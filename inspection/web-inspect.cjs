// Safe investigation of nn::web symbols, browser applet entry points, and SmileBASIC imports on S2.
// This script performs read-only dynamic symbol inspection of both SDK and main modules,
// categorizes all browser applet functions, disassembles machine code prologues,
// and saves a structured symbol dictionary for the host web applet adapter.

const fs = require('node:fs/promises');
const path = require('node:path');
const { inspectModule } = require('./inspect.cjs');

async function verifyAndCall(rpc, address, size = 16, args = []) {
  const readSize = Math.max(16, Math.min(32, size));
  const hex = (await rpc.read(address, readSize)).toString('hex');
  await rpc.request({ command: 'verify-function', address, hex });
  return rpc.callAddress(address, args);
}

function demangleWebSymbol(mangled) {
  if (!mangled.startsWith('_ZN2nn3web')) return mangled;
  let rest = mangled.slice('_ZN2nn3web'.length);

  // Parse nested components
  const parts = [];
  while (rest.length > 0) {
    if (rest.startsWith('E')) {
      rest = rest.slice(1);
      break;
    }
    if (rest.startsWith('C1') || rest.startsWith('C2')) {
      parts.push('(constructor)');
      rest = rest.slice(2);
      break;
    }
    if (rest.startsWith('D1') || rest.startsWith('D2')) {
      parts.push('(destructor)');
      rest = rest.slice(2);
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

  let readable = 'nn::web::' + parts.join('::');
  if (rest.length > 0) {
    readable += ` [args: ${rest}]`;
  }
  return readable;
}

async function main(directory) {
  directory = path.resolve(directory || path.join(__dirname, '../runs/latest'));
  const rpc = require(path.join(directory, 'shared/rpc.cjs'));

  console.log('\n======================================================');
  console.log('     nn::web Browser Applet Native Safe Inspection    ');
  console.log('======================================================');

  const sdkBase = rpc.a.sdk;
  const mainBase = rpc.a.main;
  console.log(`SDK module base:  0x${sdkBase.toString(16)}`);
  console.log(`Main module base: 0x${mainBase.toString(16)}`);

  console.log('Parsing Main module MOD0 table for SmileBASIC web imports...');
  const mainModule = await inspectModule(rpc, mainBase);
  const mainWebSymbols = mainModule.symbols.filter(s =>
    s.name.toLowerCase().includes('web')
  );
  console.log(`Found ${mainWebSymbols.length} web-related symbols/imports in Main module:`);
  for (const s of mainWebSymbols) {
    console.log(`  - [Main Import] ${demangleWebSymbol(s.name)} (raw: ${s.name})`);
  }

  console.log('\nParsing SDK MOD0 dynamic symbol table for nn::web symbols...');
  const sdkModule = await inspectModule(rpc, sdkBase);
  const webSymbols = sdkModule.symbols.filter(s =>
    s.name.toLowerCase().includes('web')
  );
  console.log(`Found ${webSymbols.length} web-related symbols in SDK.\n`);

  const categorized = {
    showWebPage: [],
    showOfflineHtmlPage: [],
    showWebPageArg: [],
    showOfflineHtmlPageArg: [],
    webPageReturnValue: [],
    libraryApplet: [],
    other: []
  };

  const resolvedDefs = {};

  for (const sym of webSymbols) {
    const desc = demangleWebSymbol(sym.name);
    const item = {
      name: sym.name,
      description: desc,
      offset: sym.offset,
      address: '0x' + (sdkBase + sym.offset).toString(16),
      size: sym.size,
      section: sym.section,
      type: sym.type
    };

    if (/11ShowWebPage/i.test(sym.name) || (/ShowWebPage/i.test(sym.name) && !/ShowWebPageArg/i.test(sym.name))) {
      categorized.showWebPage.push(item);
      resolvedDefs['ShowWebPage'] = {
        symbol: sym.name,
        offset: sym.offset,
        size: sym.size
      };
    } else if (/ShowOfflineHtmlPage/i.test(sym.name) && !/ShowOfflineHtmlPageArg/i.test(sym.name)) {
      categorized.showOfflineHtmlPage.push(item);
      resolvedDefs['ShowOfflineHtmlPage'] = {
        symbol: sym.name,
        offset: sym.offset,
        size: sym.size
      };
    } else if (/ShowWebPageArg/i.test(sym.name)) {
      categorized.showWebPageArg.push(item);
      if (sym.name.includes('C1EPKc') || sym.name.includes('C2EPKc')) {
        resolvedDefs['ShowWebPageArgConstructor'] = {
          symbol: sym.name,
          offset: sym.offset,
          size: sym.size
        };
      }
    } else if (/ShowOfflineHtmlPageArg/i.test(sym.name)) {
      categorized.showOfflineHtmlPageArg.push(item);
    } else if (/WebPageReturnValue/i.test(sym.name)) {
      categorized.webPageReturnValue.push(item);
      if (sym.name.includes('C1Ev') || sym.name.includes('C2Ev')) {
        resolvedDefs['WebPageReturnValueConstructor'] = {
          symbol: sym.name,
          offset: sym.offset,
          size: sym.size
        };
      } else if (sym.name.includes('GetWebExitReason')) {
        resolvedDefs['GetWebExitReason'] = {
          symbol: sym.name,
          offset: sym.offset,
          size: sym.size
        };
      }
      categorized.webPageReturnValue.push(item);
    } else if (/applet|creator|holder/i.test(sym.name)) {
      categorized.libraryApplet.push(item);
    } else {
      categorized.other.push(item);
    }
  }

  console.log('--- Key Function Groups ---');
  console.log(`- ShowWebPage entry points:        ${categorized.showWebPage.length}`);
  console.log(`- ShowOfflineHtmlPage entries:     ${categorized.showOfflineHtmlPage.length}`);
  console.log(`- ShowWebPageArg constructors/setters: ${categorized.showWebPageArg.length}`);
  console.log(`- ShowOfflineHtmlPageArg helpers:  ${categorized.showOfflineHtmlPageArg.length}`);
  console.log(`- WebPageReturnValue extractors:   ${categorized.webPageReturnValue.length}`);
  console.log(`- LibraryApplet wrappers:          ${categorized.libraryApplet.length}`);
  console.log(`- Other internal symbols:          ${categorized.other.length}`);

  // Read machine code bytes for key discovered functions
  console.log('\n--- Reading Function Signatures & Prologues ---');
  for (const [key, def] of Object.entries(resolvedDefs)) {
    try {
      const readSize = Math.min(def.size || 64, 64);
      const codeBytes = await rpc.read(sdkBase + def.offset, readSize);
      def.hex = codeBytes.toString('hex');
      console.log(`  ✔ [${key}] offset=${def.offset} size=${def.size} bytes:`);
      console.log(`    HEX: ${def.hex.slice(0, 32)}...`);
    } catch (readErr) {
      console.warn(`  ⚠ [${key}] Failed to read code bytes:`, readErr.message);
    }
  }

  // Also read ShowWebPageArg setters (e.g. SetCallbackUrl, SetBootDisplayKind, etc.)
  for (const sym of categorized.showWebPageArg) {
    if (sym.name.includes('Set') && sym.size > 0 && sym.size <= 256) {
      try {
        const codeBytes = await rpc.read(sdkBase + sym.offset, Math.min(sym.size, 32));
        sym.hex = codeBytes.toString('hex');
      } catch (e) {}
    }
  }

  const report = {
    session: rpc.a.session,
    sdkBase: '0x' + sdkBase.toString(16),
    mainBase: '0x' + mainBase.toString(16),
    mainWebImports: mainWebSymbols.map(s => ({
      name: s.name,
      description: demangleWebSymbol(s.name),
      offset: s.offset,
      size: s.size
    })),
    totalSdkWebSymbols: webSymbols.length,
    groups: categorized,
    resolvedDefinitions: resolvedDefs
  };

  const outFile = path.join(directory, 'web-inspection.json');
  await fs.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(`\n✔ Full inspection report saved to: ${outFile}`);

  // Also persist verified definitions to inspection/web-symbols.json for offline access
  const cacheFile = path.join(__dirname, 'web-symbols.json');
  await fs.writeFile(cacheFile, JSON.stringify(report, null, 2));
  console.log(`✔ Cached definitions saved to: ${cacheFile}\n`);

  return report;
}

module.exports = { main, demangleWebSymbol };

if (require.main === module) {
  main(process.argv[2]).catch(err => {
    console.error('Fatal error during web inspection:', err.stack);
    process.exitCode = 1;
  });
}
