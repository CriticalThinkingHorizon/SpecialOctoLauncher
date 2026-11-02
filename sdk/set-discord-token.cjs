#!/usr/bin/env node
// Server CLI Helper: Send & Save Discord JWT Token directly from Server to S2
// Usage: node sdk/set-discord-token.cjs "<YOUR_DISCORD_JWT_TOKEN>"
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const rawArg = process.argv.slice(2).join(' ').replace(/^["']|["']$/g, '').trim();
if (!rawArg || rawArg.length < 20) {
  console.error('Usage: node sdk/set-discord-token.cjs "<YOUR_DISCORD_JWT_TOKEN>"');
  process.exit(1);
}

const repoTokenFile = path.join(__dirname, '../discord-token.txt');
const homeTokenDir = path.join(os.homedir(), '.openclaw', 'discord');
const homeTokenFile = path.join(homeTokenDir, 'token.txt');

try {
  fs.mkdirSync(homeTokenDir, { recursive: true });
  fs.writeFileSync(homeTokenFile, rawArg, 'utf8');
} catch {}

fs.writeFileSync(repoTokenFile, rawArg, 'utf8');
console.log(`[DISCORD TOKEN] Saved token (${rawArg.length} chars) to ${repoTokenFile}`);

// 1. Notify active Discord Portal on port 39381 if running
function notifyPortal() {
  return new Promise(resolve => {
    const req = http.request({
      host: '127.0.0.1',
      port: Number(process.env.DISCORD_PORTAL_PORT || 39381),
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          if (d.ok) console.log(`[DISCORD PORTAL] Live session updated: ${d.detail}`);
        } catch {}
        resolve();
      });
    });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.end(JSON.stringify({ token: rawArg }));
  });
}

// 2. Also push directly to S2 tmp:/discord_token.txt if a console is currently connected
async function pushToActiveConsole() {
  const connFile = path.join(__dirname, '../runs/latest/connection.json');
  if (!fs.existsSync(connFile)) return;
  try {
    const conn = JSON.parse(fs.readFileSync(connFile, 'utf8'));
    const rpc = {
      a: conn.addresses,
      output: conn.addresses.scratch + 0x4040,
      request(b) {
        return new Promise((resolve, reject) => {
          const q = http.request({
            host: '127.0.0.1',
            port: conn.port,
            path: '/',
            method: 'POST',
            headers: { authorization: 'Bearer ' + conn.token, 'content-type': 'application/json' },
            timeout: 3000
          }, s => {
            let d = '';
            s.on('data', c => d += c);
            s.on('end', () => {
              try {
                const v = JSON.parse(d);
                if (s.statusCode !== 200) reject(new Error(v.error || 'RPC error'));
                else resolve(v);
              } catch (e) { reject(e); }
            });
          });
          q.on('error', reject);
          q.on('timeout', () => { q.destroy(); reject(new Error('timeout')); });
          q.end(JSON.stringify(b, (_, v) => typeof v === 'bigint' ? v.toString() : v));
        });
      },
      async call(o, a) {
        const r = await this.request({ command: 'call', offset: o, args: a });
        return { result: BigInt(r.result), output: Buffer.from(r.output, 'base64') };
      },
      async callAddress(a, args) {
        const r = await this.request({ command: 'call-address', address: a, args });
        return { result: BigInt(r.result), output: Buffer.from(r.output, 'base64') };
      },
      async read(a, l) {
        const r = await this.request({ command: 'read', address: a, length: l });
        return Buffer.from(r.data, 'base64');
      },
      async write(a, b) {
        await this.request({ command: 'write', address: a, data: b.toString('base64') });
      }
    };
    const fsMod = require('./host/fs.cjs');
    const fsService = await fsMod.create(rpc);
    await fsService.deletePath('save:/discord_token.txt').catch(() => {});
    const wr = await fsService.writeBytesAt('save:/discord_token.txt', 0, Buffer.from(rawArg, 'utf8'));
    if (wr.result === 0) {
      const cm = await fsService.commitMount('save');
      console.log(`[DISCORD TOKEN] Directly wrote save:/discord_token.txt (${wr.bytesWritten}B) and committed to S2 save: (0x${cm.result.toString(16)})!`);
    }
  } catch {}
}

(async () => {
  await notifyPortal();
  await pushToActiveConsole();
})();
