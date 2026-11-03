// Host-side RTP probe for the Moonlight video/audio ports.
// Run this before launching a Moonlight stream: the Node host is the RTSP
// client, so Sunshine sends video to this machine on UDP 47998 and audio on 48000.
const dgram = require('node:dgram');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const args = new Map(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return at < 0 ? [value, ''] : [value.slice(0, at), value.slice(at + 1)];
}));
const seconds = Number(args.get('--seconds') || 0);
const ports = (args.get('--ports') || '47998,48000').split(',').map(Number);
const savePath = args.get('--save');

if (!ports.length || ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) {
  console.error('Invalid --ports');
  process.exit(1);
}
if (seconds && (!Number.isFinite(seconds) || seconds < 1)) {
  console.error('Invalid --seconds');
  process.exit(1);
}

const started = new Date();
const stats = {started: started.toISOString(), ports: {}};
let capture = null;
let captureBytes = 0;
console.log('Moonlight RTP probe. Start this before launching a Moonlight stream; stop with Ctrl+C.');
console.log('Run it on the same PC as server.js: that process is the RTSP client, so Sunshine');
console.log('sends video/audio to this machine (UDP 47998/48000), not to the console.');
if (savePath) {
  const target = path.resolve(savePath);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  capture = fs.createWriteStream(target, {flags: 'wx', mode: 0o600});
  capture.write(Buffer.from('S2RTP1\0\0', 'ascii'));
}

function record(port, message, rinfo) {
  const entry = stats.ports[port];
  entry.packets++;
  entry.bytes += message.length;
  entry.maxSize = Math.max(entry.maxSize, message.length);
  entry.sources.add(rinfo.address);
  if (!entry.firstHex) entry.firstHex = message.subarray(0, 32).toString('hex');
  if (message.length >= 12 && (message[0] >> 6) === 2) {
    entry.rtp++;
    const payloadType = message[1] & 0x7f;
    entry.payloadTypes.set(payloadType, (entry.payloadTypes.get(payloadType) || 0) + 1);
    entry.ssrcs.add(message.readUInt32BE(8).toString(16));
  }
  if (capture && captureBytes < 64 * 1024 * 1024) {
    const record = Buffer.alloc(4 + message.length);
    record.writeUInt32BE(message.length, 0);
    message.copy(record, 4);
    capture.write(record);
    captureBytes += record.length;
  }
}

const sockets = [];
for (const port of ports) {
  stats.ports[port] = {packets: 0, bytes: 0, rtp: 0, maxSize: 0, sources: new Set(),
    payloadTypes: new Map(), ssrcs: new Set(), firstHex: ''};
  const socket = dgram.createSocket('udp4');
  socket.on('error', error => { stats.ports[port].error = error.message; });
  socket.on('message', (message, rinfo) => record(port, message, rinfo));
  socket.bind(port, '0.0.0.0', () => console.log(`Listening for RTP on UDP ${port}`));
  sockets.push(socket);
}

let finalPrinted = false;
function finish() {
  if (finalPrinted) return;
  finalPrinted = true;
  for (const socket of sockets) {
    try { socket.close(); } catch {}
  }
  if (capture) capture.end();
  printFinal();
}

function summary() {
  return Object.fromEntries(Object.entries(stats.ports).map(([port, entry]) => [port, {
    packets: entry.packets,
    bytes: entry.bytes,
    rtp: entry.rtp,
    maxSize: entry.maxSize,
    sources: [...entry.sources],
    payloadTypes: Object.fromEntries(entry.payloadTypes),
    ssrcs: [...entry.ssrcs],
    firstHex: entry.firstHex,
    ...entry.error ? {error: entry.error} : {}
  }]));
}

function printFinal() {
  const report = {...stats, completed: new Date().toISOString(), ports: summary()};
  const ffmpeg = spawnSync('ffmpeg', ['-hide_banner', '-version'], {encoding: 'utf8'});
  report.ffmpeg = ffmpeg.status === 0 ? ffmpeg.stdout.split('\n')[0].trim() : 'not found';
  if (savePath) report.capture = path.resolve(savePath);
  if (ffmpeg.status === 0) {
    const decoders = spawnSync('ffmpeg', ['-hide_banner', '-decoders'], {encoding: 'utf8'});
    report.h264Decoder = /h264/i.test(decoders.stdout) ? 'available' : 'not found';
  }
  const folder = path.resolve(__dirname, '..', 'runs');
  const file = path.join(folder, 'rtp-probe-' + Date.now() + '.json');
  fs.mkdirSync(folder, {recursive: true});
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  for (const [port, entry] of Object.entries(report.ports)) {
    console.log(`UDP ${port}: ${entry.packets} packets, ${entry.bytes} bytes, ` +
      `${entry.rtp} RTP, sources=${entry.sources.join(',') || 'none'}` +
      (entry.error ? `, error=${entry.error}` : ''));
  }
  console.log('ffmpeg: ' + report.ffmpeg + (report.h264Decoder ? ', H.264 decoder: ' + report.h264Decoder : ''));
  console.log('Report: ' + file);
}

process.on('SIGINT', () => { finish(); process.exit(0); });
process.on('SIGTERM', () => { finish(); process.exit(0); });

if (seconds) setTimeout(() => { finish(); process.exit(0); }, seconds * 1000);

setInterval(() => {
  const entries = Object.entries(summary()).map(([port, entry]) => `${port}:${entry.packets}`).join(' ');
  console.log(`[${new Date().toISOString()}] packets ${entries}`);
}, 5000).unref();
