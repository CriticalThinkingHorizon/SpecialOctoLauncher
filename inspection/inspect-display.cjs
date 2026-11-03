// Read-only capture of the display imports used by the running application.
// In particular, do not invoke SDK GetService: it has a hidden x8 return ABI.
const fs = require('node:fs/promises');
const path = require('node:path');
const {contains, mainCodeRegion} = require('../rpc/main-module.cjs');
const {ImportResolver, isResolverStub} = require('./imports.cjs');
const imports = require('./display-imports.json');

async function main(directory) {
  directory = path.resolve(directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const resolver = new ImportResolver(rpc);
  const report = {session: rpc.a.session, started: new Date().toISOString(), imports: {}};
  const save = () => fs.writeFile(path.join(directory, 'display-inspection.json'),
    JSON.stringify(report, null, 2), {mode: 0o600});
  try {
    const code = await mainCodeRegion(rpc);
    // The retail 4.4.9 thunk bytes identify the qualified build exactly. The
    // demo app has a different import list, so its thunk offsets and GOT slots
    // move; resolve each slot from the thunk/signature instead of rejecting it.
    let qualified = true;
    const deltas = [];
    for (const [name, entry] of Object.entries(imports)) {
      const thunkAddress = rpc.a.main + entry.plt;
      const thunk = await resolver.thunkAt(thunkAddress);
      if (thunk === null || thunk.toString('hex') !== entry.bytes) {
        qualified = false;
        (report.unrecognizedThunks ??= {})[name] = thunk ? thunk.toString('hex') : null;
      }

      const found = await resolver.resolve(entry, {
        signature: entry.targetSignature || null,
        deltaHints: [...new Set(deltas)]
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
      if (!unresolved) {
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
    report.applicationSignature = qualified ? 'qualified' : 'different';
    if (!qualified)
      console.warn('Application module build differs from the qualified 4.4.9 signature; using PLT-derived import slots.');
    // Only interpret this global after matching the implementation that loads it.
    const reference = require('../rpc/reference/sdk-checks.cjs');
    const offset = 0x3d8200;
    const implementation = await rpc.read(rpc.a.sdk + offset, 32);
    if (!implementation.equals(reference.bytes(offset, 32)))
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
