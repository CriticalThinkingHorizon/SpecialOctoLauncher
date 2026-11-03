// Read-only capture of the display imports used by the running application.
// In particular, do not invoke SDK GetService: it has a hidden x8 return ABI.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {contains, decodePltThunk, mainCodeRegion} = require('../rpc/main-module.cjs');
const imports = require('./display-imports.json');

async function findImportBySignature(rpc, entry, preferredRegion) {
  if (!entry.targetSignature) return null;
  const anchor = rpc.a.main + entry.slot;
  const region = await rpc.query(anchor);
  const start = Math.max(region.address, anchor - 0x20000);
  const alignedStart = Math.floor(start / 8) * 8;
  const end = Math.min(region.address + region.size, anchor + 0x20000);
  if (end - alignedStart < 8) return null;
  const bytes = await rpc.read(alignedStart, end - alignedStart);
  const expected = Buffer.from(entry.targetSignature, 'hex');
  const checked = new Map();
  for (let at = 0; at + 8 <= bytes.length; at += 8) {
    const value = Number(bytes.readBigUInt64LE(at));
    if (!Number.isSafeInteger(value) || value < 0x1000 || value >= 2 ** 39) continue;
    if (preferredRegion &&
        (value < preferredRegion.address || value >= preferredRegion.address + preferredRegion.size)) continue;
    if (checked.has(value)) continue;
    let targetRegion;
    try { targetRegion = await rpc.query(value); } catch { checked.set(value, false); continue; }
    if ((targetRegion.permissions & 5) !== 5) { checked.set(value, false); continue; }
    const code = await rpc.read(value, 64);
    const match = crypto.createHash('sha256').update(code).digest().equals(expected);
    checked.set(value, match);
    if (match)
      return {slotAddress: alignedStart + at, target: value, region: targetRegion, slotSource: 'signature'};
  }
  return null;
}

async function main(directory) {
  directory = path.resolve(directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const report = {session: rpc.a.session, started: new Date().toISOString(), imports: {}};
  const save = () => fs.writeFile(path.join(directory, 'display-inspection.json'),
    JSON.stringify(report, null, 2), {mode: 0o600});
  try {
    const code = await mainCodeRegion(rpc);
    // PLT bytes identify the qualified retail build only. The demo build has a
    // different GOT layout, so derive each slot from the thunk's adrp/ldr/add
    // sequence and only fall back to the recorded retail slot if it is invalid.
    let qualified = true;
    let driverRegion = null;
    for (const [name, entry] of Object.entries(imports)) {
      const thunkAddress = rpc.a.main + entry.plt;
      const thunk = contains(code, thunkAddress) && thunkAddress + 16 <= code.address + code.size
        ? await rpc.read(thunkAddress, 16) : null;
      const thunkMatches = thunk !== null && thunk.toString('hex') === entry.bytes;
      if (!thunkMatches) {
        qualified = false;
        (report.unrecognizedThunks ??= {})[name] = thunk ? thunk.toString('hex') : null;
      }
      const decodedSlot = thunk ? decodePltThunk(thunk, thunkAddress) : null;
      const candidates = decodedSlot === null ? [rpc.a.main + entry.slot] : [decodedSlot];
      if (decodedSlot !== rpc.a.main + entry.slot) candidates.push(rpc.a.main + entry.slot);
      let target, region, slotAddress, slotSource;
      for (const address of candidates) {
        const value = Number((await rpc.read(address, 8)).readBigUInt64LE());
        if (!Number.isSafeInteger(value) || !value) continue;
        let found;
        try { found = await rpc.query(value); } catch { continue; }
        if ((found.permissions & 5) !== 5) continue;
        target = value;
        region = found;
        slotAddress = address;
        slotSource = address === decodedSlot ? 'thunk' : 'table';
        break;
      }
      if (target === undefined && entry.targetSignature) {
        const found = await findImportBySignature(rpc, entry, driverRegion);
        if (found) {
          target = found.target;
          region = found.region;
          slotAddress = found.slotAddress;
          slotSource = found.slotSource;
        }
      }
      if (target === undefined) {
        if (name === 'nvnBootstrapLoader')
          throw Error('NVN bootstrap import slot not found for this application build');
        report.imports[name] = {target: 0, unresolved: true, failed: true,
          slot: entry.slot, slotSource: 'unresolved'};
        await save();
        continue;
      }
      const unresolved = contains(code, target);
      if (!unresolved && !driverRegion) driverRegion = region;
      report.imports[name] = {target, unresolved, region,
        slot: slotAddress - rpc.a.main, slotSource};
      if (!unresolved) {
        const size = Math.min(0x1000, region.address + region.size - target);
        await fs.writeFile(path.join(directory, name + '.bin'), await rpc.read(target, size), {mode: 0o600});
      }
      await save();
    }
    const unresolvedTargets = new Set(Object.values(report.imports)
      .filter(entry => !entry.failed && entry.unresolved).map(entry => entry.target));
    if (unresolvedTargets.size > 1)
      throw Error('Application import resolver layout is unsupported');
    if (report.imports.nvnBootstrapLoader.unresolved)
      throw Error('NVN bootstrap import is unresolved for this application build');
    report.applicationSignature = qualified ? 'qualified' : 'different';
    if (!qualified)
      console.warn('Application module build differs from the qualified 4.4.9 signature; using PLT-derived import slots.');
    // Only interpret this global after matching the implementation that loads it.
    const reference = require('../rpc/reference/sdk-checks.cjs');
    const offset = 0x3d8200;
    const implementation = await rpc.read(rpc.a.sdk + offset, 32);
    if (!implementation.equals(reference.bytes(offset,32)))
      throw Error('SDK GetService implementation changed');
    report.sdkService = Number((await rpc.read(rpc.a.sdk + 0xd9ef88, 8)).readBigUInt64LE());
    report.sdkServiceIsNull = report.sdkService === 0;
    report.completed = new Date().toISOString();
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally { await save(); }
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main(process.argv[2]).catch(error => {
  console.error(error.stack); process.exitCode = 1;
});
module.exports = {main};
