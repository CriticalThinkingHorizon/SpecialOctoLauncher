#ifndef HB_SDK_GLSL
#define HB_SDK_GLSL
// Include state.glsl first. Compute owns writes; define STATE_ACCESS readonly in fragment.
// Official-aligned naming conventions (nn::hid, nn::fs, nn::socket, nn::nifm, nn::time, nn::os, nn::irsensor, nn::nfc, nn::audio)
// alongside concise hb* aliases for backward compatibility.

const uint HB_A=1u,HB_B=2u,HB_X=4u,HB_Y=8u,HB_L=64u,HB_R=128u,HB_PLUS=1024u,HB_MINUS=2048u;
const uint HB_LEFT=4096u,HB_UP=8192u,HB_RIGHT=16384u,HB_DOWN=32768u;
const uint HB_PAD=1u,HB_MOTION=2u,HB_KEYBOARD=4u,HB_MOUSE=8u,HB_NETWORK=16u,HB_JOY_MOUSE=32u,HB_PAD_SOURCES=64u;
const uint HB_EXT=(0x7f0000u-1024u)/4u;

uint hbWord(uint offset){return c.atlas[HB_EXT+offset/4u];}
float hbFloat(uint offset){return uintBitsToFloat(hbWord(offset));}
bool hbAvailable(){return hbWord(0u)==0x48425344u&&hbWord(4u)==1u;}
bool hbHas(uint flags){return hbAvailable()&&(hbWord(12u)&flags)==flags;}

// ============================================================================
// 1. nn::hid & nn::hid::detail (Controllers, SixAxis Motion, Keyboard, Mouse, Colors, LEDs)
// ============================================================================
uint nnHidGetNpadButtons(){
 uint buttons=c.raw[0].z;
 if(hbHas(HB_PAD_SOURCES))for(uint i=0u;i<5u;i++){
  uint offset=640u+i*64u;
  if((hbWord(offset+32u)&1u)!=0u)buttons|=hbWord(offset+8u);
 }
 return buttons;
}
uint hbButtons(){return nnHidGetNpadButtons();}
uint nnHidGetNpadPressed(){return nnHidGetNpadButtons()&~c.state.y;}
uint hbPressed(){return nnHidGetNpadPressed();}
bool nnHidIsNpadConnected(){return (c.raw[2].x&1u)!=0u;}
bool hbConnected(){return nnHidIsNpadConnected();}

// Query individual Npad source slot: 0=Handheld, 1=FullKey (Pro), 2=JoyDual, 3=JoyLeft, 4=JoyRight
uint nnHidGetNpadSourceButtons(uint sourceIndex){
 if(sourceIndex>=5u)return 0u;
 uint offset=640u+sourceIndex*64u;
 return (hbWord(offset+32u)&1u)!=0u?hbWord(offset+8u):0u;
}

vec2 nnHidGetAnalogStick(bool right){
 ivec2 raw=right?ivec2(c.raw[1].zw):ivec2(c.raw[1].xy);
 vec2 s=clamp(vec2(raw)/32767.0,-1.0,1.0);
 float n=length(s);
 return n<=.15?vec2(0):s/n*min(1.0,(n-.15)/.85);
}
vec2 hbStick(bool right){return nnHidGetAnalogStick(right);}

uint nnHidGetTouchScreenCount(){return min(c.touch[2],16u);}
uint hbTouchCount(){return nnHidGetTouchScreenCount();}
vec2 nnHidGetTouchScreenPoint(uint index){if(index>=nnHidGetTouchScreenCount())return vec2(-1);return vec2(c.touch[8u+index*10u],c.touch[9u+index*10u]);}
vec2 hbTouch(uint index){return nnHidGetTouchScreenPoint(index);}

