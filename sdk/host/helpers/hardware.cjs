const hid=require('../../native/hid-functions.json'),services=require('../../native/service-functions.json');
const {MAGIC,VERSION,FIELD:F,FLAGS,word}=require('../layout.cjs');
const STYLES=[[1,'FullKey'],[2,'Handheld'],[4,'JoyDual'],[8,'JoyLeft'],[16,'JoyRight']];
// Sample both handheld and player-one styles every frame, including mixed attachment.
const PAD_SOURCES=[[32,'Handheld'],[0,'FullKey'],[0,'JoyDual'],[0,'JoyLeft'],[0,'JoyRight']];
const IDS=[32,0,1,2,3,4,5,6,7,16];
async function create(rpc){
 const serviceNames=['netStatus','netAddress','socketInitialized','irHandle','irStatus'];
 const api=await require('../../native/client.cjs').create(rpc,{...hid,...Object.fromEntries(serviceNames.map(k=>[k,services[k]]))});
 let joyMouse,joyMouseError;
 try{joyMouse=await require('./joy-mouse.cjs').create(rpc);}catch(error){joyMouseError=error.message;}
 for(let i=0;i<PAD_SOURCES.length;i++)await api.write(0x1000+i*4,word(PAD_SOURCES[i][0]));
 let sequence=0,selected=null,motion=[],vibration=[],lastDiscovery=0,closed=false;
 async function stopMotion(){for(const handle of motion)await api.result('motionStop',[handle]);motion=[];}
 async function discover(){
  const controllers=[];
  for(const id of IDS){await api.write(0,word(id));const result=await api.result('style',[api.base+16,api.base]);if(result)continue;const style=(await api.read(16,4)).readUInt32LE();if(style)controllers.push({id,style});}
  const next=controllers.find(p=>STYLES.some(([bit])=>p.style&bit));
  if(next?.id!==selected?.id||next?.style!==selected?.style){
   await stopMotion();vibration=[];selected=next;
   if(next){
    await api.write(0,word(next.id));const style=STYLES.find(([bit])=>next.style&bit);selected.kind=style[1];
    const n=await api.result('motionHandles',[api.base+0x300,2,api.base,style[0]]);if(n>2)throw Error('Invalid motion handle count');
    for(let i=0;i<n;i++){const handle=api.base+0x300+i*4;if(await api.result('motionStart',[handle])===0)motion.push(handle);}
    const v=await api.result('vibrationHandles',[api.base+0x800,2,api.base,style[0]]);if(v>2)throw Error('Invalid vibration handle count');
    for(let i=0;i<v;i++){const handle=api.base+0x800+i*4;if(await api.result('vibrationInit',[handle])===0)vibration.push(handle);}
   }
  }
  lastDiscovery=Date.now();return controllers;
 }
 const hardware={controllers:[],joyMouse,joyMouseError,frameCalls(mapped){
  if(closed)throw Error('Hardware context closed');
  const ext=mapped+require('../layout.cjs').OFFSET,calls=[];
  if(selected)calls.push({function:api.functions['pad'+selected.kind],args:[mapped,api.base]});
  for(let i=0;i<PAD_SOURCES.length;i++)calls.push({function:api.functions['pad'+PAD_SOURCES[i][1]],args:[ext+F.padSources+i*64,api.base+0x1000+i*4]});
  for(let i=0;i<motion.length;i++)calls.push({function:api.functions.motionRead,args:[api.base+0x400+i*4,ext+F.motion+i*96,1,motion[i]]});
  calls.push({function:api.functions.keyboard,args:[api.base+0xc00,ext+F.keyboard,1]});
  calls.push({function:api.functions.mouse,args:[ext+F.mouse]});
  if(joyMouse)calls.push(joyMouse.frameCall(mapped));
  return calls;
 },async poll(){
  if(closed)throw Error('Hardware context closed');
  if(!lastDiscovery||Date.now()-lastDiscovery>5000)hardware.controllers=await discover();
  const out=Buffer.alloc(1024);out.writeUInt32LE(MAGIC,F.magic);out.writeUInt32LE(VERSION,F.version);out.writeUInt32LE(++sequence>>>0,F.sequence);let flags=FLAGS.padSources|(joyMouse?FLAGS.joyMouse:0);
  out.writeUInt32LE(joyMouse?1:0,512);
  if(selected){
   out.writeUInt32LE(selected.id,F.padId);out.writeUInt32LE(selected.style,F.style);await api.write(0,word(selected.id));
   await api.call('pad'+selected.kind,[api.base+0x100,api.base]);(await api.read(0x100,64)).copy(out,F.pad);flags|=FLAGS.pad;
  }
  for(let i=0;i<PAD_SOURCES.length;i++){
   const entry=PAD_SOURCES[i];await api.write(0,word(entry[0]));await api.call('pad'+entry[1],[api.base+0x100,api.base]);
   (await api.read(0x100,64)).copy(out,F.padSources+i*64);
  }
  out.writeUInt32LE(motion.length,F.motionCount);
  for(let i=0;i<motion.length;i++){await api.call('motionRead',[api.base+0x400+i*4,api.base+0x500+i*96,1,motion[i]]);(await api.read(0x500,96)).copy(out,F.motion+i*96);flags|=FLAGS.motion;}
  await api.call('keyboard',[api.base+0xc00,api.base+0xd00,1]);(await api.read(0xd00,48)).copy(out,F.keyboard);flags|=FLAGS.keyboard;
  await api.call('mouse',[api.base+0xe00]);(await api.read(0xe00,40)).copy(out,F.mouse);flags|=FLAGS.mouse;
  if(joyMouse){const snapshot=await joyMouse.snapshot();snapshot.copy(out,448,0,32);}
  try{
   await api.write(0,word(selected?.id??32));const status=Buffer.alloc(4);
   if(await api.result('netStatus',[status])===0)out.writeUInt32LE(status.readUInt32LE(),F.network);
   const ip=Buffer.alloc(4);if(await api.result('netAddress',[ip])===0)out.writeUInt32LE(ip.readUInt32LE(),F.network+4);
  }catch(error){}
  out.writeUInt32LE(flags,12);return out;
 },async pulse({side=0,amplitude=.15,milliseconds=120}={}){
  if(closed)throw Error('Hardware context closed');
  if(!vibration.length)throw Error('Vibration device unavailable');
  return require('./haptics.cjs').play(api,vibration,{side,steps:[{milliseconds,lowAmplitude:amplitude,highAmplitude:amplitude}]});
 },async pattern({side=0,steps}={}){
  if(closed)throw Error('Hardware context closed');
  if(!vibration.length)throw Error('Vibration device unavailable');
  return require('./haptics.cjs').play(api,vibration,{side,steps});
 },async close(){
  if(closed)return;closed=true;let failure;
  try{await stopMotion();}catch(error){failure=error;}
  if(joyMouse)try{await joyMouse.close();}catch(error){failure??=error;}
  if(failure)throw failure;
 }};
 return hardware;
}
module.exports={create};
