// Read-only capture of the display imports used by the running application.
// In particular, do not invoke SDK GetService: it has a hidden x8 return ABI.
const fs = require('node:fs/promises');
const path = require('node:path');
const {contains, mainCodeRegion} = require('../rpc/main-module.cjs');
const imports = require('./display-imports.json');

async function main(directory) {
  directory = path.resolve(directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const report = {session: rpc.a.session, started: new Date().toISOString(), imports: {}};
  const save = () => fs.writeFile(path.join(directory, 'display-inspection.json'),
    JSON.stringify(report, null, 2), {mode: 0o600});
  try {
    const code = await mainCodeRegion(rpc);
    // PLT bytes identify the qualified retail build only. The demo build has a
    // different .text layout while keeping the same import GOT, so treat the
    // signature as diagnostic and resolve through the slot offsets.
    let qualified = true;
    for (const [name, entry] of Object.entries(imports)) {
      const thunkAddress = rpc.a.main + entry.plt;
      const thunk = contains(code, thunkAddress) && thunkAddress + 16 <= code.address + code.size
        ? await rpc.read(thunkAddress, 16) : null;
      const thunkMatches = thunk !== null && thunk.toString('hex') === entry.bytes;
      if (!thunkMatches) {
        qualified = false;
        (report.unrecognizedThunks ??= {})[name] = thunk ? thunk.toString('hex') : null;
      }
      const target = Number((await rpc.read(rpc.a.main + entry.slot, 8)).readBigUInt64LE());
      if (!Number.isSafeInteger(target) || !target) throw Error('Invalid import address: ' + name);
      const region = await rpc.query(target);
      if ((region.permissions & 5) !== 5) throw Error('Import is not executable: ' + name);
      const unresolved = contains(code, target);
      report.imports[name] = {target, unresolved, region};
      if (!unresolved) {
        const size = Math.min(0x1000, region.address + region.size - target);
        await fs.writeFile(path.join(directory, name + '.bin'), await rpc.read(target, size), {mode: 0o600});
      }
      await save();
    }
    const unresolvedTargets = new Set(Object.values(report.imports)
      .filter(entry => entry.unresolved).map(entry => entry.target));
    if (unresolvedTargets.size > 1)
      throw Error('Application import resolver layout is unsupported');
    if (report.imports.nvnBootstrapLoader.unresolved)
      throw Error('NVN bootstrap import is unresolved for this application build');
    report.applicationSignature = qualified ? 'qualified' : 'different';
    if (!qualified)
      console.warn('Application module build differs from the qualified 4.4.9 signature; using the shared import table.');
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
