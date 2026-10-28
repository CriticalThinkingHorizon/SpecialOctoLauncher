#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const {chooseHost, connectCommand} = require('./connection.cjs');
const {pairingCode, listen} = require('./engine-connection.cjs');
const {NativeClient} = require('./native.cjs');
const {qualify} = require('./qualify.cjs');
const {serve} = require('./bridge.cjs');

async function main() {
  const host = await chooseHost(process.argv.slice(2)), token = pairingCode();
  await fs.mkdir(path.join(__dirname, '../runs'), {recursive:true, mode:0o700});
  const directory = await fs.mkdtemp(path.join(__dirname, '../runs/launcher-'));
  const record = {started: new Date().toISOString(), purpose: 'HBLauncher SmileBASIC session'};
  let native, pico, bridge;
  try {
    let key = '';
    try {
      key = (await fs.readFile(path.join(__dirname, 'pico-keyboard/secret'), 'utf8')).trim();
      pico = await require('./pico-keyboard/host.cjs').start({host, command: connectCommand(host, token), key,
        onStatus: console.log});
    } catch (e) {}
    const connected = await listen({host, port: 39380, token, onRejected: console.error,
      onWaiting() {console.log('Graphics listener ready. Reconnect the Pico in fresh SmileBASIC Direct mode.');
        console.log('Run folder: ' + directory);}});
    native = new NativeClient(connected.connection, connected.addresses);
    record.qualification = await qualify(native);
    bridge = await serve(native);
    bridge.keepAwake(record.qualification.activity);
    await fs.mkdir(path.join(directory, 'shared'));
    await fs.copyFile(path.join(__dirname, 'engine/shared/rpc.cjs'), path.join(directory, 'shared/rpc.cjs'));
    await fs.writeFile(path.join(directory, 'connection.json'), JSON.stringify({port: bridge.port, token: bridge.token,
      addresses: {...native.addresses, session: path.basename(directory), target: 's2'}}), {mode: 0o600});
    console.log('Qualified native session ready for graphics inspection.');
    await new Promise(resolve => {
      const done = () => {process.removeListener('SIGINT', done); process.removeListener('SIGTERM', done); resolve();};
      connected.connection.socket.once('close', done);
      process.once('SIGINT', done); process.once('SIGTERM', done);
    });
    if (native.connection.error) record.disconnect = native.connection.error.message;
  } catch (error) {record.error = error.stack; throw error;}
  finally {
    await bridge?.close();
    await native?.stop();
    await pico?.close();
    record.completed = new Date().toISOString();
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(record, null, 2), {mode: 0o600});
  }
}
main().catch(error => {console.error(error.stack); process.exitCode = 1;});
