const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn, execSync} = require('node:child_process');
const {chooseHost, connectCommand} = require('./rpc/connection.cjs');
const {pairingCode, createMultiServer} = require('./rpc/engine-connection.cjs');
const {NativeClient} = require('./rpc/native.cjs');
const {qualify} = require('./rpc/qualify.cjs');
const {serve} = require('./rpc/bridge.cjs');

async function runScript(scriptPath, args = [], timeout = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: __dirname
    });
    let timer = null;
    if (timeout) timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (_) {}
      reject(Error(`Script timed out after ${timeout}ms: ${scriptPath}`));
    }, timeout);
    child.once('error', reject);
    child.once('close', code => {
      if (timer) clearTimeout(timer);
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

async function mirrorToLatest(sessionDir) {
  try {
    const latestDir = path.join(__dirname, 'runs', 'latest');
    await fs.rm(latestDir, {recursive: true, force: true});
    await fs.mkdir(latestDir, {recursive: true});

    // Copy essential connection and display metadata
    const filesToCopy = ['connection.json', 'display-inspection.json', 'compatibility-module.json', 'vulkan-display.json',
      'codec-probe.json', 'codec-probe-progress.json', 'codec-symbols.json', 'sm-symbols.json'];
    for (const file of filesToCopy) {
      const src = path.join(sessionDir, file);
      const dst = path.join(latestDir, file);
      try {
        await fs.copyFile(src, dst);
      } catch (_) {}
    }
    await fs.mkdir(path.join(latestDir, 'shared'), {recursive: true});
    await fs.copyFile(path.join(__dirname, 'rpc/rpc.cjs'), path.join(latestDir, 'shared/rpc.cjs'));
  } catch (err) {
    // Non-critical mirror failure
  }
}

async function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('--debug');
  const fullInspect = process.argv.includes('--full-inspect') || process.argv.includes('--probe');
  const probeCodec = process.argv.includes('--probe-codec');
  const displayDiagnostic = process.argv.includes('--display-diagnostic') ||
    process.argv.includes('--diagnose-display');
  global.VERBOSE = verbose;

  console.log('[SETUP] Verifying Python and Pillow dependencies...');
  ensurePythonAndPillow();

  const hostArgs = process.argv.slice(2).filter((arg, i, all) => {
    if (arg.startsWith('-')) return false;
    const previous = all[i - 1];
    return previous !== '--pairingCode' && previous !== '-p';
  });
  const host = await chooseHost(hostArgs);
  const token = pairingCode(process.argv.slice(2));

  console.log('========================================================================');
  console.log('  HelloWorldS2 Multi-Client RPC Server & Hello World Runner');
  console.log('  Supports Multiple Concurrent S2 Consoles (LAN / Cloud WAN)');
  console.log('========================================================================');
  console.log(`Host IP: ${host}`);
  console.log(`Port:    39380`);
  if (probeCodec) console.log('Codec probe: enabled (runs during setup, before the native worker)');
  if (displayDiagnostic) console.log('Display diagnostic: enabled (read-only import layout capture)');
  console.log('\nManual Connection Command for SmileBASIC on S2:');
  console.log(connectCommand(host, token));
  console.log('========================================================================\n');

  await fs.mkdir(path.join(__dirname, 'runs'), {recursive: true, mode: 0o700});

  const activeSessions = new Map();
  let sessionCounter = 0;

  const onSignal = () => {
    console.log('\n[SERVER] Shutdown signal received. Terminating all active console sessions...');
    for (const [id, session] of activeSessions.entries()) {
      console.log(`[SERVER] Cleaning up session ${id}...`);
      if (session.loopChild) {
        try { session.loopChild.kill('SIGTERM'); } catch (_) {}
      }
      session.bridge?.close().catch(() => {});
      session.native?.stop().catch(() => {});
    }
    activeSessions.clear();
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const argApp = process.argv.slice(2).find(a => a.startsWith('--app='))?.split('=')[1]
    || hostArgs.filter(value => value !== host)[0];
  const targetApp = argApp || 'launcher';

  // Handler for an individual S2 console session
  async function handleSession(connected) {
    const sessionNum = ++sessionCounter;
    const clientIp = connected.clientIp || '127.0.0.1';
    const clientPort = connected.clientPort || 0;
    const sessionId = `session-${sessionNum}-${clientIp.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const sessionDir = path.join(__dirname, 'runs', sessionId);

    console.log(`\n========================================================================`);
    console.log(`[CLIENT CONNECTED] S2 Console #${sessionNum} connected from ${clientIp}:${clientPort}`);
    console.log(`  Assigned Session ID: ${sessionId}`);
    console.log(`  Workspace Directory: ${sessionDir}`);
    console.log(`========================================================================`);

    await fs.rm(sessionDir, {recursive: true, force: true});
    await fs.mkdir(sessionDir, {recursive: true});

    let native = null;
    let bridge = null;
    let loopChild = null;

    try {
      native = new NativeClient(connected.connection, connected.addresses);

      console.log(`[SESSION #${sessionNum}] Qualifying native session...`);
      const qualification = await qualify(native);
      console.log(`[SESSION #${sessionNum}] Qualification passed (platform=${qualification.platform})`);

      // Clean up any leftover worker pthread from previous dropped session
      try {
        const workerStateOffset = native.addresses.scratch + 0x7e000;
        const prevWorker = await native.read(workerStateOffset, 48);
        if (prevWorker.readUInt32LE(0) === 0x574f524b) {
          console.log(`[SESSION #${sessionNum}] [RECOVERY] Detected active worker from previous session. Stopping cleanly...`);
          const selector = Number(prevWorker.readBigUInt64LE(16));
          const exit = prevWorker.readBigUInt64LE(24);
          const thread = prevWorker.readBigUInt64LE(32);

          const exitBuf = Buffer.alloc(8);
          exitBuf.writeBigUInt64LE(exit);
          await native.write(selector, exitBuf);

          const threadCode = require('./rpc/thread-code.json').functions;
          const sdk = native.addresses.sdk;
          const until = Date.now() + 500;
          while (Date.now() < until) {
            const state = (await native.callAddress(sdk + threadCode.tryWait.offset, [thread])).result;
            if (state === 1n) break;
            await new Promise(r => setTimeout(r, 10));
          }
          await native.callAddress(sdk + threadCode.join.offset, [thread, workerStateOffset + 40]);
          await native.write(workerStateOffset, Buffer.alloc(48));
          console.log(`[SESSION #${sessionNum}] [RECOVERY] Previous worker stopped and cleaned up.`);
        }
      } catch (recoveryErr) {
        console.warn(`[SESSION #${sessionNum}] [RECOVERY] Worker cleanup notice:`, recoveryErr.message);
      }

      console.log(`[SESSION #${sessionNum}] Starting dedicated RPC bridge server...`);
      bridge = await serve(native);
      bridge.keepAwake(qualification.activity);

      await fs.mkdir(path.join(sessionDir, 'shared'), {recursive: true});
      await fs.copyFile(
        path.join(__dirname, 'rpc/rpc.cjs'),
        path.join(sessionDir, 'shared/rpc.cjs')
      );
      await fs.writeFile(
        path.join(sessionDir, 'connection.json'),
        JSON.stringify({
          port: bridge.port,
          token: bridge.token,
          addresses: {...native.addresses, session: sessionId, target: 's2'}
        }, null, 2)
      );

      console.log(`[SESSION #${sessionNum}] Bridge ready on local port ${bridge.port}.`);

      // Track active session
      const sessionRecord = {
        id: sessionId,
        num: sessionNum,
        clientIp,
        clientPort,
        native,
        bridge,
        loopChild: null,
        dir: sessionDir,
        startedAt: new Date()
      };
      activeSessions.set(sessionId, sessionRecord);

      if (displayDiagnostic) {
        console.log(`\n[SESSION #${sessionNum}] [DIAGNOSTIC] Capturing display/import layout...`);
        await runScript(path.join(__dirname, 'inspection/display-diagnostic.cjs'), [sessionDir], 180000);
        console.log(`[SESSION #${sessionNum}] [DIAGNOSTIC] Complete.`);
        console.log(`[SESSION #${sessionNum}] [DIAGNOSTIC] Send this folder privately: ${path.join(sessionDir, 'diagnostic')}`);
        await new Promise(resolve => {
          const done = () => resolve();
          connected.connection.socket.once('close', done);
          connected.connection.socket.once('error', done);
        });
        console.log(`[SESSION #${sessionNum}] [DIAGNOSTIC] Console disconnected; capture retained.`);
        return;
      }

      // Fast, streamlined setup pipeline for Vulkan display initialization
      console.log(`\n[SESSION #${sessionNum}] Setting up S2 Vulkan display pipeline...`);

      console.log(`[SESSION #${sessionNum}] [1/4] Inspecting Display Imports (VI & NVN Bootstrap)...`);
      await runScript(path.join(__dirname, 'inspection/inspect-display.cjs'), [sessionDir], 180000);

      console.log(`[SESSION #${sessionNum}] [2/4] Inspecting Driver Compatibility Module...`);
      await runScript(path.join(__dirname, 'inspection/inspect-compatibility.cjs'), [sessionDir], 180000);

      console.log(`[SESSION #${sessionNum}] [3/4] Inspecting Input & Controller State...`);
      await runScript(path.join(__dirname, 'inspection/inspect-input.cjs'), [sessionDir], 120000);

      if (probeCodec) {
        // Run before hello-runner starts the native worker: the probe allocates
        // through the SDK and opens service handles, which must not race the
        // launcher's autonomous frame loop.
        console.log(`[SESSION #${sessionNum}] [PROBE] Inspecting codec/image symbols (pre-worker)...`);
        await runScript(path.join(__dirname, 'inspection/codec-probe.cjs'), [sessionDir, '--symbols-only'], 120000);
      }

      console.log(`[SESSION #${sessionNum}] [4/4] Setting Up Vulkan Display Resources...`);
      console.log(`[SESSION #${sessionNum}] Each native call is logged as [Vulkan] <name>. ` +
        `If this step stalls, send ${path.join(sessionDir, 'vulkan-display.json')} (the last operation is the one that hung).`);
      await runScript(path.join(__dirname, 'inspection/vulkan-copy.cjs'), [sessionDir, 'display'], 300000);
      console.log(`✔ [SESSION #${sessionNum}] Vulkan display pipeline ready.`);

      // Optional deep probes (enabled with --full-inspect)
      if (fullInspect) {
        console.log(`\n[SESSION #${sessionNum}] Running Deep Subsystem Probes (--full-inspect enabled)...`);
        await runScript(path.join(__dirname, 'inspection/fs-inspect.cjs'), [sessionDir]);
        await runScript(path.join(__dirname, 'inspection/swkbd-inspect.cjs'), [sessionDir]);
        await runScript(path.join(__dirname, 'inspection/web-inspect.cjs'), [sessionDir]);
      }

      // Update runs/latest mirror for standalone inspection scripts
      await mirrorToLatest(sessionDir);

      // Launch independent hello-runner for this console
      console.log(`\n[SESSION #${sessionNum}] Starting ${targetApp} Direct Execution Loop...`);
      loopChild = spawn(process.execPath, [path.join(__dirname, 'runtime/hello-runner.cjs'), sessionDir, 'auto', targetApp], {
        cwd: __dirname,
        stdio: 'inherit'
      });
      sessionRecord.loopChild = loopChild;

      console.log(`\n[SESSION #${sessionNum} ACTIVE] S2 Console (${clientIp}) running ${targetApp}. Total active consoles: ${activeSessions.size}`);

      // Wait until this specific console disconnects
      await new Promise(resolve => {
        const done = () => resolve();
        connected.connection.socket.once('close', done);
        connected.connection.socket.once('error', done);
        loopChild.once('close', done);
      });

    } catch (sessionErr) {
      console.error(`[SESSION #${sessionNum} ERROR]:`, sessionErr.message);
    } finally {
      if (loopChild) {
        try { loopChild.kill('SIGTERM'); } catch (_) {}
      }
      await bridge?.close().catch(() => {});
      await native?.stop().catch(() => {});
      activeSessions.delete(sessionId);
      console.log(`\n[SESSION #${sessionNum} CLOSED] Console ${clientIp} disconnected. Active sessions remaining: ${activeSessions.size}`);
    }
  }

  // Start Multi-Client TCP Server
  createMultiServer({
    host,
    port: 39380,
    token,
    onWaiting() {
      console.log(`[SERVER LISTENING] Waiting for S2 console connections on port 39380...`);
      console.log(`Multiple consoles can connect simultaneously!`);
      console.log(`Run 'START' on each S2 console to connect.\n`);
    },
    onConnect(connected) {
      // Handle each connected console concurrently without blocking the server listener
      handleSession(connected).catch(err => {
        console.error('[SESSION FATAL ERROR]:', err);
      });
    },
    onRejected(msg) {
      console.warn('[CONNECTION REJECTED]:', msg);
    }
  });

  // Keep process running
  await new Promise(() => {});
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  });
}