uint nnHidGetSixAxisSensorCount(){return hbHas(HB_MOTION)?min(hbWord(28u),2u):0u;}
uint hbMotionCount(){return nnHidGetSixAxisSensorCount();}
vec3 nnHidGetSixAxisAcceleration(uint sensor){if(sensor>=nnHidGetSixAxisSensorCount())return vec3(0);uint o=128u+sensor*96u+16u;return vec3(hbFloat(o),hbFloat(o+4u),hbFloat(o+8u));}
vec3 hbAcceleration(uint sensor){return nnHidGetSixAxisAcceleration(sensor);}
vec3 nnHidGetSixAxisGyroscope(uint sensor){if(sensor>=nnHidGetSixAxisSensorCount())return vec3(0);uint o=128u+sensor*96u+28u;return vec3(hbFloat(o),hbFloat(o+4u),hbFloat(o+8u));}
vec3 hbGyroscope(uint sensor){return nnHidGetSixAxisGyroscope(sensor);}
mat3 nnHidGetSixAxisDirection(uint sensor){if(sensor>=nnHidGetSixAxisSensorCount())return mat3(1);uint o=128u+sensor*96u+52u;return mat3(vec3(hbFloat(o),hbFloat(o+4u),hbFloat(o+8u)),vec3(hbFloat(o+12u),hbFloat(o+16u),hbFloat(o+20u)),vec3(hbFloat(o+24u),hbFloat(o+28u),hbFloat(o+32u)));}
mat3 hbDirection(uint sensor){return nnHidGetSixAxisDirection(sensor);}

bool nnHidGetKeyboardKey(uint usage){return hbHas(HB_KEYBOARD)&&usage<256u&&(hbWord(336u+(usage/32u)*4u)&(1u<<(usage%32u)))!=0u;}
bool hbKey(uint usage){return nnHidGetKeyboardKey(usage);}
vec2 nnHidGetMousePosition(){return hbHas(HB_MOUSE)?vec2(int(hbWord(392u)),int(hbWord(396u))):vec2(0);}
vec2 hbMouse(){return nnHidGetMousePosition();}
uint nnHidGetMouseButtons(){return hbHas(HB_MOUSE)?hbWord(416u):0u;}
uint hbMouseButtons(){return nnHidGetMouseButtons();}

// Live controller metadata populated in the HB_EXT header (offsets 20..44) and via nnHidGetNpadControllerInfo()
uint nnHidGetNpadId(){return hbWord(20u);}
uint nnHidGetNpadStyleSet(){return hbWord(24u);}
uint nnHidGetNpadBodyColorRaw(){return hbWord(32u);}
uint nnHidGetNpadButtonColorRaw(){return hbWord(36u);}
vec3 nnHidGetNpadBodyColor(){uint c=hbWord(32u);return c==0u?vec3(0.20,0.55,0.85):vec3(float(c&255u),float((c>>8u)&255u),float((c>>16u)&255u))/255.0;}
vec3 nnHidGetNpadButtonColor(){uint c=hbWord(36u);return c==0u?vec3(0.15,0.18,0.22):vec3(float(c&255u),float((c>>8u)&255u),float((c>>16u)&255u))/255.0;}
uint nnHidGetPlayerLedPattern(){return hbWord(40u);}
bool nnHidIsVibrationPermitted(){return hbWord(44u)!=0u;}

// Native optical Joy-Con mouse ring: 8 players x 2 sides
vec2 hbJoyMouseDelta(uint player,uint side,inout uint previous){
 if(!hbHas(HB_JOY_MOUSE)||player>=8u||side>=2u)return vec2(0);
 uint base=16384u+(player*2u+side)*712u,tail=hbWord(base+16u),count=hbWord(base+24u);
 if(tail>=17u||count>16u)return vec2(0);
 vec2 delta=vec2(0);uint newest=previous;
 for(uint i=0u;i<count;i++){
  uint o=base+32u+((tail+17u-i)%17u)*40u,seq=hbWord(o+16u),high=hbWord(o+20u);
  if(hbWord(o)!=seq*2u||hbWord(o+4u)!=high*2u+(seq>>31u))continue;
  if(int(seq-previous)>0){delta+=vec2(int(hbWord(o+24u)),int(hbWord(o+28u)));if(int(seq-newest)>0)newest=seq;}
 }
 previous=newest;return delta;
}
uint hbJoyMouseAttributes(uint player,uint side){
 if(!hbHas(HB_JOY_MOUSE)||player>=8u||side>=2u)return 0u;
 uint base=16384u+(player*2u+side)*712u,tail=hbWord(base+16u);if(tail>=17u||hbWord(base+24u)==0u)return 0u;
 uint o=base+32u+tail*40u,seq=hbWord(o+16u),high=hbWord(o+20u);
 return hbWord(o)==seq*2u&&hbWord(o+4u)==high*2u+(seq>>31u)?hbWord(o+32u):0u;
}

