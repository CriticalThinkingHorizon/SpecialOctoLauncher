// Resolve input imports afresh for the connected console session.
const fs = require('node:fs/promises');
const path = require('node:path');
const {contains, mainCodeRegion} = require('../rpc/main-module.cjs');

const KNOWN_SDK_OFFSETS = {
  '_ZN2nn3hid19GetTouchScreenStateILm16EEEvPNS0_16TouchScreenStateIXT_EEE': 4852400,
  '_ZN2nn3hid15GetNpadStyleSetERKj': 4844048,
  '_ZN2nn3hid12GetNpadStateEPNS0_17NpadHandheldStateERKj': 4845408,
  '_ZN2nn3hid12GetNpadStateEPNS0_16NpadFullKeyStateERKj': 4845184,
  '_ZN2nn3hid12GetNpadStateEPNS0_16NpadJoyDualStateERKj': 4847136,
  '_ZN2nn3hid12GetNpadStateEPNS0_16NpadJoyLeftStateERKj': 4847360,
  '_ZN2nn3hid12GetNpadStateEPNS0_17NpadJoyRightStateERKj': 4847584,
};

async function main(directory) {
  directory = path.resolve(directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const imports = require('./input-imports.json');
  const report = {session: rpc.a.session, started: new Date().toISOString(), imports: {}};
  const code = await mainCodeRegion(rpc);
  for (const [name, {slot}] of Object.entries(imports)) {
    let target = Number((await rpc.read(rpc.a.main + slot, 8)).readBigUInt64LE());
    if (!Number.isSafeInteger(target) || !target)
      throw Error('Invalid input import: ' + name);
    const isUnresolved = contains(code, target);
    if (isUnresolved && KNOWN_SDK_OFFSETS[name] && rpc.a.sdk) {
      target = rpc.a.sdk + KNOWN_SDK_OFFSETS[name];
      const slotBuf = Buffer.alloc(8);
      slotBuf.writeBigUInt64LE(BigInt(target));
      await rpc.write(rpc.a.main + slot, slotBuf);
    } else if (isUnresolved) {
      report.imports[name] = {slot, target, unresolved: true, bytes: '0000000000000000'};
      continue;
    }
    const region = await rpc.query(target);
    if ((region.permissions & 5) !== 5 || region.ipcReferences)
      throw Error('Input import is not in executable memory: ' + name);
    const bytes = await rpc.read(target, Math.min(256, region.address + region.size - target));
    report.imports[name] = {slot, target, region, bytes: bytes.toString('hex'), unresolved: false};
  }
  report.completed = new Date().toISOString();
  await fs.writeFile(path.join(directory, 'input-inspection.json'), JSON.stringify(report, null, 2), {flag: 'wx', mode: 0o600});
  console.log('Resolved input imports for ' + rpc.a.session);
}
if (require.main === module) main(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
