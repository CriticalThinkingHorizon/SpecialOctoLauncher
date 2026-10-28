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
  const STR_OFFSET = 0x2000;
  const STR_SIZE = 2048; // nn::swkbd::GetRequiredStringBufferSize() = 2004 bytes
  const WORK_OFFSET = 0x3000;
  const WORK_SIZE = 4096;
  const TEXTCHECK_OFFSET = 0x4000;
  const TEXTCHECK_SIZE = 2004;
  const STRINGS_OFFSET = 0x5000;

  async function show({ headerText = 'HelloWorldS2 Keyboard', subText = '', guideText = 'Enter text...', okText = 'OK', initialText = '' } = {}) {
    // 1. Clear out memory regions
    await client.write(ARG_OFFSET, Buffer.alloc(2048));
    await client.write(STR_OFFSET, Buffer.alloc(STR_SIZE));
    await client.write(WORK_OFFSET, Buffer.alloc(WORK_SIZE));

    const argPtr = client.base + ARG_OFFSET;
    const strPtr = client.base + STR_OFFSET;
    const workPtr = client.base + WORK_OFFSET;
    const textCheckPtr = client.base + TEXTCHECK_OFFSET;

    // 2. Initialize default keyboard preset
    await client.call('MakePresetDefault', [argPtr]);

    // 3. Set work buffer pointers in ShowKeyboardArg
    const argBuf = Buffer.alloc(0x50);
    argBuf.writeBigUInt64LE(BigInt(workPtr), 0x00);         // [arg + 0x4d0] = workBuf
    argBuf.writeBigUInt64LE(BigInt(WORK_SIZE), 0x08);       // [arg + 0x4d8] = workBufSize
    argBuf.writeBigUInt64LE(BigInt(textCheckPtr), 0x20);     // [arg + 0x4f0] = textCheckWorkBuf
    argBuf.writeBigUInt64LE(BigInt(TEXTCHECK_SIZE), 0x28); // [arg + 0x4f8] = textCheckWorkBufSize
    await client.write(ARG_OFFSET + 0x4d0, argBuf);

    // 4. Set optional strings
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

    // 5. Invoke ShowKeyboard synchronously (S2 Horizon displays native OSK on screen)
    const result = await client.result('ShowKeyboard', [strPtr, argPtr, 0]);

    // 6. Read back full String buffer populated by ShowKeyboard
    const rawOut = await client.read(STR_OFFSET, STR_SIZE);
    console.log(`[SWKBD DEBUG] Result: 0x${result.toString(16)}`);
    console.log(`[SWKBD DEBUG] Raw buffer hex (128 bytes): ${rawOut.subarray(0, 128).toString('hex')}`);

    let firstNonZero = -1;
    for (let i = 0; i < rawOut.length; i++) {
      if (rawOut[i] !== 0) { firstNonZero = i; break; }
    }
    console.log(`[SWKBD DEBUG] First non-zero byte at index: ${firstNonZero}`);

    let text = '';
    if (firstNonZero >= 0) {
      // Try scanning for null-terminated strings at 0, firstNonZero, etc.
      for (const start of [0, 4, 8, firstNonZero]) {
        if (start < rawOut.length) {
          const slice = rawOut.subarray(start);
          const u16 = slice.toString('utf16le').replace(/\0.*$/, '').trim();
          const u8 = slice.toString('utf8').replace(/\0.*$/, '').trim();
          if (u16 && u16.length > 0 && /^[\x20-\x7E\s]*$/.test(u16)) {
            text = u16;
            break;
          }
          if (u8 && u8.length > 0 && /^[\x20-\x7E\s]*$/.test(u8)) {
            text = u8;
            break;
          }
        }
      }
    }
    console.log(`[SWKBD DEBUG] Extracted text: "${text}"`);

    return { result, text };
  }

  return { show };
}

module.exports = { create };
