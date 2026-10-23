const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn, execSync} = require('node:child_process');
const {chooseHost, connectCommand} = require('./smilebasic/connection.cjs');
const {pairingCode, listen} = require('./smilebasic/engine/lib/connection.cjs');
const {NativeClient} = require('./smilebasic/engine/lib/native.cjs');
const {qualify} = require('./smilebasic/engine/lib/qualify.cjs');
const {serve} = require('./smilebasic/engine/lib/bridge.cjs');

async function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: __dirname
    });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(Error(`Script exited with code ${code}: ${scriptPath}`));
    });
  });
}

function ensurePythonAndPillow() {
  let pyCmd = null;
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      pyCmd = cmd;
      break;
    } catch (e) {}
  }
  if (!pyCmd) {
    throw new Error('Python 3 is required but was not found on the system. Please install Python 3.');
  }

  let hasPillow = false;
  try {
    execSync(`${pyCmd} -c "import PIL"`, { stdio: 'ignore' });
    hasPillow = true;
  } catch (e) {}

  if (!hasPillow) {
    console.log('[SETUP] Python Pillow (PIL) module not found. Attempting automatic installation via pip...');
    try {
      execSync(`${pyCmd} -m pip install Pillow`, { stdio: 'inherit' });
      console.log('[SETUP] Pillow installed successfully.');
    } catch (err) {
      throw new Error('Failed to install Python Pillow automatically. Please run: pip install Pillow');
    }
  }
}

async function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('--debug');
  global.VERBOSE = verbose;

  console.log('[SETUP] Verifying Python and Pillow dependencies...');
  ensurePythonAndPillow();

  const host = await chooseHost(process.argv.slice(2));
  const token = pairingCode(process.argv.slice(2));
  
  console.log('==================================================');
  console.log(' HelloWorldS2 Windows RPC Server & Hello World Runner');
  console.log('==================================================');
  console.log(`Host IP: ${host}`);
  console.log(`Port: 39380`);
  console.log('\nManual Connection Command for SmileBASIC on S2:');
  console.log(connectCommand(host, token));
  console.log('==================================================\n');

  await fs.mkdir(path.join(__dirname, 'runs'), {recursive: true, mode: 0o700});
  const directory = path.join(__dirname, 'runs', 'latest');
  await fs.rm(directory, {recursive: true, force: true});
  await fs.mkdir(directory, {recursive: true});

  let native, bridge;
  try {
    const connected = await listen({
      host,
      port: 39380,
      token,
      onRejected: console.error,
      onWaiting() {
        console.log('Waiting for SmileBASIC console connection on port 39380...');
        console.log('Run the REMOVE and START commands manually on the console now.');
      }
    });

    console.log('Console connected! Initializing native client...');
    native = new NativeClient(connected.connection, connected.addresses);
    
    console.log('Qualifying native session...');
    const qualification = await qualify(native);
    console.log('Qualification passed:', qualification);

    console.log('Starting RPC bridge server...');
    bridge = await serve(native);
    bridge.keepAwake(qualification.activity);

    await fs.mkdir(path.join(directory, 'shared'), {recursive: true});
    await fs.copyFile(
      path.join(__dirname, 'smilebasic/engine/shared/rpc.cjs'),
      path.join(directory, 'shared/rpc.cjs')
    );
    await fs.writeFile(
      path.join(directory, 'connection.json'),
      JSON.stringify({
        port: bridge.port,
        token: bridge.token,
        addresses: {...native.addresses, session: 'latest', target: 'switch2'}
      }, null, 2)
    );

    console.log(`Bridge server ready on port ${bridge.port}. Run folder: ${directory}`);

    // Run initialization pipeline asynchronously
    console.log('\n--- Running Console Initialization Pipeline ---');

    console.log('\n[1/6] Inspecting Display Imports (VI & NVN Bootstrap)...');
    await runScript(path.join(__dirname, 'homebrew-launcher/inspect-display.cjs'), [directory]);
    console.log('✔ Display inspection completed successfully.');

    console.log('\n[2/6] Inspecting Compatibility & Driver Symbol Module...');
    await runScript(path.join(__dirname, 'homebrew-launcher/inspect-compatibility.cjs'), [directory]);
    console.log('✔ Compatibility inspection completed successfully.');

    console.log('\n[3/6] Inspecting Input & HID State Functions...');
    await runScript(path.join(__dirname, 'homebrew-launcher/inspect-input.cjs'), [directory]);
    console.log('✔ Input inspection completed successfully.');

    console.log('\n[4/4] Setting Up Vulkan Display Resources...');
    await runScript(path.join(__dirname, 'homebrew-launcher/vulkan-copy.cjs'), [directory, 'display']);
    console.log('✔ Vulkan display setup completed successfully.');

    console.log('\n--- Starting Hello World Direct Execution Loop ---');
    const loopChild = spawn(process.execPath, [path.join(__dirname, 'homebrew-launcher/hello-runner.cjs'), directory, 'auto'], {
      cwd: __dirname,
      stdio: 'inherit'
    });

    console.log('\nHello World host is running. Press Ctrl+C to stop.');
    await new Promise(resolve => {
      const done = () => {
        process.removeListener('SIGINT', done);
        process.removeListener('SIGTERM', done);
        resolve();
      };
      connected.connection.socket.once('close', done);
      loopChild.once('close', done);
      process.once('SIGINT', done);
      process.once('SIGTERM', done);
    });

    loopChild.kill('SIGTERM');

  } catch (error) {
    console.error('Error in server execution:', error);
    throw error;
  } finally {
    await bridge?.close();
    await native?.stop();
    console.log('Server stopped.');
  }
}

function rpcProxy(directory) {
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));
  return rpc;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  });
}
