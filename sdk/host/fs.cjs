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
    async listDirectory(pathStr, maxEntries = 8, startOffset = 0) {
      const pathOff = 0x1000;
      const handleOff = 0x2000;
      const countOff = 0x2010;
      const entryOff = 0x4000;
      const maxTotal = 64;
      const pathBuf = Buffer.from(pathStr + '\0', 'utf8');

      await client.write(pathOff, pathBuf);
      const openResult = await client.result('OpenDirectory', [client.base + handleOff, client.base + pathOff, 3]);
      if (openResult !== 0) {
        return { result: openResult, total: 0, entries: [] };
      }

      const handleBuf = await client.read(handleOff, 8);
      const handle = handleBuf.readBigUInt64LE();

      await client.write(countOff, Buffer.alloc(8));
      await client.write(entryOff, Buffer.alloc(maxTotal * ENTRY_STRIDE));

      const readResult = await client.result('ReadDirectory', [client.base + countOff, client.base + entryOff, handle, maxTotal]);
      const allEntries = [];

      if (readResult === 0) {
        const countBytes = await client.read(countOff, 8);
        const count = Number(countBytes.readBigInt64LE());
        const readLen = Math.min(count, maxTotal) * ENTRY_STRIDE;
        if (readLen > 0) {
          const rawEntries = await client.read(entryOff, readLen);
          for (let i = 0; i < Math.min(count, maxTotal); i++) {
            const entrySlice = rawEntries.subarray(i * ENTRY_STRIDE, (i + 1) * ENTRY_STRIDE);
            const name = entrySlice.toString('utf8', 0, NAME_LEN).replace(/\0.*$/, '');
            const type = entrySlice.readUInt32LE(TYPE_OFFSET);
            const size = Number(entrySlice.readBigInt64LE(SIZE_OFFSET));
            if (name) {
              // nn::fs DirEntryType: 0 = directory, 1 = file.
              allEntries.push({ name, type: type === 0 ? 'dir' : 'file', size });
            }
          }
        }
      }

      await client.call('CloseDirectory', [handle]);
      const entries = allEntries.slice(startOffset, startOffset + maxEntries);
      return { result: readResult, total: allEntries.length, entries };
    },
    async readTextFile(pathStr, lineStart = 0, maxLines = 16, maxCols = 80) {
      const pathOff = 0x1000;
      const handleOff = 0x2000;
      const sizeOff = 0x2010;
      const readOff = 0x4000;
      const maxReadBytes = 0xB000;
      const pathBuf = Buffer.from(pathStr + '\0', 'utf8');

      await client.write(pathOff, pathBuf);
      const openResult = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 1]);
      if (openResult !== 0) {
        return { result: openResult, totalLines: 0, lines: [] };
      }

      const handleBuf = await client.read(handleOff, 8);
      const handle = handleBuf.readBigUInt64LE();

      await client.write(sizeOff, Buffer.alloc(8));
      const sizeResult = await client.result('GetFileSize', [client.base + sizeOff, handle]);
      let fileSize = 0;
      if (sizeResult === 0) {
        const sizeBytes = await client.read(sizeOff, 8);
        fileSize = Number(sizeBytes.readBigInt64LE());
      }

      const toRead = Math.max(0, Math.min(fileSize, maxReadBytes));
      let rawBuf = Buffer.alloc(0);
      let readResult = 0;
      if (toRead > 0) {
        await client.write(readOff, Buffer.alloc(toRead));
        readResult = await client.result('ReadFile', [handle, 0, client.base + readOff, toRead]);
        if (readResult === 0) {
          rawBuf = await client.read(readOff, toRead);
        }
      }

      await client.call('CloseFile', [handle]);
      if (readResult !== 0) {
        return { result: readResult, totalLines: 0, lines: [] };
      }

      // Skip 112-byte SmileBASIC4 container header if present (magic 0x00000004 and "SmileBoom" at +20)
      let payloadBuf = rawBuf;
      if (
        rawBuf.length >= 112 &&
        rawBuf.readUInt32LE(0) === 4 &&
        rawBuf.subarray(20, 29).toString('ascii') === 'SmileBoom'
      ) {
        payloadBuf = rawBuf.subarray(112);
      }

      // Convert to printable ASCII lines (replace tabs with spaces, non-ASCII with '.')
      const rawText = payloadBuf.toString('utf8').replace(/\0.*$/, '');
      const rawLines = rawText.split(/\r?\n/);
      const totalLines = rawLines.length;
      const lines = [];
      const start = Math.max(0, Math.min(lineStart, Math.max(0, totalLines - 1)));
      for (let i = start; i < Math.min(totalLines, start + maxLines); i++) {
        const expanded = rawLines[i].replace(/\t/g, '  ');
        let clean = '';
        for (let j = 0; j < expanded.length && clean.length < maxCols; j++) {
          const code = expanded.charCodeAt(j);
          clean += (code >= 32 && code <= 126) ? expanded[j] : '.';
        }
        lines.push(clean);
      }

      return { result: 0, totalLines, lines };
    }
  };
}

module.exports = {create};
