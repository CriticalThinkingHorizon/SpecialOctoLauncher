const http = require('node:http');
const path = require('node:path');
const {port, token, addresses} = require('../connection.json');

function request(body) {
  if (global.VERBOSE && body.command !== 'read' && body.command !== 'write') {
    console.log(`[RPC CALL] command: ${body.command}${body.address !== undefined ? `, address: 0x${Number(body.address).toString(16)}` : ''}`);
  }
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, path: '/', method: 'POST',
      headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json'}}, res => {
      const parts = [];
      res.on('data', part => parts.push(part));
      res.on('error', reject);
      res.on('end', () => {
        try {
          const value = JSON.parse(Buffer.concat(parts));
          if (res.statusCode !== 200) throw Error(value.error || 'Native bridge failed');
          resolve(value);
        } catch (error) {reject(error);}
      });
    });
    req.setTimeout(600000, () => req.destroy(Error('Native request timed out; it was not replayed')));
    req.on('error', reject);
    req.end(JSON.stringify(body, (_, value) => typeof value === 'bigint' ? value.toString() : value));
  });
}

async function call(offset, args) {
  const reply = await request({command: 'call', offset, args});
  return {result: BigInt(reply.result), output: Buffer.from(reply.output, 'base64')};
}
async function pair(calls) {
  const reply = await request({command: 'pair', calls});
  return {results: reply.results.map(BigInt), output: Buffer.from(reply.output, 'base64')};
}
async function callAddress(address, args) {
  const reply = await request({command: 'call-address', address, args});
  return {result: BigInt(reply.result), output: Buffer.from(reply.output, 'base64')};
}
async function read(address, length) {
  if (!Number.isSafeInteger(address) || !Number.isInteger(length) || length < 0 || length > 0x4000000)
    throw Error('Invalid memory transfer');
  if (global.VERBOSE) console.log(`[RPC READ START] Address: 0x${address.toString(16)}, Length: ${length} bytes`);
  const parts = [];
  let transferred = 0;
  for (let offset = 0; offset < length; offset += 0x80000) {
    const size = Math.min(0x80000, length - offset);
    const res = await request({command: 'read', address: address + offset, length: size});
    const bytes = Buffer.from(res.data, 'base64');
    if (bytes.length !== size) throw Error('Memory read was truncated');
    parts.push(bytes);
    transferred += size;
    if (global.VERBOSE) {
      const pct = ((transferred / length) * 100).toFixed(1);
      process.stdout.write(`\r[RPC READ PROGRESS] Addr: 0x${(address + offset).toString(16)} | ${transferred}/${length} bytes (${pct}%)    `);
    }
  }
  if (global.VERBOSE) process.stdout.write('\n');
  return Buffer.concat(parts);
}
async function write(address, bytes) {
  if (!Number.isSafeInteger(address) || !Buffer.isBuffer(bytes) || bytes.length > 0x4000000)
    throw Error('Invalid memory transfer');
  const total = bytes.length;
  if (global.VERBOSE) console.log(`[RPC WRITE START] Address: 0x${address.toString(16)}, Length: ${total} bytes`);
  let transferred = 0;
  for (let offset = 0; offset < total; offset += 0x80000) {
    const size = Math.min(0x80000, total - offset);
    await request({command: 'write', address: address + offset,
      data: bytes.subarray(offset, offset + size).toString('base64')});
    transferred += size;
    if (global.VERBOSE) {
      const pct = ((transferred / total) * 100).toFixed(1);
      process.stdout.write(`\r[RPC WRITE PROGRESS] Addr: 0x${(address + offset).toString(16)} | ${transferred}/${total} bytes (${pct}%)    `);
    }
  }
  if (global.VERBOSE) process.stdout.write('\n');
}
async function query(address) {
  const result = await request({command: 'query', address});
  return {...result, result: 0, address: Number(result.address), size: Number(result.size)};
}

module.exports = {request, call, callAddress, pair, read, write, query, a: addresses,
  output: addresses.scratch + 0x4040,
  directory: path.resolve(__dirname, '..', 'switch' + addresses.platform)};
