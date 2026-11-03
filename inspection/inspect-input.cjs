// Resolve input imports afresh for the connected console session.
//
// The retail 4.4.9 and demo builds share the same SDK (the launcher checks its
// CRC) but the demo application imports a different set of functions, so GOT
// slots can move by a few entries. Target the SDK directly and use the GOT only
// to locate the slot and to resolve lazily-bound entries in place.
const fs = require('node:fs/promises');
const path = require('node:path');
const {contains, mainCodeRegion} = require('../rpc/main-module.cjs');
const {ImportResolver, isResolverStub} = require('./imports.cjs');

const KNOWN_SDK_OFFSETS = {
  '_ZN2nn3hid19GetTouchScreenStateILm16EEEvPNS0_16TouchScreenStateIXT_EEE': 4852400,
  '_ZN2nn3hid15GetNpadStyleSetERKj': 4844048,
  '_ZN2nn3hid12GetNpadStateEPNS0_17NpadHandheldStateERKj': 4845408,
  '_ZN2nn3hid12GetNpadStateEPNS0_16NpadFullKeyStateERKj': 4845184,
  '_ZN2nn3hid12GetNpadStateEPNS0_16NpadJoyDualStateERKj': 4847136,
  '_ZN2nn3hid12GetNpadStateEPNS0_16NpadJoyLeftStateERKj': 4847360,
  '_ZN2nn3hid12GetNpadStateEPNS0_17NpadJoyRightStateERKj': 4847584,
};

const align = (value, size) => Math.floor(value / size) * size;

async function main(directory) {
  directory = path.resolve(directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  const imports = require('./input-imports.json');
  const resolver = new ImportResolver(rpc);
  const report = {session: rpc.a.session, started: new Date().toISOString(), imports: {}};
  const code = await mainCodeRegion(rpc);

  // Read one window covering the input block and locate the slots that already
  // hold the expected SDK target. This works for both builds regardless of how
  // far the demo application's import table has drifted.
  const recorded = Object.values(imports).map(entry => entry.slot);
  const low = Math.min(...recorded) - 0x4000;
  const high = Math.max(...recorded) + 0x4000;
  const anchor = rpc.a.main + Math.min(...recorded);
  const region = await resolver.region(anchor);
  if (!region) throw Error('Input import table is not mapped');
  const start = Math.max(region.address, align(rpc.a.main + low, 8));
  const end = Math.min(region.address + region.size, rpc.a.main + high);
  const window = end - start >= 8 ? await rpc.read(start, end - start) : Buffer.alloc(0);

  const located = new Map();
  for (const [name, entry] of Object.entries(imports)) {
    const expected = rpc.a.sdk + KNOWN_SDK_OFFSETS[name];
    for (let at = 0; at + 8 <= window.length; at += 8) {
      if (Number(window.readBigUInt64LE(at)) !== expected) continue;
      located.set(name, start + at - rpc.a.main);
      break;
    }
    if (!located.has(name)) located.set(name, null);
  }

  const shifts = new Map();
  for (const [name, slot] of located) {
    if (slot === null) continue;
    const shift = slot - imports[name].slot;
    shifts.set(shift, (shifts.get(shift) || 0) + 1);
  }
  // The demo build shifts whole blocks by a fixed number of entries. Use the
  // most common verified shift for entries that are still lazily bound.
  let delta = 0;
  if (shifts.size) delta = [...shifts].sort((a, b) => b[1] - a[1])[0][0];
  const deltaProven = shifts.size > 0;

  for (const [name, entry] of Object.entries(imports)) {
    const target = rpc.a.sdk + KNOWN_SDK_OFFSETS[name];
    const slot = located.get(name) ?? entry.slot + delta;
    const slotAddress = rpc.a.main + slot;
    let current = null;
    try { current = Number((await rpc.read(slotAddress, 8)).readBigUInt64LE()); } catch {}
    const currentDescription = current ? await resolver.describe(current) : null;
    const alreadyResolved = current === target;
    // Only patch slots we are confident about: either the slot already held the
    // exact target, or a sibling input import proved the block shift.
    if (!alreadyResolved && deltaProven && current !== null &&
        (!current || isResolverStub(currentDescription?.code))) {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(target));
      await rpc.write(slotAddress, buffer);
    }
    const targetRegion = await resolver.region(target);
    if (!targetRegion || (targetRegion.permissions & 5) !== 5 || targetRegion.ipcReferences)
      throw Error('Input import is not in executable memory: ' + name);
    if (contains(code, target))
      throw Error('Input import resolved inside the application image: ' + name);
    const bytes = await rpc.read(target, Math.min(256, targetRegion.address + targetRegion.size - target));
    report.imports[name] = {slot, target, region: targetRegion, bytes: bytes.toString('hex'),
      unresolved: false, slotSource: alreadyResolved ? 'sdk' : deltaProven ? 'shift' : 'table'};
  }
  report.completed = new Date().toISOString();
  await fs.writeFile(path.join(directory, 'input-inspection.json'), JSON.stringify(report, null, 2),
    {flag: 'wx', mode: 0o600});
  console.log('Resolved input imports for ' + rpc.a.session);
}
if (require.main === module) main(process.argv[2]).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
module.exports = {main, KNOWN_SDK_OFFSETS};
