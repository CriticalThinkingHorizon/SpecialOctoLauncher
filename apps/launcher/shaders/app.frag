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

float drawRowTitle(vec2 p,vec2 origin,uint entry){
 float ink=0.0;
 for(uint i=0u;i<47u;i++){
  uint ch=hbFsEntryByte(entry,i);
  if(ch==0u)break;
  ink=max(ink,drawChar(p,origin+vec2(float(i*uint(GLYPH_W)),0.0),ch));
 }
 return ink;
}

// Header: "S2 HOMEBREW LAUNCHER  |  A: Launch / Update  |  X: Live Reload  |  +/-: Menu"
const uint HEADER_LEN = 46u;
const uint HEADER_CHARS[46] = uint[46](
 83u,50u,32u,72u,79u,77u,69u,66u,82u,69u,87u,32u,76u,65u,85u,78u,67u,72u,69u,82u,
 32u,32u,124u,32u,32u,65u,58u,32u,83u,101u,108u,101u,99u,116u,32u,32u,124u,32u,32u,88u,58u,32u,83u,121u,110u,99u
);

float drawHeader(vec2 p,vec2 origin){
 float ink=0.0;
 for(uint i=0u;i<HEADER_LEN;i++){
  ink=max(ink,drawChar(p,origin+vec2(float(i*uint(GLYPH_W)),0.0),HEADER_CHARS[i]));
 }
 return ink;
}

void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 bg=mix(vec3(0.03,0.07,0.13),vec3(0.05,0.14,0.22),p.y/1080.0);

 float headerInk=drawHeader(p,vec2(120.0,64.0));
 vec3 color=mix(bg,vec3(0.35,0.90,0.95),headerInk);

 float rowH=float(GLYPH_H)+32.0;
 vec2 left=vec2(120.0,160.0);
 uint count=c.game.z==2u?min(c.game.w,15u):0u;
 uint selected=c.game.y;

 for(uint i=0u;i<15u;i++){
  if(i>=count)break;
  vec2 origin=left+vec2(0.0,float(i)*rowH);
  float textInk=drawRowTitle(p,origin,i);
  uint rowType=hbFsEntryType(i);
  vec3 textCol=rowType==2u?vec3(0.4,1.0,0.6):vec3(0.92,0.96,1.0);
  if(i==selected){
   float bar=fill(box(p,origin+vec2(520.0,float(GLYPH_H)*0.5),vec2(540.0,float(GLYPH_H)*0.5+10.0),10.0));
   vec3 barCol=rowType==2u?vec3(0.15,0.65,0.40):vec3(0.88,0.95,1.0);
   vec3 selTextCol=rowType==2u?vec3(1.0):vec3(0.05,0.10,0.18);
   color=mix(color,barCol,bar);
   color=mix(color,selTextCol,textInk);
  }else{
   color=mix(color,textCol,textInk);
  }
 }

 outColor=vec4(color,1);
}
