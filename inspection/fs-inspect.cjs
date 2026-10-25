// Inspect accessible filesystem on the S2 console using nn::fs.
// Only rom:/ is probed: sd:/ access drops the console connection on this setup.
const fs = require('node:fs/promises');
const path = require('node:path');
const nativeClient = require('../sdk/native/client.cjs');
const ftpDefs = require('../sdk/native/ftp-functions.json');

// Observed on-console DirectoryEntry layout: name buffer first, then type and size.
// Stride is ~0x310 bytes (name buffer 0x301). Offsets are verified by reading back the entries.
const ENTRY_STRIDE = 0x310;
const NAME_LEN = 0x301;
const TYPE_OFFSET = 0x304;
const SIZE_OFFSET = 0x308;
const MAX_ENTRIES = 32;

async function main() {
  const directory = path.resolve(__dirname, '../runs/latest');
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));

  console.log('\n--- Inspecting S2 Console Filesystem (nn::fs) ---');
  const client = await nativeClient.create(rpc, {
    OpenDirectory: ftpDefs.openDirectory,
    ReadDirectory: ftpDefs.readDirectory,
    CloseDirectory: ftpDefs.closeDirectory
  });

  const mounts = ['rom:/'];
  const allEntries = [];
  const entryBytes = MAX_ENTRIES * ENTRY_STRIDE;

  for (const mount of mounts) {
    const pathPtr = client.base + 0x1000;
    const handlePtr = client.base + 0x2000;
    const countPtr = client.base + 0x2010;
    const entryBuf = client.base + 0x4000;

    await client.write(0x1000, Buffer.from(mount + '\0', 'ascii'));
    const res = await client.result('OpenDirectory', [handlePtr, pathPtr, 3]);
    console.log(`OpenDirectory(${mount}) result: 0x${res.toString(16)}`);
    if (res !== 0) continue;

    const handle = (await client.read(0x2000, 8)).readBigUInt64LE();
    await client.write(0x2010, Buffer.alloc(8));
    await client.write(0x4000, Buffer.alloc(entryBytes));

    const readRes = await client.result('ReadDirectory', [countPtr, entryBuf, handle, MAX_ENTRIES]);
    console.log(`ReadDirectory(${mount}) result: 0x${readRes.toString(16)}`);
    if (readRes === 0) {
      const numRead = Number((await client.read(0x2010, 8)).readBigInt64LE());
      console.log(`Entries read from ${mount}: ${numRead}`);
      const buf = await client.read(0x4000, numRead * ENTRY_STRIDE);
      for (let i = 0; i < numRead; i++) {
        const e = buf.subarray(i * ENTRY_STRIDE, (i + 1) * ENTRY_STRIDE);
        const name = e.toString('utf8', 0, NAME_LEN).replace(/\0.*$/, '');
        const type = e.readUInt32LE(TYPE_OFFSET);
        const size = Number(e.readBigInt64LE(SIZE_OFFSET));
        if (!name) continue;
        // nn::fs DirEntryType: 0 = directory, 1 = file.
        const isDir = type === 0;
        console.log(`  [${isDir ? 'DIR' : 'FILE'}] ${name} (${size} bytes)`);
        allEntries.push({mount, name, type: isDir ? 'dir' : 'file', size});
      }
    }
    await client.call('CloseDirectory', [handle]);
  }

  await fs.writeFile(path.join(directory, 's2-files.json'), JSON.stringify(allEntries, null, 2));
  console.log('✔ Filesystem inspection completed.');
}

if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
