// Read-only probe for hardware video-decode access on the connected console.
// It enumerates nn::codec / nn::image / nn::av exports, records the sm service
// wrappers, then opens (and closes) the requested service handles. It does not
// initialize a codec or decode data.
//
// Run during server startup (`node server.js --probe-codec`) so the launcher's
// native worker is not using the SDK allocator concurrently.
const fs = require('node:fs/promises');
const path = require('node:path');
const {inspectModule} = require('./inspect.cjs');
const {create} = require('../sdk/native/client.cjs');
const serviceFunctions = require('../sdk/native/service-functions.json');

const DEFAULT_SERVICES = ['nvdrv', 'nvjpg', 'nvdec'];
const SYMBOL = /^_ZN2nn5codec|^_ZN2nn5image|^_ZN2nn2av|nvdec|nvjpg/i;
const SM_SYMBOL = /^_ZN2nn2sm|GetServiceHandle|IsServiceAvailable/i;
const CAPTURE = /Initialize|Finalize|IsInitialized|GetService|GetState|Create|Destroy|Decode|SetMemory|GetRequired|Get.*Memory|Open|Allocate|Decoder|Jpeg/i;

function namespaceOf(name) {
  if (/^_ZN2nn5codec/.test(name)) return 'codec';
  if (/^_ZN2nn5image/.test(name)) return 'image';
  if (/^_ZN2nn2av/.test(name)) return 'av';
  return 'other';
}

function options(argv) {
  // Service-handle probing is opt-in: nn::sm::GetServiceHandle has been observed
  // to block this SmileBASIC session, so the pipeline uses symbols-only by default.
  const result = {directory: argv[2], services: DEFAULT_SERVICES, symbolsOnly: true};
  for (const value of argv.slice(3)) {
    if (value === '--symbols-only') result.symbolsOnly = true;
    else if (value.startsWith('--services=')) {
      const names = value.slice('--services='.length).split(',').map(name => name.trim()).filter(Boolean);
      if (!names.length || names.some(name => !/^[a-z0-9:-]{1,8}$/.test(name)))
        throw Error('Invalid --services list');
      result.services = names;
      result.symbolsOnly = false;
    } else throw Error('Unknown option: ' + value);
  }
  if (!result.directory) throw Error('Usage: node inspection/codec-probe.cjs runs/session-... [--symbols-only] [--services=nvdrv,nvjpg,nvdec]');
  return result;
}

async function probeServices(rpc, directory, names, save, report) {
  const progress = async (step, extra = {}) => {
    await fs.writeFile(path.join(directory, 'codec-probe-progress.json'),
      JSON.stringify({step, at: new Date().toISOString(), ...extra}, null, 2), {mode: 0o600});
    console.log('[codec-probe] ' + step);
  };

  await progress('allocate-probe-buffer');
  const api = await create(rpc, {
    service: serviceFunctions.service,
    close: serviceFunctions.closeHandle
  });
  await progress('probe-buffer-ready', {base: api.base});

  for (const name of names) {
    const entry = {name};
    await progress('open-service', {name});
    try {
      await api.write(0x2000, Buffer.from(name + '\0'));
      const result = await api.result('service',
        [api.base + 0x2100, api.base + 0x2000, name.length]);
      if (result) {
        entry.open = false;
        entry.result = '0x' + result.toString(16);
      } else {
        entry.open = true;
        entry.handle = (await api.read(0x2100, 4)).readUInt32LE();
        entry.closeResult = await api.result('close', [entry.handle]);
      }
    } catch (error) {
      entry.error = error.message;
    }
    report.services[name] = entry;
    await progress('service-result', {name, entry});
    await save();
  }
  return report.services;
}