// ============================================================================
// 2. SDK Mailbox Status & Response Accessors
// ============================================================================
bool hbBusy(){return hbWord(2048u)!=hbWord(4096u);}
uint hbResult(){return hbWord(4100u);}
uint hbResponseBytes(){return min(hbWord(4104u),1024u);}
uint hbResponseByte(uint index){return index<hbResponseBytes()?(hbWord(4128u+(index/4u)*4u)>>((index%4u)*8u))&255u:0u;}

// Directory & Text Reader Response Accessors
uint nnFsGetDirectoryEntryCount(){return hbWord(4128u);}
uint hbFsEntryCount(){return nnFsGetDirectoryEntryCount();}
uint nnFsGetDirectoryEntryTotal(){return hbWord(4132u);}
uint hbFsEntryTotal(){return nnFsGetDirectoryEntryTotal();}
uint nnFsGetDirectoryEntryByte(uint entry,uint byteIndex){return entry<15u&&byteIndex<48u?hbResponseByte(8u+entry*64u+byteIndex):0u;}
uint hbFsEntryByte(uint entry,uint byteIndex){return nnFsGetDirectoryEntryByte(entry,byteIndex);}
uint nnFsGetDirectoryEntryType(uint index){return index<15u?hbWord(4128u+8u+index*64u+48u):0u;}
uint hbFsEntryType(uint index){return nnFsGetDirectoryEntryType(index);}

uint hbFsTextLineCount(){return hbWord(4128u);}
uint hbFsTextTotalLines(){return hbWord(4132u);}
uint hbFsTextLineStart(){return hbWord(4136u);}
uint hbFsTextByte(uint line,uint col){return line<20u&&col<48u?hbResponseByte(16u+line*48u+col):0u;}

// Generic nn::fs Response Accessors (Stat, ReadFile, WriteFile, CreateFile, DeleteFile, etc.)
bool nnFsResultExists(){return hbWord(4128u)==1u;}
bool hbFsStatExists(){return nnFsResultExists();}
uint nnFsResultEntryType(){return hbWord(4132u);}
uint hbFsStatType(){return nnFsResultEntryType();}
uint nnFsResultFileSize(){return hbWord(4136u);}
uint hbFsStatSize(){return nnFsResultFileSize();}
uint nnFsResultCode(){return hbWord(4140u);}
uint hbFsNativeResult(){return nnFsResultCode();}
uint nnFsResultBytesTransferred(){return hbWord(4128u);}
uint hbFsDataBytes(){return nnFsResultBytesTransferred();}
uint nnFsResultByte(uint index){return index<960u?hbResponseByte(16u+index):0u;}
uint hbFsDataByte(uint index){return nnFsResultByte(index);}

// Generic nn::socket / nn::nifm Response Accessors
int nnSocketResultFd(){return int(hbWord(4128u));}
int hbNetSocketFd(){return nnSocketResultFd();}
uint nnNifmResultIpAddress(){return hbWord(4128u);}
uint hbNetIpWord(){return nnNifmResultIpAddress();}
uint nnNifmResultConnectionStatus(){return hbWord(4132u);}
uint hbNetStatus(){return nnNifmResultConnectionStatus();}
uint nnSocketResultBytes(){return hbWord(4128u);}
uint hbNetBytes(){return nnSocketResultBytes();}
uint nnSocketResultReady(){return hbWord(4132u);}
uint hbNetReady(){return nnSocketResultReady();}
uint nnSocketResultErrno(){return hbWord(4136u);}
uint nnSocketResultByte(uint index){return index<960u?hbResponseByte(16u+index):0u;}
uint hbNetByte(uint index){return nnSocketResultByte(index);}

