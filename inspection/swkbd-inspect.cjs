// Safe investigation of nn::swkbd symbols and work buffer requirements on S2.
// This script performs read-only dynamic symbol inspection, prologue disassembly reads,
// and executes strictly safe non-blocking query routines (e.g., GetRequiredWorkBufferSize).
// It explicitly DOES NOT invoke ShowKeyboard or any blocking applet transitions.

const fs = require('node:fs/promises');
const path = require('node:path');
const { inspectModule } = require('./inspect.cjs');

async function verifyAndCall(rpc, address, size = 16, args = []) {
  const readSize = Math.max(16, Math.min(32, size));
  const hex = (await rpc.read(address, readSize)).toString('hex');
  await rpc.request({ command: 'verify-function', address, hex });
  return rpc.callAddress(address, args);
}

function demangleSimple(name) {
  if (name.includes('GetRequiredWorkBufferSizeEb')) return 'nn::swkbd::GetRequiredWorkBufferSize(bool hasCustomizeDic)';
  if (name.includes('GetRequiredWorkBufferSizeEi')) return 'nn::swkbd::GetRequiredWorkBufferSize(int dicSize)';
  if (name.includes('GetRequiredStringBufferSize')) return 'nn::swkbd::GetRequiredStringBufferSize()';
  if (name.includes('GetRequiredTextCheckWorkBufferSize')) return 'nn::swkbd::GetRequiredTextCheckWorkBufferSize()';
  if (name.includes('InitializeKeyboardConfig')) return 'nn::swkbd::InitializeKeyboardConfig(KeyboardConfig*)';
  if (name.includes('ShowKeyboard')) return 'nn::swkbd::ShowKeyboard(...)';
  if (name.includes('MakePreset')) return 'nn::swkbd::MakePreset(...)';
  if (name.includes('SetHeaderText')) return 'nn::swkbd::SetHeaderText(...)';
  if (name.includes('SetSubText')) return 'nn::swkbd::SetSubText(...)';
  if (name.includes('SetGuideText')) return 'nn::swkbd::SetGuideText(...)';
  if (name.includes('SetOkText')) return 'nn::swkbd::SetOkText(...)';
  if (name.includes('SetInitialText')) return 'nn::swkbd::SetInitialText(...)';
  if (name.includes('InlineKeyboard')) return 'nn::swkbd::InlineKeyboard::' + name.replace(/.*InlineKeyboard/, '');
  return name;
}

