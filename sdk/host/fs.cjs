const nativeClient = require('../native/client.cjs');
const ftpDefs = require('../native/ftp-functions.json');

async function create(rpc) {
  const client = await nativeClient.create(rpc, {
    OpenFile: ftpDefs.openFile,
    ReadFile: ftpDefs.readFile,
    WriteFile: ftpDefs.writeFile,
    CloseFile: ftpDefs.closeFile,
    GetFileSize: ftpDefs.fileSize,
    SetFileSize: ftpDefs.setFileSize,
    FlushFile: ftpDefs.flushFile,
    CreateFile: ftpDefs.createFile,
    DeleteFile: ftpDefs.deleteFile,
    RenameFile: ftpDefs.renameFile,
    OpenDirectory: ftpDefs.openDirectory,
    ReadDirectory: ftpDefs.readDirectory,
    CloseDirectory: ftpDefs.closeDirectory,
    CreateDirectory: ftpDefs.createDirectory,
    DeleteDirectory: ftpDefs.deleteDirectory,
    RenameDirectory: ftpDefs.renameDirectory,
    GetEntryType: ftpDefs.entryType,
    CommitSaveData: ftpDefs.commit
  });

  const ENTRY_STRIDE = 0x310;
  const NAME_LEN = 0x301;
  const TYPE_OFFSET = 0x304;
  const SIZE_OFFSET = 0x308;

  return {
    client,
    async OpenFile(handleOut, path, mode) {
      return await client.call('OpenFile', [handleOut, path, mode]);
    },
    async ReadFile(handle, offset, buffer, size) {
      return await client.call('ReadFile', [handle, offset, buffer, size]);
    },
    async WriteFile(handle, offset, buffer, size, option) {
      return await client.call('WriteFile', [handle, offset, buffer, size, option]);
    },
    async CloseFile(handle) {
      return await client.call('CloseFile', [handle]);
    },
    async GetFileSize(sizeOut, handle) {
      return await client.call('GetFileSize', [sizeOut, handle]);
    },
    async OpenDirectory(handleOut, path, mode = 3) {
      return await client.call('OpenDirectory', [handleOut, path, mode]);
    },
    async ReadDirectory(countOut, entryBuf, handle, maxEntries) {
      return await client.call('ReadDirectory', [countOut, entryBuf, handle, maxEntries]);
    },
    async CloseDirectory(handle) {
      return await client.call('CloseDirectory', [handle]);
    },
    async listDirectory(pathStr, maxEntries = 8) {
      const pathOff = 0x1000;
      const handleOff = 0x2000;
      const countOff = 0x2010;
      const entryOff = 0x4000;
      const pathBuf = Buffer.from(pathStr + '\0', 'utf8');

      await client.write(pathOff, pathBuf);
      const openResult = await client.result('OpenDirectory', [client.base + handleOff, client.base + pathOff, 3]);
      if (openResult !== 0) {
        return { result: openResult, entries: [] };
      }

      const handleBuf = await client.read(handleOff, 8);
      const handle = handleBuf.readBigUInt64LE();

      await client.write(countOff, Buffer.alloc(8));
      await client.write(entryOff, Buffer.alloc(maxEntries * ENTRY_STRIDE));

      const readResult = await client.result('ReadDirectory', [client.base + countOff, client.base + entryOff, handle, maxEntries]);
      const entries = [];

      if (readResult === 0) {
        const countBytes = await client.read(countOff, 8);
        const count = Number(countBytes.readBigInt64LE());
        const readLen = Math.min(count, maxEntries) * ENTRY_STRIDE;
        if (readLen > 0) {
          const rawEntries = await client.read(entryOff, readLen);
          for (let i = 0; i < Math.min(count, maxEntries); i++) {
            const entrySlice = rawEntries.subarray(i * ENTRY_STRIDE, (i + 1) * ENTRY_STRIDE);
            const name = entrySlice.toString('utf8', 0, NAME_LEN).replace(/\0.*$/, '');
            const type = entrySlice.readUInt32LE(TYPE_OFFSET);
            const size = Number(entrySlice.readBigInt64LE(SIZE_OFFSET));
            if (name) {
              // nn::fs DirEntryType: 0 = directory, 1 = file.
              entries.push({ name, type: type === 0 ? 'dir' : 'file', size });
            }
          }
        }
      }

      await client.call('CloseDirectory', [handle]);
      return { result: readResult, entries };
    }
  };
}

module.exports = {create};
