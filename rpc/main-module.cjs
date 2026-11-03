// The retail and demo SmileBASIC builds share the application's import GOT
// layout, but not its PLT code. An import that has not been resolved yet still
// points into the application's own executable mapping, so identify it from
// that mapping instead of a build-specific resolver address or thunk bytes.
// Decode the AArch64 PLT stub:
//   adrp x16, page
//   ldr  x17, [x16, #off]
//   add  x16, x16, #off
//   br   x17
// The encoded GOT address is stable for the thunk but not across application
// builds, so deriving it here avoids a build-specific slot table.
function decodePltThunk(bytes, thunkAddress) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== 16 ||
      !Number.isSafeInteger(thunkAddress) || thunkAddress < 0) return null;
  const adrp = bytes.readUInt32LE(0);
  if (((adrp & 0x9F000000) >>> 0) !== 0x90000000) return null;
  const rd = adrp & 0x1F;
  const immlo = (adrp >>> 29) & 3;
  const immhi = (adrp >>> 5) & 0x7FFFF;
  let imm = immhi * 4 + immlo;
  if (imm & 0x100000) imm -= 0x200000;
  const page = Math.floor(thunkAddress / 4096) * 4096 + imm * 4096;

  const ldr = bytes.readUInt32LE(4);
  if (((ldr & 0xFFC00000) >>> 0) !== 0xF9400000) return null;
  const ldrRn = (ldr >>> 5) & 0x1F;
  const ldrRt = ldr & 0x1F;
  const ldrOffset = ((ldr >>> 10) & 0xFFF) * 8;

  const add = bytes.readUInt32LE(8);
  if (((add & 0xFFC00000) >>> 0) !== 0x91000000) return null;
  const addRn = (add >>> 5) & 0x1F;
  const addRd = add & 0x1F;
  const addShift = (add >>> 22) & 3;
  const addOffset = ((add >>> 10) & 0xFFF) * (addShift === 1 ? 4096 : 1);

  const br = bytes.readUInt32LE(12);
  if (br !== 0xD61F0220) return null; // br x17
  if (rd !== 16 || ldrRn !== 16 || ldrRt !== 17 ||
      addRn !== 16 || addRd !== 16 || ldrOffset !== addOffset) return null;

  const slot = page + addOffset;
  if (!Number.isSafeInteger(slot) || slot < 0x1000 || slot >= 2 ** 39 || slot % 8) return null;
  return slot;
}

function contains(region, address) {
  return Number.isSafeInteger(address) &&
    address >= region.address && address < region.address + region.size;
}

async function mainCodeRegion(rpc) {
  const region = await rpc.query(rpc.a.main);
  if ((region.permissions & 5) !== 5 || !contains(region, rpc.a.main))
    throw Error('Application code mapping changed');
  return region;
}

module.exports = {contains, decodePltThunk, mainCodeRegion};
