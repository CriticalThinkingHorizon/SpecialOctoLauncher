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

  // 5. Optional configuration setters
  const touchSym = symbols.find(s => s.name.includes('SetTouchEnabledOnContents'));
  const pointerSym = symbols.find(s => s.name.includes('SetPointerEnabled'));
  const callbackSym = symbols.find(s =>
    s.name.includes('ShowWebPageArg') && s.name.includes('SetCallbackUrl')
  ) || { name: '_ZN2nn3web14ShowWebPageArg14SetCallbackUrlEPKc', offset: 5137272, size: 236 };
  const callbackableSym = symbols.find(s =>
    s.name.includes('ShowWebPageArg') && s.name.includes('SetCallbackableUrl')
  ) || { name: '_ZN2nn3web14ShowWebPageArg18SetCallbackableUrlEPKc', offset: 5137508, size: 236 };

  console.log(`[WEB HOST] Found ShowWebPage: ${showWebSym.name} (offset=${showWebSym.offset}, size=${showWebSym.size})`);
  console.log(`[WEB HOST] Found ShowWebPageArg constructor: ${argCtorSym.name} (offset=${argCtorSym.offset}, size=${argCtorSym.size})`);
  console.log(`[WEB HOST] Found WebPageReturnValue constructor: ${retValCtorSym.name} (offset=${retValCtorSym.offset})`);
  console.log(`[WEB HOST] Found GetWebExitReason: ${exitReasonSym.name} (offset=${exitReasonSym.offset})`);
  if (callbackSym) console.log(`[WEB HOST] Found SetCallbackUrl: ${callbackSym.name} (offset=${callbackSym.offset})`);
  if (callbackableSym) console.log(`[WEB HOST] Found SetCallbackableUrl: ${callbackableSym.name} (offset=${callbackableSym.offset})`);
  if (touchSym) console.log(`[WEB HOST] Found SetTouchEnabledOnContents: ${touchSym.name} (offset=${touchSym.offset})`);
  if (pointerSym) console.log(`[WEB HOST] Found SetPointerEnabled: ${pointerSym.name} (offset=${pointerSym.offset})`);

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

  if (callbackSym) {
    webDefs.SetCallbackUrl = {
      offset: callbackSym.offset,
      size: callbackSym.size,
      hex: (await rpc.read(sdk + callbackSym.offset, Math.min(callbackSym.size || 16, 16))).toString('hex')
    };
  }
  if (callbackableSym) {
    webDefs.SetCallbackableUrl = {
      offset: callbackableSym.offset,
      size: callbackableSym.size,
      hex: (await rpc.read(sdk + callbackableSym.offset, Math.min(callbackableSym.size || 16, 16))).toString('hex')
    };
  }
  if (touchSym) {
    webDefs.SetTouchEnabled = {
      offset: touchSym.offset,
      size: touchSym.size,
      hex: (await rpc.read(sdk + touchSym.offset, Math.min(touchSym.size || 16, 16))).toString('hex')
    };
  }
  if (pointerSym) {
    webDefs.SetPointerEnabled = {
      offset: pointerSym.offset,
      size: pointerSym.size,
      hex: (await rpc.read(sdk + pointerSym.offset, Math.min(pointerSym.size || 16, 16))).toString('hex')
    };
  }

  const client = await nativeClient.create(rpc, webDefs, 65536);

  const ARG_OFFSET = 0x2000;
  const RET_VAL_OFFSET = 0x4000;
  const URL_OFFSET = 0x5000;
  const CALLBACK_OFFSET = 0x6000;

  async function showWebPage({ url = 'https://google.com', callbackUrl = 'http://localhost/callback', flags = 0 } = {}) {
    // 1. Clear out memory regions
    await client.write(ARG_OFFSET, Buffer.alloc(8192));
    await client.write(RET_VAL_OFFSET, Buffer.alloc(1024));

    // 2. Initialize WebPageReturnValue object
    const retValPtr = client.base + RET_VAL_OFFSET;
    await client.call('WebPageReturnValueCtor', [retValPtr]);

    // 3. Format and write target URL string & callback URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const urlBuf = Buffer.from(url + '\0', 'utf8');
    await client.write(URL_OFFSET, urlBuf);

    const callbackBuf = Buffer.from(callbackUrl + '\0', 'utf8');
    await client.write(CALLBACK_OFFSET, callbackBuf);

    const argPtr = client.base + ARG_OFFSET;
    const urlPtr = client.base + URL_OFFSET;
    const callbackPtr = client.base + CALLBACK_OFFSET;

    // 4. Construct ShowWebPageArg with target URL
    console.log(`[WEB HOST] Initializing ShowWebPageArg with target URL: "${url}" (flags=0x${flags.toString(16)})...`);
    await client.call('ShowWebPageArgCtor', [argPtr, urlPtr]);

    // Apply Callback URL required by S2 OS for third-party web sessions
    if (webDefs.SetCallbackUrl) {
      console.log(`[WEB HOST] Setting CallbackUrl: "${callbackUrl}"...`);
      await client.call('SetCallbackUrl', [argPtr, callbackPtr]);
    }

    // Apply standard setters if present
    if (webDefs.SetTouchEnabled && (flags & 2)) {
      await client.call('SetTouchEnabled', [argPtr, 1]);
      console.log('[WEB HOST] Enabled TouchOnContents');
    }
    if (webDefs.SetPointerEnabled && (flags & 4)) {
      await client.call('SetPointerEnabled', [argPtr, 1]);
      console.log('[WEB HOST] Enabled PointerMode');
    }

    // Apply internal flag at offset 0x2BC (decimal 700) if requested
    if (flags & 1) {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(1, 0);
      await client.write(ARG_OFFSET + 0x2BC, b);
      console.log('[WEB HOST] Applied InternalArgs / CommonArgData + 0x2BC (700) = 1');
    }

    // Verify and log offset 0x2BC value
    const checkBuf = await client.read(ARG_OFFSET + 0x2BC, 4);
    const valAt2BC = checkBuf.readUInt32LE(0);
    console.log(`[WEB HOST] Arg verification: [arg + 0x2BC] = 0x${valAt2BC.toString(16)} (${valAt2BC})`);

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
