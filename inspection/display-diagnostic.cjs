// Read-only diagnostic for the SmileBASIC demo import layout.
// Run with: node server.js --display-diagnostic <host-ip>
// It writes runs/<session>/diagnostic/ for the maintainer to inspect.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {contains, decodePltThunk, mainCodeRegion} = require('../rpc/main-module.cjs');
const displayImports = require('./display-imports.json');
const inputImports = require('./input-imports.json');

async function readValue(rpc, address) {
  try {
    return Number((await rpc.read(address, 8)).readBigUInt64LE());
  } catch {
    return null;
  }
}

async function describeTarget(rpc, value) {
  if (!Number.isSafeInteger(value) || value < 0x1000 || value >= 2 ** 39) return null;
  try {
    const region = await rpc.query(value);
    const executable = (region.permissions & 5) === 5;
    const result = {value, region, executable};
    if (executable) {
      const code = await rpc.read(value, 64);
      result.code64 = code.toString('hex');
      result.codeHash = crypto.createHash('sha256').update(code).digest('hex');
    }
    return result;
  } catch (error) {
    return {value, error: error.message};
  }
}

async function displayEntry(rpc, name, entry, code, folder) {
  const result = {recorded: {slot: entry.slot, plt: entry.plt, bytes: entry.bytes,
    targetSignature: entry.targetSignature || null}, candidates: []};
  const thunkAddress = rpc.a.main + entry.plt;
  if (contains(code, thunkAddress) && thunkAddress + 16 <= code.address + code.size) {
    const thunk = await rpc.read(thunkAddress, 16);
    result.thunkAddress = thunkAddress;
    result.thunkHex = thunk.toString('hex');
    result.thunkMatches = thunk.toString('hex') === entry.bytes;
    result.decodedSlot = decodePltThunk(thunk, thunkAddress);
    result.decodedSlotOffset = result.decodedSlot === null ? null : result.decodedSlot - rpc.a.main;
  }
  const candidates = [];
  if (result.decodedSlot !== null && result.decodedSlot !== undefined) candidates.push(result.decodedSlot);
  const hardcoded = rpc.a.main + entry.slot;
  if (!candidates.includes(hardcoded)) candidates.push(hardcoded);
  for (const address of candidates) {
    const value = await readValue(rpc, address);
    const described = value === null ? null : await describeTarget(rpc, value);
    const row = {slotAddress: address, slotOffset: address - rpc.a.main, value, target: described};
    if (described?.executable && described.code64) {
      const file = name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 120) + '-' + row.slotOffset + '.bin';
      await fs.writeFile(path.join(folder, file), Buffer.from(described.code64, 'hex'), {mode: 0o600});
      row.codeFile = file;
    }
    if (entry.targetSignature && described?.codeHash)
      row.signatureMatches = described.codeHash === entry.targetSignature;
    result.candidates.push(row);
  }
  return result;
}

async function inputEntry(rpc, name, entry, folder) {
  const address = rpc.a.main + entry.slot;
  const value = await readValue(rpc, address);
  const described = value === null ? null : await describeTarget(rpc, value);
  const row = {recorded: {slot: entry.slot}, slotAddress: address, value, target: described};
  if (described?.executable && described.code64) {
    const file = 'input-' + name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 120) + '.bin';
    await fs.writeFile(path.join(folder, file), Buffer.from(described.code64, 'hex'), {mode: 0o600});
    row.codeFile = file;
  }
  return row;
}

async function dumpWindow(rpc, folder, name, anchor, span) {
  try {
    const region = await rpc.query(anchor);
    const start = Math.max(region.address, anchor - span);
    const end = Math.min(region.address + region.size, anchor + span);
    if (end - start < 8) return {anchor, error: 'window outside region'};
    const bytes = await rpc.read(start, end - start);
    await fs.writeFile(path.join(folder, name + '.bin'), bytes, {mode: 0o600});
    return {anchor, address: start, size: bytes.length, region, file: name + '.bin'};
  } catch (error) {
    return {anchor, error: error.message};
  }
}

async function main(directory) {
  directory = path.resolve(directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const folder = path.join(directory, 'diagnostic');
  await fs.mkdir(folder, {recursive: true, mode: 0o700});
  const report = {
    session: rpc.a.session,
    started: new Date().toISOString(),
    addresses: {...rpc.a},
    display: {},
    input: {},
    windows: {},
    errors: []
  };
  const save = () => fs.writeFile(path.join(folder, 'diagnostic.json'),
    JSON.stringify(report, null, 2), {mode: 0o600});
  try {
    if (!(await rpc.request({command: 'status'})).ready) throw Error('Console disconnected');
    const code = await mainCodeRegion(rpc);
    report.mainRegion = code;
    report.sdkRegion = await rpc.query(rpc.a.sdk);
    await fs.writeFile(path.join(folder, 'main-header.bin'), await rpc.read(rpc.a.main, 256),
      {mode: 0o600});

    console.log('Dumping main code mapping...');
    const mainCode = await rpc.read(code.address, code.size);
    await fs.writeFile(path.join(folder, 'main-code.bin'), mainCode, {mode: 0o600});
    report.mainCode = {address: code.address, size: mainCode.length};

    console.log('Indexing PLT thunks...');
    const thunkIndex = {};
    for (let at = 0; at + 16 <= mainCode.length; at += 16) {
      const slot = decodePltThunk(mainCode.subarray(at, at + 16), code.address + at);
      if (slot !== null) thunkIndex[slot - rpc.a.main] = at;
    }
    report.thunkIndex = thunkIndex;
    await fs.writeFile(path.join(folder, 'thunk-index.json'),
      JSON.stringify(thunkIndex, null, 2), {mode: 0o600});

    report.windows.got = await dumpWindow(rpc, folder, 'got-window', rpc.a.got, 0x20000);
    report.windows.memmove = await dumpWindow(rpc, folder, 'memmove-window', rpc.a.memmove, 0x2000);
    report.windows.main = await dumpWindow(rpc, folder, 'main-code-window', rpc.a.main, 0x2000);

    console.log('Inspecting display imports...');
    for (const [name, entry] of Object.entries(displayImports)) {
      try {
        report.display[name] = await displayEntry(rpc, name, entry, code, folder);
      } catch (error) {
        report.display[name] = {error: error.message};
      }
      await save();
    }

    console.log('Inspecting input imports...');
    for (const [name, entry] of Object.entries(inputImports)) {
      try {
        report.input[name] = await inputEntry(rpc, name, entry, folder);
      } catch (error) {
        report.input[name] = {error: error.message};
      }
      await save();
    }

    report.completed = new Date().toISOString();
    await fs.writeFile(path.join(folder, 'README.txt'), [
      'SmileBASIC display/import diagnostic',
      '',
      'Send the entire diagnostic folder to the maintainer (privately):',
      '  diagnostic.json',
      '  thunk-index.json',
      '  main-code.bin',
      '  got-window.bin',
      '  memmove-window.bin',
      '  main-code-window.bin',
      '  main-header.bin',
      '  *.bin target captures',
      '',
      'These files contain console memory addresses and application code.',
      'Do not post them publicly; send them only to the project maintainer.'
    ].join('\r\n'), {mode: 0o600});
    console.log('Diagnostic complete: ' + folder);
  } catch (error) {
    report.errors.push(error.message);
    throw error;
  } finally {
    await save();
  }
}

if (require.main === module) {
  if (process.argv.length !== 3) {
    console.error('Usage: node inspection/display-diagnostic.cjs runs/session-...');
    process.exitCode = 1;
  } else main(process.argv[2]).catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  });
}
module.exports = {main};