// High-level HTTP Client Response Accessors (subOp 20, 21)
uint nnHttpResultStatusCode(){return hbWord(4128u);}
uint hbHttpStatusCode(){return nnHttpResultStatusCode();}
uint nnHttpResultTotalBytes(){return hbWord(4132u);}
uint hbHttpTotalBytes(){return nnHttpResultTotalBytes();}
uint nnHttpResultBodyBytes(){return hbWord(4136u);}
uint hbHttpBodyBytes(){return nnHttpResultBodyBytes();}
uint nnHttpResultErrno(){return hbWord(4140u);}
uint hbHttpErrno(){return nnHttpResultErrno();}
uint nnHttpResultBodyByte(uint index){return index<960u?hbResponseByte(16u+index):0u;}
uint hbHttpByte(uint index){return nnHttpResultBodyByte(index);}

// Image download & decode accessors (subOp 22)
uint nnHttpImageWidth(){return hbWord(4132u);}
uint hbImageWidth(){return nnHttpImageWidth();}
uint nnHttpImageHeight(){return hbWord(4136u);}
uint hbImageHeight(){return nnHttpImageHeight();}
uint nnHttpImageFileBytes(){return hbWord(4140u);}
uint hbImageFileBytes(){return nnHttpImageFileBytes();}
uint nnHttpImageDecodedBytes(){return hbWord(4144u);}
uint hbImageDecodedBytes(){return nnHttpImageDecodedBytes();}

// nn::time & nn::os Response Accessors (after calling nnTimeGetNow() or nnOsGetSystemInfo())
uvec2 nnTimeResultSteadyClockTick(){return uvec2(hbWord(4128u),hbWord(4132u));}
uvec2 nnTimeResultSteadyClockFreq(){return uvec2(hbWord(4136u),hbWord(4140u));}
uvec2 nnTimeResultPosixSeconds(){return uvec2(hbWord(4144u),hbWord(4148u));}
uint nnTimeResultYear(){return hbWord(4152u);}
uint nnTimeResultMonth(){return hbWord(4156u);}
uint nnTimeResultDay(){return hbWord(4160u);}
uint nnTimeResultHour(){return hbWord(4164u);}
uint nnTimeResultMinute(){return hbWord(4168u);}
uint nnTimeResultSecond(){return hbWord(4172u);}

uvec2 nnOsResultAruid(){return uvec2(hbWord(4128u),hbWord(4132u));}
uvec2 nnOsResultSteadyTick(){return uvec2(hbWord(4136u),hbWord(4140u));}
uint nnOsResultClockFrequency(){return hbWord(4144u);}
int nnOsResultThreadPriority(){return int(hbWord(4148u));}
uvec2 nnOsResultMainModuleBase(){return uvec2(hbWord(4152u),hbWord(4156u));}
uvec2 nnOsResultSdkModuleBase(){return uvec2(hbWord(4160u),hbWord(4164u));}

// nn::irsensor & nn::audio Response Accessors
uint nnIrSensorResultHandle(){return hbWord(4128u);}
uint nnIrSensorResultStatus(){return hbWord(4132u);}
uint nnAudioResultInputCount(){return hbWord(4128u);}
uint nnAudioResultInputNameByte(uint devIndex,uint charIndex){return devIndex<8u&&charIndex<64u?hbResponseByte(16u+devIndex*64u+charIndex):0u;}

#ifndef HB_READONLY
void hbEndFrame(){c.state.y=nnHidGetNpadButtons();}
void hbExit(){c.reserved.z=1u;}
void hbSound(uint id){c.events.x++;c.events.y=id;}

