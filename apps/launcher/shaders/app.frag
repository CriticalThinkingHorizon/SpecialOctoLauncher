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

// Header: "S2 HOMEBREW LAUNCHER  |  A: Select  |  Y: Cache All  |  X: Sync" (63 chars)
const uint HEADER_LEN = 63u;
const uint HEADER_CHARS[63] = uint[63](
 83u,50u,32u,72u,79u,77u,69u,66u,82u,69u,87u,32u,76u,65u,85u,78u,67u,72u,69u,82u,
 32u,32u,124u,32u,32u,65u,58u,32u,83u,101u,108u,101u,99u,116u,
 32u,32u,124u,32u,32u,89u,58u,32u,67u,97u,99u,104u,101u,32u,65u,108u,108u,
 32u,32u,124u,32u,32u,88u,58u,32u,83u,121u,110u,99u
);

// Loading message: "LOADING APPLICATION... PLEASE WAIT" (34 chars)
const uint LOAD_LEN = 34u;
const uint LOAD_CHARS[34] = uint[34](
 76u,79u,65u,68u,73u,78u,71u,32u,65u,80u,80u,76u,73u,67u,65u,84u,73u,79u,78u,46u,46u,46u,32u,
 80u,76u,69u,65u,83u,69u,32u,87u,65u,73u,84u
);

// Caching message: "CACHING APPS TO TMP:/ AND MEMORY..." (35 chars)
const uint CACHE_MSG_LEN = 35u;
const uint CACHE_MSG_CHARS[35] = uint[35](
 67u,65u,67u,72u,73u,78u,71u,32u,65u,80u,80u,83u,32u,84u,79u,32u,
 84u,77u,80u,58u,47u,32u,65u,78u,68u,32u,77u,69u,77u,79u,82u,89u,
 46u,46u,46u
);

// Cached badge: "[CACHED]" (8 chars)
const uint CACHED_LEN = 8u;
const uint CACHED_CHARS[8] = uint[8](
 91u,67u,65u,67u,72u,69u,68u,93u
);

float drawHeader(vec2 p,vec2 origin){
 float ink=0.0;
 for(uint i=0u;i<HEADER_LEN;i++){
  ink=max(ink,drawChar(p,origin+vec2(float(i*uint(GLYPH_W)),0.0),HEADER_CHARS[i]));
 }
 return ink;
}

float drawLoadingText(vec2 p,vec2 origin){
 float ink=0.0;
 for(uint i=0u;i<LOAD_LEN;i++){
  ink=max(ink,drawChar(p,origin+vec2(float(i*uint(GLYPH_W)),0.0),LOAD_CHARS[i]));
 }
 return ink;
}

float drawCachingText(vec2 p,vec2 origin){
 float ink=0.0;
 for(uint i=0u;i<CACHE_MSG_LEN;i++){
  ink=max(ink,drawChar(p,origin+vec2(float(i*uint(GLYPH_W)),0.0),CACHE_MSG_CHARS[i]));
 }
 return ink;
}

float drawCachedBadge(vec2 p,vec2 origin){
 float ink=0.0;
 for(uint i=0u;i<CACHED_LEN;i++){
  ink=max(ink,drawChar(p,origin+vec2(float(i*uint(GLYPH_W)),0.0),CACHED_CHARS[i]));
 }
 return ink;
}

