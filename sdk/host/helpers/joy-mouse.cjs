// S2 optical input through the HID Jcms service, independent of generic MouseState.
const BYTES=0x4000,STRIDE=712,SLOTS=17,RECORD=40,DESTINATION=0x4000;
function samples(bytes,player,side){
 if(!Buffer.isBuffer(bytes)||bytes.length!==BYTES||!Number.isInteger(player)||player<0||player>7||!Number.isInteger(side)||side<0||side>1)throw Error('Invalid Jcms snapshot');
 const base=(player*2+side)*STRIDE,tail=bytes.readUInt32LE(base+16),count=bytes.readUInt32LE(base+24);
 if(tail>=SLOTS||count>16)throw Error('Invalid Jcms ring header');const result=[];
 for(let i=0;i<count;i++){
  const o=base+32+((tail+SLOTS-i)%SLOTS)*RECORD,guard=bytes.readBigUInt64LE(o),sequence=bytes.readBigUInt64LE(o+16);
  if(!sequence||guard!==BigInt.asUintN(64,sequence*2n))continue;
  result.push({sequence:String(sequence),deltaNanoseconds:String(bytes.readBigUInt64LE(o+8)),dx:bytes.readInt32LE(o+24),dy:bytes.readInt32LE(o+28),attributes:bytes.readUInt32LE(o+32)});
 }
 return result;
}
async function create(rpc){
 const ipc=await require('../../native/ipc.cjs').open(rpc,'hid'),api=await require('../../native/client.cjs').create(rpc,{},BYTES),aruid=await ipc.aruid();
 const handle=await ipc.result('jcms',[aruid]);const transfer=await rpc.map(DESTINATION,BYTES);
 if(await api.result('jcmsStart',[handle])!==0){rpc.unmap(DESTINATION,BYTES);ipc.close();throw Error('Failed to start Jcms service');}
 let closed=false;
 return {async snapshot(){
  if(closed)throw Error('Jcms session closed');
  await api.result('jcmsRead',[handle,DESTINATION,BYTES]);return rpc.read(DESTINATION,BYTES);
 },samples(bytes,player=0,side=0){return samples(bytes,player,side);},frameCall(mapped){
  if(closed)throw Error('Jcms session closed');
  return {function:api.functions.jcmsRead,args:[handle,mapped+448,BYTES]};
 },async close(){
  if(closed)return;closed=true;
  try{await api.result('jcmsStop',[handle]);}catch(error){}
  try{rpc.unmap(DESTINATION,BYTES);}catch(error){}
  try{ipc.close();}catch(error){}
 }};
}
module.exports={create,samples,BYTES,STRIDE};