async function main(directory) {
  directory = path.resolve(directory || path.join(__dirname, '../runs/latest'));
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));

  console.log('\n======================================================');
  console.log('     nn::swkbd Native Subsystem Safe Inspection       ');
  console.log('======================================================');

  const sdkBase = rpc.a.sdk;
  console.log(`SDK module base address: 0x${sdkBase.toString(16)}`);

  console.log('Parsing SDK MOD0 dynamic symbol table for swkbd symbols...');
  const sdkModule = await inspectModule(rpc, sdkBase);
  
  const swkbdSymbols = sdkModule.symbols.filter(s => 
    s.name.toLowerCase().includes('swkbd')
  );

  console.log(`Found ${swkbdSymbols.length} swkbd-related symbols in SDK.\n`);

  const categorized = {
    queryAndConfig: [],
    showKeyboard: [],
    inlineKeyboard: [],
    stringAndPreset: [],
    viSdkSwkbd: [],
    other: []
  };

  for (const sym of swkbdSymbols) {
    const item = {
      name: sym.name,
      description: demangleSimple(sym.name),
      offset: sym.offset,
      address: '0x' + (sdkBase + sym.offset).toString(16),
      size: sym.size,
      section: sym.section,
      type: sym.type
    };

    if (/GetRequired|InitializeKeyboardConfig/i.test(sym.name)) {
      categorized.queryAndConfig.push(item);
    } else if (/ShowKeyboard/i.test(sym.name)) {
      categorized.showKeyboard.push(item);
    } else if (/InlineKeyboard/i.test(sym.name)) {
      categorized.inlineKeyboard.push(item);
    } else if (/Preset|Text|String/i.test(sym.name)) {
      categorized.stringAndPreset.push(item);
    } else if (/vi.*sdk.*swkbd/i.test(sym.name)) {
      categorized.viSdkSwkbd.push(item);
    } else {
      categorized.other.push(item);
    }
  }

  console.log('--- Key Function Groups ---');
  console.log(`- Query & Config helpers: ${categorized.queryAndConfig.length}`);
  console.log(`- ShowKeyboard entry points: ${categorized.showKeyboard.length}`);
  console.log(`- InlineKeyboard methods: ${categorized.inlineKeyboard.length}`);
  console.log(`- String/Preset utilities: ${categorized.stringAndPreset.length}`);
  console.log(`- VI SDK Virtual Display: ${categorized.viSdkSwkbd.length}`);
  console.log(`- Other internal symbols: ${categorized.other.length}`);

  const report = {
    session: rpc.a.session,
    sdkBase: '0x' + sdkBase.toString(16),
    totalSwkbdSymbols: swkbdSymbols.length,
    groups: categorized,
    probes: {}
  };

  // 1. Probe GetRequiredWorkBufferSize & Buffer Sizing (Pure calculation, zero risk)
  console.log('\n[Probe 1] Testing nn::swkbd Buffer Requirement Query Functions:');
  report.probes.bufferSizes = {};

  const getWorkBufBool = swkbdSymbols.find(s => s.name.includes('GetRequiredWorkBufferSizeEb') && s.section && s.type === 2);
  if (getWorkBufBool) {
    const addr = sdkBase + getWorkBufBool.offset;
    try {
      const resNoDic = await verifyAndCall(rpc, addr, getWorkBufBool.size, [0]);
      const resWithDic = await verifyAndCall(rpc, addr, getWorkBufBool.size, [1]);
      const bytesNoDic = Number(resNoDic.result);
      const bytesWithDic = Number(resWithDic.result);
      console.log(`  nn::swkbd::GetRequiredWorkBufferSize(false): ${bytesNoDic} bytes (0x${bytesNoDic.toString(16)})`);
      console.log(`  nn::swkbd::GetRequiredWorkBufferSize(true):  ${bytesWithDic} bytes (0x${bytesWithDic.toString(16)})`);
      report.probes.bufferSizes.workBufferWithoutDic = bytesNoDic;
      report.probes.bufferSizes.workBufferWithDic = bytesWithDic;
    } catch (e) {
      console.log('  GetRequiredWorkBufferSize(bool) failed:', e.message);
    }
  }

  const getStringBuf = swkbdSymbols.find(s => s.name.includes('GetRequiredStringBufferSize') && s.section && s.type === 2);
  if (getStringBuf) {
    const addr = sdkBase + getStringBuf.offset;
    try {
      const res = await verifyAndCall(rpc, addr, getStringBuf.size, []);
      const bytes = Number(res.result);
      console.log(`  nn::swkbd::GetRequiredStringBufferSize():    ${bytes} bytes (0x${bytes.toString(16)})`);
      report.probes.bufferSizes.stringBuffer = bytes;
    } catch (e) {
      console.log('  GetRequiredStringBufferSize failed:', e.message);
    }
  }

  const getTextCheckBuf = swkbdSymbols.find(s => s.name.includes('GetRequiredTextCheckWorkBufferSize') && s.section && s.type === 2);
  if (getTextCheckBuf) {
    const addr = sdkBase + getTextCheckBuf.offset;
    try {
      const res = await verifyAndCall(rpc, addr, getTextCheckBuf.size, []);
      const bytes = Number(res.result);
      console.log(`  nn::swkbd::GetRequiredTextCheckWorkBufferSize(): ${bytes} bytes (0x${bytes.toString(16)})`);
      report.probes.bufferSizes.textCheckWorkBuffer = bytes;
    } catch (e) {
      console.log('  GetRequiredTextCheckWorkBufferSize failed:', e.message);
    }
  }

  const getInlineBuf = swkbdSymbols.find(s => s.name.includes('InlineKeyboard25GetRequiredWorkBufferSize') && s.section && s.type === 2);
  if (getInlineBuf) {
    const addr = sdkBase + getInlineBuf.offset;
    try {
      const res = await verifyAndCall(rpc, addr, getInlineBuf.size, []);
      const bytes = Number(res.result);
      console.log(`  nn::swkbd::InlineKeyboard::GetRequiredWorkBufferSize(): ${bytes} bytes (0x${bytes.toString(16)})`);
      report.probes.bufferSizes.inlineWorkBuffer = bytes;
    } catch (e) {
      console.log('  InlineKeyboard::GetRequiredWorkBufferSize failed:', e.message);
    }
  }

  // 2. Read assembly of ShowKeyboard implementation (offset 3980640, 892 bytes)
  const fullShowSym = swkbdSymbols.find(s => s.name.includes('ShowKeyboard') && s.size > 100 && s.section && s.type === 2);
  if (fullShowSym) {
    const showAddr = sdkBase + fullShowSym.offset;
    console.log(`\n[Probe 2] Reading machine code of ShowKeyboard (892 bytes) at 0x${showAddr.toString(16)}:`);
    try {
      const codeBytes = await rpc.read(showAddr, 64);
      console.log(`  Target symbol: ${fullShowSym.name}`);
      console.log(`  Instructions (first 64 bytes):`);
      console.log(`  HEX: ${codeBytes.toString('hex')}`);
      report.probes.showKeyboardPrologue = {
        symbol: fullShowSym.name,
        address: '0x' + showAddr.toString(16),
        totalSize: fullShowSym.size,
        first64Hex: codeBytes.toString('hex')
      };
    } catch (e) {
      console.log('  Failed to read ShowKeyboard code:', e.message);
      report.probes.showKeyboardPrologue = { error: e.message };
    }
  }

  // 3. Probe InitializeKeyboardConfig (Verifies function, initializes struct in isolated scratch buffer)
  const initConfigSym = swkbdSymbols.find(s => s.name.includes('InitializeKeyboardConfig') && s.section && s.type === 2);
  if (initConfigSym) {
    const initAddr = sdkBase + initConfigSym.offset;
    console.log(`\n[Probe 3] Testing InitializeKeyboardConfig with verified call:`);
    try {
      const scratch = rpc.a.scratch + 0x10000;
      const initialZeros = Buffer.alloc(1024);
      await rpc.write(scratch, initialZeros);
      
      const callRes = await verifyAndCall(rpc, initAddr, initConfigSym.size, [scratch]);
      console.log(`  Call completed with return code: 0x${callRes.result.toString(16)}`);

      const filled = await rpc.read(scratch, 1024);
      let nonZeroCount = 0;
      for (let i = 0; i < filled.length; i++) {
        if (filled[i] !== 0) nonZeroCount++;
      }
      console.log(`  KeyboardConfig populated: ${nonZeroCount} non-zero bytes out of 1024`);
      console.log(`  Config Header Hex (64 bytes): ${filled.subarray(0, 64).toString('hex')}`);

      report.probes.initializeKeyboardConfig = {
        symbol: initConfigSym.name,
        address: '0x' + initAddr.toString(16),
        returnResult: '0x' + callRes.result.toString(16),
        nonZeroBytes: nonZeroCount,
        sampleHex: filled.subarray(0, 128).toString('hex')
      };
    } catch (e) {
      console.log('  InitializeKeyboardConfig failed:', e.message);
      report.probes.initializeKeyboardConfig = { error: e.message };
    }
  }

  const outFile = path.join(directory, 'swkbd-inspection.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(`\n✔ Full inspection report written to: ${outFile}\n`);
}

module.exports = { main };

if (require.main === module) {
  main(process.argv[2]).catch(err => {
    console.error('Fatal error during swkbd probe:', err.stack);
    process.exitCode = 1;
  });
}
