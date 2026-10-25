const nativeClient = require('../native/client.cjs');
const timingDefs = require('../../rpc/timing-code.json').functions;
const ipcDefs = require('../native/ipc-functions.json');
const svcDefs = require('../native/service-functions.json');

let cachedSystemClient = null;

async function getClient(rpc) {
  if (cachedSystemClient) return cachedSystemClient;
  cachedSystemClient = await nativeClient.create(rpc, {
    tick: { offset: timingDefs.tick.offset, hex: timingDefs.tick.bytes },
    frequency: { offset: timingDefs.frequency.offset, hex: timingDefs.frequency.bytes },
    priority: { offset: timingDefs.priority.offset, hex: timingDefs.priority.bytes },
    aruid: ipcDefs.aruid,
    audioInputs: svcDefs.audioInputs
  });
  return cachedSystemClient;
}

async function create(rpc) {
  const api = await getClient(rpc);
  return {
    async now() {
      const tickVal = await api.call('tick');
      const freqVal = await api.call('frequency');
      const posixMs = BigInt(Date.now());
      const d = new Date(Number(posixMs));
      return {
        steadyTick: tickVal,
        steadyFreq: freqVal > 0n ? freqVal : 19200000n,
        posixSeconds: posixMs / 1000n,
        posixMillis: posixMs,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        hour: d.getHours(),
        minute: d.getMinutes(),
        second: d.getSeconds()
      };
    },
    async systemInfo() {
      const tickVal = await api.call('tick');
      const freqVal = await api.call('frequency');
      const prioVal = await api.call('priority');
      const aruidVal = await api.call('aruid');
      return {
        steadyTick: tickVal,
        steadyFreq: Number(freqVal > 0n ? freqVal : 19200000n),
        threadPriority: Number(BigInt.asIntN(32, prioVal)),
        aruid: aruidVal,
        mainBase: BigInt(rpc.a.main),
        sdkBase: BigInt(rpc.a.sdk),
        hostPid: process.pid
      };
    },
    async listAudioInputs(maxCount = 8) {
      const infoStride = 64; // AudioInInfo: 64 bytes (device name UTF-8)
      const count = Math.max(1, Math.min(maxCount, 8));
      await api.write(0x1000, Buffer.alloc(count * infoStride));
      const found = Number(BigInt.asIntN(32, await api.call('audioInputs', [api.base + 0x1000, count])));
      const names = [];
      if (found > 0) {
        const raw = await api.read(0x1000, Math.min(found, count) * infoStride);
        for (let i = 0; i < Math.min(found, count); i++) {
          const name = raw.subarray(i * infoStride, (i + 1) * infoStride).toString('utf8').replace(/\0.*$/, '');
          if (name) names.push(name);
        }
      }
      return { count: Math.max(0, found), names };
    },
    async ToPosixTimeFromUtc(calendarTime) {
      return BigInt(Math.floor(Date.now() / 1000));
    }
  };
}

module.exports = { create };
