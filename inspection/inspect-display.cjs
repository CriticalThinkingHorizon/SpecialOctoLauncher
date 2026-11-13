// Read-only capture of the display imports used by the running application.
// In particular, do not invoke SDK GetService: it has a hidden x8 return ABI.
//
// Startup only needs nvnBootstrapLoader (for the compatibility module) and the
// application signature (to choose the VI layer name). The other VI imports are
// diagnostic data, so they are captured only when --full is requested. This
// keeps the handshake to a handful of small reads even on a high-latency link.
const fs = require('node:fs/promises');
const path = require('node:path');
const {contains, mainCodeRegion} = require('../rpc/main-module.cjs');
const {ImportResolver, isResolverStub} = require('./imports.cjs');
const imports = require('./display-imports.json');

const STARTUP_IMPORTS = ['nvnBootstrapLoader'];
// Coalesce nearby PLT entries into one read. Import tables are dense, so the
// eight display thunks normally fit into two small windows.
const THUNK_GROUP_GAP = 0x100;

function thunkGroups(rpc) {
  const addresses = [...new Set(Object.values(imports).map(entry => rpc.a.main + entry.plt))]
    .sort((a, b) => a - b);
  const groups = [];
  for (const address of addresses) {
    const last = groups[groups.length - 1];
    if (last && address - (last.start + last.length) <= THUNK_GROUP_GAP) {
      last.length = address + 16 - last.start;
    } else {
      groups.push({start: address, length: 16});
    }
  }
  return groups;
}

async function readThunks(rpc) {
  const thunks = new Map();
  for (const group of thunkGroups(rpc)) {
    const bytes = await rpc.read(group.start, group.length);
    for (const [name, entry] of Object.entries(imports)) {
      const at = rpc.a.main + entry.plt - group.start;
      if (at >= 0 && at + 16 <= bytes.length)
        thunks.set(name, bytes.subarray(at, at + 16));
    }
  }
  return thunks;
}

function checkThunks(thunks) {
  const report = {qualified: true, unrecognizedThunks: {}};
  for (const [name, entry] of Object.entries(imports)) {
    const thunk = thunks.get(name) || null;
    if (!thunk || thunk.toString('hex') !== entry.bytes) {
      report.qualified = false;
      report.unrecognizedThunks[name] = thunk ? thunk.toString('hex') : null;
    }
  }
  return report;
}

async function main(directory, options = {}) {
  directory = path.resolve(directory);
  const full = options.full || process.argv.includes('--full');
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const resolver = new ImportResolver(rpc);
  const report = {session: rpc.a.session, started: new Date().toISOString(), imports: {}};
  const save = () => fs.writeFile(path.join(directory, 'display-inspection.json'),
    JSON.stringify(report, null, 2), {mode: 0o600});
  try {
    const code = await mainCodeRegion(rpc);

    // One or two reads verify the qualified 4.4.9 thunk bytes. A demo build has
    // a different import list, so its thunk offsets move; resolve each slot from
    // the thunk/signature instead of rejecting it.
    const thunks = await readThunks(rpc);
    const thunkCheck = checkThunks(thunks);
    const qualified = thunkCheck.qualified;
    if (!qualified) report.unrecognizedThunks = thunkCheck.unrecognizedThunks;
    report.applicationSignature = qualified ? 'qualified' : 'different';
    if (!qualified)
      console.warn('Application module build differs from the qualified 4.4.9 signature; using PLT-derived import slots.');

    const names = full ? Object.keys(imports) : STARTUP_IMPORTS;
    const deltas = [];
    for (const name of names) {
      const entry = imports[name];
      const found = await resolver.resolve(entry, {
        signature: entry.targetSignature || null,
        deltaHints: [...new Set(deltas)],
        thunkBytes: thunks.get(name) || null
      });
      if (!found) {
        if (name === 'nvnBootstrapLoader')
          throw Error('NVN bootstrap import slot not found for this application build');
        report.imports[name] = {target: 0, unresolved: true, failed: true,
          slot: entry.slot, slotSource: 'unresolved'};
        await save();
        continue;
      }

      const unresolved = !found.target || isResolverStub(found.code) ||
        contains(code, found.target);
      report.imports[name] = {target: found.target, unresolved,
        region: found.region, slot: found.slotOffset, slotSource: found.slotSource};
      if (entry.targetSignature && !unresolved)
        deltas.push(found.slotOffset - entry.slot);
      if (full && !unresolved) {
        const size = Math.min(0x1000, found.region.address + found.region.size - found.target);
        await fs.writeFile(path.join(directory, name + '.bin'),
          await rpc.read(found.target, size), {mode: 0o600});
      }
      await save();
    }

    // Lazily-bound imports legitimately share one PLT resolver stub, and an
    // import that is not currently loaded may read as zero. Only reject a
    // layout that points distinct unresolved imports at different addresses.
    const unresolvedTargets = new Set(Object.values(report.imports)
      .filter(entry => !entry.failed && entry.unresolved && entry.target)
      .map(entry => entry.target));
    if (unresolvedTargets.size > 1)
      throw Error('Application import resolver layout is unsupported');
    if (report.imports.nvnBootstrapLoader.unresolved)
      throw Error('NVN bootstrap import is unresolved for this application build');

    // The SDK image check is diagnostic-only; qualify() already validated the
    // exact SDK CRC for this session. Skip it on the startup path.
    if (full) {
      const reference = require('../rpc/reference/sdk-checks.cjs');
      const offset = 0x3d8200;
      const implementation = await rpc.read(rpc.a.sdk + offset, 32);
      if (!implementation.equals(reference.bytes(offset, 32)))
        throw Error('SDK GetService implementation changed');
      report.sdkService = Number((await rpc.read(rpc.a.sdk + 0xd9ef88, 8)).readBigUInt64LE());
      report.sdkServiceIsNull = report.sdkService === 0;
    }
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
