#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#define HB_READONLY
#include "abi.glsl"
#include "hb.glsl"
#include "text.glsl"
#include "draw.glsl"

const uint VM_BASE = 65536u;

float drawChar(vec2 p,vec2 origin,uint ch){
 if(ch<GLYPH_FIRST||ch>=GLYPH_FIRST+GLYPH_COUNT)return 0.0;
 uint idx=ch-GLYPH_FIRST;
 ivec4 rect=ivec4(int(idx%uint(GLYPH_COLS))*GLYPH_W,int(idx/uint(GLYPH_COLS))*GLYPH_H,GLYPH_W,GLYPH_H);
 return text(p,origin,rect);
}

// "CHIP-8 VIRTUAL MACHINE - COMPUTE SHADER RUNNER" (46 chars)
const uint T_LEN = 46u;
const uint T_CHARS[46] = uint[46](
 67u,72u,73u,80u,45u,56u,32u,86u,73u,82u,84u,85u,65u,76u,32u,77u,65u,67u,72u,73u,78u,69u,32u,45u,32u,67u,79u,77u,80u,85u,84u,69u,32u,83u,72u,65u,68u,69u,82u,32u,82u,85u,78u,78u,69u,82u
);

// "ROM: tmp:/rom.ch8 (Loaded from S2 tmp:/)" (40 chars)
const uint R_TMP_LEN = 40u;
const uint R_TMP_CHARS[40] = uint[40](
 82u,79u,77u,58u,32u,116u,109u,112u,58u,47u,114u,111u,109u,46u,99u,104u,56u,32u,40u,76u,111u,97u,100u,101u,100u,32u,102u,114u,111u,109u,32u,83u,50u,32u,116u,109u,112u,58u,47u,41u
);

// "ROM: BUILT-IN DEMO (Drop rom.ch8 into tmp:/)" (44 chars)
const uint R_DEMO_LEN = 44u;
const uint R_DEMO_CHARS[44] = uint[44](
 82u,79u,77u,58u,32u,66u,85u,73u,76u,84u,45u,73u,78u,32u,68u,69u,77u,79u,32u,40u,68u,114u,111u,112u,32u,114u,111u,109u,46u,99u,104u,56u,32u,105u,110u,116u,111u,32u,116u,109u,112u,58u,47u,41u
);

// "[A] Reload tmp:/   [X] Palette   [Y] Speed   [+] Reset   [-] Exit" (61 chars)
const uint F_LEN = 61u;
const uint F_CHARS[61] = uint[61](
 91u,65u,93u,32u,82u,101u,108u,111u,97u,100u,32u,116u,109u,112u,58u,47u,32u,32u,91u,88u,93u,32u,80u,97u,108u,101u,116u,116u,101u,32u,32u,91u,89u,93u,32u,83u,112u,101u,101u,100u,32u,32u,91u,43u,93u,32u,82u,101u,115u,101u,116u,32u,32u,91u,45u,93u,32u,69u,120u,105u,116u
);

void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 bg=mix(vec3(0.02,0.03,0.04),vec3(0.04,0.06,0.08),p.y/1080.0);
 vec3 color=bg;

 // Outer cabinet / chassis
 float chassis=fill(box(p,vec2(960.0,540.0),vec2(860.0,470.0),20.0));
 color=mix(color,vec3(0.08,0.10,0.12),chassis);

 // Top title frame
 float titleBar=fill(box(p,vec2(960.0,90.0),vec2(820.0,24.0),8.0));
 color=mix(color,vec3(0.12,0.16,0.20),titleBar*0.8);

 // Draw header
 float tInk=0.0;
 for(uint i=0u;i<T_LEN;i++)tInk=max(tInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),78.0),T_CHARS[i]));
 color=mix(color,vec3(0.35,0.95,0.65),tInk);

 // Draw ROM Status row
 float rInk=0.0;
 if(c.game.x==1u){
  for(uint i=0u;i<R_TMP_LEN;i++)rInk=max(rInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),125.0),R_TMP_CHARS[i]));
  color=mix(color,vec3(0.4,1.0,0.7),rInk);
 }else{
  for(uint i=0u;i<R_DEMO_LEN;i++)rInk=max(rInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),125.0),R_DEMO_CHARS[i]));
  color=mix(color,vec3(1.0,0.85,0.4),rInk);
 }

 // CRT Display Monitor Area: 1280 x 640 pixels centered at (960, 520)
 // X: [320, 1600], Y: [200, 840]
 vec2 screenMin=vec2(320.0,200.0);
 vec2 screenMax=vec2(1600.0,840.0);
 vec2 screenSize=screenMax-screenMin;

 // CRT screen bezel
 float bezel=fill(box(p,vec2(960.0,520.0),vec2(656.0,336.0),16.0));
 color=mix(color,vec3(0.04,0.05,0.06),bezel);
 float bezelBorder=line(box(p,vec2(960.0,520.0),vec2(656.0,336.0),16.0),3.0);
 color=mix(color,vec3(0.25,0.30,0.35),bezelBorder*0.7);

 // Color Palettes:
 // 0 = Phosphor Green, 1 = Amber Glow, 2 = Cyber Cyan, 3 = Monochrome B&W
 uint pal=uint(c.flow.x)%4u;
 vec3 fgCol=vec3(0.25,1.0,0.45);
 vec3 bgCol=vec3(0.04,0.12,0.06);
 if(pal==1u){
  fgCol=vec3(1.0,0.72,0.15);
  bgCol=vec3(0.12,0.06,0.01);
 }else if(pal==2u){
  fgCol=vec3(0.15,0.92,1.0);
  bgCol=vec3(0.03,0.09,0.16);
 }else if(pal==3u){
  fgCol=vec3(0.96,0.96,0.96);
  bgCol=vec3(0.08,0.08,0.08);
 }

 if(p.x>=screenMin.x&&p.x<screenMax.x&&p.y>=screenMin.y&&p.y<screenMax.y){
  // Pixel inside CHIP-8 display
  int screenX=int((p.x-screenMin.x)/20.0);
  int screenY=int((screenMax.y-p.y)/20.0); // row 0 at top!
  screenX=clamp(screenX,0,63);
  screenY=clamp(screenY,0,31);

  bool pixelOn=((c.atlas[VM_BASE+1056u+uint(screenX)]>>uint(screenY))&1u)!=0u;

  // Grid line gap: slight 1-pixel darkening at pixel borders
  vec2 cellFrac=fract((p-screenMin)/20.0);
  float gridGap=(cellFrac.x<0.08||cellFrac.y<0.08)?0.82:1.0;

  // Scanline effect (alternating scanlines)
  float scanline=0.88+0.12*sin(p.y*3.14159/2.0);

  vec3 crtColor=pixelOn?fgCol:bgCol;

  // Subtle phosphor glow from neighbors
  if(!pixelOn){
   int left=max(0,screenX-1),right=min(63,screenX+1);
   bool nearOn=(((c.atlas[VM_BASE+1056u+uint(left)]>>uint(screenY))&1u)!=0u)||
               (((c.atlas[VM_BASE+1056u+uint(right)]>>uint(screenY))&1u)!=0u);
   if(nearOn)crtColor=mix(bgCol,fgCol,0.12);
  }

  color=crtColor*gridGap*scanline;
 }

 // Bottom footer instructions
 float fInk=0.0;
 for(uint i=0u;i<F_LEN;i++)fInk=max(fInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),960.0),F_CHARS[i]));
 color=mix(color,vec3(0.95,0.85,0.40),fInk);

 outColor=vec4(color,1.0);
}