bool hbRequest(uint op,uint a,uint b,uint d){
 if(!hbAvailable()||hbBusy())return false;
 uint o=HB_EXT+2048u/4u;c.atlas[o+1u]=op;c.atlas[o+2u]=a;c.atlas[o+3u]=b;c.atlas[o+4u]=d;
 uint sequence=c.atlas[o]+1u;c.atlas[o]=sequence==0u?1u:sequence;return true;
}

// ============================================================================
// 3. Official-Aligned Request Functions (Compute Shader Only)
// ============================================================================

// --- nn::hid::detail (Vibration, Haptics, Controller Info) ---
bool nnHidSendVibrationPulse(uint side,uint milliseconds,uint amplitudePermille){return hbRequest(1u,side,milliseconds,amplitudePermille);}
bool hbVibrate(uint side,uint milliseconds,uint amplitudePermille){return nnHidSendVibrationPulse(side,milliseconds,amplitudePermille);}
void nnHidSetVibrationStep(uint index,uint milliseconds,vec4 value){
 if(index>=32u||hbBusy())return;uint o=HB_EXT+2080u/4u+index*5u;c.atlas[o]=milliseconds;
 c.atlas[o+1u]=floatBitsToUint(value.x);c.atlas[o+2u]=floatBitsToUint(value.y);c.atlas[o+3u]=floatBitsToUint(value.z);c.atlas[o+4u]=floatBitsToUint(value.w);
}
void hbHapticStep(uint index,uint milliseconds,vec4 value){nnHidSetVibrationStep(index,milliseconds,value);}
bool nnHidSendVibrationPattern(uint side,uint steps){return steps>0u&&steps<=32u&&hbRequest(4u,side,steps,0u);}
bool hbPlayHaptics(uint side,uint steps){return nnHidSendVibrationPattern(side,steps);}
bool nnHidGetNpadControllerInfo(uint npadId){return hbRequest(5u,npadId,1u,0u);}
bool hbPadInfo(uint npadId){return nnHidGetNpadControllerInfo(npadId);}

// --- nn::nfc (Amiibo / NFC Tag Scanning) ---
bool nnNfcScanTag(){return hbRequest(2u,0u,0u,0u);}
bool hbScanNfc(){return nnNfcScanTag();}

// --- nn::time & nn::os (Clocks, Calendar Time, Module/System Info) ---
bool nnTimeStandardSteadyClockNow(){return hbRequest(6u,0u,0u,0u);}
bool hbTimeNow(){return nnTimeStandardSteadyClockNow();}
bool nnOsGetSystemInfo(){return hbRequest(7u,0u,0u,0u);}
bool hbSystemInfo(){return nnOsGetSystemInfo();}

// --- nn::irsensor::detail & nn::audio ---
bool nnIrSensorGetCameraStatus(uint npadId){return hbRequest(11u,npadId,1u,0u);}
bool hbIrStatus(uint npadId){return nnIrSensorGetCameraStatus(npadId);}
bool nnAudioListAudioIns(uint maxCount){return hbRequest(12u,maxCount,0u,0u);}
bool hbAudioListInputs(uint maxCount){return nnAudioListAudioIns(maxCount);}

// --- nn::fs (Complete 18-Function Filesystem Suite + High-Level Helpers) ---
void nnFsSetPathByte(uint index,uint value){if(index>=64u||hbBusy())return;uint o=HB_EXT+(2048u+32u)/4u+index/4u,shift=(index%4u)*8u;c.atlas[o]=(c.atlas[o]&~(255u<<shift))|((value&255u)<<shift);}
void hbFsPathByte(uint index,uint value){nnFsSetPathByte(index,value);}
void nnFsSetSecondPathByte(uint index,uint value){if(index>=64u||hbBusy())return;uint o=HB_EXT+(2048u+96u)/4u+index/4u,shift=(index%4u)*8u;c.atlas[o]=(c.atlas[o]&~(255u<<shift))|((value&255u)<<shift);}
void hbFsPath2Byte(uint index,uint value){nnFsSetSecondPathByte(index,value);}
void nnFsSetWriteByte(uint index,uint value){if(index>=960u||hbBusy())return;uint o=HB_EXT+(2048u+96u)/4u+index/4u,shift=(index%4u)*8u;c.atlas[o]=(c.atlas[o]&~(255u<<shift))|((value&255u)<<shift);}
void hbFsDataWriteByte(uint index,uint value){nnFsSetWriteByte(index,value);}

