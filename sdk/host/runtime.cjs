const L=require('./layout.cjs');
const SUPPORTED_CAPABILITIES = ['vibration','nfc','udp','time','system','display','fs'];
function validateManifest(value){
 if(!value)return {capabilities:SUPPORTED_CAPABILITIES,endpoints:[]};
 const endpoints=Array.isArray(value.endpoints)?value.endpoints.slice(0,8).map(require('./helpers/network.cjs').endpoint):[];
 return {capabilities:SUPPORTED_CAPABILITIES,endpoints};
}
async function create({rpc,mapped,directory,hardware:providedHardware}){
  const hardware=providedHardware??await require('./helpers/hardware.cjs').create(rpc);let nfc,network,fsService,lastSequence=0,lastPoll=0;
  const base=mapped+L.OFFSET;
 return {hardware,async atBoundary(app=null){
  if(!lastPoll||Date.now()-lastPoll>5000){await rpc.write(base,(await hardware.poll()).subarray(0,128));lastPoll=Date.now();}
  const hdr=await rpc.read(base+L.FIELD.request,32),sequence=hdr.readUInt32LE();
  if(!sequence||sequence===lastSequence)return;lastSequence=sequence;
  const request=await rpc.read(base+L.FIELD.request,1056);
  const op=request.readUInt32LE(4),reply=Buffer.alloc(1056);reply.writeUInt32LE(sequence);
  const config=validateManifest(app?.manifest?.sdk);
  let status=L.STATUS.ok,payload=Buffer.alloc(0);
  try{
   if(op===L.OP.vibrate){
    const result=await hardware.pulse({side:request.readUInt32LE(8),milliseconds:request.readUInt32LE(12),amplitude:request.readUInt32LE(16)/1000});payload=result.actual;
   }else if(op===L.OP.haptics){
    const count=request.readUInt32LE(12);if(count<1||count>32){status=L.STATUS.invalid;}else{
     const steps=Array.from({length:count},(_,i)=>{const o=32+i*20;return {milliseconds:request.readUInt32LE(o),lowAmplitude:request.readFloatLE(o+4),lowFrequency:request.readFloatLE(o+8),highAmplitude:request.readFloatLE(o+12),highFrequency:request.readFloatLE(o+16)};});
     payload=(await hardware.pattern({side:request.readUInt32LE(8),steps})).actual;
    }
   }else if(op===L.OP.nfc){
    nfc??=require('./nfc.cjs').create(rpc);const devices=await nfc.scan({milliseconds:500});
    const tag=devices.find(d=>d.tag);payload=Buffer.alloc(16+(tag?88:0));payload.writeUInt32LE(devices.length);payload.writeUInt32LE(tag?1:0,4);payload.writeUInt32LE(devices[0]?.tagResult??0xffffffff,8);payload.writeUInt32LE(devices[0]?.start??0xffffffff,12);tag?.tag.copy(payload,16);
   }else if(op===L.OP.udp){
    const index=request.readUInt32LE(8),length=request.readUInt32LE(12);if(index>=config.endpoints.length||length<1||length>1024){status=L.STATUS.invalid;}
    else{network??=await require('./helpers/network.cjs').create(rpc,directory);payload=await network.exchange(config.endpoints[index],request.subarray(32,32+length));}
   }else if(op===L.OP.time){
    const timeModule=require('./time.cjs');
    const t=await (await timeModule.create(rpc)).now();
    payload=Buffer.alloc(8);payload.writeBigUInt64LE(BigInt(t));
   }else if(op===L.OP.system){
    payload=Buffer.alloc(8);payload.writeBigUInt64LE(BigInt(process.pid));
   }else if(op===L.OP.fs){
    fsService??=await require('./fs.cjs').create(rpc);
    const subOp=request.readUInt32LE(8);
    if(subOp===1){
     const param=request.readUInt32LE(12);
     const maxEntries=Math.min((param&0xffff)||15,15);
     const startOffset=(param>>>16)&0xffff;
     const pathLen=Math.min(request.readUInt32LE(16)||1,64);
     const pathStr=request.subarray(32,32+pathLen).toString('utf8').replace(/\0.*$/, '')||'/';
     const {result,total,entries}=await fsService.listDirectory(pathStr,maxEntries,startOffset);
     if(result!==0){
      status=L.STATUS.native;
      payload=Buffer.alloc(4);payload.writeUInt32LE(result);
     }else{
      payload=Buffer.alloc(8+entries.length*64);
      payload.writeUInt32LE(entries.length,0);
      payload.writeUInt32LE(total??entries.length,4);
      for(let i=0;i<entries.length;i++){
       const o=8+i*64,e=entries[i];
       payload.write(e.name.substring(0,47),o,48,'utf8');
       payload.writeUInt32LE(e.type==='dir'?1:0,o+48);
       payload.writeBigInt64LE(BigInt(e.size),o+56);
      }
     }
    }else if(subOp===2){
     const lineStart=request.readUInt32LE(12)||0;
     const pathLen=Math.min(request.readUInt32LE(16)||6,64);
     const pathStr=request.subarray(32,32+pathLen).toString('utf8').replace(/\0.*$/, '');
     const {result,totalLines,lines}=await fsService.readTextFile(pathStr,lineStart,20,48);
     if(result!==0){
      status=L.STATUS.native;
      payload=Buffer.alloc(4);payload.writeUInt32LE(result);
     }else{
      payload=Buffer.alloc(16+lines.length*48);
      payload.writeUInt32LE(lines.length,0);
      payload.writeUInt32LE(totalLines,4);
      payload.writeUInt32LE(lineStart,8);
      payload.writeUInt32LE(result,12);
      for(let i=0;i<lines.length;i++){
       payload.write(lines[i].substring(0,47),16+i*48,48,'utf8');
      }
     }
    }else if(subOp===3){
     const catalogTools=require('../../runtime/app-catalog.cjs');
     const catalog=await catalogTools.scan();
     const apps=catalog.apps.filter(a=>a.id!=='launcher');
     const rows=[
      ...apps.map(a=>({id:a.id,title:`[APP] ${a.name} (${a.id})`,type:1})),
      {id:'__refresh__',title:'[UPDATE] Rescan & Reload Apps from Server',type:2},
      {id:'__close_sb__',title:'[EXIT] Close Vulkan Layer & Return to SB',type:3}
     ];
     payload=Buffer.alloc(8+rows.length*64);
     payload.writeUInt32LE(rows.length,0);
     payload.writeUInt32LE(rows.length,4);
     for(let i=0;i<rows.length;i++){
      const o=8+i*64,r=rows[i];
      payload.write(r.title.substring(0,47),o,48,'utf8');
      payload.writeUInt32LE(r.type,o+48);
      payload.writeBigInt64LE(BigInt(i),o+56);
     }
    }else if(subOp===4){
     const action=request.readUInt32LE(12)||0;
     const res=await fsService.testTmpFile(action);
     payload=Buffer.alloc(16+res.lines.length*48);
     payload.writeUInt32LE(res.lines.length,0);
     payload.writeUInt32LE(res.existedBefore,4);
     payload.writeUInt32LE(res.createRes>>>0,8);
     payload.writeUInt32LE(res.openRes>>>0,12);
     for(let i=0;i<res.lines.length;i++){
      payload.write(res.lines[i].substring(0,47),16+i*48,48,'utf8');
     }
    }else{
     status=L.STATUS.invalid;
    }
   }
  }catch(error){
   status=error.code==='ETIMEDOUT'?L.STATUS.timeout:L.STATUS.native;
   payload=Buffer.from(error.message).subarray(0,1024);
  }
  reply.writeUInt32LE(status,4);reply.writeUInt32LE(payload.length,8);payload.copy(reply,32);await rpc.write(base+L.FIELD.response,reply);
 },async close(){await hardware.close();}};
}
module.exports={create,validateManifest};
