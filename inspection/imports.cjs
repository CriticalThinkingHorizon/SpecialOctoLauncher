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
const PLT_SCAN_ENTRIES = 1024;  // 16 KiB each side of the recorded thunk
const NARROW_SCAN_SPAN = 0x2000; // fast path for small demo-build shifts
const GOT_SCAN_SPAN = 0x40000;  // 256 KiB each side of a recorded slot

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
  async thunkSlots(pltOffset) {
    const center = this.rpc.a.main + pltOffset;
    const region = await this.region(center);
    if (!region || (region.permissions & 5) !== 5) return [];
    const start = Math.max(region.address, align(center - PLT_SCAN_ENTRIES * 16, 16));
    const end = Math.min(region.address + region.size, center + PLT_SCAN_ENTRIES * 16 + 16);
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
    const expected = Buffer.from(signature, 'hex');
    const seen = new Set();
    for (const anchorOffset of new Set(anchorOffsets)) {
      const window = await this.gotWindow(anchorOffset, span);
      if (!window) continue;
      const {start, bytes} = window;
      for (let at = 0; at + 8 <= bytes.length; at += 8) {
        const value = Number(bytes.readBigUInt64LE(at));
        if (!Number.isSafeInteger(value) || value < 0x1000 || value >= MAX_ADDRESS) continue;
        if (seen.has(value)) continue;
        seen.add(value);
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
  async resolve(entry, {signature = null, deltaHints = []} = {}) {
    const thunks = await this.thunkSlots(entry.plt);
    const thunkOffsets = new Set(thunks.map(thunk => thunk.slotOffset));
    const candidates = new Map();
    const add = (offset, source) => {
      if (Number.isSafeInteger(offset) && offset > 0 && !candidates.has(offset))
        candidates.set(offset, source);
    };
    for (const delta of deltaHints) {
      const offset = entry.slot + delta;
      add(offset, thunkOffsets.has(offset) ? 'thunk' : 'shift');
    }
    add(entry.slot, thunkOffsets.has(entry.slot) ? 'thunk' : 'table');
    for (const thunk of thunks) add(thunk.slotOffset, 'thunk');

    let deferred = null;
    for (const [slotOffset, slotSource] of candidates) {
      const value = await this.readSlot(this.rpc.a.main + slotOffset);
      if (value === null) continue;
      if (!value) { deferred ??= {slotOffset, slotSource, value: 0}; continue; }
      const described = await this.describe(value);
      if (!described?.executable) continue;
      if (signature) {
        if (described.hash?.equals(Buffer.from(signature, 'hex')))
          return {slotOffset, slotSource, target: value, region: described.region,
            code: described.code, unresolved: false};
        continue;
      }
      if (slotSource === 'shift')
        return {slotOffset, slotSource, target: value, region: described.region,
          code: described.code, unresolved: false};
      deferred ??= {slotOffset, slotSource, value, described};
    }

    if (signature) {
      const anchors = [entry.slot, ...deltaHints.map(delta => entry.slot + delta),
        ...[...candidates.keys()]];
      // The demo app shifts imports by a handful of entries, so scan a narrow
      // window first and only fall back to the full GOT window if needed.
      let found = await this.findBySignature(anchors, signature, NARROW_SCAN_SPAN);
      if (!found) found = await this.findBySignature(anchors, signature);
      if (found)
        return {slotOffset: found.slotOffset, slotSource: 'signature',
          target: found.described.value, region: found.described.region,
          code: found.described.code, unresolved: false};
    }

    if (deferred)
      return {slotOffset: deferred.slotOffset, slotSource: deferred.slotSource,
        target: deferred.value, region: deferred.described?.region || null,
        code: deferred.described?.code || null, unresolved: !deferred.value};
    return null;
  }
}

module.exports = {
  ImportResolver, isResolverStub,
  PLT_SCAN_ENTRIES, GOT_SCAN_SPAN, MAX_ADDRESS
};
