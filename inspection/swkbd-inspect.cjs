// Safe investigation of nn::swkbd symbols and work buffer requirements on Switch 2.
// This script performs read-only dynamic symbol inspection, prologue disassembly reads,
// and executes strictly safe non-blocking query routines (e.g., CalculateWorkBufferSize).
// It explicitly DOES NOT invoke ShowKeyboard or any blocking applet transitions.

const fs = require('node:fs/promises');
const path = require('node:path');
const { inspectModule } = require('./inspect.cjs');

function demangleSimple(name) {
  // Helpful quick demangling patterns for nn::swkbd symbols
  if (name.includes('CalculateWorkBufferSize')) return 'nn::swkbd::CalculateWorkBufferSize(bool)';
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

    if (/CalculateWorkBufferSize|InitializeKeyboardConfig/i.test(sym.name)) {
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

  // 1. Probe CalculateWorkBufferSize (Stateless calculation, zero risk)
  const calcBufSym = swkbdSymbols.find(s => s.name.includes('CalculateWorkBufferSize') && s.section && s.type === 2);
  if (calcBufSym) {
    const calcAddr = sdkBase + calcBufSym.offset;
    console.log(`\n[Probe 1] Testing nn::swkbd::CalculateWorkBufferSize at 0x${calcAddr.toString(16)}:`);
    try {
      const resWithoutDic = await rpc.callAddress(calcAddr, [0]);
      const resWithDic = await rpc.callAddress(calcAddr, [1]);
      const bytesNoDic = Number(resWithoutDic.result);
      const bytesWithDic = Number(resWithDic.result);

      console.log(`  Work buffer required (without custom dict): ${bytesNoDic} bytes (0x${bytesNoDic.toString(16)})`);
      console.log(`  Work buffer required (with custom dict):    ${bytesWithDic} bytes (0x${bytesWithDic.toString(16)})`);
      report.probes.calculateWorkBufferSize = {
        symbol: calcBufSym.name,
        address: '0x' + calcAddr.toString(16),
        withoutDictBytes: bytesNoDic,
        withDictBytes: bytesWithDic
      };
    } catch (e) {
      console.log('  CalculateWorkBufferSize call failed:', e.message);
      report.probes.calculateWorkBufferSize = { error: e.message };
    }
  } else {
    console.log('\n[Probe 1] CalculateWorkBufferSize symbol not found.');
  }

  // 2. Read assembly prologue of ShowKeyboard (Read-only, no execution)
  const showSym = swkbdSymbols.find(s => s.name.includes('ShowKeyboard') && s.section && s.type === 2);
  if (showSym) {
    const showAddr = sdkBase + showSym.offset;
    console.log(`\n[Probe 2] Reading machine code prologue of ShowKeyboard at 0x${showAddr.toString(16)}:`);
    try {
      const codeBytes = await rpc.read(showAddr, Math.min(64, showSym.size || 64));
      console.log(`  Instructions (first ${codeBytes.length} bytes):`);
      console.log(`  HEX: ${codeBytes.toString('hex')}`);
      report.probes.showKeyboardPrologue = {
        symbol: showSym.name,
        address: '0x' + showAddr.toString(16),
        size: showSym.size,
        hex: codeBytes.toString('hex')
      };
    } catch (e) {
      console.log('  Failed to read ShowKeyboard code:', e.message);
      report.probes.showKeyboardPrologue = { error: e.message };
    }
  }

  // 3. Probe InitializeKeyboardConfig (Initializes struct with default values in isolated scratch buffer)
  const initConfigSym = swkbdSymbols.find(s => s.name.includes('InitializeKeyboardConfig') && s.section && s.type === 2);
  if (initConfigSym) {
    const initAddr = sdkBase + initConfigSym.offset;
    console.log(`\n[Probe 3] Testing InitializeKeyboardConfig with isolated scratch buffer:`);
    try {
      const scratch = rpc.a.scratch + 0x10000;
      const initialZeros = Buffer.alloc(1024);
      await rpc.write(scratch, initialZeros);
      
      const callRes = await rpc.callAddress(initAddr, [scratch]);
      console.log(`  Call completed with return code: 0x${callRes.result.toString(16)}`);

      const filled = await rpc.read(scratch, 1024);
      let nonZeroCount = 0;
      for (let i = 0; i < filled.length; i++) {
        if (filled[i] !== 0) nonZeroCount++;
      }
      console.log(`  KeyboardConfig filled bytes: ${nonZeroCount} non-zero bytes out of 1024`);
      
      // Dump the first 128 bytes of KeyboardConfig
      console.log(`  Config Header Hex: ${filled.subarray(0, 64).toString('hex')}`);

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
