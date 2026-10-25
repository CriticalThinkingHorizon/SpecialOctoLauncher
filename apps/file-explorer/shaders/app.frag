#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#define HB_READONLY
#include "abi.glsl"
#include "hb.glsl"
#include "text.glsl"
#include "draw.glsl"

// Coverage of one glyph, looked up from the font atlas in text.bin.
float drawChar(vec2 p,vec2 origin,uint ch){
 if(ch<GLYPH_FIRST||ch>=GLYPH_FIRST+GLYPH_COUNT)return 0.0;
 uint idx=ch-GLYPH_FIRST;
 ivec4 rect=ivec4(int(idx%uint(GLYPH_COLS))*GLYPH_W,int(idx/uint(GLYPH_COLS))*GLYPH_H,GLYPH_W,GLYPH_H);
 return text(p,origin,rect);
}

// Entry name from the fs response, with a trailing '/' for directories.
float drawName(vec2 p,vec2 origin,uint entry){
 float ink=0.0;
 uint k=0u;
 for(uint i=0u;i<47u;i++){
  uint ch=hbFsEntryByte(entry,i);
  if(ch==0u)break;
  ink=max(ink,drawChar(p,origin+vec2(float(i*uint(GLYPH_W)),0.0),ch));
  k=i+1u;
 }
 if(hbFsEntryType(entry)==1u)ink=max(ink,drawChar(p,origin+vec2(float(k*uint(GLYPH_W)),0.0),47u));
 return ink;
}

// Current path, stored by the compute shader in app scratch.
float drawPath(vec2 p,vec2 origin){
 float ink=0.0;
 uint n=uint(max(c.piece.x,0));
 for(uint i=0u;i<63u&&i<n;i++){
  uint ch=(c.rows[i/4u]>>((i%4u)*8u))&255u;
  ink=max(ink,drawChar(p,origin+vec2(float(i*uint(GLYPH_W)),0.0),ch));
 }
 return ink;
}

void main(){
 vec2 p=gl_FragCoord.xy;
 float rowH=float(GLYPH_H)+24.0;
 vec2 left=vec2(120.0,160.0);
 uint count=c.game.z==2u?min(c.game.w,8u):0u;
 uint selected=c.game.y;

 float ink=drawPath(p,vec2(120.0,100.0));

 for(uint i=0u;i<8u;i++){
  if(i>=count)break;
  vec2 origin=left+vec2(0.0,float(i)*rowH);
  float text_ink=drawName(p,origin,i);
  if(i==selected){
   float bar=fill(box(p,origin+vec2(900.0,float(GLYPH_H)*0.5),vec2(900.0,float(GLYPH_H)*0.5+8.0),8.0));
   // White bar with black text on the selected row.
   ink=max(ink,bar*(1.0-text_ink)+(1.0-bar)*text_ink);
  }else{
   ink=max(ink,text_ink);
  }
 }

 outColor=vec4(vec3(ink),1);
}
