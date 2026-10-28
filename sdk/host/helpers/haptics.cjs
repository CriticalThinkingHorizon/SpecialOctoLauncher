// Standard amplitude/frequency HD vibration envelopes.
function validate({side=0,steps}={}){
 if(!Number.isInteger(side)||side<0||side>2||!Array.isArray(steps)||steps.length<1||steps.length>32)throw Error('Haptics needs side 0/1/2 and 1..32 steps');
 let duration=0;const normalized=steps.map(step=>{
  const v={milliseconds:step.milliseconds,lowAmplitude:step.lowAmplitude??step.amplitude??.15,lowFrequency:step.lowFrequency??160,highAmplitude:step.highAmplitude??step.amplitude??.15,highFrequency:step.highFrequency??320};
  if(!Number.isInteger(v.milliseconds)||v.milliseconds<1||v.milliseconds>1000||![v.lowAmplitude,v.highAmplitude].every(x=>Number.isFinite(x)&&x>=0&&x<=1)||![v.lowFrequency,v.highFrequency].every(x=>Number.isFinite(x)&&x>=40&&x<=1250))throw Error('Invalid haptic step: duration 1..1000ms, amplitudes 0..1, frequencies 40..1250Hz');
  duration+=v.milliseconds;return v;
 });if(duration>2000)throw Error('Haptic pattern exceeds 2000ms');return {side,steps:normalized};
}

const VIB_VAL_OFFSET = 0x820;
const VIB_STOP_OFFSET = 0x830;
const VIB_READ_OFFSET = 0x840;

const timers = [null, null];
let stopInitialized = false;

async function ensureStopBuffer(api){
 if(!stopInitialized){
  const stopVal=Buffer.alloc(16);
  stopVal.writeFloatLE(0.0,0);
  stopVal.writeFloatLE(160.0,4);
  stopVal.writeFloatLE(0.0,8);
  stopVal.writeFloatLE(320.0,12);
  await api.write(VIB_STOP_OFFSET,stopVal);
  stopInitialized=true;
 }
}

async function play(api,handles,options){
 const {side,steps}=validate(options);
 if(!handles||!handles.length)return {actual:Buffer.alloc(16)};

 await ensureStopBuffer(api);

 const targets=[];
 if(side===0){
  targets.push({handle:handles[0],index:0});
 }else if(side===1){
  targets.push({handle:handles[1]??handles[0],index:1});
 }else if(side===2){
  targets.push({handle:handles[0],index:0});
  if(handles[1])targets.push({handle:handles[1],index:1});
 }

 for(const t of targets){
  if(timers[t.index]){
   clearTimeout(timers[t.index]);
   timers[t.index]=null;
  }
 }

 const actual=Buffer.alloc(16);

 if(steps.length===1){
  const step=steps[0];
  const val=Buffer.alloc(16);
  val.writeFloatLE(step.lowAmplitude,0);
  val.writeFloatLE(step.lowFrequency,4);
  val.writeFloatLE(step.highAmplitude,8);
  val.writeFloatLE(step.highFrequency,12);
  await api.write(VIB_VAL_OFFSET,val);

  for(const t of targets){
   await api.result('vibrationSend',[t.handle,api.base+VIB_VAL_OFFSET]);
   timers[t.index]=setTimeout(async()=>{
    try{
     await api.result('vibrationSend',[t.handle,api.base+VIB_STOP_OFFSET]);
    }catch(e){}
    timers[t.index]=null;
   },step.milliseconds);
  }

  return {actual};
 }

 for(const step of steps){
  const val=Buffer.alloc(16);
  val.writeFloatLE(step.lowAmplitude,0);
  val.writeFloatLE(step.lowFrequency,4);
  val.writeFloatLE(step.highAmplitude,8);
  val.writeFloatLE(step.highFrequency,12);
  await api.write(VIB_VAL_OFFSET,val);

  for(const t of targets){
   await api.result('vibrationSend',[t.handle,api.base+VIB_VAL_OFFSET]);
  }
  await new Promise(r=>setTimeout(r,step.milliseconds));
 }

 for(const t of targets){
  await api.result('vibrationSend',[t.handle,api.base+VIB_STOP_OFFSET]);
 }

 try{
  if(targets.length&&await api.result('vibrationRead',[api.base+VIB_READ_OFFSET,targets[0].handle])===0){
   const readVal=await api.read(VIB_READ_OFFSET,16);
   readVal.copy(actual);
  }
 }catch(e){}

 return {actual};
}

module.exports={validate,play};
