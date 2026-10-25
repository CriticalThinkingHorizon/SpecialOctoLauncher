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
    CommitSaveData: ftpDefs.commit
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
        children: [
          { name: `${name}.nso`, type: 'file', size: totalSize },
          { name: '.text', type: 'file', size: textSize },
          ...(rodataSize > 0 ? [{ name: '.rodata', type: 'file', size: rodataSize }] : []),
          ...(dataSize > 0 ? [{ name: '.data', type: 'file', size: dataSize }] : []),
          { name: `base_0x${codeReg.address.toString(16)}`, type: 'file', size: 0 }
        ]
      });
    }

    exefsCache = [
      ...modules,
      { name: 'main.npdm', type: 'file', size: 0 }
    ];
    return exefsCache;
  }

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
    }
  };
}

module.exports = {create};
