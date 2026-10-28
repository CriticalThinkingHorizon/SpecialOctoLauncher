// Direct Hello World execution and continuous frame loop.
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const {journal} = require('./journal.cjs');
const {create} = require('./native-six.cjs');
const {prepare} = require('./gpu-app.cjs');
const catalogTools = require('./app-catalog.cjs');
const code = require('../rpc/thread-code.json').functions;
const timing = require('../rpc/timing-code.json').functions;
const sdkImage = require('../rpc/reference/sdk-checks.cjs');
const check = (v, m) => { if (!v) throw Error(m); };
const struct = (size, type, words = {}, pointers = {}) => {
  const b = Buffer.alloc(size);
  b.writeUInt32LE(type);
  for (const [a, v] of Object.entries(words)) b.writeUInt32LE(v, +a);
  for (const [a, v] of Object.entries(pointers)) b.writeBigUInt64LE(BigInt(v), +a);
  return b;
};

async function main(directory, attempt = 'auto') {
  directory = path.resolve(directory);
  const rpc = require(path.join(directory, 'shared/rpc.cjs')), sdk = rpc.a.sdk;
  const previous = JSON.parse(await fs.readFile(path.join(directory, 'vulkan-display.json')));
  const module = JSON.parse(await fs.readFile(path.join(directory, 'compatibility-module.json')));
  check(previous.session === rpc.a.session && previous.resourcesRetained, 'Wrong session');

  const r = previous.displayResources, device = BigInt(r.device), queue = BigInt(r.queue), swapchain = BigInt(r.swapchain);
  const stem = 'hello-' + attempt;
  const file = path.join(directory, stem + '.json');
  await fs.writeFile(file, '{}', {flag: 'wx'});

  const appName = process.argv[4] || 'launcher';
  const app = await catalogTools.readApp(path.join(__dirname, '../apps', appName));
  const report = {purpose: 'Hello World direct GPU execution', session: rpc.a.session, started: new Date().toISOString(), resourcesRetained: true, functions: {}, commands: []};
  const save = () => fs.writeFile(file, JSON.stringify(report, null, 2)), tracked = journal(report, save), fn = report.functions;

  const storageBytes = 8 * 1024 * 1024;
  const worker = await create(rpc, directory);
  async function resolve(name) {
    if (fn[name]) return fn[name];
    const s = module.symbols.find(s => s.name === name && s.section && s.type === 2);
    check(s, 'Missing ' + name);
    const a = module.base + s.offset, b = await rpc.read(a, 32);
    await rpc.request({command: 'verify-function', address: a, hex: b.toString('hex')});
    return fn[name] = a;
  }
  async function call(name, ...args) {
    const a = await resolve(name);
    return tracked(name, args, () => args.length > 4 ? worker.call(a, args) : rpc.callAddress(a, args).then(x => x.result));
  }
  const ok = async (name, ...args) => {
    const n = Number(BigInt.asIntN(32, await call(name, ...args)));
    check(n === 0, name + ': ' + n);
  };

  const p = rpc.a.scratch + 0x10000, saved = await rpc.read(p, 0x10000), put = (o, b) => rpc.write(p + o, b), ptr = async o => (await rpc.read(p + o, 8)).readBigUInt64LE();

  try {
    await put(0, Buffer.alloc(0x10000));
    check((await rpc.call(5732112, [p, 65536, 0x20000])).result === 0n, 'Shader staging allocation failed');
    const shaderStaging = Number(await ptr(0));
    check(Number.isSafeInteger(shaderStaging) && shaderStaging > 0 && shaderStaging % 65536 === 0, 'Invalid shader staging allocation');
    report.shaderStaging = {address: shaderStaging, bytes: 0x20000};
    await save();

    const binding = Buffer.alloc(24);
    binding.writeUInt32LE(7, 4);
    binding.writeUInt32LE(1, 8);
    binding.writeUInt32LE(49, 12);
    await put(0x200, binding);
    await put(0x100, struct(32, 32, {20: 1}, {24: p + 0x200}));
    await ok('vkCreateDescriptorSetLayout', device, p + 0x100, 0, p);
    const setLayout = await ptr(0);

    await put(0x100, struct(48, 30, {20: 1}, {24: p}));
    await ok('vkCreatePipelineLayout', device, p + 0x100, 0, p + 8);
    const layout = await ptr(8);

    await ok('vkEnumeratePhysicalDevices', BigInt(r.instance), p + 24, 0);
    check((await rpc.read(p + 24, 4)).readUInt32LE() === 1, 'Physical device count');
    await ok('vkEnumeratePhysicalDevices', BigInt(r.instance), p + 24, p + 32);
    const physical = await ptr(32);
    await call('vkGetPhysicalDeviceMemoryProperties', physical, p + 0x7000);
    const properties = await rpc.read(p + 0x7000, 520);

    await put(0x100, struct(56, 12, {32: 0x20}, {24: storageBytes}));
    await ok('vkCreateBuffer', device, p + 0x100, 0, p);
    const buffer = await ptr(0);
    await call('vkGetBufferMemoryRequirements', device, buffer, p + 0x200);
    const requirements = await rpc.read(p + 0x200, 24), size = requirements.readBigUInt64LE(), bits = requirements.readUInt32LE(16);
    let memoryType = -1;
    for (let i = 0; i < properties.readUInt32LE(); i++) {
      if ((bits & (1 << i)) && ((properties.readUInt32LE(4 + i * 8) & 6) === 6)) {
        memoryType = i;
        break;
      }
    }
    check(memoryType >= 0 && size <= 33554432n, 'Coherent storage memory unavailable');
    await put(0x100, struct(32, 5, {24: memoryType}, {16: size}));
    await ok('vkAllocateMemory', device, p + 0x100, 0, p);
    const memory = await ptr(0);
    await ok('vkBindBufferMemory', device, buffer, memory, 0);
    await put(0x100, struct(48, 1000271000, {}, {24: memory, 40: size}));
    await ok('vkMapMemory2', device, p + 0x100, p);
    const mapped = Number(await ptr(0));

    const getEffectiveDataSlice = (buf) => {
      let end = buf.length;
      while (end > 0 && buf[end - 1] === 0) end--;
      const aligned = Math.min(buf.length, Math.max(4096, (end + 4095) & ~4095));
      return buf.subarray(0, aligned);
    };
    let currentAtlasSlice = getEffectiveDataSlice(app.files.data.bytes);

    const initialBytes = Buffer.alloc(1024 + currentAtlasSlice.length);
    app.files.state.bytes.copy(initialBytes, 0);
    currentAtlasSlice.copy(initialBytes, 1024);
    initialBytes.writeFloatLE(1, 960);
    await rpc.write(mapped, initialBytes);

    const previewBytes = 1920 * 1080 * 4;
    await put(0x100, struct(56, 12, {32: 2}, {24: previewBytes}));
    await ok('vkCreateBuffer', device, p + 0x100, 0, p);
    const previewBuffer = await ptr(0);
    await call('vkGetBufferMemoryRequirements', device, previewBuffer, p + 0x200);
    const previewReq = await rpc.read(p + 0x200, 24), previewSize = previewReq.readBigUInt64LE(), previewBits = previewReq.readUInt32LE(16);
    let previewType = -1;
    for (let j = 0; j < properties.readUInt32LE(); j++) {
      if ((previewBits & (1 << j)) && ((properties.readUInt32LE(4 + j * 8) & 6) === 6)) {
        previewType = j;
        break;
      }
    }
    check(previewType >= 0 && previewSize <= 33554432n, 'Preview memory unavailable');
    await put(0x100, struct(32, 5, {24: previewType}, {16: previewSize}));
    await ok('vkAllocateMemory', device, p + 0x100, 0, p);
    const previewMemory = await ptr(0);
    await ok('vkBindBufferMemory', device, previewBuffer, previewMemory, 0);
    await put(0x100, struct(48, 1000271000, {}, {24: previewMemory, 40: previewSize}));
    await ok('vkMapMemory2', device, p + 0x100, p);
    const previewMapped = Number(await ptr(0));
    report.capture = {buffer: String(previewBuffer), memory: String(previewMemory), mapped: previewMapped, bytes: previewBytes, width: 1920, height: 1080};

    const poolSize = Buffer.alloc(8);
    poolSize.writeUInt32LE(7);
    poolSize.writeUInt32LE(1, 4);
    await put(0x200, poolSize);
    await put(0x100, struct(40, 33, {20: 1, 24: 1}, {32: p + 0x200}));
    await ok('vkCreateDescriptorPool', device, p + 0x100, 0, p);
    const descriptorPool = await ptr(0);
    const sl = Buffer.alloc(8);
    sl.writeBigUInt64LE(setLayout);
    await put(0x200, sl);
    await put(0x100, struct(40, 34, {24: 1}, {16: descriptorPool, 32: p + 0x200}));
    await ok('vkAllocateDescriptorSets', device, p + 0x100, p);
    const descriptor = await ptr(0);
    const bufferInfo = Buffer.alloc(24);
    bufferInfo.writeBigUInt64LE(buffer);
    bufferInfo.writeBigUInt64LE(BigInt(storageBytes), 16);
    await put(0x200, bufferInfo);
    await put(0x100, struct(64, 35, {32: 1, 36: 7}, {16: descriptor, 48: p + 0x200}));
    await call('vkUpdateDescriptorSets', device, 1, p + 0x100, 0, 0);

    report.controls = {buffer: String(buffer), memory: String(memory), mapped, setLayout: String(setLayout), descriptorPool: String(descriptorPool), descriptor: String(descriptor), bytes: storageBytes};
    report.layout = String(layout);

    await ok('vkGetSwapchainImagesKHR', device, swapchain, p + 24, 0);
    const count = (await rpc.read(p + 24, 4)).readUInt32LE();
    check(count > 0 && count <= 8, 'Image count');
    await ok('vkGetSwapchainImagesKHR', device, swapchain, p + 24, p + 0x1000);
    const images = [], views = [], semaphores = [];
    await put(0x100, struct(24, 9));
    await ok('vkCreateSemaphore', device, p + 0x100, 0, p);
    const acquired = await ptr(0);
    for (let i = 0; i < count; i++) {
      const image = await ptr(0x1000 + i * 8);
      images.push(image);
      await put(0x200, struct(80, 15, {32: 1, 36: 37, 56: 1, 64: 1, 72: 1}, {24: image}));
      await ok('vkCreateImageView', device, p + 0x200, 0, p);
      views.push(await ptr(0));
      await ok('vkCreateSemaphore', device, p + 0x100, 0, p);
      semaphores.push(await ptr(0));
    }
    await put(0x100, struct(24, 39, {20: previous.queueFamily}));
    await ok('vkCreateCommandPool', device, p + 0x100, 0, p);
    const pool = await ptr(0);

    report.resources = {device: String(device), queue: String(queue), swapchain: String(swapchain), images: images.map(String), views: views.map(String), semaphores: semaphores.map(String), acquired: String(acquired), pool: String(pool)};
    await save();

    const menuObj = {
      resources: report.resources,
      shaderStaging: report.shaderStaging,
      layout: report.layout,
      controls: report.controls,
      capture: report.capture
    };

    const preparedApps = {};
    const ensureAppPrepared = async (targetId) => {
      const freshApp = await catalogTools.readApp(path.join(__dirname, '../apps', targetId));
      const prev = preparedApps[targetId];
      if (!prev || prev.app.fingerprint !== freshApp.fingerprint) {
        console.log(`[CATALOG] Preparing GPU pipeline on-demand for ${freshApp.id} (${freshApp.name})...`);
        const prep = await prepare(rpc, menuObj, freshApp, directory);
        preparedApps[targetId] = { app: freshApp, prep };
      }
      return preparedApps[targetId];
    };

    const reloadCatalog = async () => {
      const scanned = await catalogTools.scan();
      return scanned.apps.filter(a => a.id !== 'launcher').map(a => a.id);
    };

    let launchableIds = await reloadCatalog();
    await ensureAppPrepared('launcher');
    if (appName !== 'launcher') {
      await ensureAppPrepared(appName);
    }
    let activeAppId = preparedApps[appName] ? appName : 'launcher';
    const appPrep = preparedApps[activeAppId].prep;
    report.pipeline = appPrep.pipeline;
    report.computePipeline = appPrep.computePipeline;
    report.computePipelines = appPrep.computePipelines;
    report.commands = appPrep.commands;
    report.ready = true;
    await save();
    console.log('Launcher GPU pipeline prepared successfully (apps load on-demand).');

    // Start continuous frame loop
    const inputInspection = JSON.parse(await fs.readFile(path.join(directory, 'input-inspection.json')));
    const input = inputInspection.imports['_ZN2nn3hid12GetNpadStateEPNS0_17NpadHandheldStateERKj'];
    const touch = inputInspection.imports['_ZN2nn3hid19GetTouchScreenStateILm16EEEvPNS0_16TouchScreenStateIXT_EEE'];

    const temp = rpc.a.scratch + 0x10000, savedScratch = await rpc.read(temp, 8);
    let base;
    try {
      check((await rpc.call(5732112, [temp, 4096, 0x400000])).result === 0n, 'Allocation failed');
      base = Number((await rpc.read(temp, 8)).readBigUInt64LE());
    } finally {
      await rpc.write(temp, savedScratch);
    }
    check(base > 0 && base % 4096 === 0, 'Bad allocation');

    const control = base + 0x1000;
    const lookup = sdk + 0x45c288;

    const resolveVk = (name) => {
      const s = module.symbols.find(s => s.name === name && s.section && s.type === 2);
      check(s, 'Missing ' + name);
      return module.base + s.offset;
    };
    const vkAcquireNextImage2KHR = resolveVk('vkAcquireNextImage2KHR');
    const vkQueueSubmit = resolveVk('vkQueueSubmit');
    const vkQueuePresentKHR = resolveVk('vkQueuePresentKHR');
    const vkQueueWaitIdle = resolveVk('vkQueueWaitIdle');

    // Verify all functions BEFORE calling or using them
    const verified = new Set();

    for (const c of [...Object.values(code), timing.tick]) {
      const expected = Buffer.from(c.bytes, 'hex').subarray(0, 256);
      await rpc.request({command: 'verify-function', address: sdk + c.offset, hex: expected.toString('hex')});
      verified.add(sdk + c.offset);
    }
    await rpc.request({command: 'verify-function', address: lookup, hex: sdkImage.bytes(0x45c288, 16).toString('hex')});
    verified.add(lookup);

    const freq = module.base + 0x13d6f0;
    await rpc.request({command: 'verify-function', address: freq, hex: '00ca9a52803ba072c0035fd6'});
    verified.add(freq);

    await rpc.request({command: 'verify-function', address: sdk + 0x586fb0, hex: require('../sdk/native/ipc-functions.json').copy.hex});
    verified.add(sdk + 0x586fb0);

    for (const address of [vkAcquireNextImage2KHR, vkQueueSubmit, vkQueuePresentKHR, vkQueueWaitIdle]) {
      await rpc.request({command: 'verify-function', address, hex: (await rpc.read(address, 32)).toString('hex')});
      verified.add(address);
    }

    await rpc.request({command: 'verify-function', address: input.target, hex: input.bytes.slice(0, 64)});
    verified.add(input.target);

    await rpc.request({command: 'verify-function', address: touch.target, hex: touch.bytes.slice(0, 64)});
    verified.add(touch.target);

    const data = Buffer.alloc(0x9000), putCtrl = (o, b) => b.copy(data, o), u64 = (o, v) => data.writeBigUInt64LE(BigInt(v), o);
    putCtrl(0x100, struct(56, 1000060010, {48: 1}, {16: swapchain, 24: 0xffffffffffffffffn, 32: acquired}));
    u64(0x200, acquired); data.writeUInt32LE(0x400, 0x210); u64(0x220, swapchain); data.writeUInt32LE(32, 0x230);
    const semObject = control + 0x800; u64(0x850, control + 0x880); report.resources.semaphores.forEach((v, i) => u64(0x880 + i * 8, v));
    putCtrl(0x600, struct(64, 1000001001, {16: 1, 32: 1}, {24: semObject + 0x28, 40: control + 0x220, 48: control}));

    for (let phase = 0; phase < report.commands.length; phase++) {
      const o = 0x1000 + phase * 0x100, obj = control + o;
      u64(o + 0x50, obj + 0x60);
      report.commands[phase].forEach((v, i) => u64(o + 0x60 + i * 8, v));
      putCtrl(o + 0x80, struct(72, 4, {16: 1, 40: 1, 56: 1}, {24: control + 0x200, 32: control + 0x210, 48: obj + 0x28, 64: semObject + 0x28}));
    }
    await rpc.write(control, data);

    const last = images.length - 1;
    await rpc.callAddress(lookup, [semObject, last]);

    const sdkRuntime = await require('../sdk/host/runtime.cjs').create({rpc, mapped: report.controls.mapped, directory});
    await rpc.write(report.controls.mapped + 0x7f0000, await sdkRuntime.hardware.poll());
    const padCalls = sdkRuntime.hardware.frameCalls(report.controls.mapped).slice(0, 6);
    for (const hc of padCalls) {
      verified.add(hc.function);
    }

    const frameCount = 30;
    const calls = [];
    const add = (fn, args, expectZero = false) => {
      calls.push({function: fn, args: [...args, ...Array(4 - args.length).fill(0)]});
    };
    add(sdk + timing.tick.offset, []);
    for (let f = 0; f < frameCount; f++) {
      const obj = control + 0x1000 + (f % report.commands.length) * 0x100;
      add(input.target, [report.controls.mapped, control + 0x230]);
      add(touch.target, [report.controls.mapped + 128]);
      for (const hc of padCalls) {
        add(hc.function, hc.args);
      }
      add(vkAcquireNextImage2KHR, [device.toString(), control + 0x100, control], true);
      add(lookup, [obj, {u32: control}]);
      add(lookup, [semObject, {u32: control}]);
      add(vkQueueSubmit, [queue.toString(), 1, obj + 0x80, 0], true);
      add(vkQueuePresentKHR, [queue.toString(), control + 0x600], true);
      add(vkQueueWaitIdle, [queue.toString()], true);
    }
    add(sdk + timing.tick.offset, []);

    const program = await require('../sdk/native/repeating.cjs').prepare(rpc, {base, code, calls, verified});
    await rpc.call(0x586fb0, [program.live, program.snapshot, program.frame.length]);
    const pointer = Buffer.alloc(8);
    pointer.writeBigUInt64LE(BigInt(program.live));
    await rpc.write(program.selector, pointer);

    check((await rpc.callAddress(sdk + code.create.offset, [base, 0, sdk + code.longjmp.offset, program.live])).result === 0n, 'pthread_create failed');
    const thread = (await rpc.read(base, 8)).readBigUInt64LE();
    console.log('Hello World continuous native frame loop running.');

    // Save worker state for clean reconnection recovery across sessions
    const workerStateOffset = rpc.a.scratch + 0x7e000;
    const workerState = Buffer.alloc(48);
    workerState.writeUInt32LE(0x574f524b, 0); // 'WORK'
    workerState.writeBigUInt64LE(BigInt(base), 8);
    workerState.writeBigUInt64LE(BigInt(program.selector), 16);
    workerState.writeBigUInt64LE(BigInt(program.exit), 24);
    workerState.writeBigUInt64LE(thread, 32);
    workerState.writeBigUInt64LE(BigInt(r.layer || 0), 40);
    await rpc.write(workerStateOffset, workerState);

    const APP_TABLE_OFFSET = rpc.a.scratch + 0x7d000;
    const SLOT_STRIDE = 0x40000; // 256 KiB per app slot
    const MAX_CACHED_SLOTS = 15;
    let cachedMask = 0;

    const cacheAllApps = async () => {
      console.log('[CACHE] Preparing local app cache on S2 tmp:/ and mapped GPU memory...');
      let fsService;
      try {
        fsService = await require('../sdk/host/fs.cjs').create(rpc);
        await fsService.mkdirPath('tmp:/cache');
      } catch (e) {
        console.warn('[CACHE] Notice preparing tmp:/cache:', e.message);
      }

      // App slot 0 is always launcher; subsequent slots correspond to catalog rows
      const allAppIds = ['launcher', ...launchableIds.slice(0, MAX_CACHED_SLOTS - 1)];
      const appCount = allAppIds.length;
      console.log(`[CACHE] Staging ${appCount} apps into GPU memory and tmp:/ storage...`);

      const tableBuf = Buffer.alloc(64 + appCount * 64);
      tableBuf.writeUInt32LE(0x41505053, 0); // 'APPS' magic
      tableBuf.writeBigUInt64LE(1n, 8);      // version 1
      tableBuf.writeBigUInt64LE(BigInt(appCount), 16);
      tableBuf.writeBigUInt64LE(0n, 24);     // activeSlot = 0 (launcher)
      tableBuf.writeBigUInt64LE(BigInt(mapped), 40);
      tableBuf.writeBigUInt64LE(BigInt(control), 48);
      tableBuf.writeBigUInt64LE(BigInt(semObject), 56);

      cachedMask = (appCount > 1) ? ((1 << (appCount - 1)) - 1) : 0;
      tableBuf.writeBigUInt64LE(BigInt(cachedMask), 32); // cachedBitmask

      // Read current directory entries response (1048 bytes) from launcher to preserve app names offline
      let launcherDirEntries = Buffer.alloc(1048);
      try {
        launcherDirEntries = await rpc.read(mapped + 0x7f0000 + 4100, 1048);
      } catch (dirErr) {
        console.warn('[CACHE] Notice reading dir entries:', dirErr.message);
      }

      for (let slot = 0; slot < appCount; slot++) {
        const appId = allAppIds[slot];
        console.log(`[CACHE] Staging slot ${slot} (${appId})...`);
        await ensureAppPrepared(appId);
        const { app: targetApp, prep } = preparedApps[appId];

        // 1. Build command buffer block (512 bytes)
        const cmdBuf = Buffer.alloc(prep.commands.length * 0x100);
        for (let phase = 0; phase < prep.commands.length; phase++) {
          const o = phase * 0x100, obj = control + 0x1000 + o;
          cmdBuf.writeBigUInt64LE(BigInt(obj + 0x60), o + 0x50);
          prep.commands[phase].forEach((v, i) => cmdBuf.writeBigUInt64LE(BigInt(v), o + 0x60 + i * 8));
          const submitStruct = struct(72, 4, {16: 1, 40: 1, 56: 1}, {24: control + 0x200, 32: control + 0x210, 48: obj + 0x28, 64: semObject + 0x28});
          submitStruct.copy(cmdBuf, o + 0x80);
        }

        // 2. Scratch state (240 bytes)
        const scratchState = Buffer.from(targetApp.files.state.bytes.subarray(784, 1024));
        scratchState.writeFloatLE(1, 960 - 784);
        if (slot === 0) {
          // Launcher slot: enforce ready state (c.game.z = 2), app count, and cachedMask so it never blocks waiting for RPC
          scratchState.writeUInt32LE(2, 792 - 784);
          scratchState.writeUInt32LE(appCount - 1, 796 - 784);
          scratchState.writeUInt32LE(cachedMask, 992 - 784);
        }

        // 3. Font atlas slice
        const atlasSlice = getEffectiveDataSlice(targetApp.files.data.bytes);
        const atlasLen = Math.min(atlasSlice.length, SLOT_STRIDE - 0x800);

        // Slot mapped address: mapped + 0x300000 + slot * SLOT_STRIDE
        const slotMapped = mapped + 0x300000 + slot * SLOT_STRIDE;
        await rpc.write(slotMapped, cmdBuf);
        await rpc.write(slotMapped + 0x200, scratchState);
        if (slot === 0 && launcherDirEntries.length >= 1048) {
          await rpc.write(slotMapped + 0x300, launcherDirEntries);
        }
        await rpc.write(slotMapped + 0x800, atlasSlice.subarray(0, atlasLen));

        // 4. Save to tmp:/cache/ on S2 filesystem
        if (fsService) {
          try {
            await fsService.writeBytesAt(`tmp:/cache/${appId}-state.bin`, 0, targetApp.files.state.bytes);
            await fsService.writeBytesAt(`tmp:/cache/${appId}-data.bin`, 0, atlasSlice.subarray(0, atlasLen));
          } catch (fsErr) {
            console.warn(`[CACHE] File cache warning for ${appId}:`, fsErr.message);
          }
        }

        // 5. Fill slot entry in tableBuf
        const entryOffset = 64 + slot * 64;
        tableBuf.writeBigUInt64LE(BigInt(slotMapped), entryOffset);           // cmdSrc
        tableBuf.writeBigUInt64LE(BigInt(cmdBuf.length), entryOffset + 8);    // cmdLen
        tableBuf.writeBigUInt64LE(BigInt(slotMapped + 0x200), entryOffset + 16); // scratchSrc
        tableBuf.writeBigUInt64LE(BigInt(scratchState.length), entryOffset + 24); // scratchLen
        tableBuf.writeBigUInt64LE(BigInt(slotMapped + 0x800), entryOffset + 32); // atlasSrc
        tableBuf.writeBigUInt64LE(BigInt(atlasLen), entryOffset + 40);         // atlasLen
        tableBuf.writeBigUInt64LE(1n, entryOffset + 48);                      // isCached
        tableBuf.writeBigUInt64LE(slot === 0 ? BigInt(slotMapped + 0x300) : 0n, entryOffset + 56); // dirEntriesSrc
      }

      // Write tableBuf to scratch memory at APP_TABLE_OFFSET
      await rpc.write(APP_TABLE_OFFSET, tableBuf);

      // Write cachedMask to mapped + 992 (c.stats.x) so [CACHED] badges appear
      const maskBuf = Buffer.alloc(4);
      maskBuf.writeUInt32LE(cachedMask, 0);
      await rpc.write(mapped + 992, maskBuf);

      // Dismiss modal by resetting c.reserved.w = 0 and c.game.z = 2
      const clearRes = Buffer.alloc(8);
      await rpc.write(mapped + 1016, clearRes);
      const readyZ = Buffer.alloc(4);
      readyZ.writeUInt32LE(2, 0);
      await rpc.write(mapped + 792, readyZ);

      console.log(`[CACHE] Successfully cached ${appCount} apps! Bitmask: 0x${cachedMask.toString(16)}`);
    };

    let stop = false;
    process.on('SIGINT', () => {
      console.log('\n[DETACH] Server received SIGINT. Detaching and leaving native app running autonomously on S2...');
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      console.log('\n[DETACH] Server received SIGTERM. Detaching and leaving native app running autonomously on S2...');
      process.exit(0);
    });

    const applyApp = async (name) => {
      const { app: targetApp, prep } = preparedApps[name];

      // 1. Switch command buffers immediately so the old app's compute shader stops running
      for (let phase = 0; phase < prep.commands.length; phase++) {
        const o = 0x1000 + phase * 0x100, obj = control + o;
        u64(o + 0x50, obj + 0x60);
        prep.commands[phase].forEach((v, i) => u64(o + 0x60 + i * 8, v));
        putCtrl(o + 0x80, struct(72, 4, {16: 1, 40: 1, 56: 1}, {24: control + 0x200, 32: control + 0x210, 48: obj + 0x28, 64: semObject + 0x28}));
      }
      await rpc.write(control + 0x1000, data.subarray(0x1000, 0x1000 + prep.commands.length * 0x100));

      // Wait ~20ms (one frame) so any in-flight GPU frame of the previous app completes
      await new Promise(r => setTimeout(r, 20));

      // 2. Clear previous SDK response payload length (offset 4104) while preserving request/response sequence numbers
      await rpc.write(mapped + 0x7f0000 + 4100, Buffer.alloc(1048));

      // 3. Always restore the target app's font atlas at mapped + 1024, clearing any dirty rows from previous apps
      const nextSlice = getEffectiveDataSlice(targetApp.files.data.bytes);
      const uploadBytes = Math.max(262144, nextSlice.length);
      const atlasUpload = targetApp.files.data.bytes.subarray(0, Math.min(targetApp.files.data.bytes.length, uploadBytes));
      await rpc.write(mapped + 1024, atlasUpload);
      currentAtlasSlice = nextSlice;

      // 4. Reset app scratch state (784..1024), clearing c.reserved.z (1016) & c.reserved.w (1020)
      const scratchState = Buffer.from(targetApp.files.state.bytes.subarray(784, 1024));
      scratchState.writeFloatLE(1, 960 - 784);
      await rpc.write(mapped + 784, scratchState);

      // 5. Combine all held buttons across handheld (mapped + 8) and PAD_SOURCES (mapped + 0x7f0000 + 640) into c.state.y (mapped + 84)
      let heldButtons = (await rpc.read(mapped + 8, 4)).readUInt32LE(0);
      const padSrcBuf = await rpc.read(mapped + 0x7f0000 + 640, 320);
      for (let i = 0; i < 5; i++) {
        if ((padSrcBuf.readUInt32LE(i * 64 + 32) & 1) !== 0) {
          heldButtons |= padSrcBuf.readUInt32LE(i * 64 + 8);
        }
      }
      const heldBuf = Buffer.alloc(4);
      heldBuf.writeUInt32LE(heldButtons >>> 0, 0);
      await rpc.write(mapped + 84, heldBuf);
      activeAppId = name;

      // Update activeSlot in AppTable and restore cachedMask in c.stats.x when in launcher
      if (cachedMask !== 0) {
        const slot = (name === 'launcher') ? 0 : launchableIds.indexOf(name) + 1;
        const slotBuf = Buffer.alloc(8);
        slotBuf.writeBigUInt64LE(BigInt(slot), 0);
        await rpc.write(APP_TABLE_OFFSET + 24, slotBuf);

        if (name === 'launcher') {
          const maskBuf = Buffer.alloc(4);
          maskBuf.writeUInt32LE(cachedMask, 0);
          await rpc.write(mapped + 992, maskBuf);
        }
      }
    };

    let closeLayerRequested = false;

    // Service SDK requests and launcher app selection / live reload while the native frame loop runs.
    while (!stop) {
      try {
        const currentEntry = preparedApps[activeAppId];
        await sdkRuntime.atBoundary({ fingerprint: `${currentEntry.app.id}-${currentEntry.app.fingerprint.slice(0, 8)}`, manifest: currentEntry.app.manifest });
        const reserved = await rpc.read(mapped + 1008, 16);
        const exitFlag = reserved.readUInt32LE(8);     // c.reserved.z (1016)
        const actionCode = reserved.readUInt32LE(12);  // c.reserved.w (1020)

        if (activeAppId === 'launcher' && actionCode === 97) {
          console.log('[CACHE] User pressed Y: Caching all apps for offline play...');
          await cacheAllApps();
        } else if (activeAppId === 'launcher' && actionCode === 99) {
          console.log('[LIVE UPDATE] Rescanning apps directory for compiled apps...');
          const clearW = Buffer.alloc(4);
          await rpc.write(mapped + 1020, clearW);
          launchableIds = await reloadCatalog();
          console.log('[LIVE UPDATE] Catalog updated:', launchableIds.join(', '));
        } else if (exitFlag !== 0) {
          if (activeAppId === 'launcher') {
            if (actionCode === 98) {
              console.log('[EXIT] Closing Vulkan layer and returning to SmileBASIC...');
              closeLayerRequested = true;
              stop = true;
              break;
            }
            launchableIds = await reloadCatalog();
            const idx = actionCode > 0 ? actionCode - 1 : 0;
            const targetId = launchableIds[idx] || launchableIds[0];
            console.log(`[LAUNCHER] Launch requested: actionCode=${actionCode}, idx=${idx} -> ${targetId} (catalog: ${launchableIds.length} apps)`);
            if (targetId) {
              console.log(`[LAUNCHER] Switching to app: ${targetId}`);
              await ensureAppPrepared(targetId);
              await applyApp(targetId);
            } else {
              await rpc.write(mapped + 1016, Buffer.alloc(8));
            }
          } else {
            console.log(`[LAUNCHER] Returning from ${activeAppId} to Homebrew Launcher...`);
            await applyApp('launcher');
          }
        }
      } catch (error) {
        console.error('[SDK] request failed:', error.message);
      }
      await new Promise(r => setTimeout(r, 16));
    }

    if (closeLayerRequested) {
      await program.stop();
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        const state = (await rpc.callAddress(sdk + code.tryWait.offset, [thread])).result;
        if (state === 1n) break;
        await new Promise(r => setTimeout(r, 10));
      }
      await rpc.callAddress(sdk + code.join.offset, [thread, base + 8]);
      await sdkRuntime.close();
      await rpc.write(rpc.a.scratch + 0x7e000, Buffer.alloc(48));

      if (r.layer) {
        try {
          console.log('[EXIT] Waiting for Vulkan queue idle and closing nn::vi::Layer...');
          await call('vkQueueWaitIdle', queue);
          await call('_ZN2nn2vi5Layer5CloseEb', Number(r.layer), 0);
          if (r.display) {
            await call('_ZN2nn2vi12CloseDisplayEPNS0_7DisplayE', BigInt(r.display));
          }
          console.log('[EXIT] Vulkan overlay layer closed cleanly.');
        } catch (closeErr) {
          console.warn('[EXIT] Layer teardown warning:', closeErr.message);
        }
      }
    } else {
      console.log('[DETACH] Server stopping. Leaving native frame loop running autonomously on S2 console.');
      try { await sdkRuntime.close(); } catch (e) {}
    }

  } catch (e) {
    report.error = e.stack;
    console.error(e);
    process.exitCode = 1;
    await save();
    throw e;
  } finally {
    await put(0, saved);
    report.scratchRestored = (await rpc.read(p, saved.length)).equals(saved);
    report.completed = new Date().toISOString();
    await save();
  }
}

if (require.main === module) main(process.argv[2], process.argv[3]).catch(e => { console.error(e); process.exitCode = 1; });
