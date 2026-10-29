// Native nn::web Host Adapter for S2 Browser Applet
const nativeClient = require('../native/client.cjs');
const { inspectModule } = require('../../inspection/inspect.cjs');

async function create(rpc) {
  const sdk = rpc.a.sdk;

  // Dynamically resolve nn::web symbols from SDK MOD0 table
  console.log('[WEB HOST] Resolving nn::web symbols from SDK module...');
  let sdkModule = null;
  try {
    sdkModule = await inspectModule(rpc, sdk);
  } catch (err) {
    console.warn('[WEB HOST] Module inspection failed, falling back to cached offsets:', err.message);
  }

  const symbols = sdkModule?.symbols || [];

  // 1. Find ShowWebPage entry point
  const showWebSym = symbols.find(s =>
    (s.name.includes('11ShowWebPage') || s.name.startsWith('_ZN2nn3web11ShowWebPage')) && s.section && s.type === 2
  ) || symbols.find(s =>
    s.name.includes('ShowWebPage') && !s.name.includes('ShowWebPageArg') && s.section && s.type === 2
  ) || { name: '_ZN2nn3web11ShowWebPageEPNS0_18WebPageReturnValueERKNS0_14ShowWebPageArgE', offset: 5125680, size: 344 };

  // 2. Find ShowWebPageArg constructor (taking const char* url)
  const argCtorSym = symbols.find(s =>
    s.name.includes('14ShowWebPageArgC1EPKc') || s.name.includes('14ShowWebPageArgC2EPKc')
  ) || symbols.find(s =>
    s.name.includes('ShowWebPageArg') && (s.name.includes('C1') || s.name.includes('C2')) && s.name.includes('PKc')
  ) || { name: '_ZN2nn3web14ShowWebPageArgC1EPKc', offset: 5136996, size: 152 };

  // 3. Find WebPageReturnValue constructor
  const retValCtorSym = symbols.find(s =>
    s.name.includes('18WebPageReturnValueC1Ev') || s.name.includes('18WebPageReturnValueC2Ev')
  ) || { name: '_ZN2nn3web18WebPageReturnValueC1Ev', offset: 5140336, size: 12 };

  // 4. Find GetWebExitReason getter
  const exitReasonSym = symbols.find(s =>
    s.name.includes('GetWebExitReason')
  ) || { name: '_ZNK2nn3web18WebPageReturnValue16GetWebExitReasonEv', offset: 5140348, size: 76 };

  console.log(`[WEB HOST] Found ShowWebPage: ${showWebSym.name} (offset=${showWebSym.offset}, size=${showWebSym.size})`);
  console.log(`[WEB HOST] Found ShowWebPageArg constructor: ${argCtorSym.name} (offset=${argCtorSym.offset}, size=${argCtorSym.size})`);
  console.log(`[WEB HOST] Found WebPageReturnValue constructor: ${retValCtorSym.name} (offset=${retValCtorSym.offset})`);
  console.log(`[WEB HOST] Found GetWebExitReason: ${exitReasonSym.name} (offset=${exitReasonSym.offset})`);

  const takesReturnValue = showWebSym.name.includes('WebPageReturnValue') || showWebSym.name.includes('PNS0_18');

  const webDefs = {
    ShowWebPageArgCtor: {
      offset: argCtorSym.offset,
      size: argCtorSym.size,
      hex: (await rpc.read(sdk + argCtorSym.offset, Math.min(argCtorSym.size || 16, 16))).toString('hex')
    },
    ShowWebPage: {
      offset: showWebSym.offset,
      size: showWebSym.size,
      hex: (await rpc.read(sdk + showWebSym.offset, Math.min(showWebSym.size || 16, 16))).toString('hex')
    },
    WebPageReturnValueCtor: {
      offset: retValCtorSym.offset,
      size: retValCtorSym.size,
      hex: (await rpc.read(sdk + retValCtorSym.offset, Math.min(retValCtorSym.size || 16, 16))).toString('hex')
    },
    GetWebExitReason: {
      offset: exitReasonSym.offset,
      size: exitReasonSym.size,
      hex: (await rpc.read(sdk + exitReasonSym.offset, Math.min(exitReasonSym.size || 16, 16))).toString('hex')
    }
  };

  const client = await nativeClient.create(rpc, webDefs, 65536);

  const ARG_OFFSET = 0x2000;
  const RET_VAL_OFFSET = 0x4000;
  const URL_OFFSET = 0x5000;

  async function showWebPage({ url = 'https://google.com' } = {}) {
    // 1. Clear out memory regions
    await client.write(ARG_OFFSET, Buffer.alloc(8192));
    await client.write(RET_VAL_OFFSET, Buffer.alloc(1024));

    // 2. Initialize WebPageReturnValue object
    const retValPtr = client.base + RET_VAL_OFFSET;
    await client.call('WebPageReturnValueCtor', [retValPtr]);

    // 3. Format and write target URL string
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const urlBuf = Buffer.from(url + '\0', 'utf8');
    await client.write(URL_OFFSET, urlBuf);

    const argPtr = client.base + ARG_OFFSET;
    const urlPtr = client.base + URL_OFFSET;

    // 4. Construct ShowWebPageArg with target URL
    console.log(`[WEB HOST] Initializing ShowWebPageArg with target URL: "${url}"...`);
    await client.call('ShowWebPageArgCtor', [argPtr, urlPtr]);

    // 5. Launch S2 Browser Applet
    console.log(`[WEB HOST] Launching S2 Browser Applet on console...`);
    let result = 0;
    if (takesReturnValue) {
      result = await client.result('ShowWebPage', [retValPtr, argPtr]);
    } else {
      result = await client.result('ShowWebPage', [argPtr]);
    }

    console.log(`[WEB HOST] Browser applet returned with code: 0x${result.toString(16)}`);

    // 6. Read back return values via official getter
    let exitReason = 0;
    try {
      exitReason = await client.result('GetWebExitReason', [retValPtr]);
    } catch (e) {
      const retBuf = await client.read(RET_VAL_OFFSET, 64);
      exitReason = retBuf.readUInt32LE(0);
    }
    console.log(`[WEB HOST] WebPageReturnValue exitReason: ${exitReason}`);

    return { result, exitReason, url };
  }

  return { showWebPage, takesReturnValue };
}

module.exports = { create };
