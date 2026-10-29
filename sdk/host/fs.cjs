const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
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
    CommitSaveData: ftpDefs.commit,
    StorageCtor: {
      symbol: '_ZN2nn2fs17FileHandleStorageC1ENS0_10FileHandleEb',
      offset: 952452,
      size: 36,
      hex: '480000120900809208400039686100d0'
    },
    StorageWrite: {
      symbol: '_ZN2nn2fs17FileHandleStorage5WriteElPKvm',
      offset: 952904,
      size: 232,
      hex: 'ff4301d1fd7b01a9fd430091f85f02a9'
    }
  });

  const ENTRY_STRIDE = 0x310;
  const NAME_LEN = 0x301;
  const TYPE_OFFSET = 0x304;
  const SIZE_OFFSET = 0x308;

  let exefsCache = null;

  async function getExefsEntries() {
    if (exefsCache) return exefsCache;
    const codeBases = [];
    for (let address = 0; address < 2 ** 39;) {
      const region = await rpc.query(address);
      const next = region.address + region.size;
      if (region.type === 3 && region.permissions === 5 && !region.ipcReferences) {
        codeBases.push(region);
      }
      if (next <= address) break;
      address = next;
    }

    const modules = [];
    let subsdkCount = 0;
    for (let i = 0; i < codeBases.length; i++) {
      const codeReg = codeBases[i];
      let name = `module${i}`;
      if (codeReg.address === rpc.a.main) {
        name = 'main';
      } else if (codeReg.address === rpc.a.sdk) {
        name = 'sdk';
      } else if (i === 0 && codeReg.address < rpc.a.main) {
        name = 'rtld';
      } else {
        name = `subsdk${subsdkCount++}`;
      }

      // Compute total contiguous module span (code + rodata + data) up to next code module
      const nextCodeAddr = i + 1 < codeBases.length ? codeBases[i + 1].address : Infinity;
      let totalSize = 0;
      let textSize = codeReg.size;
      let rodataSize = 0;
      let dataSize = 0;
      let cur = codeReg.address;
      for (let seg = 0; seg < 6 && cur < nextCodeAddr; seg++) {
        const r = seg === 0 ? codeReg : await rpc.query(cur);
        if (![3, 4].includes(r.type) || !(r.permissions & 1) || r.ipcReferences) break;
        if (seg > 0 && r.permissions === 5) break;
        totalSize += r.size;
        if (r.permissions === 1) rodataSize += r.size;
        else if ((r.permissions & 3) === 3) dataSize += r.size;
        cur = r.address + r.size;
      }

      modules.push({
        name,
        type: 'dir',
        size: totalSize,
        address: codeReg.address,
        children: [
          { name: `${name}.nso`, type: 'file', size: totalSize, address: codeReg.address },
          { name: '.text', type: 'file', size: textSize, address: codeReg.address },
          ...(rodataSize > 0 ? [{ name: '.rodata', type: 'file', size: rodataSize, address: codeReg.address + textSize }] : []),
          ...(dataSize > 0 ? [{ name: '.data', type: 'file', size: dataSize, address: codeReg.address + textSize + rodataSize }] : []),
          { name: `base_0x${codeReg.address.toString(16)}`, type: 'file', size: 0, address: codeReg.address }
        ]
      });
    }

    exefsCache = [
      ...modules,
      { name: 'main.npdm', type: 'file', size: 0, address: 0 }
    ];
    return exefsCache;
  }

  async function resolveExefsPath(pathStr) {
    if (!pathStr || !pathStr.startsWith('exefs:')) return null;
    const entries = await getExefsEntries();
    const sub = pathStr.slice('exefs:'.length).replace(/^\/+|\/+$/g, '');
    if (!sub) {
      return { isDir: true, name: 'exefs:', size: 0, children: entries };
    }
    const parts = sub.split('/').filter(Boolean);
    if (parts.length === 1) {
      const mod = entries.find(m => m.name === parts[0]);
      if (!mod) return null;
      if (mod.type === 'dir') {
        return { isDir: true, name: mod.name, size: mod.size, address: mod.address, children: mod.children };
      }
      return { isDir: false, name: mod.name, size: mod.size, address: mod.address || 0 };
    }
    if (parts.length === 2) {
      const mod = entries.find(m => m.type === 'dir' && m.name === parts[0]);
      if (!mod) return null;
      const file = mod.children?.find(c => c.name === parts[1]);
      if (!file) return null;
      return { isDir: false, name: file.name, size: file.size, address: file.address };
    }
    return null;
  }

  return {
    client,
    resolveExefsPath,
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
      if (!pathStr || pathStr === '/') {
        const roots = [
          { name: 'rom:', type: 'dir', size: 0 },
          { name: 'save:', type: 'dir', size: 0 },
          { name: 'tmp:', type: 'dir', size: 0 },
          { name: 'exefs:', type: 'dir', size: 0 }
        ];
        return {
          result: 0,
          total: roots.length,
          entries: roots.slice(startOffset, startOffset + maxEntries)
        };
      }
      if (pathStr.startsWith('exefs:')) {
        const exefsEntries = await getExefsEntries();
        const sub = pathStr.slice('exefs:'.length).replace(/^\/+|\/+$/g, '');
        if (!sub) {
          const top = exefsEntries.map(({ name, type, size }) => ({ name, type, size }));
          return {
            result: 0,
            total: top.length,
            entries: top.slice(startOffset, startOffset + maxEntries)
          };
        }
        const mod = exefsEntries.find(m => m.type === 'dir' && m.name === sub);
        const list = mod?.children ?? [];
        return {
          result: 0,
          total: list.length,
          entries: list.slice(startOffset, startOffset + maxEntries)
        };
      }
      const pathOff = 0x1000;
      const handleOff = 0x2000;
      const countOff = 0x2010;
      const entryOff = 0x4000;
      const maxTotal = 32;
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
      if (pathStr.startsWith('exefs:')) {
        const item = await resolveExefsPath(pathStr);
        if (!item || item.isDir) {
          return { result: 0x00202, totalLines: 0, lines: [] };
        }
        if (!item.address || item.size === 0) {
          return { result: 0, totalLines: 1, lines: ['(Empty or unmapped section)'] };
        }
        const toRead = Math.min(item.size, 4096);
        let buf = Buffer.alloc(0);
        try {
          buf = await rpc.read(item.address, toRead);
        } catch {
          return { result: 0x00201, totalLines: 1, lines: ['(Error reading memory section)'] };
        }
        const allLines = [];
        for (let off = 0; off < buf.length; off += 16) {
          const slice = buf.subarray(off, off + 16);
          const hex = Array.from(slice, b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
          const asc = Array.from(slice, b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
          allLines.push(`${off.toString(16).padStart(6, '0')}  ${hex}  |${asc}|`.slice(0, maxCols));
        }
        const lines = allLines.slice(lineStart, lineStart + maxLines);
        return { result: 0, totalLines: allLines.length, lines };
      }
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

      // Skip 112-byte SmileBASIC4 container header if present (magic 0x00000004, type 2 = TXT/PRG)
      let payloadBuf = rawBuf;
      if (rawBuf.length >= 112 && rawBuf.readUInt32LE(0) === 4 && rawBuf.readUInt16LE(6) === 2) {
        const compressed = rawBuf.readUInt16LE(4) === 1;
        payloadBuf = rawBuf.subarray(112);
        if (compressed && payloadBuf.length > 2) {
          try {
            payloadBuf = zlib.inflateSync(payloadBuf, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
          } catch {
            try {
              if (payloadBuf.length > 20) {
                payloadBuf = zlib.inflateSync(payloadBuf.subarray(0, payloadBuf.length - 20));
              }
            } catch {}
          }
        }
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
    },
    async readRawFile(pathStr, maxBytes = 0xB000) {
      if (pathStr.startsWith('exefs:')) {
        const item = await resolveExefsPath(pathStr);
        if (!item || item.isDir) {
          return { result: 0x00202, fileSize: 0, buffer: Buffer.alloc(0), isSbContainer: false };
        }
        if (!item.address || item.size === 0) {
          return { result: 0, fileSize: 0, buffer: Buffer.alloc(0), isSbContainer: false, address: 0 };
        }
        const toRead = Math.max(0, Math.min(item.size, maxBytes));
        let buffer = Buffer.alloc(0);
        if (toRead > 0) {
          try {
            buffer = await rpc.read(item.address, toRead);
          } catch (readErr) {
            console.warn(`[EXEFS READ ERROR] Address: 0x${item.address.toString(16)}, size: ${toRead}:`, readErr.message);
            return { result: 0x00201, fileSize: item.size, buffer: Buffer.alloc(0), isSbContainer: false, address: item.address };
          }
        }
        return { result: 0, fileSize: item.size, buffer, isSbContainer: false, address: item.address };
      }
      const pathOff = 0x1000;
      const handleOff = 0x2000;
      const sizeOff = 0x2010;
      const readOff = 0x4000;
      const pathBuf = Buffer.from(pathStr + '\0', 'utf8');

      await client.write(pathOff, pathBuf);
      const openResult = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 1]);
      if (openResult !== 0) {
        return { result: openResult, fileSize: 0, buffer: Buffer.alloc(0), isSbContainer: false };
      }

      const handle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
      await client.write(sizeOff, Buffer.alloc(8));
      const sizeResult = await client.result('GetFileSize', [client.base + sizeOff, handle]);
      let fileSize = 0;
      if (sizeResult === 0) {
        fileSize = Number((await client.read(sizeOff, 8)).readBigInt64LE(0));
      }

      const toRead = Math.max(0, Math.min(fileSize, maxBytes));
      let rawBuf = Buffer.alloc(0);
      let readResult = 0;
      if (toRead > 0) {
        const chunkSize = 0x8000;
        const parts = [];
        let curOff = 0;
        while (curOff < toRead) {
          const thisRead = Math.min(chunkSize, toRead - curOff);
          readResult = await client.result('ReadFile', [handle, curOff, client.base + readOff, thisRead]);
          if (readResult !== 0) break;
          parts.push(await client.read(readOff, thisRead));
          curOff += thisRead;
        }
        if (readResult === 0) {
          rawBuf = Buffer.concat(parts);
        }
      }
      await client.call('CloseFile', [handle]);
      if (readResult !== 0) {
        return { result: readResult, fileSize, buffer: Buffer.alloc(0), isSbContainer: false };
      }

      let payloadBuf = rawBuf;
      let isSbContainer = false;
      if (rawBuf.length >= 112 && rawBuf.readUInt32LE(0) === 4 && rawBuf.readUInt16LE(6) === 2) {
        isSbContainer = true;
        const compressed = rawBuf.readUInt16LE(4) === 1;
        payloadBuf = rawBuf.subarray(112);
        if (compressed && payloadBuf.length > 2) {
          try {
            payloadBuf = zlib.inflateSync(payloadBuf, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
          } catch {
            try {
              if (payloadBuf.length > 20) {
                payloadBuf = zlib.inflateSync(payloadBuf.subarray(0, payloadBuf.length - 20));
              }
            } catch {}
          }
        }
      }
      return { result: 0, fileSize, buffer: payloadBuf, isSbContainer };
    },
    // Generic low-level nn::fs primitives for shader SDK calls (subOp 10..17)
    async statPath(pathStr) {
      if (pathStr.startsWith('exefs:')) {
        const item = await resolveExefsPath(pathStr);
        if (!item) return { exists: 0, entryType: 0xffffffff, fileSize: 0, result: 0x00202 };
        return {
          exists: 1,
          entryType: item.isDir ? 1 : 0,
          fileSize: item.size || 0,
          result: 0
        };
      }
      const pathOff = 0x1000, typeOff = 0x2000, handleOff = 0x2010, sizeOff = 0x2020;
      await client.write(pathOff, Buffer.from(pathStr + '\0', 'utf8'));
      await client.write(typeOff, Buffer.alloc(8));
      const res = await client.result('GetEntryType', [client.base + typeOff, client.base + pathOff]);
      if (res !== 0) {
        return { exists: 0, entryType: 0xffffffff, fileSize: 0, result: res };
      }
      const rawType = (await client.read(typeOff, 4)).readUInt32LE(0); // nn::fs: 0 = dir, 1 = file
      const entryType = rawType === 0 ? 1 : 0; // SDK convention: 1 = dir, 0 = file
      let fileSize = 0;
      if (rawType === 1) {
        await client.write(handleOff, Buffer.alloc(8));
        if ((await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 1])) === 0) {
          const handle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
          await client.write(sizeOff, Buffer.alloc(8));
          if ((await client.result('GetFileSize', [client.base + sizeOff, handle])) === 0) {
            fileSize = Number((await client.read(sizeOff, 8)).readBigInt64LE(0));
          }
          await client.call('CloseFile', [handle]);
        }
      }
      return { exists: 1, entryType, fileSize, result: 0 };
    },
    async createPath(pathStr, initialSize = 0) {
      const pathOff = 0x1000;
      await client.write(pathOff, Buffer.from(pathStr + '\0', 'utf8'));
      const res = await client.result('CreateFile', [client.base + pathOff, Math.max(0, initialSize)]);
      return { result: res };
    },
    async deletePath(pathStr) {
      const pathOff = 0x1000;
      await client.write(pathOff, Buffer.from(pathStr + '\0', 'utf8'));
      const res = await client.result('DeleteFile', [client.base + pathOff]);
      return { result: res };
    },
    async mkdirPath(pathStr) {
      const pathOff = 0x1000;
      await client.write(pathOff, Buffer.from(pathStr + '\0', 'utf8'));
      const res = await client.result('CreateDirectory', [client.base + pathOff]);
      return { result: res };
    },
    async rmdirPath(pathStr) {
      const pathOff = 0x1000;
      await client.write(pathOff, Buffer.from(pathStr + '\0', 'utf8'));
      const res = await client.result('DeleteDirectory', [client.base + pathOff]);
      return { result: res };
    },
    async renamePath(oldPath, newPath) {
      const oldOff = 0x1000, newOff = 0x1400;
      await client.write(oldOff, Buffer.from(oldPath + '\0', 'utf8'));
      await client.write(newOff, Buffer.from(newPath + '\0', 'utf8'));
      const res = await client.result('RenameFile', [client.base + oldOff, client.base + newOff]);
      return { result: res };
    },
    async readBytesAt(pathStr, offset = 0, length = 960) {
      if (pathStr.startsWith('exefs:')) {
        const item = await resolveExefsPath(pathStr);
        if (!item || item.isDir) return { result: 0x00202, fileSize: 0, data: Buffer.alloc(0) };
        if (!item.address || offset >= item.size) return { result: 0, fileSize: item.size || 0, data: Buffer.alloc(0) };
        const avail = Math.max(0, item.size - offset);
        const toRead = Math.max(0, Math.min(avail, Math.min(length, 960)));
        let data = Buffer.alloc(0);
        let readRes = 0;
        if (toRead > 0) {
          try {
            data = await rpc.read(item.address + offset, toRead);
          } catch {
            readRes = 0x00201;
          }
        }
        return { result: readRes, fileSize: item.size, data };
      }
      const pathOff = 0x1000, handleOff = 0x2000, sizeOff = 0x2010, readOff = 0x4000;
      await client.write(pathOff, Buffer.from(pathStr + '\0', 'utf8'));
      await client.write(handleOff, Buffer.alloc(8));
      const openRes = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 1]);
      if (openRes !== 0) return { result: openRes, fileSize: 0, data: Buffer.alloc(0) };
      const handle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
      await client.write(sizeOff, Buffer.alloc(8));
      let fileSize = 0;
      if ((await client.result('GetFileSize', [client.base + sizeOff, handle])) === 0) {
        fileSize = Number((await client.read(sizeOff, 8)).readBigInt64LE(0));
      }
      const avail = Math.max(0, fileSize - offset);
      const toRead = Math.max(0, Math.min(avail, Math.min(length, 960)));
      let data = Buffer.alloc(0);
      let readRes = 0;
      if (toRead > 0) {
        await client.write(readOff, Buffer.alloc(toRead));
        readRes = await client.result('ReadFile', [handle, offset, client.base + readOff, toRead]);
        if (readRes === 0) data = await client.read(readOff, toRead);
      }
      await client.call('CloseFile', [handle]);
      return { result: readRes, fileSize, data };
    },
    async writeBytesAt(pathStr, offset = 0, dataBuf = Buffer.alloc(0)) {
      const pathOff = 0x1000, typeOff = 0x2000, handleOff = 0x2010, storageOff = 0x2040, sizeOff = 0x20c0, writeOff = 0x4000;
      await client.write(pathOff, Buffer.from(pathStr + '\0', 'utf8'));
      await client.write(typeOff, Buffer.alloc(8));
      if ((await client.result('GetEntryType', [client.base + typeOff, client.base + pathOff])) !== 0) {
        const cr = await client.result('CreateFile', [client.base + pathOff, offset + dataBuf.length]);
        if (cr !== 0) return { result: cr, bytesWritten: 0 };
      }
      await client.write(handleOff, Buffer.alloc(8));
      // Mode 3 = OpenMode_Read (1) | OpenMode_Write (2)
      let openRes = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 3]);
      if (openRes !== 0) {
        openRes = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 2]);
        if (openRes !== 0) return { result: openRes, bytesWritten: 0 };
      }
      const handle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
      let writeRes = 0;
      try {
        await client.write(sizeOff, Buffer.alloc(8));
        if ((await client.result('GetFileSize', [client.base + sizeOff, handle])) === 0) {
          const curSize = Number((await client.read(sizeOff, 8)).readBigInt64LE(0));
          if (offset + dataBuf.length > curSize) {
            await client.result('SetFileSize', [handle, offset + dataBuf.length]);
          }
        }
        if (dataBuf.length > 0) {
          await client.write(writeOff, dataBuf);
          await client.write(storageOff, Buffer.alloc(128));
          await client.call('StorageCtor', [client.base + storageOff, handle, 0]);
          writeRes = await client.result('StorageWrite', [client.base + storageOff, offset, client.base + writeOff, dataBuf.length]);
        }
        await client.result('FlushFile', [handle]);
      } finally {
        await client.call('CloseFile', [handle]);
      }
      return { result: writeRes, bytesWritten: writeRes === 0 ? dataBuf.length : 0 };
    },
    async renameDirPath(oldPath, newPath) {
      const oldOff = 0x1000, newOff = 0x1400;
      await client.write(oldOff, Buffer.from(oldPath + '\0', 'utf8'));
      await client.write(newOff, Buffer.from(newPath + '\0', 'utf8'));
      const res = await client.result('RenameDirectory', [client.base + oldOff, client.base + newOff]);
      return { result: res };
    },
    async commitMount(mountName = 'save') {
      const pathOff = 0x1000;
      await client.write(pathOff, Buffer.from(mountName + '\0', 'utf8'));
      const res = await client.result('CommitSaveData', [client.base + pathOff]);
      return { result: res };
    },
    async testTmpFile(action = 0) {
      const targetPath = 'tmp:/tmptest';
      const pathOff = 0x1000;
      const typeOff = 0x2000;
      const handleOff = 0x2010;
      const sizeOff = 0x2020;

      const pathBuf = Buffer.from(targetPath + '\0', 'utf8');
      await client.write(pathOff, pathBuf);

      const logLines = [];
      logLines.push('=== TMP:/ PERSISTENCE TEST (tmp:/tmptest) ===');
      logLines.push('');

      if (action === 2) {
        logLines[0] = '=== TMP:/ CLEANER APP (Delete tmp:/tmptest) ===';
        await client.write(typeOff, Buffer.alloc(8));
        const checkRes = await client.result('GetEntryType', [client.base + typeOff, client.base + pathOff]);
        const existedBefore = (checkRes === 0);

        logLines.push('[STEP 1] Check if tmp:/tmptest exists:');
        logLines.push(`  GetEntryType("tmp:/tmptest") -> 0x${checkRes.toString(16)}`);
        if (existedBefore) {
          logLines.push('  STATUS: FOUND tmp:/tmptest!');
        } else {
          logLines.push('  STATUS: DOES NOT EXIST (Already Clean)');
        }
        logLines.push('');

        let delRes = 0;
        if (existedBefore) {
          logLines.push('[STEP 2] Deleting tmp:/tmptest:');
          delRes = await client.result('DeleteFile', [client.base + pathOff]);
          logLines.push(`  nn::fs::DeleteFile("tmp:/tmptest") -> 0x${delRes.toString(16)}`);
          if (delRes === 0) {
            logLines.push('  STATUS: DELETED SUCCESSFULLY!');
          } else {
            logLines.push('  STATUS: DELETE FAILED!');
          }
        } else {
          logLines.push('[STEP 2] DeleteFile skipped (file not present).');
        }
        logLines.push('');

        await client.write(typeOff, Buffer.alloc(8));
        const afterRes = await client.result('GetEntryType', [client.base + typeOff, client.base + pathOff]);
        logLines.push('[STEP 3] Verify deletion:');
        logLines.push(`  GetEntryType("tmp:/tmptest") -> 0x${afterRes.toString(16)}`);
        logLines.push(afterRes !== 0 ? '  STATUS: CONFIRMED REMOVED (0x202)' : '  STATUS: STILL PRESENT!');

        const dirListing = await this.listDirectory('tmp:/', 10, 0);
        const names = dirListing.entries.map(e => `${e.name} (${e.size}B)`).join(', ');
        logLines.push('');
        logLines.push(`[TMP:/ DIR] ${names || '(empty)'}`);
        logLines.push('------------------------------------------------');
        logLines.push('A: Re-check & Delete             -: Exit to Menu');

        return {
          result: 0,
          existedBefore: existedBefore ? 1 : 0,
          createRes: delRes,
          openRes: afterRes,
          lines: logLines
        };
      }

      if (action === 1) {
        logLines.push('[ACTION] Deleting tmp:/tmptest...');
        const delRes = await client.result('DeleteFile', [client.base + pathOff]);
        logLines.push(`  nn::fs::DeleteFile("tmp:/tmptest") -> 0x${delRes.toString(16)}`);
        logLines.push('');
      }

      // Step 1: Check if tmp:/tmptest exists via GetEntryType
      await client.write(typeOff, Buffer.alloc(8));
      const checkRes = await client.result('GetEntryType', [client.base + typeOff, client.base + pathOff]);
      const existedBefore = (checkRes === 0);

      logLines.push('[STEP 1] Check if tmp:/tmptest exists:');
      logLines.push(`  GetEntryType("tmp:/tmptest") -> 0x${checkRes.toString(16)}`);
      if (existedBefore) {
        const entryType = (await client.read(typeOff, 4)).readUInt32LE(0);
        logLines.push(`  STATUS: ALREADY EXISTS! (EntryType=${entryType === 1 ? 'File' : 'Dir'})`);
        logLines.push('  -> File persisted across app/session runs!');
      } else {
        logLines.push('  STATUS: DOES NOT EXIST (0x202 = PathNotFound)');
      }
      logLines.push('');

      // Step 2: If it doesn't exist, create an empty file (size = 0)
      let createRes = 0;
      if (!existedBefore) {
        logLines.push('[STEP 2] Creating empty file tmp:/tmptest (0 bytes):');
        createRes = await client.result('CreateFile', [client.base + pathOff, 0]);
        logLines.push(`  nn::fs::CreateFile("tmp:/tmptest", 0) -> 0x${createRes.toString(16)}`);
        if (createRes === 0) {
          logLines.push('  STATUS: CREATED SUCCESSFULLY!');
        } else {
          logLines.push('  STATUS: CREATE FAILED!');
        }
      } else {
        logLines.push('[STEP 2] CreateFile skipped (file already exists).');
      }
      logLines.push('');

      // Step 3: Verify with OpenFile + GetFileSize + CloseFile
      await client.write(handleOff, Buffer.alloc(8));
      const openRes = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 1]);
      logLines.push('[STEP 3] Verify file handle & size:');
      logLines.push(`  nn::fs::OpenFile("tmp:/tmptest", Read) -> 0x${openRes.toString(16)}`);
      if (openRes === 0) {
        const handle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
        await client.write(sizeOff, Buffer.alloc(8));
        const sizeRes = await client.result('GetFileSize', [client.base + sizeOff, handle]);
        const fileSize = sizeRes === 0 ? Number((await client.read(sizeOff, 8)).readBigInt64LE(0)) : -1;
        await client.call('CloseFile', [handle]);
        logLines.push(`  nn::fs::GetFileSize -> ${fileSize} bytes (CloseFile OK)`);
      }

      // Step 4: List current contents of tmp:/
      const dirListing = await this.listDirectory('tmp:/', 10, 0);
      const names = dirListing.entries.map(e => `${e.name} (${e.size}B)`).join(', ');
      logLines.push('');
      logLines.push(`[TMP:/ DIR] ${names || '(empty)'}`);
      logLines.push('------------------------------------------------');
      logLines.push('A: Re-run Check   X: Delete tmptest   -: Exit');

      return {
        result: 0,
        existedBefore: existedBefore ? 1 : 0,
        createRes,
        openRes,
        lines: logLines
      };
    },
    async testSaveFile(action = 0) {
      const targetPath = 'save:/f/###/TTEST';
      const pathOff = 0x1000;
      const typeOff = 0x2000;
      const handleOff = 0x2010;
      const sizeOff = 0x2020;
      const storageOff = 0x2040;
      const writeOff = 0x4000;
      const readOff = 0x4800;

      const savePayload = Buffer.from('\' S2 Native Save Manager POC\nPRINT "PERSISTENCE VERIFIED OK"\n', 'utf8');
      const pathBuf = Buffer.from(targetPath + '\0', 'utf8');
      await client.write(pathOff, pathBuf);

      const logLines = [];
      logLines.push('=== S2 NATIVE SAVE & COMMIT POC (save:/f/###/TTEST) ===');
      logLines.push('');

      if (action === 2) {
        logLines[0] = '=== S2 SAVE CLEANER (Delete save:/f/###/TTEST) ===';
        await client.write(typeOff, Buffer.alloc(8));
        const checkRes = await client.result('GetEntryType', [client.base + typeOff, client.base + pathOff]);
        const existedBefore = (checkRes === 0);

        logLines.push('[STEP 1] Check if save:/f/###/TTEST exists:');
        logLines.push(`  GetEntryType("save:/f/###/TTEST") -> 0x${checkRes.toString(16)}`);
        if (existedBefore) {
          logLines.push('  STATUS: FOUND TTEST!');
        } else {
          logLines.push('  STATUS: DOES NOT EXIST (Already Clean)');
        }
        logLines.push('');

        let delRes = 0;
        let commitRes = 0;
        if (existedBefore) {
          logLines.push('[STEP 2] Deleting save:/f/###/TTEST:');
          delRes = await client.result('DeleteFile', [client.base + pathOff]);
          logLines.push(`  nn::fs::DeleteFile("save:/f/###/TTEST") -> 0x${delRes.toString(16)}`);

          logLines.push('[STEP 3] Committing deletion to save: partition:');
          const saveMountOff = 0x1400;
          await client.write(saveMountOff, Buffer.from('save\0', 'utf8'));
          commitRes = await client.result('CommitSaveData', [client.base + saveMountOff]);
          logLines.push(`  nn::fs::CommitSaveData("save") -> 0x${commitRes.toString(16)} ${commitRes === 0 ? '(Committed)' : '(Failed)'}`);
        } else {
          logLines.push('[STEP 2] Delete skipped (file not present).');
        }
        logLines.push('');

        await client.write(typeOff, Buffer.alloc(8));
        const afterRes = await client.result('GetEntryType', [client.base + typeOff, client.base + pathOff]);
        logLines.push('[STEP 4] Verify deletion:');
        logLines.push(`  GetEntryType("save:/f/###/TTEST") -> 0x${afterRes.toString(16)}`);
        logLines.push(afterRes !== 0 ? '  STATUS: CONFIRMED REMOVED (0x202 = PathNotFound)' : '  STATUS: STILL PRESENT!');

        const dirListing = await this.listDirectory('save:/f/###', 10, 0);
        const names = dirListing.entries.map(e => `${e.name} (${e.size}B)`).join(', ');
        logLines.push('');
        logLines.push(`[SAVE:/F/### DIR] ${names || '(empty)'}`);
        logLines.push('------------------------------------------------');
        logLines.push('A: Save & Commit   Y: Verify   X: Clean   -: Exit');

        return {
          result: 0,
          existedBefore: existedBefore ? 1 : 0,
          saveRes: delRes,
          commitRes,
          lines: logLines
        };
      }

      if (action === 1) {
        logLines[0] = '=== S2 SAVE PERSISTENCE VERIFICATION ===';
        await client.write(typeOff, Buffer.alloc(8));
        const checkRes = await client.result('GetEntryType', [client.base + typeOff, client.base + pathOff]);
        const exists = (checkRes === 0);

        logLines.push('[STEP 1] Check file existence in save:/f/###/:');
        logLines.push(`  GetEntryType("save:/f/###/TTEST") -> 0x${checkRes.toString(16)}`);
        if (exists) {
          logLines.push('  STATUS: FILE FOUND! Persistent in save partition.');
        } else {
          logLines.push('  STATUS: NOT FOUND (0x202 = PathNotFound)');
        }
        logLines.push('');

        let readSize = 0;
        let readText = '';
        if (exists) {
          logLines.push('[STEP 2] Open & Read verified persistent data:');
          await client.write(handleOff, Buffer.alloc(8));
          const openRes = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 1]);
          logLines.push(`  nn::fs::OpenFile("save:/f/###/TTEST", Read) -> 0x${openRes.toString(16)}`);
          if (openRes === 0) {
            const handle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
            await client.write(sizeOff, Buffer.alloc(8));
            await client.result('GetFileSize', [client.base + sizeOff, handle]);
            readSize = Number((await client.read(sizeOff, 8)).readBigInt64LE(0));
            logLines.push(`  nn::fs::GetFileSize -> ${readSize} bytes`);

            if (readSize > 0) {
              const toRead = Math.min(readSize, 64);
              await client.write(readOff, Buffer.alloc(toRead));
              const rRes = await client.result('ReadFile', [handle, 0, client.base + readOff, toRead]);
              if (rRes === 0) {
                const readBuf = await client.read(readOff, toRead);
                readText = readBuf.toString('utf8').replace(/[\r\n]+/g, ' ').substring(0, 40);
                logLines.push(`  Content: "${readText}"`);
              }
            }
            await client.call('CloseFile', [handle]);
          }
        } else {
          logLines.push('[STEP 2] Read skipped (file not present).');
        }

        const dirListing = await this.listDirectory('save:/f/###', 10, 0);
        const names = dirListing.entries.map(e => `${e.name} (${e.size}B)`).join(', ');
        logLines.push('');
        logLines.push(`[SAVE:/F/### DIR] ${names || '(empty)'}`);
        logLines.push('------------------------------------------------');
        logLines.push('A: Save & Commit   Y: Verify   X: Clean   -: Exit');

        return {
          result: 0,
          existedBefore: exists ? 1 : 0,
          saveRes: exists ? 0 : checkRes,
          commitRes: 0,
          lines: logLines
        };
      }

      // action === 0: Native Save & Commit Process
      // Step 1: Check existing status via GetEntryType
      await client.write(typeOff, Buffer.alloc(8));
      const checkRes = await client.result('GetEntryType', [client.base + typeOff, client.base + pathOff]);
      const existedBefore = (checkRes === 0);

      logLines.push('[STEP 1] Query save:/f/###/TTEST:');
      logLines.push(`  GetEntryType -> 0x${checkRes.toString(16)} (${existedBefore ? 'File exists' : 'New file'})`);

      if (existedBefore) {
        logLines.push('  Removing previous version for fresh write...');
        await client.result('DeleteFile', [client.base + pathOff]);
      }

      // Step 2: Create file with exact payload size
      logLines.push(`[STEP 2] CreateFile ("save:/f/###/TTEST", ${savePayload.length}B):`);
      const createRes = await client.result('CreateFile', [client.base + pathOff, savePayload.length]);
      logLines.push(`  nn::fs::CreateFile -> 0x${createRes.toString(16)} ${createRes === 0 ? '(Success)' : '(Error)'}`);
      if (createRes !== 0) {
        logLines.push('  FAILED to create file in save partition.');
        return { result: createRes, existedBefore: 0, saveRes: createRes, commitRes: 0, lines: logLines };
      }

      // Step 3: Open file in ReadWrite mode
      logLines.push('[STEP 3] OpenFile (OpenMode_Read | OpenMode_Write):');
      await client.write(handleOff, Buffer.alloc(8));
      const openRes = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 3]);
      logLines.push(`  nn::fs::OpenFile -> 0x${openRes.toString(16)}`);
      if (openRes !== 0) {
        logLines.push('  FAILED to open file for writing.');
        return { result: openRes, existedBefore: 0, saveRes: openRes, commitRes: 0, lines: logLines };
      }
      const handle = (await client.read(handleOff, 8)).readBigUInt64LE(0);

      // Step 4: Write payload via FileHandleStorage
      logLines.push(`[STEP 4] WriteFile (${savePayload.length} bytes UTF-8 code):`);
      await client.write(writeOff, savePayload);
      await client.write(storageOff, Buffer.alloc(128));
      await client.call('StorageCtor', [client.base + storageOff, handle, 0]);
      const writeRes = await client.result('StorageWrite', [client.base + storageOff, 0, client.base + writeOff, savePayload.length]);
      logLines.push(`  WriteFile via FileHandleStorage -> 0x${writeRes.toString(16)} ${writeRes === 0 ? '(OK)' : '(Error)'}`);

      await client.result('FlushFile', [handle]);
      await client.call('CloseFile', [handle]);
      logLines.push('  FlushFile & CloseFile completed.');

      // Step 5: ATOMIC COMMIT - nn::fs::CommitSaveData("save")
      logLines.push('');
      logLines.push('[STEP 5] *** ATOMIC TRANSACTION COMMIT ***:');
      const saveMountOff = 0x1400;
      await client.write(saveMountOff, Buffer.from('save\0', 'utf8'));
      const commitRes = await client.result('CommitSaveData', [client.base + saveMountOff]);
      logLines.push(`  nn::fs::CommitSaveData("save") -> 0x${commitRes.toString(16)}`);
      if (commitRes === 0) {
        logLines.push('  STATUS: TRANSACTION COMMITTED TO FLASH!');
      } else {
        logLines.push('  STATUS: COMMIT FAILED (Transaction uncommitted)');
      }

      // Step 6: Verify Persistence by reading back
      logLines.push('');
      logLines.push('[STEP 6] Verify Persistence (Read-Back Verification):');
      await client.write(handleOff, Buffer.alloc(8));
      const vOpenRes = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 1]);
      if (vOpenRes === 0) {
        const vHandle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
        await client.write(sizeOff, Buffer.alloc(8));
        await client.result('GetFileSize', [client.base + sizeOff, vHandle]);
        const vSize = Number((await client.read(sizeOff, 8)).readBigInt64LE(0));
        await client.write(readOff, Buffer.alloc(savePayload.length));
        await client.result('ReadFile', [vHandle, 0, client.base + readOff, savePayload.length]);
        const readBackBuf = await client.read(readOff, savePayload.length);
        await client.call('CloseFile', [vHandle]);

        const verified = readBackBuf.equals(savePayload);
        logLines.push(`  Verified: ${vSize} bytes, Match: ${verified ? 'YES (100% Match)' : 'NO'}`);
      }

      // Step 7: Enumerate save:/f/### directory
      const dirListing = await this.listDirectory('save:/f/###', 10, 0);
      const names = dirListing.entries.map(e => `${e.name} (${e.size}B)`).join(', ');
      logLines.push('');
      logLines.push(`[SAVE:/F/### DIR] ${names || '(empty)'}`);
      logLines.push('------------------------------------------------');
      logLines.push('A: Save & Commit   Y: Verify   X: Clean   -: Exit');

      return {
        result: 0,
        existedBefore: existedBefore ? 1 : 0,
        saveRes: writeRes,
        commitRes,
        lines: logLines
      };
    },
    async updateBootstrapFile(action = 0) {
      const targetPath = 'save:/f/###/TNS2';
      const backupPath = 'save:/f/###/TNS2.BAK';
      const repoBootstrapPath = path.resolve(__dirname, '../../rpc/bootstrap.bas');
      
      let repoBytes = Buffer.alloc(0);
      try {
        repoBytes = await fs.readFile(repoBootstrapPath);
      } catch (e) {
        return {
          result: -1,
          lines: [
            '=== BOOTSTRAP UPDATER ERROR ===',
            '',
            'Failed to read local bootstrap.bas:',
            `  ${e.message}`,
            '',
            'Check repository files on PC host.',
            '------------------------------------------------',
            '-: Exit to Menu'
          ]
        };
      }

      // SmileBASIC requires at least two lines of trailing padding at the end of scripts;
      // otherwise the interpreter and editor truncate the last real lines.
      let scriptText = repoBytes.toString('utf8');
      const lines = scriptText.replace(/\r\n/g, '\n').split('\n');
      let trailingPadding = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line === '' || line.startsWith("' Padding") || line.startsWith("'")) {
          trailingPadding++;
        } else {
          break;
        }
      }
      if (trailingPadding < 3) {
        if (!scriptText.endsWith('\n')) scriptText += '\n';
        while (trailingPadding < 3) {
          scriptText += "' Padding\n";
          trailingPadding++;
        }
        repoBytes = Buffer.from(scriptText, 'utf8');
      }

      const logLines = [];
      logLines.push('=== S2 TNS2 BOOTSTRAP UPDATER & COMMIT ===');
      logLines.push('');

      const pathOff = 0x1000;
      const typeOff = 0x2000;
      const handleOff = 0x2010;
      const sizeOff = 0x2020;
      const storageOff = 0x2040;
      const writeOff = 0x4000;

      // Check current TNS2 on console
      const curRead = await this.readRawFile(targetPath, 0xB000);
      const curExists = (curRead.result === 0);
      const curSize = curExists ? curRead.fileSize : 0;
      const curHeader = curExists ? curRead.buffer.toString('utf8').split('\n')[0].substring(0, 42) : '(none)';

      // Check backup TNS2.BAK
      const bakRead = await this.readRawFile(backupPath, 16);
      const bakExists = (bakRead.result === 0);
      const bakSize = bakExists ? bakRead.fileSize : 0;

      if (action === 0) {
        // Status & Compare
        logLines.push('[STATUS] Current Console File:');
        logLines.push('  Path: save:/f/###/TNS2');
        logLines.push(`  Exists: ${curExists ? 'YES' : 'NO'} | Size: ${curSize} bytes`);
        if (curExists) {
          logLines.push(`  Header: "${curHeader}"`);
        }
        logLines.push('');

        logLines.push('[STATUS] Host Repository File:');
        logLines.push('  Source: rpc/bootstrap.bas');
        logLines.push(`  Size: ${repoBytes.length} bytes`);
        const isIdentical = curExists && curRead.buffer.equals(repoBytes);
        logLines.push(`  Match with Console: ${isIdentical ? 'IDENTICAL (Up to date)' : 'DIFFERS (Update available)'}`);
        logLines.push('');

        logLines.push('[STATUS] Backup File:');
        logLines.push(`  save:/f/###/TNS2.BAK: ${bakExists ? `FOUND (${bakSize}B)` : 'None'}`);
        logLines.push('');
        logLines.push('------------------------------------------------');
        logLines.push('A: Update & Commit TNS2    X: Restore Backup');
        logLines.push('Y: Refresh Check           -: Exit to Launcher');

        return {
          result: 0,
          curSize,
          repoSize: repoBytes.length,
          isIdentical: isIdentical ? 1 : 0,
          updateRes: 0,
          commitRes: 0,
          lines: logLines
        };
      }

      if (action === 2) {
        // Restore Backup
        logLines[0] = '=== RESTORE TNS2 FROM BACKUP ===';
        if (!bakExists) {
          logLines.push('[ERROR] No backup found at save:/f/###/TNS2.BAK!');
          logLines.push('Cannot restore without existing backup file.');
          logLines.push('------------------------------------------------');
          logLines.push('A: Update from Repo    Y: Check    -: Exit');
          return { result: -1, curSize, repoSize: repoBytes.length, isIdentical: 0, updateRes: -1, commitRes: -1, lines: logLines };
        }

        const fullBak = await this.readRawFile(backupPath, 0xB000);
        logLines.push(`[STEP 1] Read backup file (${fullBak.buffer.length} bytes)...`);

        await client.write(pathOff, Buffer.from(targetPath + '\0', 'utf8'));
        await client.result('DeleteFile', [client.base + pathOff]);

        logLines.push(`[STEP 2] Create fresh save:/f/###/TNS2 (${fullBak.buffer.length}B)...`);
        await client.result('CreateFile', [client.base + pathOff, fullBak.buffer.length]);

        await client.write(handleOff, Buffer.alloc(8));
        const opRes = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 3]);
        if (opRes === 0) {
          const handle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
          await client.result('SetFileSize', [handle, fullBak.buffer.length]);
          await client.write(writeOff, fullBak.buffer);
          await client.write(storageOff, Buffer.alloc(128));
          await client.call('StorageCtor', [client.base + storageOff, handle, 0]);
          await client.result('StorageWrite', [client.base + storageOff, 0, client.base + writeOff, fullBak.buffer.length]);
          await client.result('FlushFile', [handle]);
          await client.call('CloseFile', [handle]);
          logLines.push('  Restored file written successfully.');
        }

        logLines.push('[STEP 3] Committing restored file to save:...');
        const saveMountOff = 0x1400;
        await client.write(saveMountOff, Buffer.from('save\0', 'utf8'));
        const commitRes = await client.result('CommitSaveData', [client.base + saveMountOff]);
        logLines.push(`  nn::fs::CommitSaveData("save") -> 0x${commitRes.toString(16)}`);

        logLines.push('');
        logLines.push('STATUS: RESTORE COMPLETED AND COMMITTED!');
        logLines.push('------------------------------------------------');
        logLines.push('A: Update from Repo    Y: Re-check    -: Exit');

        return {
          result: 0,
          curSize: fullBak.fileSize,
          repoSize: repoBytes.length,
          isIdentical: 0,
          updateRes: 0,
          commitRes,
          lines: logLines
        };
      }

      // action === 1: Update & Commit TNS2
      logLines.push(`[STEP 1] Target: save:/f/###/TNS2 (${curExists ? `Existing: ${curSize}B` : 'New'})`);
      if (curExists && curSize > 0) {
        logLines.push('  Creating backup save:/f/###/TNS2.BAK...');
        const fullCur = await this.readRawFile(targetPath, 0xB000);
        if (fullCur.result === 0) {
          await client.write(pathOff, Buffer.from(backupPath + '\0', 'utf8'));
          await client.result('DeleteFile', [client.base + pathOff]);
          await client.result('CreateFile', [client.base + pathOff, fullCur.buffer.length]);
          await client.write(handleOff, Buffer.alloc(8));
          if ((await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 3])) === 0) {
            const bHandle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
            await client.result('SetFileSize', [bHandle, fullCur.buffer.length]);
            await client.write(writeOff, fullCur.buffer);
            await client.write(storageOff, Buffer.alloc(128));
            await client.call('StorageCtor', [client.base + storageOff, bHandle, 0]);
            await client.result('StorageWrite', [client.base + storageOff, 0, client.base + writeOff, fullCur.buffer.length]);
            await client.result('FlushFile', [bHandle]);
            await client.call('CloseFile', [bHandle]);
            logLines.push(`  Backup created successfully (${fullCur.buffer.length}B).`);
          }
        }
      }

      // Step 2: Delete old TNS2 and Create fresh with new size
      logLines.push(`[STEP 2] Preparing fresh TNS2 (${repoBytes.length} bytes)...`);
      await client.write(pathOff, Buffer.from(targetPath + '\0', 'utf8'));
      await client.result('DeleteFile', [client.base + pathOff]);
      const createRes = await client.result('CreateFile', [client.base + pathOff, repoBytes.length]);
      logLines.push(`  nn::fs::CreateFile -> 0x${createRes.toString(16)}`);
      if (createRes !== 0) {
        logLines.push('  ERROR: CreateFile failed!');
        return { result: createRes, curSize, repoSize: repoBytes.length, isIdentical: 0, updateRes: createRes, commitRes: -1, lines: logLines };
      }

      // Step 3: Write repoBytes in single direct transfer
      logLines.push(`[STEP 3] Writing repo bootstrap.bas to S2 save:...`);
      await client.write(handleOff, Buffer.alloc(8));
      const openRes = await client.result('OpenFile', [client.base + handleOff, client.base + pathOff, 3]);
      if (openRes !== 0) {
        logLines.push('  ERROR: OpenFile failed!');
        return { result: openRes, curSize, repoSize: repoBytes.length, isIdentical: 0, updateRes: openRes, commitRes: -1, lines: logLines };
      }
      const handle = (await client.read(handleOff, 8)).readBigUInt64LE(0);
      await client.result('SetFileSize', [handle, repoBytes.length]);
      await client.write(writeOff, repoBytes);
      await client.write(storageOff, Buffer.alloc(128));
      await client.call('StorageCtor', [client.base + storageOff, handle, 0]);
      const writeErr = await client.result('StorageWrite', [client.base + storageOff, 0, client.base + writeOff, repoBytes.length]);
      await client.result('FlushFile', [handle]);
      await client.call('CloseFile', [handle]);
      logLines.push(`  Write completed (result: 0x${writeErr.toString(16)}).`);

      // Step 4: Atomic Commit to NAND flash
      logLines.push('');
      logLines.push('[STEP 4] *** ATOMIC TRANSACTION COMMIT ***:');
      const saveMountOff = 0x1400;
      await client.write(saveMountOff, Buffer.from('save\0', 'utf8'));
      const commitRes = await client.result('CommitSaveData', [client.base + saveMountOff]);
      logLines.push(`  nn::fs::CommitSaveData("save") -> 0x${commitRes.toString(16)}`);
      if (commitRes === 0) {
        logLines.push('  STATUS: COMMITTED TO S2 PERSISTENT STORAGE!');
      } else {
        logLines.push('  STATUS: COMMIT FAILED!');
      }

      // Step 5: Read-Back Verification
      logLines.push('');
      logLines.push('[STEP 5] Verification (Read-Back & Compare):');
      const verifyRead = await this.readRawFile(targetPath, 0xB000);
      const isMatch = verifyRead.result === 0 && verifyRead.buffer.equals(repoBytes);
      logLines.push(`  Read back: ${verifyRead.fileSize}B | 100% Byte Match: ${isMatch ? 'YES (SUCCESS)' : 'NO (MISMATCH)'}`);

      // Step 6: Directory overview
      const dirListing = await this.listDirectory('save:/f/###', 8, 0);
      const names = dirListing.entries.map(e => `${e.name} (${e.size}B)`).join(', ');
      logLines.push('');
      logLines.push(`[SAVE:/F/### DIR] ${names || '(empty)'}`);
      logLines.push('------------------------------------------------');
      logLines.push('A: Update & Commit Again    Y: Verify    -: Exit');

      return {
        result: 0,
        curSize: verifyRead.fileSize,
        repoSize: repoBytes.length,
        isIdentical: isMatch ? 1 : 0,
        updateRes: writeErr,
        commitRes,
        lines: logLines
      };
    }
  };
}

module.exports = {create};
