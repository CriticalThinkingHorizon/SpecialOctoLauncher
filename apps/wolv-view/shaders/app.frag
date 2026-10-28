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

// "WOLVERINE 1080P VIEWER (nn::http)" (33 chars)
const uint T_LEN = 33u;
const uint T_CHARS[33] = uint[33](
 87u,79u,76u,86u,69u,82u,73u,78u,69u,32u,49u,48u,56u,48u,80u,32u,86u,73u,69u,87u,69u,82u,32u,40u,110u,110u,58u,58u,104u,116u,116u,112u,41u
);

// "URL: https://ferreirapablo.com/files/wolv.png" (45 chars)
const uint U_LEN = 45u;
const uint U_CHARS[45] = uint[45](
 85u,82u,76u,58u,32u,104u,116u,116u,112u,115u,58u,47u,47u,102u,101u,114u,114u,101u,105u,114u,97u,112u,97u,98u,108u,111u,46u,99u,111u,109u,47u,102u,105u,108u,101u,115u,47u,119u,111u,108u,118u,46u,112u,110u,103u
);

// "DOWNLOADING & DECODING IMAGE DIRECTLY TO GPU..." (47 chars)
const uint D_LEN = 47u;
const uint D_CHARS[47] = uint[47](
 68u,79u,87u,78u,76u,79u,65u,68u,73u,78u,71u,32u,38u,32u,68u,69u,67u,79u,68u,73u,78u,71u,32u,73u,77u,65u,71u,69u,32u,68u,73u,82u,69u,67u,84u,76u,89u,32u,84u,79u,32u,71u,80u,85u,46u,46u,46u
);

// "ERROR: Download or decoding failed" (34 chars)
const uint E_LEN = 34u;
const uint E_CHARS[34] = uint[34](
 69u,82u,82u,79u,82u,58u,32u,68u,111u,119u,110u,108u,111u,97u,100u,32u,111u,114u,32u,100u,101u,99u,111u,100u,105u,110u,103u,32u,102u,97u,105u,108u,101u,100u
);

// "[A] Reload    [X] Toggle Fullscreen HUD    [-] Exit" (49 chars)
const uint F_LEN = 49u;
const uint F_CHARS[49] = uint[49](
 91u,65u,93u,32u,82u,101u,108u,111u,97u,100u,32u,32u,32u,91u,88u,93u,32u,84u,111u,103u,103u,108u,101u,32u,70u,117u,108u,108u,115u,99u,114u,101u,101u,110u,32u,72u,85u,68u,32u,32u,32u,91u,45u,93u,32u,69u,120u,105u,116u
);

// "WOLVERINE (1920x1080 RGBA)  |  Downloaded via nn::http" (54 chars)
const uint H_LEN = 54u;
const uint H_CHARS[54] = uint[54](
 87u,79u,76u,86u,69u,82u,73u,78u,69u,32u,40u,49u,57u,50u,48u,120u,49u,48u,56u,48u,32u,82u,71u,66u,65u,41u,32u,32u,124u,32u,32u,68u,111u,119u,110u,108u,111u,97u,100u,101u,100u,32u,118u,105u,97u,32u,110u,110u,58u,58u,104u,116u,116u,112u
);

void main(){
 vec2 p=gl_FragCoord.xy;

 // When image is ready (c.game.z == 2u), sample directly from mapped buffer at offset 1024
 if(c.game.z==2u){
  int px=int(p.x);
  int py=int(p.y); // Vulkan gl_FragCoord.y=0 is at top of screen
  px=clamp(px,0,1919);
  py=clamp(py,0,1079);

  uint pixelIdx=uint(py*1920+px);
  uint word=c.atlas[pixelIdx]; // c.atlas[0] starts directly at byte 1024

  vec3 imgColor=vec3(
   float(word&255u)/255.0,
   float((word>>8u)&255u)/255.0,
   float((word>>16u)&255u)/255.0
  );

  vec3 color=imgColor;

  // If HUD is enabled (c.game.w == 1u), render translucent bottom info bar
  if(c.game.w==1u){
   float hudBar=fill(box(p,vec2(960.0,1000.0),vec2(860.0,40.0),12.0));
   color=mix(color,vec3(0.04,0.08,0.14),hudBar*0.82);

   float hInk=0.0;
   for(uint i=0u;i<H_LEN;i++){
    hInk=max(hInk,drawChar(p,vec2(160.0+float(i*uint(GLYPH_W)),988.0),H_CHARS[i]));
   }
   color=mix(color,vec3(0.95,0.85,0.25),hInk*hudBar);
  }

  outColor=vec4(color,1.0);
  return;
 }

 // Loading / downloading screen
 vec3 bg=mix(vec3(0.05,0.08,0.15),vec3(0.08,0.14,0.24),p.y/1080.0);
 vec3 color=bg;

 // Center Card
 float card=fill(box(p,vec2(960.0,540.0),vec2(760.0,300.0),20.0));
 float border=line(box(p,vec2(960.0,540.0),vec2(760.0,300.0),20.0),3.0);
 color=mix(color,vec3(0.08,0.12,0.20),card);
 color=mix(color,vec3(0.95,0.75,0.20),border*0.8);

 // Title
 float tInk=0.0;
 for(uint i=0u;i<T_LEN;i++)tInk=max(tInk,drawChar(p,vec2(260.0+float(i*uint(GLYPH_W)),340.0),T_CHARS[i]));
 color=mix(color,vec3(0.95,0.82,0.20),tInk);

 // URL
 float uInk=0.0;
 for(uint i=0u;i<U_LEN;i++)uInk=max(uInk,drawChar(p,vec2(260.0+float(i*uint(GLYPH_W)),410.0),U_CHARS[i]));
 color=mix(color,vec3(0.50,0.85,1.0),uInk);

 // Status
 float sInk=0.0;
 if(c.game.z==5u){
  for(uint i=0u;i<E_LEN;i++)sInk=max(sInk,drawChar(p,vec2(260.0+float(i*uint(GLYPH_W)),480.0),E_CHARS[i]));
  color=mix(color,vec3(1.0,0.35,0.35),sInk);
 }else{
  for(uint i=0u;i<D_LEN;i++)sInk=max(sInk,drawChar(p,vec2(260.0+float(i*uint(GLYPH_W)),480.0),D_CHARS[i]));
  color=mix(color,vec3(0.35,1.0,0.65),sInk);

  // Animated sliding progress bar
  float track=fill(box(p,vec2(960.0,560.0),vec2(700.0,12.0),6.0));
  color=mix(color,vec3(0.04,0.06,0.10),track);

  float phase=fract(c.motion.x*0.8);
  float barX=960.0-300.0+phase*600.0;
  float barPulse=fill(box(p,vec2(barX,560.0),vec2(120.0,12.0),6.0))*track;
  color=mix(color,vec3(0.95,0.80,0.20),barPulse);
 }

 // Bottom footer instructions
 float fInk=0.0;
 for(uint i=0u;i<F_LEN;i++)fInk=max(fInk,drawChar(p,vec2(260.0+float(i*uint(GLYPH_W)),680.0),F_CHARS[i]));
 color=mix(color,vec3(0.80,0.85,0.92),fInk);

 outColor=vec4(color,1.0);
}