// High-level directory & text helpers
bool nnFsReadDirectory(uint maxEntries,uint startOffset,uint pathLen){return hbRequest(9u,1u,(maxEntries&65535u)|((startOffset&65535u)<<16u),pathLen);}
bool hbFsListDir(uint maxEntries,uint pathLen){return nnFsReadDirectory(maxEntries,0u,pathLen);}
bool hbFsListDirOffset(uint maxEntries,uint startOffset,uint pathLen){return nnFsReadDirectory(maxEntries,startOffset,pathLen);}
bool nnFsReadTextLines(uint lineStart,uint pathLen){return hbRequest(9u,2u,lineStart,pathLen);}
bool hbFsReadText(uint lineStart,uint pathLen){return nnFsReadTextLines(lineStart,pathLen);}
bool hbFsListApps(){return hbRequest(9u,3u,0u,0u);}
bool hbFsTestTmp(uint action){return hbRequest(9u,4u,action,0u);}
bool hbFsHttpPoll(uint action){return hbRequest(9u,5u,action,0u);}
bool hbFsTestSave(uint action){return hbRequest(9u,6u,action,0u);}
bool hbFsUpdateBootstrap(uint action){return hbRequest(9u,7u,action,0u);}

// Official-named nn::fs primitives (subOp 10..19)
bool nnFsGetEntryType(uint pathLen){return hbRequest(9u,10u,0u,pathLen);}
bool hbFsStat(uint pathLen){return nnFsGetEntryType(pathLen);}
bool nnFsCreateFile(uint initialSize,uint pathLen){return hbRequest(9u,11u,initialSize,pathLen);}
bool hbFsCreate(uint initialSize,uint pathLen){return nnFsCreateFile(initialSize,pathLen);}
bool nnFsDeleteFile(uint pathLen){return hbRequest(9u,12u,0u,pathLen);}
bool hbFsDelete(uint pathLen){return nnFsDeleteFile(pathLen);}
bool nnFsReadFile(uint offset,uint maxBytes,uint pathLen){return hbRequest(9u,13u,offset,(pathLen&65535u)|((min(maxBytes,960u)&65535u)<<16u));}
bool hbFsReadBytes(uint offset,uint maxBytes,uint pathLen){return nnFsReadFile(offset,maxBytes,pathLen);}
bool nnFsWriteFile(uint offset,uint dataLen,uint pathLen){return hbRequest(9u,14u,offset,(pathLen&65535u)|((min(dataLen,960u)&65535u)<<16u));}
bool hbFsWriteBytes(uint offset,uint dataLen,uint pathLen){return nnFsWriteFile(offset,dataLen,pathLen);}
bool nnFsCreateDirectory(uint pathLen){return hbRequest(9u,15u,0u,pathLen);}
bool hbFsMkdir(uint pathLen){return nnFsCreateDirectory(pathLen);}
bool nnFsDeleteDirectory(uint pathLen){return hbRequest(9u,16u,0u,pathLen);}
bool hbFsRmdir(uint pathLen){return nnFsDeleteDirectory(pathLen);}
bool nnFsRenameFile(uint oldLen,uint newLen){return hbRequest(9u,17u,oldLen,newLen);}
bool hbFsRename(uint oldLen,uint newLen){return nnFsRenameFile(oldLen,newLen);}
bool nnFsRenameDirectory(uint oldLen,uint newLen){return hbRequest(9u,18u,oldLen,newLen);}
bool hbFsRenameDir(uint oldLen,uint newLen){return nnFsRenameDirectory(oldLen,newLen);}
bool nnFsCommitSaveData(uint mountLen){return hbRequest(9u,19u,0u,mountLen);}
bool hbFsCommit(uint mountLen){return nnFsCommitSaveData(mountLen);}