async function captureSymbols(rpc, directory, symbols) {
  const folder = path.join(directory, 'codec-probe');
  await fs.mkdir(folder, {recursive: true, mode: 0o700});
  const index = [];
  const candidates = symbols
    .filter(symbol => symbol.type === 2 && symbol.section && symbol.size > 0 && CAPTURE.test(symbol.name))
    .slice(0, 64);
  for (const symbol of candidates) {
    const address = rpc.a.sdk + symbol.offset;
    const region = await rpc.query(address);
    if ((region.permissions & 5) !== 5) continue;
    const size = Math.min(Math.max(symbol.size, 16), 256, region.address + region.size - address);
    const name = symbol.name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 120);
    const file = index.length + '-' + name + '.bin';
    await fs.writeFile(path.join(folder, file), await rpc.read(address, size), {mode: 0o600});
    index.push({name: symbol.name, offset: symbol.offset, size, file});
  }
  await fs.writeFile(path.join(folder, 'index.json'), JSON.stringify(index, null, 2), {mode: 0o600});
  return index;
}

async function main(argv) {
  const opts = options(argv);
  const directory = path.resolve(opts.directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const report = {session: rpc.a.session, started: new Date().toISOString(), services: {}, symbols: {}};
  const save = () => fs.writeFile(path.join(directory, 'codec-probe.json'),
    JSON.stringify(report, null, 2), {mode: 0o600});
  try {
    if (!(await rpc.request({command: 'status'})).ready) throw Error('Console disconnected');

    console.log('Enumerating SDK codec/image symbols...');
    const module = await inspectModule(rpc, rpc.a.sdk);
    const matches = module.symbols.filter(symbol => SYMBOL.test(symbol.name));
    const smMatches = module.symbols.filter(symbol => SM_SYMBOL.test(symbol.name));
    const namespaces = {codec: 0, image: 0, av: 0, other: 0};
    for (const symbol of matches) namespaces[namespaceOf(symbol.name)]++;
    report.symbols = {total: module.symbols.length, matched: matches.length, namespaces,
      smMatched: smMatches.length};
    await fs.writeFile(path.join(directory, 'codec-symbols.json'),
      JSON.stringify(matches, null, 2), {mode: 0o600});
    await fs.writeFile(path.join(directory, 'sm-symbols.json'),
      JSON.stringify(smMatches, null, 2), {mode: 0o600});
    report.symbols.captured = (await captureSymbols(rpc, directory, matches)).length;
    await save();
    console.log(`SDK symbols: ${module.symbols.length}; codec/image/av matches: ${matches.length} ` +
      `(codec=${namespaces.codec}, image=${namespaces.image}, av=${namespaces.av}); sm matches: ${smMatches.length}`);
    console.log(`Captured ${report.symbols.captured} candidate function ranges for offline disassembly.`);

    if (!opts.symbolsOnly) {
      console.log('Probing service-manager access (open then close): ' + opts.services.join(', '));
      await probeServices(rpc, directory, opts.services, save, report);
    }
    await save();
    for (const [name, entry] of Object.entries(report.services)) {
      console.log(`  ${name}: ${entry.open ? 'OPEN (handle ' + entry.handle + ')' :
        entry.result || entry.error || 'failed'}`);
    }

    const nvdec = report.services.nvdec?.open;
    const nvjpg = report.services.nvjpg?.open;
    const nvdrv = report.services.nvdrv?.open || report.services['nvdrv:a']?.open;
    report.recommendation = opts.symbolsOnly
      ? 'symbols-only: no H.264/HEVC video decoder is exported by this SDK; JPEG/PNG and audio codecs are present. Service probing is opt-in via --services.'
      : !nvdrv
        ? 'probe-invalid: the control nvdrv service did not open'
        : nvdec
          ? 'route-b: hardware video service (nvdec) is reachable; no H.264 wrapper exists in this SDK, so raw nvdec access must be evaluated'
          : nvjpg
            ? 'route-b-lite: JPEG service (nvjpg) is reachable; MJPEG path possible'
            : 'route-a: no hardware decode service access; decode on the host';
    await save();
    console.log('Recommendation: ' + report.recommendation);
    console.log('Report: ' + path.join(directory, 'codec-probe.json'));
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally {
    await save();
  }
}

module.exports = {main, namespaceOf};
if (require.main === module) {
  main(process.argv).catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  });
}
