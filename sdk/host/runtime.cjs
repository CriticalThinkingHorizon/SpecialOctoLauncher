const L=require('./layout.cjs');
const { decodePng, decodePngToRgb565 } = require('./image-decoder.cjs');
const SUPPORTED_CAPABILITIES = ['vibration','nfc','udp','hid','time','system','display','fs','net','irsensor','audio','swkbd','web'];
function validateManifest(value){
 if(!value)return {capabilities:SUPPORTED_CAPABILITIES,endpoints:[]};
 const endpoints=Array.isArray(value.endpoints)?value.endpoints.slice(0,8).map(require('./helpers/network.cjs').endpoint):[];
 return {capabilities:SUPPORTED_CAPABILITIES,endpoints};
}
async function create({rpc,mapped,directory,hardware:providedHardware}){
  const hardware=providedHardware??await require('./helpers/hardware.cjs').create(rpc);let nfc,network,fsService,httpServer,netSockets,timeService,swkbdService,webService,audioService,lastSequence=0,lastPoll=0;
  const base=mapped+L.OFFSET;
 return {hardware,async atBoundary(app=null){
  if(!lastPoll||Date.now()-lastPoll>5000){await rpc.write(base,(await hardware.poll()).subarray(0,128));lastPoll=Date.now();}
  const hdr=await rpc.read(base+L.FIELD.request,32),sequence=hdr.readUInt32LE();
  if(!sequence||sequence===lastSequence)return;lastSequence=sequence;
  const request=await rpc.read(base+L.FIELD.request,1056);
  const op=request.readUInt32LE(4);
  const config=validateManifest(app?.manifest?.sdk);
  let status=L.STATUS.ok,payload=Buffer.alloc(0);
  try{
   if(op===L.OP.vibrate){
    const side=request.readUInt32LE(8);
    const milliseconds=request.readUInt32LE(12);
    const amplitude=request.readUInt32LE(16)/1000;
    const result=await hardware.pulse({side,milliseconds,amplitude});
    payload=result.actual;
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
   }else if(op===L.OP.hid){
    const npadId=request.readUInt32LE(8)===0&&request.readUInt32LE(12)===0?32:request.readUInt32LE(8);
    const details=await hardware.queryPadDetails(npadId);
    payload=Buffer.alloc(40);
    payload.writeUInt32LE(details.styleSet>>>0,0);
    payload.writeUInt32LE(details.bodyColor>>>0,4);
    payload.writeUInt32LE(details.buttonColor>>>0,8);
    payload.writeUInt32LE(details.ledPattern>>>0,12);
    payload.writeUInt32LE(details.vibPermitted>>>0,16);
    details.actualVib.copy(payload,20);
   }else if(op===L.OP.time){
    timeService??=await require('./time.cjs').create(rpc);
    const t=await timeService.now();
    payload=Buffer.alloc(48);
    payload.writeBigUInt64LE(BigInt(t.steadyTick),0);
    payload.writeBigUInt64LE(BigInt(t.steadyFreq),8);
    payload.writeBigUInt64LE(BigInt(t.posixSeconds),16);
    payload.writeUInt32LE(t.year>>>0,24);
    payload.writeUInt32LE(t.month>>>0,28);
    payload.writeUInt32LE(t.day>>>0,32);
    payload.writeUInt32LE(t.hour>>>0,36);
    payload.writeUInt32LE(t.minute>>>0,40);
    payload.writeUInt32LE(t.second>>>0,44);
   }else if(op===L.OP.system){
    timeService??=await require('./time.cjs').create(rpc);
    const sys=await timeService.systemInfo();
    payload=Buffer.alloc(48);
    payload.writeBigUInt64LE(BigInt(sys.aruid),0);
    payload.writeBigUInt64LE(BigInt(sys.steadyTick),8);
    payload.writeUInt32LE(sys.steadyFreq>>>0,16);
    payload.writeInt32LE(sys.threadPriority,20);
    payload.writeBigUInt64LE(BigInt(sys.mainBase),24);
    payload.writeBigUInt64LE(BigInt(sys.sdkBase),32);
    payload.writeUInt32LE(sys.hostPid>>>0,40);
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
      {id:'__refresh__',title:'[UPDATE] Rescan & Reload Apps from Server',type:2}
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
     delete require.cache[require.resolve('./fs.cjs')];
     const activeFs=action===2?await require('./fs.cjs').create(rpc):fsService;
     const res=await activeFs.testTmpFile(action);
     payload=Buffer.alloc(16+res.lines.length*48);
     payload.writeUInt32LE(res.lines.length,0);
     payload.writeUInt32LE(res.existedBefore,4);
     payload.writeUInt32LE(res.createRes>>>0,8);
     payload.writeUInt32LE(res.openRes>>>0,12);
     for(let i=0;i<res.lines.length;i++){
      payload.write(res.lines[i].substring(0,47),16+i*48,48,'utf8');
     }
    }else if(subOp===5){
     const action=request.readUInt32LE(12)||0;
     httpServer??=await require('./http-server.cjs').create(rpc,fsService);
     const res=await httpServer.step(action);
     payload=Buffer.alloc(16+res.lines.length*48);
     payload.writeUInt32LE(res.lines.length,0);
     payload.writeUInt32LE(res.listening,4);
     payload.writeUInt32LE(res.port,8);
     payload.writeUInt32LE(res.requestCount,12);
     for(let i=0;i<res.lines.length;i++){
      payload.write(res.lines[i].substring(0,47),16+i*48,48,'utf8');
     }
    }else if(subOp===6){
     const action=request.readUInt32LE(12)||0;
     delete require.cache[require.resolve('./fs.cjs')];
     const activeFs=action===2?await require('./fs.cjs').create(rpc):fsService;
     const res=await activeFs.testSaveFile(action);
     payload=Buffer.alloc(16+res.lines.length*48);
     payload.writeUInt32LE(res.lines.length,0);
     payload.writeUInt32LE(res.existedBefore,4);
     payload.writeUInt32LE(res.saveRes>>>0,8);
     payload.writeUInt32LE(res.commitRes>>>0,12);
     for(let i=0;i<res.lines.length;i++){
      payload.write(res.lines[i].substring(0,47),16+i*48,48,'utf8');
     }
    }else if(subOp===7){
     const action=request.readUInt32LE(12)||0;
     delete require.cache[require.resolve('./fs.cjs')];
     const activeFs=await require('./fs.cjs').create(rpc);
     const res=await activeFs.updateBootstrapFile(action);
     payload=Buffer.alloc(16+res.lines.length*48);
     payload.writeUInt32LE(res.lines.length,0);
     payload.writeUInt32LE(res.curSize>>>0,4);
     payload.writeUInt32LE(res.repoSize>>>0,8);
     payload.writeUInt32LE(res.isIdentical>>>0,12);
     for(let i=0;i<res.lines.length;i++){
      payload.write(res.lines[i].substring(0,47),16+i*48,48,'utf8');
     }
    }else if(subOp===10){
     const pathLen=Math.min(request.readUInt32LE(16)||1,64);
     const pathStr=request.subarray(32,32+pathLen).toString('utf8').replace(/\0.*$/, '');
     const st=await fsService.statPath(pathStr);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(st.exists,0);
     payload.writeUInt32LE(st.entryType>>>0,4);
     payload.writeUInt32LE(st.fileSize>>>0,8);
     payload.writeUInt32LE(st.result>>>0,12);
    }else if(subOp===11){
     const initialSize=request.readUInt32LE(12)||0;
     const pathLen=Math.min(request.readUInt32LE(16)||1,64);
     const pathStr=request.subarray(32,32+pathLen).toString('utf8').replace(/\0.*$/, '');
     const cr=await fsService.createPath(pathStr,initialSize);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(cr.result===0?1:0,0);
     payload.writeUInt32LE(cr.result>>>0,12);
    }else if(subOp===12){
     const pathLen=Math.min(request.readUInt32LE(16)||1,64);
     const pathStr=request.subarray(32,32+pathLen).toString('utf8').replace(/\0.*$/, '');
     const dl=await fsService.deletePath(pathStr);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(dl.result===0?1:0,0);
     payload.writeUInt32LE(dl.result>>>0,12);
    }else if(subOp===13){
     const offset=request.readUInt32LE(12)||0;
     const packed=request.readUInt32LE(16)||1;
     const pathLen=Math.min(packed&0xffff,64);
     const reqBytes=Math.min((packed>>>16)||960,960);
     const pathStr=request.subarray(32,32+pathLen).toString('utf8').replace(/\0.*$/, '');
     const rd=await fsService.readBytesAt(pathStr,offset,reqBytes);
     payload=Buffer.alloc(16+rd.data.length);
     payload.writeUInt32LE(rd.data.length,0);
     payload.writeUInt32LE(rd.fileSize>>>0,4);
     payload.writeUInt32LE(offset>>>0,8);
     payload.writeUInt32LE(rd.result>>>0,12);
     rd.data.copy(payload,16);
    }else if(subOp===14){
     const offset=request.readUInt32LE(12)||0;
     const packed=request.readUInt32LE(16)||1;
     const pathLen=Math.min(packed&0xffff,64);
     const dataLen=Math.min((packed>>>16)&0xffff,960);
     const pathStr=request.subarray(32,32+pathLen).toString('utf8').replace(/\0.*$/, '');
     const dataBuf=request.subarray(32+64,32+64+dataLen);
     const wr=await fsService.writeBytesAt(pathStr,offset,dataBuf);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(wr.bytesWritten>>>0,0);
     payload.writeUInt32LE(offset>>>0,8);
     payload.writeUInt32LE(wr.result>>>0,12);
    }else if(subOp===15){
     const pathLen=Math.min(request.readUInt32LE(16)||1,64);
     const pathStr=request.subarray(32,32+pathLen).toString('utf8').replace(/\0.*$/, '');
     const mk=await fsService.mkdirPath(pathStr);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(mk.result===0?1:0,0);
     payload.writeUInt32LE(mk.result>>>0,12);
    }else if(subOp===16){
     const pathLen=Math.min(request.readUInt32LE(16)||1,64);
     const pathStr=request.subarray(32,32+pathLen).toString('utf8').replace(/\0.*$/, '');
     const rm=await fsService.rmdirPath(pathStr);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(rm.result===0?1:0,0);
     payload.writeUInt32LE(rm.result>>>0,12);
    }else if(subOp===17){
     const oldLen=Math.min(request.readUInt32LE(12)||1,64);
     const newLen=Math.min(request.readUInt32LE(16)||1,64);
     const oldPath=request.subarray(32,32+oldLen).toString('utf8').replace(/\0.*$/, '');
     const newPath=request.subarray(32+64,32+64+newLen).toString('utf8').replace(/\0.*$/, '');
     const rn=await fsService.renamePath(oldPath,newPath);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(rn.result===0?1:0,0);
     payload.writeUInt32LE(rn.result>>>0,12);
    }else if(subOp===18){
     const oldLen=Math.min(request.readUInt32LE(12)||1,64);
     const newLen=Math.min(request.readUInt32LE(16)||1,64);
     const oldPath=request.subarray(32,32+oldLen).toString('utf8').replace(/\0.*$/, '');
     const newPath=request.subarray(32+64,32+64+newLen).toString('utf8').replace(/\0.*$/, '');
     const rn=await fsService.renameDirPath(oldPath,newPath);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(rn.result===0?1:0,0);
     payload.writeUInt32LE(rn.result>>>0,12);
    }else if(subOp===19){
     const mountLen=Math.min(request.readUInt32LE(16)||4,64);
     const mountName=request.subarray(32,32+mountLen).toString('utf8').replace(/\0.*$/, '')||'save';
     const cm=await fsService.commitMount(mountName);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(cm.result===0?1:0,0);
     payload.writeUInt32LE(cm.result>>>0,12);
    }else{
     status=L.STATUS.invalid;
    }
   }else if(op===L.OP.net){
    netSockets??=await require('./net-sockets.cjs').create(rpc);
    const subOp=request.readUInt32LE(8);
    if(subOp===1){
     const info=await netSockets.getInfo();
     payload=Buffer.alloc(32);
     payload.writeUInt32LE(info.ipWord>>>0,0);
     payload.writeUInt32LE(info.netState>>>0,4);
     payload.writeUInt32LE(info.sockInit>>>0,8);
     payload.write(info.ipStr,16,16,'utf8');
    }else if(subOp===2){
     const port=request.readUInt32LE(12)||8080;
     const backlog=request.readUInt32LE(16)||8;
     const ls=await netSockets.listenTcp(port,backlog);
     payload=Buffer.alloc(16);
     payload.writeInt32LE(ls.fd,0);
     payload.writeUInt32LE(ls.port>>>0,4);
     payload.writeUInt32LE(ls.errno>>>0,8);
    }else if(subOp===3){
     const listenFd=request.readInt32LE(12);
     const timeoutMs=request.readUInt32LE(16)||0;
     const ac=await netSockets.acceptTcp(listenFd,timeoutMs);
     payload=Buffer.alloc(16);
     payload.writeInt32LE(ac.clientFd,0);
     payload.writeUInt32LE(ac.peerIp>>>0,4);
     payload.writeUInt32LE(ac.peerPort>>>0,8);
     payload.writeUInt32LE(ac.ready>>>0,12);
    }else if(subOp===4){
     const fd=request.readInt32LE(12);
     const packed=request.readUInt32LE(16)||960;
     const maxBytes=Math.min(packed&0xffff,960);
     const timeoutMs=(packed>>>16)&0xffff;
     const rv=await netSockets.recvSocket(fd,maxBytes,timeoutMs);
     payload=Buffer.alloc(16+rv.data.length);
     payload.writeUInt32LE(rv.bytesRead>>>0,0);
     payload.writeUInt32LE(rv.ready>>>0,4);
     rv.data.copy(payload,16);
    }else if(subOp===5){
     const fd=request.readInt32LE(12);
     const len=Math.min(request.readUInt32LE(16)||0,960);
     const dataBuf=request.subarray(32,32+len);
     const sn=await netSockets.sendSocket(fd,dataBuf);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(sn.bytesSent>>>0,0);
     payload.writeUInt32LE(sn.errno>>>0,4);
    }else if(subOp===6){
     const fd=request.readInt32LE(12);
     const cl=await netSockets.closeSocket(fd);
     payload=Buffer.alloc(16);
     payload.writeInt32LE(cl.result,0);
    }else if(subOp===7){
     const ipWord=request.readUInt32LE(12);
     const port=request.readUInt32LE(16)||80;
     const cn=await netSockets.connectTcp(ipWord,port);
     payload=Buffer.alloc(16);
     payload.writeInt32LE(cn.fd,0);
     payload.writeUInt32LE(port>>>0,4);
     payload.writeUInt32LE(cn.errno>>>0,8);
    }else if(subOp===8){
     const fd=request.readInt32LE(12);
     const sn=await netSockets.getSockName(fd);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(sn.localIp>>>0,0);
     payload.writeUInt32LE(sn.localPort>>>0,4);
     payload.writeUInt32LE(sn.errno>>>0,8);
    }else if(subOp===9){
     const er=await netSockets.getLastErrno();
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(er.errno>>>0,0);
    }else if(subOp===20){
     const maxBytes=Math.min(request.readUInt32LE(12)||960,960);
     const packed=request.readUInt32LE(16)||0;
     const urlLen=Math.min(packed&0xffff,128);
     const isPost=((packed>>>16)&1)===1;
     const postLen=Math.min((packed>>>17)&0x7fff,960);
     const urlStr=request.subarray(32,32+urlLen).toString('utf8').replace(/\0.*$/, '');
     const reqBody=isPost?request.subarray(32+128,32+128+postLen):Buffer.alloc(0);
     const httpRes=await netSockets.httpRequest({method:isPost?'POST':'GET',urlStr,reqBody,maxBytes});
     payload=Buffer.alloc(16+httpRes.body.length);
     payload.writeUInt32LE(httpRes.statusCode>>>0,0);
     payload.writeUInt32LE(httpRes.totalBytes>>>0,4);
     payload.writeUInt32LE(httpRes.body.length>>>0,8);
     payload.writeUInt32LE(httpRes.errno>>>0,12);
     httpRes.body.copy(payload,16);
    }else if(subOp===21){
     const packed=request.readUInt32LE(16)||0;
     const urlLen=Math.min(packed&0xffff,128);
     const saveLen=Math.min((packed>>>16)&0xffff,64);
     const urlStr=request.subarray(32,32+urlLen).toString('utf8').replace(/\0.*$/, '');
     const savePath=request.subarray(32+128,32+128+saveLen).toString('utf8').replace(/\0.*$/, '')||'tmp:/download.bin';
     const dlRes=await netSockets.httpRequest({method:'GET',urlStr,savePath,fsService});
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(dlRes.statusCode>>>0,0);
     payload.writeUInt32LE(dlRes.totalBytes>>>0,4);
     payload.writeUInt32LE(dlRes.errno>>>0,12);
    }else if(subOp===22){
     // Download and decode PNG image directly into GPU storage buffer (mapped + 1024)
     const packed=request.readUInt32LE(16)||0;
     const urlLen=Math.min(packed&0xffff,128);
     let urlStr=request.subarray(32,32+urlLen).toString('utf8').replace(/\0.*$/, '');
     if(!/^https?:\/\//i.test(urlStr))urlStr='https://ferreirapablo.com/files/wolv.png';
     try {
       console.log(`[HTTP IMAGE] Fetching remote image: ${urlStr}...`);
       const resp=await fetch(urlStr,{signal:AbortSignal.timeout(20000)});
       if(resp.ok){
         const fileBuf=Buffer.from(await resp.arrayBuffer());
         console.log(`[HTTP IMAGE] Downloaded ${fileBuf.length} bytes. Decoding PNG...`);
         const decoded=decodePngToRgb565(fileBuf);
         console.log(`[HTTP IMAGE] Decoded ${decoded.width}x${decoded.height} RGB565 (${decoded.data.length} bytes). Writing to GPU buffer at offset 262144 (preserving font atlas)...`);
         // Store image at byte offset 262144 (word offset 65536) to preserve font atlas at 0..65535
         await rpc.write(mapped+1024+262144,decoded.data);
         console.log(`[HTTP IMAGE] Direct GPU upload complete!`);
         payload=Buffer.alloc(24);
         payload.writeUInt32LE(resp.status>>>0,0);
         payload.writeUInt32LE(decoded.width>>>0,4);
         payload.writeUInt32LE(decoded.height>>>0,8);
         payload.writeUInt32LE(fileBuf.length>>>0,12);
         payload.writeUInt32LE(decoded.data.length>>>0,16);
         payload.writeUInt32LE(0,20);
       }else{
         console.warn(`[HTTP IMAGE] HTTP fetch returned status: ${resp.status}`);
         payload=Buffer.alloc(24);
         payload.writeUInt32LE(resp.status>>>0,0);
         payload.writeUInt32LE(1,20);
       }
     }catch(err){
       console.error(`[HTTP IMAGE] Error:`, err.message);
       payload=Buffer.alloc(24);
       payload.writeUInt32LE(0,0);
       payload.writeUInt32LE(2,20);
     }
    }else if(subOp===30){
     const nono=require('./nonopost.cjs');
     const startOffset=request.readUInt32LE(12)||0;
     const maxCount=Math.min(request.readUInt32LE(16)||4,4);
     const res=await nono.getFeedSlice(startOffset,maxCount);
     payload=Buffer.alloc(16+res.posts.length*240);
     payload.writeUInt32LE(res.posts.length>>>0,0);
     payload.writeUInt32LE(res.total>>>0,4);
     payload.writeUInt32LE(startOffset>>>0,8);
     payload.writeUInt32LE(200,12);
     for(let i=0;i<res.posts.length;i++){
      const p=res.posts[i],o=16+i*240;
      payload.write(p.id.slice(0,35),o,36,'utf8');
      payload.write(p.author.slice(0,19),o+36,20,'utf8');
      payload.write(p.date.slice(0,11),o+56,12,'utf8');
      payload.writeFloatLE(p.avgRating,o+68);
      payload.writeUInt32LE(p.totalRatings>>>0,o+72);
      payload.writeUInt32LE(p.commentCount>>>0,o+76);
      payload.write(p.content.slice(0,159),o+80,160,'utf8');
     }
     // Mirror persistent feed buffer to mapped + 1024 + 70000*4 (c.atlas[70000])
     await rpc.write(mapped+1024+70000*4,payload);
    }else if(subOp===31){
     const nono=require('./nonopost.cjs');
     const authorLen=Math.min(request.readUInt32LE(12)||0,32);
     const contentLen=Math.min(request.readUInt32LE(16)||0,400);
     const authorName=authorLen>0?request.subarray(32,32+authorLen).toString('utf8').replace(/\0.*$/, ''):'';
     const content=contentLen>0?request.subarray(32+32,32+32+contentLen).toString('utf8').replace(/\0.*$/, ''):'';
     const postRes=await nono.createPost({authorName,content});
     payload=Buffer.alloc(48);
     payload.writeUInt32LE(postRes.statusCode>>>0,0);
     if(postRes.post?.id){
      payload.write(String(postRes.post.id).slice(0,35),4,36,'utf8');
     }
    }else if(subOp===32){
     const nono=require('./nonopost.cjs');
     const postIndex=request.readUInt32LE(12)||0;
     const rating=request.readUInt32LE(16)||5;
     const rateRes=await nono.ratePost({postIndex,rating});
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(rateRes.statusCode>>>0,0);
     payload.writeUInt32LE(rating>>>0,4);
    }else{
     status=L.STATUS.invalid;
    }
   }else if(op===L.OP.irsensor){
    const npadId=request.readUInt32LE(8)===0&&request.readUInt32LE(12)===0?32:request.readUInt32LE(8);
    const ir=await hardware.queryIrStatus(npadId);
    payload=Buffer.alloc(16);
    payload.writeUInt32LE(ir.handle>>>0,0);
    payload.writeUInt32LE(ir.status>>>0,4);
    payload.writeUInt32LE(ir.handleResult>>>0,8);
    payload.writeUInt32LE(ir.statusResult>>>0,12);
   }else if(op===L.OP.audio){
    audioService??=await require('./audio.cjs').create(rpc);
    const subOp=request.readUInt32LE(8);
    if(subOp===1){
     // Query status / ensure initialized
     await audioService.ensureInitialized();
     const st=await audioService.getStatus();
     payload=Buffer.alloc(16+st.preview.length);
     payload.writeUInt32LE(st.initialized>>>0,0);
     payload.writeUInt32LE(st.started>>>0,4);
     payload.writeUInt32LE(st.volume>>>0,8);
     payload.writeUInt32LE(st.playedCount>>>0,12);
     st.preview.copy(payload,16);
    }else if(subOp===2){
     // Play Sound Effect (sfxId in arg0, volumePercent in arg1)
     const sfxId=request.readUInt32LE(12);
     const volPercent=request.readUInt32LE(16)||85;
     const res=await audioService.playSfx(sfxId,volPercent/100.0);
     const st=await audioService.getStatus();
     payload=Buffer.alloc(16+st.preview.length);
     payload.writeUInt32LE(res>>>0,0);
     payload.writeUInt32LE(sfxId>>>0,4);
     payload.writeUInt32LE(st.playedCount>>>0,8);
     payload.writeUInt32LE(st.volume>>>0,12);
     st.preview.copy(payload,16);
    }else if(subOp===3){
     // Play Tone (waveType in arg0, packed freqHz & durationMs in arg1)
     const waveType=request.readUInt32LE(12);
     const packed=request.readUInt32LE(16);
     const freqHz=packed&0xffff;
     const durationMs=(packed>>>16)&0xffff;
     const res=await audioService.playTone(waveType,freqHz||440,durationMs||200);
     const st=await audioService.getStatus();
     payload=Buffer.alloc(16+st.preview.length);
     payload.writeUInt32LE(res>>>0,0);
     payload.writeUInt32LE(waveType>>>0,4);
     payload.writeUInt32LE(freqHz>>>0,8);
     payload.writeUInt32LE(durationMs>>>0,12);
     st.preview.copy(payload,16);
    }else if(subOp===4){
     // Set master volume
     const volPercent=request.readUInt32LE(12);
     await audioService.setVolume(volPercent);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(volPercent>>>0,0);
    }else if(subOp===5){
     // Stop audio
     await audioService.stop();
     payload=Buffer.alloc(16);
    }else if(subOp===10||subOp===0){
     // List audio inputs (legacy compat)
     timeService??=await require('./time.cjs').create(rpc);
     const maxCount=request.readUInt32LE(12)||8;
     const au=await timeService.listAudioInputs(maxCount);
     payload=Buffer.alloc(16+au.names.length*64);
     payload.writeUInt32LE(au.count>>>0,0);
     for(let i=0;i<au.names.length;i++){
      payload.write(au.names[i].substring(0,63),16+i*64,64,'utf8');
     }
    }
   }else if(op===L.OP.swkbd){
    swkbdService??=await require('./swkbd.cjs').create(rpc);
    const subOp=request.readUInt32LE(8);
    if(subOp===1){
     const headerLen=Math.min(request.readUInt32LE(12)||0,64);
     const packed=request.readUInt32LE(16)||0;
     const guideLen=Math.min(packed&0xffff,64);
     const initialLen=Math.min((packed>>>16)&0xffff,64);
     const headerText=headerLen>0?request.subarray(32,32+headerLen).toString('utf8').replace(/\0.*$/, ''):'HelloWorldS2 Keyboard';
     const guideText=guideLen>0?request.subarray(32+64,32+64+guideLen).toString('utf8').replace(/\0.*$/, ''):'Enter text...';
     const initialText=initialLen>0?request.subarray(32+128,32+128+initialLen).toString('utf8').replace(/\0.*$/, ''):'';
     console.log(`[SWKBD] Triggering Native Software Keyboard on S2: "${headerText}"...`);
     const kbdRes=await swkbdService.show({headerText,guideText,initialText});
     console.log(`[SWKBD] Result: 0x${kbdRes.result.toString(16)}, Text: "${kbdRes.text}"`);
     const textBuf=Buffer.from(kbdRes.text,'utf8');
     payload=Buffer.alloc(16+textBuf.length);
     payload.writeUInt32LE(kbdRes.result>>>0,0);
     payload.writeUInt32LE(textBuf.length>>>0,4);
     textBuf.copy(payload,16);
    }
   }else if(op===L.OP.web){
    webService??=await require('./web.cjs').create(rpc);
    const subOp=request.readUInt32LE(8);
    if(subOp===1){
     const urlLen=Math.min(request.readUInt32LE(12)||0,512);
     const flags=request.readUInt32LE(16);
     const urlStr=urlLen>0?request.subarray(32,32+urlLen).toString('utf8').replace(/\0.*$/, ''):'https://google.com';
     console.log(`[WEB] Triggering S2 Browser Applet: "${urlStr}" (flags=0x${flags.toString(16)})...`);
     const webRes=await webService.showWebPage({url:urlStr, flags});
     console.log(`[WEB] S2 Browser Applet Finished. Result: 0x${webRes.result.toString(16)}, ExitReason: ${webRes.exitReason}`);
     payload=Buffer.alloc(16);
     payload.writeUInt32LE(webRes.result>>>0,0);
     payload.writeUInt32LE(webRes.exitReason>>>0,4);
    }
   }
  }catch(error){
   console.error(`[RUNTIME ERROR] Op ${op} failed:`, error);
   status=error.code==='ETIMEDOUT'?L.STATUS.timeout:L.STATUS.native;
   payload=Buffer.from(error.message).subarray(0,1024);
  }
   const reply=Buffer.alloc(Math.max(1056,32+payload.length));
   reply.writeUInt32LE(sequence,0);
   reply.writeUInt32LE(status,4);
   reply.writeUInt32LE(payload.length,8);
   payload.copy(reply,32);
   await rpc.write(base+L.FIELD.response,reply);
 },async close(){await netSockets?.closeAll();await httpServer?.close();await audioService?.close();await hardware.close();}};
}
module.exports={create,validateManifest};