// --- nn::socket & nn::nifm (TCP / UDP Client & Server Primitives) ---
void nnSocketSetSendByte(uint index,uint value){if(index>=1024u||hbBusy())return;uint o=HB_EXT+(2080u/4u)+index/4u,shift=(index%4u)*8u;c.atlas[o]=(c.atlas[o]&~(255u<<shift))|((value&255u)<<shift);}
void hbRequestByte(uint index,uint value){nnSocketSetSendByte(index,value);}
bool nnSocketSendToUdpEndpoint(uint endpoint,uint bytes){return bytes>0u&&bytes<=1024u&&hbRequest(3u,endpoint,bytes,0u);}
bool hbSendUdp(uint endpoint,uint bytes){return nnSocketSendToUdpEndpoint(endpoint,bytes);}

bool nnNifmGetCurrentPrimaryIpAddress(){return hbRequest(10u,1u,0u,0u);}
bool hbNetGetInfo(){return nnNifmGetCurrentPrimaryIpAddress();}
bool nnSocketListenTcp(uint port,uint backlog){return hbRequest(10u,2u,port,backlog);}
bool hbNetListen(uint port,uint backlog){return nnSocketListenTcp(port,backlog);}
bool nnSocketAccept(uint listenFd,uint timeoutMs){return hbRequest(10u,3u,listenFd,timeoutMs);}
bool hbNetAccept(uint listenFd,uint timeoutMs){return nnSocketAccept(listenFd,timeoutMs);}
bool nnSocketRecv(uint fd,uint maxBytes,uint timeoutMs){return hbRequest(10u,4u,fd,(min(maxBytes,960u)&65535u)|((min(timeoutMs,1000u)&65535u)<<16u));}
bool hbNetRecv(uint fd,uint maxBytes,uint timeoutMs){return nnSocketRecv(fd,maxBytes,timeoutMs);}
bool nnSocketSend(uint fd,uint byteLen){return hbRequest(10u,5u,fd,min(byteLen,960u));}
bool hbNetSend(uint fd,uint byteLen){return nnSocketSend(fd,byteLen);}
bool nnSocketClose(uint fd){return hbRequest(10u,6u,fd,0u);}
bool hbNetClose(uint fd){return nnSocketClose(fd);}
bool nnSocketConnect(uint ipv4BigEndian,uint port){return hbRequest(10u,7u,ipv4BigEndian,port);}
bool hbNetConnect(uint ipv4BigEndian,uint port){return nnSocketConnect(ipv4BigEndian,port);}
bool nnSocketGetSockName(uint fd){return hbRequest(10u,8u,fd,0u);}
bool hbNetGetSockName(uint fd){return nnSocketGetSockName(fd);}
bool nnSocketGetLastErrno(){return hbRequest(10u,9u,0u,0u);}
bool hbNetGetLastErrno(){return nnSocketGetLastErrno();}

// --- High-Level HTTP Request Primitives ---
// Staging helpers:
// URL is set via nnHttpSetUrlByte(i, ch) (up to 128 bytes)
// POST body is set via nnHttpSetPostByte(i, val) (up to 960 bytes)
// Destination path for downloads is set via nnHttpSetSavePathByte(i, ch) (up to 64 bytes)
void nnHttpSetUrlByte(uint index,uint value){if(index>=128u||hbBusy())return;uint o=HB_EXT+(2048u+32u)/4u+index/4u,shift=(index%4u)*8u;c.atlas[o]=(c.atlas[o]&~(255u<<shift))|((value&255u)<<shift);}
void hbHttpUrlByte(uint index,uint value){nnHttpSetUrlByte(index,value);}
void nnHttpSetPostByte(uint index,uint value){if(index>=960u||hbBusy())return;uint o=HB_EXT+(2048u+160u)/4u+index/4u,shift=(index%4u)*8u;c.atlas[o]=(c.atlas[o]&~(255u<<shift))|((value&255u)<<shift);}
void hbHttpPostByte(uint index,uint value){nnHttpSetPostByte(index,value);}
void nnHttpSetSavePathByte(uint index,uint value){if(index>=64u||hbBusy())return;uint o=HB_EXT+(2048u+160u)/4u+index/4u,shift=(index%4u)*8u;c.atlas[o]=(c.atlas[o]&~(255u<<shift))|((value&255u)<<shift);}
void hbHttpSavePathByte(uint index,uint value){nnHttpSetSavePathByte(index,value);}

