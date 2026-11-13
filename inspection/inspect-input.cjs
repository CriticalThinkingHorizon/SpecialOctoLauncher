// Resolve input imports for the connected console session.
//
// The HID entry points live at fixed offsets inside the qualified SDK image;
// only the SDK *base* changes per session (ASLR). qualify() already verifies
// that image by CRC, so scanning the application GOT and patching every input
// slot is unnecessary for the runtime. Read the small target window once and
// record the bytes the caller needs. The old GOT-repair path was thousands of
// round trips on a WAN connection and is available only as a diagnostic.
const fs = require('node:fs/promises');
const path = require('node:path');

const KNOWN_SDK_OFFSETS = {
  '_ZN2nn3hid19GetTouchScreenStateILm16EEEvPNS0_16TouchScreenStateIXT_EEE': 4852400,
  '_ZN2nn3hid15GetNpadStyleSetERKj': 4844048,
  '_ZN2nn3hid12GetNpadStateEPNS0_17NpadHandheldStateERKj': 4845408,
  '_ZN2nn3hid12GetNpadStateEPNS0_16NpadFullKeyStateERKj': 4845184,
  '_ZN2nn3hid12GetNpadStateEPNS0_16NpadJoyDualStateERKj': 4847136,
  '_ZN2nn3hid12GetNpadStateEPNS0_16NpadJoyLeftStateERKj': 4847360,
  '_ZN2nn3hid12GetNpadStateEPNS0_17NpadJoyRightStateERKj': 4847584,
};

const BYTES = 256;

async function main(directory) {
  directory = path.resolve(directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const imports = require('./input-imports.json');
  const report = {session: rpc.a.session, started: new Date().toISOString(), imports: {}};

  const sdk = await rpc.query(rpc.a.sdk);
  if ((sdk.permissions & 5) !== 5)
    throw Error('SDK mapping is not executable');
  const entries = Object.entries(imports);
  const targets = entries.map(([name]) => rpc.a.sdk + KNOWN_SDK_OFFSETS[name]);
  const low = Math.min(...targets);
  const high = Math.max(...targets) + BYTES;
  if (low < sdk.address || high > sdk.address + sdk.size)
    throw Error('Input offsets leave the qualified SDK mapping');

  // One contiguous read covers every HID entry point.
  const bytes = await rpc.read(low, high - low);
  for (const [name, entry] of entries) {
    const target = rpc.a.sdk + KNOWN_SDK_OFFSETS[name];
    const at = target - low;
    report.imports[name] = {
      slot: entry.slot,
      target,
      region: sdk,
      bytes: bytes.subarray(at, at + BYTES).toString('hex'),
      unresolved: false,
      slotSource: 'sdk'
    };
  }
  report.completed = new Date().toISOString();
  await fs.writeFile(path.join(directory, 'input-inspection.json'),
    JSON.stringify(report, null, 2), {flag: 'wx', mode: 0o600});
  console.log('Resolved input imports for ' + rpc.a.session);
}

if (require.main === module) main(process.argv[2]).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
module.exports = {main, KNOWN_SDK_OFFSETS};
