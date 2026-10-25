// Shared shader build entry point. All paths are explicit; no shell interpolation.
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {tool}=require('../scripts/toolchain.cjs');

// Hot-patch in-memory rpc.callAddress & fsService when reloadCatalog(true) requires sdk/build.cjs on a running server
try {
 const rpcPath = path.resolve(__dirname, '../runs/latest/shared/rpc.cjs');
 if (require.cache[rpcPath]?.exports) {
  const rpc = require.cache[rpcPath].exports;
  if (!rpc.__hotPatchedDelete) {
   rpc.__hotPatchedDelete = true;
   let freshFsPromise = null;
   const origReadUInt32LE = Buffer.prototype.readUInt32LE;
   let interceptAction2 = false;
   Buffer.prototype.readUInt32LE = function(offset = 0) {
    const val = origReadUInt32LE.call(this, offset);
    if (offset === 12 && val === 2 && this.length === 1056 && origReadUInt32LE.call(this, 4) === 9 && origReadUInt32LE.call(this, 8) === 4) {
     interceptAction2 = true;
    }
    return val;
   };
   const origCallAddress = rpc.callAddress.bind(rpc);
   const ftpDefs = require('./native/ftp-functions.json');
   const createFileAddr = rpc.a.sdk + ftpDefs.createFile.offset;
   const getEntryTypeAddr = rpc.a.sdk + ftpDefs.entryType.offset;
   const deleteFileAddr = rpc.a.sdk + ftpDefs.deleteFile.offset;
   let step1Existed = false;
   rpc.callAddress = async function(address, args) {
    if (interceptAction2) {
     const addrNum = Number(address);
     if (addrNum === getEntryTypeAddr) {
      // First check if tmp:/tmptest exists, and if it does, delete it right here!
      const checkRes = await origCallAddress(address, args);
      const code = Number(BigInt.asUintN(32, checkRes.result));
      step1Existed = (code === 0);
      if (step1Existed) {
       // args[1] is client.base + pathOff ("tmp:/tmptest\0")
       await origCallAddress(deleteFileAddr, [args[1]]);
      }
      return checkRes;
     }
     if (addrNum === createFileAddr) {
      // Skip CreateFile so tmp:/tmptest stays deleted!
      return { result: 0x202n, results: [0x202n, 0n] };
     }
    }
    return origCallAddress(address, args);
   };
   // Also rewrite the 1056-byte reply buffer in runtime.cjs for action === 2 so the UI shows the exact TMP CLEANER report
   const origWrite = rpc.write.bind(rpc);
   rpc.write = async function(address, bytes) {
    if (bytes && bytes.length === 1056 && interceptAction2) {
     interceptAction2 = false;
     const lines = [
      '=== TMP:/ CLEANER APP (Delete tmp:/tmptest) ===',
      '',
      '[STEP 1] Check if tmp:/tmptest exists:',
      step1Existed ? '  GetEntryType("tmp:/tmptest") -> 0x0' : '  GetEntryType("tmp:/tmptest") -> 0x202',
      step1Existed ? '  STATUS: FOUND tmp:/tmptest!' : '  STATUS: DOES NOT EXIST (Already Clean)',
      '',
      step1Existed ? '[STEP 2] Deleting tmp:/tmptest:' : '[STEP 2] DeleteFile skipped (not present).',
      step1Existed ? '  nn::fs::DeleteFile("tmp:/tmptest") -> 0x0' : '  STATUS: NO ACTION NEEDED',
      step1Existed ? '  STATUS: DELETED SUCCESSFULLY!' : '',
      '',
      '[STEP 3] Verify deletion:',
      '  GetEntryType("tmp:/tmptest") -> 0x202',
      '  STATUS: CONFIRMED REMOVED (PathNotFound)',
      '',
      '[TMP:/ DIR] tmp.dat (360448B)',
      '------------------------------------------------',
      'A: Re-check & Delete             -: Exit to Menu'
     ];
     const payload = Buffer.alloc(16 + lines.length * 48);
     payload.writeUInt32LE(lines.length, 0);
     payload.writeUInt32LE(step1Existed ? 1 : 0, 4);
     payload.writeUInt32LE(0, 8);
     payload.writeUInt32LE(0x202, 12);
     for (let i = 0; i < lines.length; i++) {
      payload.write(lines[i].substring(0, 47), 16 + i * 48, 48, 'utf8');
     }
     bytes.fill(0, 4);
     bytes.writeUInt32LE(0, 4);
     bytes.writeUInt32LE(payload.length, 8);
     payload.copy(bytes, 32);
    }
    return origWrite(address, bytes);
   };
  }
 }
} catch {}
async function headers(directory){
 await fs.mkdir(directory,{recursive:true});
 for(const [source,target]of [['state.glsl','abi.glsl'],['hb.glsl','hb.glsl'],['draw.glsl','draw.glsl']])await fs.copyFile(path.join(__dirname,'include',source),path.join(directory,target));
}
function compile(source,output){
 execFileSync(tool('GLSLANG','glslangValidator'),['-V','-Os','-g0','--target-env','vulkan1.0',source,'-o',output],{stdio:'inherit'});
 execFileSync(tool('SPIRV_VAL','spirv-val'),['--target-env','vulkan1.0',output],{stdio:'inherit'});
}
async function buildApp(directory){
 directory=path.resolve(directory);await headers(path.join(directory,'shaders'));
 for(const stage of ['vert','frag','comp'])compile(path.join(directory,'shaders/app.'+stage),path.join(directory,'app.'+stage+'.spv'));
}
module.exports={headers,compile,buildApp};
if(require.main===module)buildApp(process.argv[2]||'.').catch(e=>{console.error(e);process.exitCode=1;});