void main(){
 vec2 p=gl_FragCoord.xy;

 // CRT screen center and active tube dimensions (1760 x 980 inside 1920 x 1080)
 vec2 screenCenter=vec2(960.0,540.0);
 vec2 tubeHalfSize=vec2(890.0,500.0);

 // Normalized tube coordinates [-1.0, 1.0]
 vec2 normUv=(p-screenCenter)/tubeHalfSize;

 // Authentic CRT barrel curvature distortion
 vec2 d=normUv*0.5;
 vec2 crtUv=normUv*(1.0+dot(d,d)*0.10);

 // Check if fragment is within the CRT tube glass
 bool insideTube=(abs(crtUv.x)<=1.0&&abs(crtUv.y)<=1.0);

 // Cabinet chassis color (dark vintage textured matte chassis)
 vec3 cabinetCol=mix(vec3(0.02,0.03,0.025),vec3(0.04,0.05,0.04),p.y/1080.0);

 // Outer CRT Bezel / Frame border
 float bezelBox=box(p,screenCenter,tubeHalfSize+vec2(24.0,24.0),30.0);
 float bezelFill=fill(bezelBox);
 cabinetCol=mix(cabinetCol,vec3(0.06,0.08,0.065),bezelFill);

 float bezelBorder=line(box(p,screenCenter,tubeHalfSize+vec2(6.0,6.0),22.0),4.0);
 cabinetCol=mix(cabinetCol,vec3(0.12,0.18,0.13),bezelBorder*0.6);

 // Power LED at bottom right of chassis
 float pwrLed=fill(box(p,vec2(1840.0,1035.0),vec2(10.0,6.0),3.0));
 cabinetCol=mix(cabinetCol,vec3(0.20,1.0,0.40),pwrLed*0.85);

 vec3 color=cabinetCol;

 if(insideTube){
  // Map curved CRT UV back to pixel sampling coordinates
  vec2 sp=crtUv*tubeHalfSize+screenCenter;

  // Vintage P31 phosphor green cathode background
  vec3 crtBg=mix(vec3(0.015,0.055,0.025),vec3(0.025,0.090,0.038),sp.y/1080.0);

  // Subtle tube glass edge vignette
  float vig=clamp(1.0-dot(crtUv*0.48,crtUv*0.48),0.0,1.0);
  crtBg*=vig;

  // Render header
  float headerInk=drawHeader(sp,vec2(120.0,64.0));
  vec3 tubeColor=mix(crtBg,vec3(0.40,1.0,0.60),headerInk);

  // Horizontal phosphor divider line under header
  if(abs(sp.y-112.0)<1.5&&sp.x>=110.0&&sp.x<=1810.0){
   tubeColor=mix(tubeColor,vec3(0.30,0.90,0.45),0.75);
  }

  float rowH=float(GLYPH_H)+32.0;
  vec2 left=vec2(120.0,160.0);
  uint count=c.game.z==2u?min(c.game.w,15u):0u;
  uint selected=c.game.y;

  for(uint i=0u;i<15u;i++){
   if(i>=count)break;
   vec2 origin=left+vec2(0.0,float(i)*rowH);
   float textInk=drawRowTitle(sp,origin,i);
   uint rowType=hbFsEntryType(i);

   // Phosphor color themes: Amber warning for EXIT, Cyan for UPDATE, Neon Green for apps
   vec3 textCol=rowType==3u?vec3(1.0,0.42,0.25):(rowType==2u?vec3(0.40,1.0,0.85):vec3(0.35,0.95,0.50));

   if(i==selected){
    float bar=fill(box(sp,origin+vec2(520.0,float(GLYPH_H)*0.5),vec2(540.0,float(GLYPH_H)*0.5+10.0),8.0));
    float barOutline=line(box(sp,origin+vec2(520.0,float(GLYPH_H)*0.5),vec2(540.0,float(GLYPH_H)*0.5+10.0),8.0),2.0);

    vec3 barCol=rowType==3u?vec3(0.65,0.18,0.12):(rowType==2u?vec3(0.12,0.60,0.45):vec3(0.20,0.85,0.38));
    vec3 selTextCol=(rowType==2u||rowType==3u)?vec3(1.0,1.0,0.95):vec3(0.02,0.07,0.03);

    tubeColor=mix(tubeColor,barCol,bar*0.9);
    tubeColor=mix(tubeColor,vec3(0.60,1.0,0.70),barOutline*0.8);
    tubeColor=mix(tubeColor,selTextCol,textInk);
   }else{
    // Faint phosphor glow under non-selected text
    tubeColor=mix(tubeColor,textCol,textInk);
   }

   // Draw [CACHED] badge if this app entry is cached in memory / tmp:/
   if((c.stats.x&(1u<<i))!=0u){
    vec2 badgeOrigin=origin+vec2(860.0,0.0);
    float badgeInk=drawCachedBadge(sp,badgeOrigin);
    vec3 badgeCol=(i==selected)?vec3(0.05,0.18,0.08):vec3(0.35,0.95,0.85);
    tubeColor=mix(tubeColor,badgeCol,badgeInk);
   }
  }

  // Show loading modal + animated progress bar when launching an app or caching apps
  if(c.reserved.z!=0u||c.game.z!=2u){
   tubeColor*=0.30;
   vec2 center=vec2(960.0,540.0);
   float modal=fill(box(sp,center,vec2(420.0,110.0),16.0));
   float border=line(box(sp,center,vec2(420.0,110.0),16.0),3.0);
   tubeColor=mix(tubeColor,vec3(0.03,0.09,0.04),modal);
   tubeColor=mix(tubeColor,vec3(0.35,1.0,0.55),border);

   float modalInk=0.0;
   if(c.game.z==3u){
    float textW=float(CACHE_MSG_LEN*uint(GLYPH_W));
    modalInk=drawCachingText(sp,vec2(960.0-textW*0.5,485.0));
   }else{
    float textW=float(LOAD_LEN*uint(GLYPH_W));
    modalInk=drawLoadingText(sp,vec2(960.0-textW*0.5,485.0));
   }
   tubeColor=mix(tubeColor,vec3(0.60,1.0,0.75),modalInk);

   // Animated retro phosphor progress bar
   float track=fill(box(sp,vec2(960.0,575.0),vec2(320.0,10.0),4.0));
   tubeColor=mix(tubeColor,vec3(0.015,0.05,0.02),track);
   float phase=fract(c.motion.x*0.9);
   float barX=960.0-220.0+phase*440.0;
   float pulse=fill(box(sp,vec2(barX,575.0),vec2(90.0,10.0),4.0))*track;
   tubeColor=mix(tubeColor,vec3(0.35,1.0,0.60),pulse);
  }

  // === CRT Raster Post-Processing ===
  // 1. High-frequency horizontal TV scanlines (fine pitch)
  float scanline=0.80+0.20*cos(sp.y*3.14159265);

  // 2. Vertical phosphor aperture grille shadow mask
  float shadowMask=0.92+0.08*sin(sp.x*3.14159265*0.5);

  // 3. 60Hz cathode electron beam sweep
  float beamTrace=1.0+0.03*sin(sp.y*0.015-c.motion.x*15.0);

  // Apply CRT raster characteristics
  tubeColor=tubeColor*scanline*shadowMask*beamTrace;

  // Soft inner tube border shadow (vignette at the glass edge)
  float edgeDist=max(abs(crtUv.x),abs(crtUv.y));
  float tubeBorderShadow=smoothstep(1.0,0.92,edgeDist);
  tubeColor*=tubeBorderShadow;

  color=tubeColor;
 }

 outColor=vec4(color,1.0);
}
