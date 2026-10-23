// Resolve input imports afresh for the connected console session.
const fs = require('node:fs/promises');
const path = require('node:path');
async function main(directory) {
  directory = path.resolve(directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const imports = require('./input-imports.json');
  const report = {session: rpc.a.session, started: new Date().toISOString(), imports: {}};
  for (const [name, {slot}] of Object.entries(imports)) {
    const target = Number((await rpc.read(rpc.a.main + slot, 8)).readBigUInt64LE());
    if (!Number.isSafeInteger(target) || !target)
      throw Error('Invalid input import: ' + name);
    if (target === rpc.a.main + 0x29b850) {
      report.imports[name] = {slot, target, unresolved: true, bytes: '0000000000000000'};
      continue;
    }
    const region = await rpc.query(target);
    if (region.permissions !== 5 || region.ipcReferences)
      throw Error('Input import is not in executable memory: ' + name);
    const bytes = await rpc.read(target, Math.min(256, region.address + region.size - target));
    report.imports[name] = {slot, target, region, bytes: bytes.toString('hex')};
  }
  for (const name of [
    '_ZN2nn3hid12GetNpadStateEPNS0_17NpadHandheldStateERKj',
    '_ZN2nn3hid19GetTouchScreenStateILm16EEEvPNS0_16TouchScreenStateIXT_EEE'
  ]) if (!report.imports[name].bytes) report.imports[name].bytes = '0000000000000000';
  report.completed = new Date().toISOString();
  await fs.writeFile(path.join(directory, 'input-inspection.json'), JSON.stringify(report, null, 2), {flag: 'wx', mode: 0o600});
  console.log('Resolved input imports for ' + rpc.a.session);
}
if (require.main === module) main(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
