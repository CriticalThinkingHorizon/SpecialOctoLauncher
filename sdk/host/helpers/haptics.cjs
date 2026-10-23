// Standard amplitude/frequency HD vibration envelopes. Not a claim of PCM/HD Rumble 2 encoding.
function validate({side=0,steps}={}){
 if(!Number.isInteger(side)||side<0||side>2||!Array.isArray(steps)||steps.length<1||steps.length>32)throw Error('Haptics needs side 0/1/2 and 1..32 steps');
 let duration=0;const normalized=steps.map(step=>{
  const v={milliseconds:step.milliseconds,lowAmplitude:step.lowAmplitude??step.amplitude??.15,lowFrequency:step.lowFrequency??160,highAmplitude:step.highAmplitude??step.amplitude??.15,highFrequency:step.highFrequency??320};
  if(!Number.isInteger(v.milliseconds)||v.milliseconds<1||v.milliseconds>500||![v.lowAmplitude,v.highAmplitude].every(x=>Number.isFinite(x)&&x>=0&&x<=1)||![v.lowFrequency,v.highFrequency].every(x=>Number.isFinite(x)&&x>=40&&x<=1250))throw Error('Invalid haptic step: duration 1..500ms, amplitudes 0..1, frequencies 40..1250Hz');
  duration+=v.milliseconds;return v;
 });if(duration>2000)throw Error('Haptic pattern exceeds 2000ms');return {side,steps:normalized};
}
async function play(api,handles,options){
 const {side,steps}=validate(options),selected=side===2?handles:handles.slice(side,side+1);if(!selected.length)throw Error('Selected haptic side unavailable');
 const stop=async()=>{for(const handle of selected){const value=Buffer.alloc(20);value.writeFloatLE(.0,0);value.writeFloatLE(160,4);value.writeFloatLE(.0,8);value.writeFloatLE(320,12);await api.result('vibrationSend',[handle,value]);}};
 await stop();
 const actual=Buffer.alloc(20);
 for(const step of steps){
  const value=Buffer.alloc(20);value.writeFloatLE(step.lowAmplitude,0);value.writeFloatLE(step.lowFrequency,4);value.writeFloatLE(step.highAmplitude,8);value.writeFloatLE(step.highFrequency,12);
  for(const handle of selected)await api.result('vibrationSend',[handle,value]);
  await new Promise(r=>setTimeout(r,step.milliseconds));
 }
 await stop();
 if(selected.length){const value=Buffer.alloc(20);if(await api.result('vibrationRead',[selected[0],value])===0)value.copy(actual);}
 return {actual};
}
module.exports={validate,play};
