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

  const app = await catalogTools.readApp(path.join(__dirname, '../apps/hello-world'));
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

    const initialBytes = Buffer.alloc(storageBytes);
    app.files.state.bytes.copy(initialBytes, 0);
    app.files.data.bytes.copy(initialBytes, 1024);
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

    console.log('Preparing Hello World GPU app via gpu-app.cjs...');
    const appPrep = await prepare(rpc, menuObj, app, directory);
    report.pipeline = appPrep.pipeline;
    report.computePipeline = appPrep.computePipeline;
    report.computePipelines = appPrep.computePipelines;
    report.commands = appPrep.commands;
    report.ready = true;
    await save();
    console.log('Hello World GPU app prepared successfully.');

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

    const frameCount = 60;
    const calls = [];
    const add = (fn, args, expectZero = false) => {
      calls.push({function: fn, args: [...args, ...Array(4 - args.length).fill(0)]});
    };
    add(sdk + timing.tick.offset, []);
    for (let f = 0; f < frameCount; f++) {
      const obj = control + 0x1000 + (f % report.commands.length) * 0x100;
      add(input.target, [report.controls.mapped, control + 0x230]);
      add(touch.target, [report.controls.mapped + 128]);
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

    let stop = false;
    process.on('SIGINT', () => stop = true);
    process.on('SIGTERM', () => stop = true);

    while (!stop) {
      await new Promise(r => setTimeout(r, 100));
    }

    await program.stop();
    await sdkRuntime.close();

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
