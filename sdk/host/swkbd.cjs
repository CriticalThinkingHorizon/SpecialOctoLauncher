// Native nn::swkbd Host Adapter for S2
const nativeClient = require('../native/client.cjs');

async function create(rpc) {
  const sdk = rpc.a.sdk;
  const swkbdDefs = {
    MakePresetDefault: {
      offset: 3978976,
      size: 112,
      hex: (await rpc.read(sdk + 3978976, 16)).toString('hex')
    },
    SetHeaderTextUtf8: {
      offset: 3982928,
      size: 156,
      hex: (await rpc.read(sdk + 3982928, 16)).toString('hex')
    },
    SetSubTextUtf8: {
      offset: 3983248,
      size: 164,
      hex: (await rpc.read(sdk + 3983248, 16)).toString('hex')
    },
    SetGuideTextUtf8: {
      offset: 3983584,
      size: 156,
      hex: (await rpc.read(sdk + 3983584, 16)).toString('hex')
    },
    SetOkTextUtf8: {
      offset: 3982416,
      size: 156,
      hex: (await rpc.read(sdk + 3982416, 16)).toString('hex')
    },
    SetInitialTextUtf8: {
      offset: 3983872,
      size: 168,
      hex: (await rpc.read(sdk + 3983872, 16)).toString('hex')
    },
    ShowKeyboard: {
      offset: 3980640,
      size: 892,
      hex: (await rpc.read(sdk + 3980640, 16)).toString('hex')
    }
  };

  const client = await nativeClient.create(rpc, swkbdDefs, 65536);

  const ARG_OFFSET = 0x1000;
  const STR_STRUCT_OFFSET = 0x2000;
  const STR_BUF_OFFSET = 0x2020;
  const STR_BUF_SIZE = 2004; // nn::swkbd::GetRequiredStringBufferSize() = 2004 bytes
  const WORK_OFFSET = 0x3000;
  const WORK_SIZE = 4096;
  const TEXTCHECK_OFFSET = 0x4000;
  const TEXTCHECK_SIZE = 2004;
  const STRINGS_OFFSET = 0x5000;

  async function show({ headerText = 'HelloWorldS2 Keyboard', subText = '', guideText = 'Enter text...', okText = 'OK', initialText = '' } = {}) {
    // 1. Clear out memory regions
    await client.write(ARG_OFFSET, Buffer.alloc(2048));
    await client.write(STR_STRUCT_OFFSET, Buffer.alloc(32));
    await client.write(STR_BUF_OFFSET, Buffer.alloc(2048));
    await client.write(WORK_OFFSET, Buffer.alloc(WORK_SIZE));

    const argPtr = client.base + ARG_OFFSET;
    const strStructPtr = client.base + STR_STRUCT_OFFSET;
    const strBufPtr = client.base + STR_BUF_OFFSET;
    const workPtr = client.base + WORK_OFFSET;
    const textCheckPtr = client.base + TEXTCHECK_OFFSET;

    // 2. Setup nn::swkbd::String struct
    // [offset 0x00]: 64-bit destination character buffer pointer
    // [offset 0x08]: 64-bit buffer capacity / read size in bytes (2004 bytes)
    const strHeader = Buffer.alloc(16);
    strHeader.writeBigUInt64LE(BigInt(strBufPtr), 0);
    strHeader.writeBigUInt64LE(BigInt(STR_BUF_SIZE), 8);
    await client.write(STR_STRUCT_OFFSET, strHeader);

    // 3. Initialize default keyboard preset
    await client.call('MakePresetDefault', [argPtr]);

    // 4. Set work buffer pointers in ShowKeyboardArg
    const argBuf = Buffer.alloc(0x50);
    argBuf.writeBigUInt64LE(BigInt(workPtr), 0x00);         // [arg + 0x4d0] = workBuf
    argBuf.writeBigUInt64LE(BigInt(WORK_SIZE), 0x08);       // [arg + 0x4d8] = workBufSize
    argBuf.writeBigUInt64LE(BigInt(textCheckPtr), 0x20);     // [arg + 0x4f0] = textCheckWorkBuf
    argBuf.writeBigUInt64LE(BigInt(TEXTCHECK_SIZE), 0x28); // [arg + 0x4f8] = textCheckWorkBufSize
    await client.write(ARG_OFFSET + 0x4d0, argBuf);

    // 5. Set optional strings
    let strCursor = STRINGS_OFFSET;
    async function writeStr(s) {
      const b = Buffer.from(s + '\0', 'utf8');
      const ptr = client.base + strCursor;
      await client.write(strCursor, b);
      strCursor += (b.length + 15) & ~15;
      return ptr;
    }

    if (headerText) {
      const hPtr = await writeStr(headerText);
      await client.call('SetHeaderTextUtf8', [argPtr, hPtr]);
    }
    if (subText) {
      const sPtr = await writeStr(subText);
      await client.call('SetSubTextUtf8', [argPtr, sPtr]);
    }
    if (guideText) {
      const gPtr = await writeStr(guideText);
      await client.call('SetGuideTextUtf8', [argPtr, gPtr]);
    }
    if (okText) {
      const oPtr = await writeStr(okText);
      await client.call('SetOkTextUtf8', [argPtr, oPtr]);
    }
    if (initialText) {
      const iPtr = await writeStr(initialText);
      await client.call('SetInitialTextUtf8', [argPtr, iPtr]);
    }

    // 6. Invoke ShowKeyboard synchronously (S2 Horizon displays native OSK on screen)
    const result = await client.result('ShowKeyboard', [strStructPtr, argPtr, 0]);

    // 7. Read back text from the buffer populated by ReadStorage
    const rawOut = await client.read(STR_BUF_OFFSET, STR_BUF_SIZE);
    console.log(`[SWKBD DEBUG] Result: 0x${result.toString(16)}`);
    console.log(`[SWKBD DEBUG] Raw buffer hex (64 bytes): ${rawOut.subarray(0, 64).toString('hex')}`);

    let text = '';
    if (result === 0) {
      // The OS software keyboard returns null-terminated UTF-16LE text
      const u16Str = rawOut.toString('utf16le').replace(/\0.*$/, '');
      const u8Str = rawOut.toString('utf8').replace(/\0.*$/, '');

      // Determine encoding: if byte 1 is 0 and byte 0 is non-zero, it is UTF-16LE
      if (rawOut.length >= 2 && rawOut[1] === 0 && rawOut[0] !== 0) {
        text = u16Str;
      } else if (u8Str && u8Str.length > 0 && /^[\x20-\x7E\s]*$/.test(u8Str)) {
        text = u8Str;
      } else {
        text = u16Str || u8Str;
      }
    }
    console.log(`[SWKBD DEBUG] Extracted text: "${text}"`);

    return { result, text };
  }

  return { show };
}

module.exports = { create };
