// Direct Hello World execution, skipping the Homebrew Launcher in its entirety.
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const {journal} = require('./journal.cjs');
const {create} = require('./native-six.cjs');
const {prepare} = require('./gpu-app.cjs');
const catalogTools = require('./app-catalog.cjs');
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
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
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

    const checkFile = path.join(directory, stem + '-check.json');
    await fs.writeFile(checkFile, JSON.stringify({session: rpc.a.session, passed: true, scratchRestored: true}, null, 2));

    console.log('Starting Hello World continuous loop...');
    const {spawn} = require('node:child_process');
    const loopChild = spawn(process.execPath, [path.join(__dirname, 'launcher-loop.cjs'), directory, stem], {
      cwd: __dirname,
      stdio: 'inherit'
    });

    await new Promise(resolve => {
      const done = () => resolve();
      loopChild.once('close', done);
    });

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
