#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#define HB_READONLY
#include "abi.glsl"
#include "hb.glsl"
#include "text.glsl"
#include "draw.glsl"

float drawChar(vec2 p,vec2 origin,uint ch){
 if(ch<GLYPH_FIRST||ch>=GLYPH_FIRST+GLYPH_COUNT)return 0.0;
 uint idx=ch-GLYPH_FIRST;
 ivec4 rect=ivec4(int(idx%uint(GLYPH_COLS))*GLYPH_W,int(idx/uint(GLYPH_COLS))*GLYPH_H,GLYPH_W,GLYPH_H);
 return text(p,origin,rect);
}

float drawBodyLine(vec2 p,vec2 origin,uint lineIdx){
 float ink=0.0;
 uint startByte=lineIdx*48u;
 for(uint col=0u;col<48u;col++){
  uint ch=nnHttpResultBodyByte(startByte+col);
  if(ch==0u)break;
  if(ch<32u||ch>126u)ch=32u;
  ink=max(ink,drawChar(p,origin+vec2(float(col*uint(GLYPH_W)),0.0),ch));
 }
 return ink;
}

// "S2 HTTP CLIENT & DOWNLOADER (nn::http)" (38 chars)
const uint TITLE_LEN = 38u;
const uint TITLE_CHARS[38] = uint[38](
 83u,50u,32u,72u,84u,84u,80u,32u,67u,76u,73u,69u,78u,84u,32u,38u,32u,68u,79u,87u,78u,76u,79u,65u,68u,69u,82u,32u,40u,110u,110u,58u,58u,104u,116u,116u,112u,41u
);

// "IDLE: Press [A], [X], or [Y] to test" (36 chars)
const uint IDLE_LEN = 36u;
const uint IDLE_CHARS[36] = uint[36](
 73u,68u,76u,69u,58u,32u,80u,114u,101u,115u,115u,32u,91u,65u,93u,44u,32u,91u,88u,93u,44u,32u,111u,114u,32u,91u,89u,93u,32u,116u,111u,32u,116u,101u,115u,116u
);

// "REQUESTING... Communicating via S2 stack..." (43 chars)
const uint REQ_LEN = 43u;
const uint REQ_CHARS[43] = uint[43](
 82u,69u,81u,85u,69u,83u,84u,73u,78u,71u,46u,46u,46u,32u,67u,111u,109u,109u,117u,110u,105u,99u,97u,116u,105u,110u,103u,32u,118u,105u,97u,32u,83u,50u,32u,115u,116u,97u,99u,107u,46u,46u,46u
);

// "STATUS: 200 OK (Response body preview below)" (43 chars)
const uint OK_LEN = 43u;
const uint OK_CHARS[43] = uint[43](
 83u,84u,65u,84u,85u,83u,58u,32u,50u,48u,48u,32u,79u,75u,32u,40u,82u,101u,115u,112u,111u,110u,115u,101u,32u,98u,111u,100u,121u,32u,112u,114u,101u,118u,105u,101u,119u,32u,98u,101u,108u,111u,119u
);

// "ERROR: Request failed or server error" (37 chars)
const uint ERR_LEN = 37u;
const uint ERR_CHARS[37] = uint[37](
 69u,82u,82u,79u,82u,58u,32u,82u,101u,113u,117u,101u,115u,116u,32u,102u,97u,105u,108u,101u,100u,32u,111u,114u,32u,115u,101u,114u,118u,101u,114u,32u,101u,114u,114u,111u,114u
);

// "DOWNLOAD COMPLETE: Saved to tmp:/download.bin" (45 chars)
const uint DL_LEN = 45u;
const uint DL_CHARS[45] = uint[45](
 68u,79u,87u,78u,76u,79u,65u,68u,32u,67u,79u,77u,80u,76u,69u,84u,69u,58u,32u,83u,97u,118u,101u,100u,32u,116u,111u,32u,116u,109u,112u,58u,47u,100u,111u,119u,110u,108u,111u,97u,100u,46u,98u,105u,110u
);

