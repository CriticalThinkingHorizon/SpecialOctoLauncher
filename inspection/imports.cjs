// Build-independent, read-only resolution helpers for SmileBASIC application
// imports. The retail 4.4.9 build and the demo build do not share the
// application import table layout: the demo app adds/removes imports, so GOT
// slot offsets drift by multiples of 8 in either direction. Derive each slot
// from the application's own PLT thunk where possible, verify the target with
// the recorded first-64-byte signature, and only then fall back to a signature
// scan of the GOT window.
const crypto = require('node:crypto');
const {contains, decodePltThunk} = require('../rpc/main-module.cjs');

const MAX_ADDRESS = 2 ** 39;
// Import table drift between SmileBASIC builds is a handful of entries, not a
// whole mapping. Keep the normal search window small so a WAN session never
// spends minutes walking every PLT stub for an import that is not bound yet.
const PLT_SCAN_ENTRIES = 32;    // 512 bytes each side of the recorded thunk
const DIAGNOSTIC_PLT_SCAN_ENTRIES = 1024; // full window, only for diagnostics
const NARROW_SCAN_SPAN = 0x2000; // fast path for small demo-build shifts
const GOT_SCAN_SPAN = 0x40000;  // 256 KiB each side of a recorded slot
const MAX_SIGNATURE_CANDIDATES = 256; // hard bound for the slow fallback

const align = (value, size) => Math.floor(value / size) * size;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest();

// An unresolved lazy import points at the application's shared PLT0 resolver
// stub. In the retail build that stub lives inside the main code mapping, but
// the demo maps it separately, so detect the code rather than the address.
function isResolverStub(code) {
  return Buffer.isBuffer(code) && code.length >= 8 &&
    code.readUInt32LE(0) === 0xA9BF7BF0 &&
    ((code.readUInt32LE(4) & 0x9F000000) >>> 0) === 0x90000000;
}

class ImportResolver {
  constructor(rpc) {
    this.rpc = rpc;
    this.regionCache = new Map();
    this.targetCache = new Map();
    this.windowCache = new Map();
  }

  async region(address) {
    if (this.regionCache.has(address)) return this.regionCache.get(address);
    let region = null;
    try {
      const found = await this.rpc.query(address);
      if (contains(found, address)) region = found;
    } catch {}
    this.regionCache.set(address, region);
    return region;
  }

  async describe(value) {
    if (!Number.isSafeInteger(value) || value < 0x1000 || value >= MAX_ADDRESS) return null;
    if (this.targetCache.has(value)) return this.targetCache.get(value);
    const region = await this.region(value);
    const executable = !!region && (region.permissions & 5) === 5;
    let code = null;
    let digest = null;
    if (executable) {
      try {
        code = await this.rpc.read(value, 64);
        digest = hash(code);
      } catch {}
    }
    const described = {value, region, executable, code, hash: digest};
    this.targetCache.set(value, described);
    return described;
  }

  async readSlot(address) {
    try {
      return Number((await this.rpc.read(address, 8)).readBigUInt64LE());
    } catch { return null; }
  }

  async thunkAt(address) {
    const region = await this.region(address);
    if (!region || (region.permissions & 5) !== 5) return null;
    if (!contains(region, address) || address + 16 > region.address + region.size) return null;
    try { return await this.rpc.read(address, 16); } catch { return null; }
  }

  // Decode every PLT stub in a window around the recorded offset. Inserting or
  // removing one import moves the demo build's thunk by one 16-byte entry.
  async thunkSlots(pltOffset, entries = PLT_SCAN_ENTRIES) {
    const center = this.rpc.a.main + pltOffset;
    const region = await this.region(center);
    if (!region || (region.permissions & 5) !== 5) return [];
    const span = Math.max(1, entries | 0) * 16;
    const start = Math.max(region.address, align(center - span, 16));
    const end = Math.min(region.address + region.size, center + span + 16);
    if (end - start < 16) return [];
    let bytes;
    try { bytes = await this.rpc.read(start, end - start); } catch { return []; }
    const slots = new Map();
    for (let at = 0; at + 16 <= bytes.length; at += 16) {
      const address = start + at;
      const slot = decodePltThunk(bytes.subarray(at, at + 16), address);
      if (slot === null || slot < 0x1000 || slot >= MAX_ADDRESS || slot % 8) continue;
      const distance = Math.abs(address - center);
      const previous = slots.get(slot);
      if (!previous || previous.distance > distance)
        slots.set(slot, {slotAddress: slot, slotOffset: slot - this.rpc.a.main, distance});
    }
    return [...slots.values()].sort((a, b) => a.distance - b.distance);
  }

  async gotWindow(anchorOffset, span = GOT_SCAN_SPAN) {
    const anchor = this.rpc.a.main + anchorOffset;
    const region = await this.region(anchor);
    if (!region) return null;
    const start = Math.max(region.address, align(anchor - span, 8));
    const end = Math.min(region.address + region.size, anchor + span);
    if (end - start < 8) return null;
    const key = start + ':' + end;
    if (this.windowCache.has(key)) return {start, bytes: this.windowCache.get(key)};
    let bytes;
    try { bytes = await this.rpc.read(start, end - start); } catch { return null; }
    this.windowCache.set(key, bytes);
    return {start, bytes};
  }

