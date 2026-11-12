#ifndef PC_KBD_GLSL
#define PC_KBD_GLSL

// Shared DucktoChat touch-keyboard geometry (screen space: y grows downward).
const uint PC_INPUT_BASE = 80000u;
const uint PC_KEY_SPACE = 0x101u;
const uint PC_KEY_BACK  = 0x102u;
const uint PC_KEY_SEND  = 0x103u;
const uint PC_KEY_CLEAR = 0x104u;

const float PC_KEY_W = 56.0;
const float PC_KEY_H = 46.0;
const float PC_KEY_STEP_X = 64.0;
const float PC_KEY_STEP_Y = 56.0;
const float PC_KB_LEFT = 128.0;
const float PC_ROW0_Y = 465.0;
const float PC_ACTION_Y = 730.0;

const uint PC_ROW0[12] = uint[12](49u,50u,51u,52u,53u,54u,55u,56u,57u,48u,45u,61u);
const uint PC_ROW1[12] = uint[12](113u,119u,101u,114u,116u,121u,117u,105u,111u,112u,91u,93u);
const uint PC_ROW2[12] = uint[12](97u,115u,100u,102u,103u,104u,106u,107u,108u,59u,39u,0u);
const uint PC_ROW3[12] = uint[12](122u,120u,99u,118u,98u,110u,109u,44u,46u,47u,0u,0u);

uint pcKeyCode(int r,int c){
 if(c<0||c>=12||r<0||r>=4)return 0u;
 if(r==0)return PC_ROW0[c];
 if(r==1)return PC_ROW1[c];
 if(r==2)return PC_ROW2[c];
 return PC_ROW3[c];
}

float pcRowOffset(int r){ return r==2?32.0:(r==3?64.0:0.0); }
vec2 pcKeyCenter(int r,int c){ return vec2(PC_KB_LEFT+pcRowOffset(r)+float(c)*PC_KEY_STEP_X,PC_ROW0_Y+float(r)*PC_KEY_STEP_Y); }
vec2 pcClearCenter(){ return vec2(165.0,PC_ACTION_Y); }
vec2 pcSpaceCenter(){ return vec2(480.0,PC_ACTION_Y); }
vec2 pcBackCenter(){ return vec2(740.0,PC_ACTION_Y); }
vec2 pcSendCenter(){ return vec2(840.0,PC_ACTION_Y); }

uint pcKeyAt(vec2 pt){
 for(int r=0;r<4;r++){
  for(int c=0;c<12;c++){
   uint code=pcKeyCode(r,c);
   if(code==0u)continue;
   vec2 k=pcKeyCenter(r,c);
   if(abs(pt.x-k.x)<=PC_KEY_W*0.5&&abs(pt.y-k.y)<=PC_KEY_H*0.5)return code;
  }
 }
 if(abs(pt.x-165.0)<=90.0&&abs(pt.y-PC_ACTION_Y)<=23.0)return PC_KEY_CLEAR;
 if(abs(pt.x-480.0)<=205.0&&abs(pt.y-PC_ACTION_Y)<=23.0)return PC_KEY_SPACE;
 if(abs(pt.x-740.0)<=40.0&&abs(pt.y-PC_ACTION_Y)<=23.0)return PC_KEY_BACK;
 if(abs(pt.x-840.0)<=45.0&&abs(pt.y-PC_ACTION_Y)<=23.0)return PC_KEY_SEND;
 return 0u;
}

vec2 pcRoomCenter(uint r){ return vec2(650.0+float(r)*72.0,70.0); }

uint pcInputByte(uint i){
 uint w=PC_INPUT_BASE+(i/4u),sh=(i%4u)*8u;
 return (c.atlas[w]>>sh)&255u;
}
#ifndef HB_READONLY
void pcSetInputByte(uint i,uint v){
 if(i>=104u)return;
 uint w=PC_INPUT_BASE+(i/4u),sh=(i%4u)*8u;
 c.atlas[w]=(c.atlas[w]&~(255u<<sh))|((v&255u)<<sh);
}
#endif
#endif
