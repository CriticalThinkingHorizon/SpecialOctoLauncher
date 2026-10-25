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

float drawReportLine(vec2 p,vec2 origin,uint lineIdx){
 float ink=0.0;
 for(uint col=0u;col<47u;col++){
  uint ch=hbFsTextByte(lineIdx,col);
  if(ch==0u)break;
  ink=max(ink,drawChar(p,origin+vec2(float(col*uint(GLYPH_W)),0.0),ch));
 }
 return ink;
}

void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 bg=mix(vec3(0.04,0.08,0.12),vec3(0.06,0.15,0.18),p.y/1080.0);
 vec3 color=bg;

 // Draw card container
 float card=fill(box(p,vec2(960.0,540.0),vec2(860.0,470.0),18.0));
 color=mix(color,vec3(0.07,0.12,0.18),card);

 // Status banner at top-right based on whether file existed before (hbWord(4132))
 if(c.game.z==2u){
  uint existedBefore=hbWord(4132u);
  uint createRes=hbWord(4136u);
  vec3 badgeCol=existedBefore==1u?vec3(0.15,0.65,0.35):(createRes==0u?vec3(0.20,0.50,0.80):vec3(0.75,0.20,0.20));
  float badge=fill(box(p,vec2(960.0,115.0),vec2(820.0,28.0),10.0));
  color=mix(color,badgeCol,badge*0.45);
 }

 uint lines=c.game.z==2u?min(c.game.w,20u):0u;
 float lineH=float(GLYPH_H)+8.0;
 vec2 startPos=vec2(160.0,100.0);

 for(uint i=0u;i<20u;i++){
  if(i>=lines)break;
  vec2 origin=startPos+vec2(0.0,float(i)*lineH);
  float ink=drawReportLine(p,origin,i);
  vec3 lineCol=vec3(0.92,0.96,1.0);
  if(i==0u)lineCol=vec3(0.45,0.95,1.0);
  else if(hbFsTextByte(i,0u)==91u)lineCol=vec3(0.98,0.86,0.42); // '[' section header
  else if(hbFsTextByte(i,2u)==83u)lineCol=vec3(0.45,1.0,0.65);  // '  STATUS:'
  color=mix(color,lineCol,ink);
 }

 outColor=vec4(color,1.0);
}