  async findBySignature(anchorOffsets, signature, span = GOT_SCAN_SPAN) {
    const expected = Buffer.isBuffer(signature) ? signature : Buffer.from(signature, 'hex');
    const seen = new Set();
    let examined = 0;
    for (const anchorOffset of new Set(anchorOffsets)) {
      const window = await this.gotWindow(anchorOffset, span);
      if (!window) continue;
      const {start, bytes} = window;
      for (let at = 0; at + 8 <= bytes.length; at += 8) {
        const value = Number(bytes.readBigUInt64LE(at));
        if (!Number.isSafeInteger(value) || value < 0x1000 || value >= MAX_ADDRESS) continue;
        if (seen.has(value)) continue;
        seen.add(value);
        // A signature scan is a last resort. Bound the work so a slow link
        // fails fast instead of timing out the whole inspection stage.
        if (++examined > MAX_SIGNATURE_CANDIDATES) return null;
        const described = await this.describe(value);
        if (described?.hash?.equals(expected))
          return {slotOffset: start + at - this.rpc.a.main, described};
      }
    }
    return null;
  }

  // Find a pointer to `target` in the GOT region around the recorded slot.
  async findByValue(anchorOffsets, target, span = GOT_SCAN_SPAN) {
    for (const anchorOffset of new Set(anchorOffsets)) {
      const window = await this.gotWindow(anchorOffset, span);
      if (!window) continue;
      const {start, bytes} = window;
      for (let at = 0; at + 8 <= bytes.length; at += 8) {
        if (Number(bytes.readBigUInt64LE(at)) === target)
          return {slotOffset: start + at - this.rpc.a.main, value: target};
      }
    }
    return null;
  }

  // Resolve one import. `deltaHints` are slot shifts already proven by other
  // imports in the same build; `signature` is the recorded target code hash.
  //
  // Work is deliberately ordered cheapest-and-most-certain first:
  //   1. recorded thunk still matches -> its decoded GOT slot is authoritative
  //   2. shifts proven by sibling imports
  //   3. nearby PLT thunks (different build only, bounded window)
  //   4. a bounded signature scan (last resort only)
  // The previous version walked every decoded thunk in a 32 KiB window for
  // every import, which is thousands of round trips on a WAN link.
  async resolve(entry, {signature = null, deltaHints = [], thunkBytes} = {}) {
    const expected = signature ? Buffer.from(signature, 'hex') : null;
    const tried = new Set();
    const deferred = [];

    const consider = async (slotOffset, slotSource) => {
      if (!Number.isSafeInteger(slotOffset) || slotOffset <= 0 || tried.has(slotOffset))
        return null;
      tried.add(slotOffset);
      const value = await this.readSlot(this.rpc.a.main + slotOffset);
      if (value === null) return null;
      if (!value) {
        deferred.push({slotOffset, slotSource, target: 0, region: null,
          code: null, unresolved: true});
        return null;
      }
      const described = await this.describe(value);
      if (!described) return null;
      if (expected) {
        if (described.hash?.equals(expected))
          return {slotOffset, slotSource, target: value, region: described.region,
            code: described.code, unresolved: false};
        // A lazily bound slot still points at the application resolver stub.
        // Remember it as an unresolved result instead of scanning the world.
        if (!described.executable || isResolverStub(described.code))
          deferred.push({slotOffset, slotSource, target: value,
            region: described.region, code: described.code, unresolved: true});
        return null;
      }
      return {slotOffset, slotSource, target: value, region: described.region,
        code: described.code, unresolved: !described.executable};
    };

    const recorded = thunkBytes === undefined
      ? await this.thunkAt(this.rpc.a.main + entry.plt) : thunkBytes;
    const thunkMatches = recorded !== null && recorded !== undefined &&
      Buffer.isBuffer(recorded) && recorded.toString('hex') === entry.bytes;

    if (thunkMatches) {
      const direct = await consider(entry.slot, 'thunk');
      if (direct) return direct;
    }

    for (const delta of new Set(deltaHints)) {
      const found = await consider(entry.slot + delta, 'shift');
      if (found) return found;
    }

    if (!thunkMatches) {
      const table = await consider(entry.slot, 'table');
      if (table) return table;
      for (const thunk of await this.thunkSlots(entry.plt)) {
        const found = await consider(thunk.slotOffset, 'thunk');
        if (found) return found;
      }
    }

    if (expected && !thunkMatches) {
      const anchors = [entry.slot, ...deltaHints.map(delta => entry.slot + delta),
        ...tried];
      const found = await this.findBySignature(anchors, expected, NARROW_SCAN_SPAN);
      if (found)
        return {slotOffset: found.slotOffset, slotSource: 'signature',
          target: found.described.value, region: found.described.region,
          code: found.described.code, unresolved: false};
    }

    return deferred[0] || null;
  }
}

module.exports = {
  ImportResolver, isResolverStub,
  PLT_SCAN_ENTRIES, DIAGNOSTIC_PLT_SCAN_ENTRIES, GOT_SCAN_SPAN, MAX_ADDRESS
};