// "[A] GET /get   [X] GET /ip   [Y] Download robots.txt   [-] Exit" (59 chars)
const uint FOOT_LEN = 59u;
const uint FOOT_CHARS[59] = uint[59](
 91u,65u,93u,32u,71u,69u,84u,32u,47u,103u,101u,116u,32u,32u,32u,91u,88u,93u,32u,71u,69u,84u,32u,47u,105u,112u,32u,32u,32u,91u,89u,93u,32u,68u,111u,119u,110u,108u,111u,97u,100u,32u,32u,32u,91u,45u,93u,32u,69u,120u,105u,116u,32u,116u,111u,32u,76u,97u,117u
);

void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 bg=mix(vec3(0.03,0.06,0.11),vec3(0.05,0.12,0.18),p.y/1080.0);
 vec3 color=bg;

 // Main UI card
 float card=fill(box(p,vec2(960.0,540.0),vec2(860.0,470.0),18.0));
 color=mix(color,vec3(0.07,0.11,0.17),card);

 // Top title bar
 float titleBar=fill(box(p,vec2(960.0,115.0),vec2(820.0,28.0),10.0));
 color=mix(color,vec3(0.12,0.22,0.34),titleBar*0.7);

 // State banner color
 vec3 bannerCol=vec3(0.2,0.3,0.4);
 if(c.game.z==1u||c.game.z==3u){
  float pulse=0.5+0.5*sin(c.motion.x*8.0);
  bannerCol=mix(vec3(0.1,0.4,0.7),vec3(0.2,0.7,0.9),pulse);
 }else if(c.game.z==2u||c.game.z==4u){
  bannerCol=c.piece.x>=200&&c.piece.x<300?vec3(0.15,0.65,0.35):vec3(0.75,0.25,0.25);
 }else if(c.game.z==5u){
  bannerCol=vec3(0.8,0.2,0.2);
 }
 float statusBadge=fill(box(p,vec2(960.0,175.0),vec2(820.0,22.0),8.0));
 color=mix(color,bannerCol,statusBadge*0.35);

 float lineH=float(GLYPH_H)+6.0;

 // Header title
 float tInk=0.0;
 for(uint i=0u;i<TITLE_LEN;i++)tInk=max(tInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),100.0),TITLE_CHARS[i]));
 color=mix(color,vec3(0.4,0.9,1.0),tInk);

 // Status row
 float sInk=0.0;
 if(c.game.z==0u){
  for(uint i=0u;i<IDLE_LEN;i++)sInk=max(sInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),165.0),IDLE_CHARS[i]));
  color=mix(color,vec3(0.7,0.8,0.9),sInk);
 }else if(c.game.z==1u||c.game.z==3u){
  for(uint i=0u;i<REQ_LEN;i++)sInk=max(sInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),165.0),REQ_CHARS[i]));
  color=mix(color,vec3(0.3,0.9,1.0),sInk);
 }else if(c.game.z==2u||c.game.z==4u){
  for(uint i=0u;i<OK_LEN;i++)sInk=max(sInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),165.0),OK_CHARS[i]));
  color=mix(color,vec3(0.4,1.0,0.6),sInk);
 }else{
  for(uint i=0u;i<ERR_LEN;i++)sInk=max(sInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),165.0),ERR_CHARS[i]));
  color=mix(color,vec3(1.0,0.4,0.4),sInk);
 }

 // Response Body or Download Confirmation
 if(c.game.z==2u){
  for(uint l=0u;l<14u;l++){
   vec2 o=vec2(160.0,240.0+float(l)*lineH);
   float ink=drawBodyLine(p,o,l);
   color=mix(color,vec3(0.85,0.92,1.0),ink);
  }
 }else if(c.game.z==4u){
  float dInk=0.0;
  for(uint i=0u;i<DL_LEN;i++)dInk=max(dInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),260.0),DL_CHARS[i]));
  color=mix(color,vec3(0.4,1.0,0.7),dInk);
 }

 // Bottom instruction footer
 float fInk=0.0;
 for(uint i=0u;i<FOOT_LEN;i++)fInk=max(fInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),960.0),FOOT_CHARS[i]));
 color=mix(color,vec3(0.95,0.85,0.4),fInk);

 outColor=vec4(color,1.0);
}
