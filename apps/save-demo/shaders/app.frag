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
 
 // CRT Phosphor gradient background
 vec3 bg=mix(vec3(0.03,0.06,0.08),vec3(0.05,0.11,0.14),p.y/1080.0);
 // Subtle scanline effect
 bg*=0.97+0.03*sin(p.y*1.5);
 vec3 color=bg;

 // Outer card container
 float card=fill(box(p,vec2(960.0,540.0),vec2(880.0,480.0),16.0));
 color=mix(color,vec3(0.06,0.12,0.16),card);

 // Top Status Banner / Badge
 if(c.game.z==1u){
  float badge=fill(box(p,vec2(960.0,78.0),vec2(840.0,22.0),8.0));
  color=mix(color,vec3(0.85,0.65,0.15),badge*0.55);
 }else if(c.game.z==2u){
  uint action=c.game.y;
  uint saveRes=hbWord(4136u);
  uint commitRes=hbWord(4140u);
  vec3 badgeCol=vec3(0.20,0.75,0.40); // default green
  if(action==2u)badgeCol=vec3(0.90,0.50,0.20); // orange for clean
  else if(action==1u)badgeCol=vec3(0.25,0.65,0.95); // blue for verify
  else if(commitRes!=0u||saveRes!=0u)badgeCol=vec3(0.85,0.25,0.25); // red for error

  float badge=fill(box(p,vec2(960.0,78.0),vec2(840.0,22.0),8.0));
  color=mix(color,badgeCol,badge*0.45);
 }

 uint lines=c.game.z==2u?min(c.game.w,20u):0u;
 float lineH=float(GLYPH_H)+7.0;
 vec2 startPos=vec2(130.0,90.0);

 for(uint i=0u;i<20u;i++){
  if(i>=lines)break;
  vec2 origin=startPos+vec2(0.0,float(i)*lineH);
  float ink=drawReportLine(p,origin,i);
  
  vec3 lineCol=vec3(0.90,0.95,0.98);
  uint b0=hbFsTextByte(i,0u);
  uint b2=hbFsTextByte(i,2u);
  
  if(i==0u)lineCol=vec3(0.40,0.95,1.0); // Main title line
  else if(b0==91u)lineCol=vec3(0.98,0.86,0.40); // '[' Step / Section header
  else if(b2==83u)lineCol=vec3(0.35,1.0,0.60);  // '  STATUS:'
  else if(b0==45u)lineCol=vec3(0.55,0.85,0.75); // '---' Separator
  else if(i==19u)lineCol=vec3(0.95,0.85,0.45);  // Bottom controls legend
  
  color=mix(color,lineCol,ink);
 }

 outColor=vec4(color,1.0);
}
