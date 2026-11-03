// The retail and demo SmileBASIC builds share the application's import GOT
// layout, but not its PLT code. An import that has not been resolved yet still
// points into the application's own executable mapping, so identify it from
// that mapping instead of a build-specific resolver address or thunk bytes.
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

module.exports = {contains, mainCodeRegion};