bool nnHttpGet(uint maxBytes,uint urlLen){return hbRequest(10u,20u,min(maxBytes,960u),(urlLen&65535u));}
bool hbHttpGet(uint maxBytes,uint urlLen){return nnHttpGet(maxBytes,urlLen);}
bool nnHttpPost(uint postLen,uint urlLen){return hbRequest(10u,20u,960u,(urlLen&65535u)|(1u<<16u)|((min(postLen,960u)&32767u)<<17u));}
bool hbHttpPost(uint postLen,uint urlLen){return nnHttpPost(postLen,urlLen);}
bool nnHttpDownloadTo(uint savePathLen,uint urlLen){return hbRequest(10u,21u,0u,(urlLen&65535u)|((savePathLen&65535u)<<16u));}
bool hbHttpDownloadTo(uint savePathLen,uint urlLen){return nnHttpDownloadTo(savePathLen,urlLen);}
bool nnHttpDownloadToTmp(uint urlLen){return nnHttpDownloadTo(0u,urlLen);}
bool hbHttpDownloadToTmp(uint urlLen){return nnHttpDownloadToTmp(urlLen);}
bool nnHttpDownloadImage(uint urlLen){return hbRequest(10u,22u,0u,(urlLen&65535u));}
bool hbHttpDownloadImage(uint urlLen){return nnHttpDownloadImage(urlLen);}

// --- nn::swkbd (S2 Native Software Keyboard) ---
void nnSwkbdSetPromptByte(uint index, uint value) {
 if (index >= 64u || hbBusy()) return;
 uint o = HB_EXT + (2048u + 32u)/4u + index/4u, shift = (index % 4u) * 8u;
 c.atlas[o] = (c.atlas[o] & ~(255u << shift)) | ((value & 255u) << shift);
}
void hbSwkbdPromptByte(uint index, uint value) { nnSwkbdSetPromptByte(index, value); }

void nnSwkbdSetGuideByte(uint index, uint value) {
 if (index >= 64u || hbBusy()) return;
 uint o = HB_EXT + (2048u + 96u)/4u + index/4u, shift = (index % 4u) * 8u;
 c.atlas[o] = (c.atlas[o] & ~(255u << shift)) | ((value & 255u) << shift);
}
void hbSwkbdGuideByte(uint index, uint value) { nnSwkbdSetGuideByte(index, value); }

void nnSwkbdSetInitialByte(uint index, uint value) {
 if (index >= 64u || hbBusy()) return;
 uint o = HB_EXT + (2048u + 160u)/4u + index/4u, shift = (index % 4u) * 8u;
 c.atlas[o] = (c.atlas[o] & ~(255u << shift)) | ((value & 255u) << shift);
}
void hbSwkbdInitialByte(uint index, uint value) { nnSwkbdSetInitialByte(index, value); }

bool nnSwkbdShow(uint promptLen, uint guideLen, uint initialLen) {
 return hbRequest(13u, 1u, promptLen, (guideLen & 65535u) | (initialLen << 16u));
}
bool hbSwkbdShow(uint promptLen, uint guideLen, uint initialLen) {
 return nnSwkbdShow(promptLen, guideLen, initialLen);
}

uint nnSwkbdGetResult() { return hbWord(4128u); }
uint nnSwkbdGetTextLength() { return hbWord(4132u); }
uint nnSwkbdGetTextByte(uint index) { return hbResponseByte(16u + index); }
#endif
#endif
