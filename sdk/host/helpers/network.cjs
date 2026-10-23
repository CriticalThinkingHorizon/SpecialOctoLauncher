const net=require('node:net');
const definitions=require('../../native/service-functions.json');
function endpoint(value){
 if(!value||!net.isIPv4(value.address)||!Number.isInteger(value.port)||value.port<1||value.port>65535)throw Error('UDP endpoint requires an IPv4 address and port 1..65535');
 return {address:value.address,port:value.port};
}
async function create(rpc,directory){
 const names=['socket','sendto','recv','socketClose','errno','socketInitialized'];
 const api=await require('../../native/client.cjs').create(rpc,Object.fromEntries(names.map(k=>[k,definitions[k]])));
 const worker=await require('../../native/six.cjs').create(rpc,directory);let busy=false;
 return {async exchange(destination,payload,{timeout=1000}={}){
  destination=endpoint(destination);
  if(!Buffer.isBuffer(payload)||payload.length<1||payload.length>1024)throw Error('UDP payload must be 1..1024 bytes');
  if(!Number.isInteger(timeout)||timeout<1||timeout>5000)throw Error('UDP timeout must be 1..5000ms');
  if(busy)throw Error('UDP exchange already in flight');busy=true;let fd=-1;
  try{
   if(await api.result('socketInitialized')!==1)throw Error('Console socket stack uninitialized');
   fd=await api.result('socket',[2,2,17]);if(fd<0)throw Error('Failed to create UDP socket');
   const [addr,port]=[destination.address.split('.').map(Number),destination.port];
   const sa=Buffer.alloc(16);sa.writeUInt16LE(2);sa.writeUInt16BE(port,2);sa[4]=addr[0];sa[5]=addr[1];sa[6]=addr[2];sa[7]=addr[3];
   await api.write(api.base+1024,payload);
   const sent=await api.result('sendto',[fd,api.base+1024,payload.length,0,api.base+128,16]);
   if(sent!==payload.length)throw Error('Failed to send UDP payload');
   const res=await worker.poll(async()=>{
    const n=await api.result('recv',[fd,api.base+1024,1024,0]);
    if(n>0)return api.read(api.base+1024,n);if(n===0||n===-11)return null;throw Error('UDP receive failed');
   },{timeout});
   if(!res)throw Error('UDP exchange timed out');return res;
  }finally{if(fd>=0)try{await api.result('socketClose',[fd]);}catch(error){}busy=false;}
 },endpoint};
}
module.exports={create,endpoint};
