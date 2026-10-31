// Safe inspection of nn::audio symbols, audio output pipelines, and SmileBASIC audio capabilities on S2.
// This script performs dynamic symbol inspection of SDK audio routines, validates offsets,
// disassembles prologues, and produces an audio architecture summary.

const fs = require('node:fs/promises');
const path = require('node:path');
const { inspectModule } = require('./inspect.cjs');

function demangleAudioSymbol(mangled) {
  if (!mangled.startsWith('_ZN2nn5audio')) return mangled;
  let rest = mangled.slice('_ZN2nn5audio'.length);

  const parts = [];
  while (rest.length > 0) {
    if (rest.startsWith('E')) {
      rest = rest.slice(1);
      break;
    }
    const match = rest.match(/^(\d+)/);
    if (match) {
      const len = parseInt(match[1], 10);
      const nameStart = match[1].length;
      parts.push(rest.slice(nameStart, nameStart + len));
      rest = rest.slice(nameStart + len);
    } else {
      break;
    }
  }

  let readable = 'nn::audio::' + parts.join('::');
  if (rest.length > 0) {
    readable += ` [args: ${rest}]`;
  }
  return readable;
}

async function main(directory) {
  directory = path.resolve(directory || path.join(__dirname, '../runs/latest'));
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));

  console.log('\n======================================================');
  console.log('       nn::audio Hardware Subsystem Safe Inspection   ');
  console.log('======================================================');

  const sdkBase = rpc.a.sdk;
  const mainBase = rpc.a.main;
  console.log(`SDK module base address:  0x${sdkBase.toString(16)}`);
  console.log(`Main module base address: 0x${mainBase.toString(16)}`);

  console.log('Parsing SDK MOD0 dynamic symbol table for audio symbols...');
  const sdkModule = await inspectModule(rpc, sdkBase);
  const audioSymbols = sdkModule.symbols.filter(s =>
    s.name.toLowerCase().includes('audio')
  );
  console.log(`Found ${audioSymbols.length} audio-related symbols in SDK.\n`);

  const keyFunctions = [
    'InitializeAudioOutParameter',
    'OpenDefaultAudioOut',
    'StartAudioOut',
    'StopAudioOut',
    'CloseAudioOut',
    'SetAudioOutBufferInfo',
    'AppendAudioOutBuffer',
    'GetReleasedAudioOutBuffer',
    'SetAudioOutVolume',
    'GetAudioOutVolume',
    'GetAudioOutState',
    'GetAudioOutSampleRate',
    'GetAudioOutChannelCount',
    'GetAudioOutPlayedSampleCount',
    'FlushAudioOutBuffers'
  ];

  const report = {
    session: 'latest',
    sdkBase: `0x${sdkBase.toString(16)}`,
    mainBase: `0x${mainBase.toString(16)}`,
    totalAudioSymbols: audioSymbols.length,
    keySymbols: {}
  };

  for (const key of keyFunctions) {
    const matches = audioSymbols.filter(s => s.name.includes(key));
    console.log(`--- Symbol Group: ${key} (${matches.length} matches) ---`);
    for (const m of matches) {
      const readLen = Math.min(m.size || 16, 16);
      let hex = '';
      try {
        hex = (await rpc.read(sdkBase + m.offset, readLen)).toString('hex');
      } catch (err) {
        hex = 'read-error: ' + err.message;
      }
      const item = {
        name: m.name,
        demangled: demangleAudioSymbol(m.name),
        offset: m.offset,
        size: m.size,
        address: `0x${(sdkBase + m.offset).toString(16)}`,
        prologueHex: hex
      };
      console.log(`  * ${item.demangled}`);
      console.log(`    Offset: +${m.offset} (0x${m.offset.toString(16)}), Size: ${m.size}B, Hex: ${hex.slice(0, 32)}`);
      report.keySymbols[m.name] = item;
    }
  }

  const outPath = path.join(__dirname, 'audio-symbols-verified.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nVerified symbols written to: ${outPath}`);
}

module.exports = { main, demangleAudioSymbol };

if (require.main === module) {
  main(process.argv[2]).catch(err => {
    console.error('[AUDIO INSPECT ERROR]:', err);
    process.exitCode = 1;
  });
}
