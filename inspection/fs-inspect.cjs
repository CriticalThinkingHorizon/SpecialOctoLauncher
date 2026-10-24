// Inspect accessible filesystem on the S2 console using nn::fs.
const fs = require('node:fs/promises');
const path = require('node:path');
const nativeClient = require('../sdk/native/client.cjs');
const ftpDefs = require('../sdk/native/ftp-functions.json');

async function main(hostIP) {
  const directory = path.resolve(__dirname, '../runs/latest');
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));

  console.log('\n--- Inspecting S2 Console Filesystem (nn::fs) ---');
  const client = await nativeClient.create(rpc, {
    OpenDirectory: ftpDefs.openDirectory,
    ReadDirectory: ftpDefs.readDirectory,
    CloseDirectory: ftpDefs.closeDirectory,
    GetEntryType: ftpDefs.entryType
  });

  const mounts = ['rom:/', 'sd:/'];
  const allEntries = [];

  for (const mount of mounts) {
    try {
      const p = client.base + 0x1000;
      // Write path string at base + 0x1000
      await client.write(0x1000, Buffer.from(mount + '\0', 'ascii'));
      // OpenDirectory(DirectoryHandle *outHandle, const char *path, int mode)
      // handle pointer at base + 0x2000, path at base + 0x1000, mode = 3 (Read)
      const res = await client.result('OpenDirectory', [client.base + 0x2000, client.base + 0x1000, 3]);
      console.log(`OpenDirectory(${mount}) result: 0x${res.toString(16)}`);
      if (res === 0) {
        const handle = (await client.read(0x2000, 8)).readBigUInt64LE();
        console.log(`Opened ${mount} handle:`, handle.toString());

        // ReadDirectory(int64_t *outEntriesRead, DirectoryEntry *entryBuffer, DirectoryHandle handle, int64_t entryCount)
        const countPtr = client.base + 0x2010;
        const entryBuf = client.base + 0x3000;
        await client.write(0x2010, Buffer.alloc(8));
        await client.write(0x3000, Buffer.alloc(4096));

        const readRes = await client.result('ReadDirectory', [countPtr, entryBuf, handle, 32]);
        console.log(`ReadDirectory(${mount}) result: 0x${readRes.toString(16)}`);
        if (readRes === 0) {
          const numRead = Number((await client.read(0x2010, 8)).readBigInt64LE());
          console.log(`Entries read from ${mount}:`, numRead);
          const entriesBytes = await client.read(0x3000, numRead * 64);
          for (let i = 0; i < numRead; i++) {
            const entryData = entriesBytes.subarray(i * 64, (i + 1) * 64);
            const name = entryData.toString('utf8', 0, 32).replace(/\0.*$/, '');
            const type = entryData.readUInt32LE(32);
            const size = entryData.readBigInt64LE(40);
            console.log(`  [${type === 1 ? 'DIR' : 'FILE'}] ${name} (${size} bytes)`);
            allEntries.push({mount, name, type: type === 1 ? 'dir' : 'file', size: Number(size)});
          }
        }
        await client.call('CloseDirectory', [handle]);
      }
    } catch (e) {
      console.log(`Mount ${mount} access note:`, e.message);
    }
  }

  await fs.writeFile(path.join(directory, 's2-files.json'), JSON.stringify(allEntries, null, 2));
  console.log('✔ Filesystem inspection completed.');
}

if (require.main === module) main(process.argv[2]).catch(e => { console.error(e.stack); process.exitCode = 1; });
