#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "draw.glsl"
#include "text.glsl"

uint getTouchCount(){ return min(c.touch[2], 16u); }
// Native S2 touchscreen digitizer reports in 1280x720 space; scale 1.5x to match 1920x1080 swapchain
vec2 getTouchPoint(uint index){
 return vec2(float(c.touch[8u + index * 10u]) * 1.5, float(c.touch[9u + index * 10u]) * 1.5);
}
vec2 getRawTouchPoint(uint index){
 return vec2(float(c.touch[8u + index * 10u]), float(c.touch[9u + index * 10u]));
}

float drawChar(vec2 p,vec2 origin,uint ascii){
 if(ascii<GLYPH_FIRST||ascii>=GLYPH_FIRST+GLYPH_COUNT)return 0.0;
 uint idx=ascii-GLYPH_FIRST;
 ivec4 rect=ivec4(int(idx%uint(GLYPH_COLS))*GLYPH_W,int(idx/uint(GLYPH_COLS))*GLYPH_H,GLYPH_W,GLYPH_H);
 return text(p,origin,rect);
}

float drawDigit(vec2 p,vec2 origin,uint d){
 if(d>9u)return 0.0;
 return drawChar(p,origin,48u+d);
}

float drawNumber4(vec2 p,vec2 origin,uint v){
 float ink=0.0;
 float gw=float(GLYPH_W);
 ink=max(ink,drawDigit(p,origin,v>=1000u?(v/1000u)%10u:32u));
 ink=max(ink,drawDigit(p,origin+vec2(gw,0.0),v>=100u?(v/100u)%10u:32u));
 ink=max(ink,drawDigit(p,origin+vec2(gw*2.0,0.0),v>=10u?(v/10u)%10u:32u));
 ink=max(ink,drawDigit(p,origin+vec2(gw*3.0,0.0),v%10u));
 return ink;
}

// "TOUCH SCREEN WAVES  |  TOUCHES: "
const uint TITLE_CHARS[] = uint[](
 84u,79u,85u,67u,72u,32u,83u,67u,82u,69u,69u,78u,32u,87u,65u,86u,69u,83u,
 32u,32u,124u,32u,32u,84u,79u,85u,67u,72u,69u,83u,58u,32u
);
const uint TITLE_LEN = uint(TITLE_CHARS.length());

// "TOUCH / DRAG: Waves  |  X: Palette  |  Y: Shockwave  |  A: Clear  |  -: Exit"
const uint HINT_CHARS[] = uint[](
 84u,79u,85u,67u,72u,32u,47u,32u,68u,82u,65u,71u,58u,32u,87u,97u,118u,101u,115u,
 32u,32u,124u,32u,32u,88u,58u,32u,80u,97u,108u,101u,116u,116u,101u,
 32u,32u,124u,32u,32u,89u,58u,32u,83u,104u,111u,99u,107u,119u,97u,118u,101u,
 32u,32u,124u,32u,32u,65u,58u,32u,67u,108u,101u,97u,114u,
 32u,32u,124u,32u,32u,45u,58u,32u,69u,120u,105u,116u
);
const uint HINT_LEN = uint(HINT_CHARS.length());

void main(){
 vec2 p = gl_FragCoord.xy;
 vec2 sp = p;
 float t = c.motion.x;

 // Background deep abyss
 vec3 tubeColor = mix(vec3(0.015, 0.025, 0.05), vec3(0.025, 0.05, 0.09), sp.y / 1080.0);

 // Palette selection (0=Cyan, 1=Emerald, 2=Magenta, 3=Amber)
 uint pal = c.game.x % 4u;
 vec3 waveColor1 = (pal == 0u) ? vec3(0.15, 0.85, 1.0) :
                   ((pal == 1u) ? vec3(0.20, 1.0, 0.45) :
                   ((pal == 2u) ? vec3(1.0, 0.25, 0.75) : vec3(1.0, 0.75, 0.20)));
 vec3 waveColor2 = (pal == 0u) ? vec3(0.40, 0.40, 1.0) :
                   ((pal == 1u) ? vec3(0.10, 0.60, 0.85) :
                   ((pal == 2u) ? vec3(0.70, 0.15, 1.0) : vec3(1.0, 0.35, 0.15)));

 // Ambient fluid ripples
 float ambientWave = sin(sp.x * 0.012 + t * 2.0) * cos(sp.y * 0.012 - t * 1.5) * 0.5 + 0.5;
 tubeColor += waveColor2 * ambientWave * 0.08;

 vec2 screenCenter = vec2(960.0, 540.0);

 // Central shockwave if active
 if(c.game.z > 0u){
  float shockRadius = float(180u - c.game.z) * 9.0;
  float distCenter = length(sp - screenCenter);
  float shockRing = abs(distCenter - shockRadius);
  float shockIntensity = exp(-shockRing * 0.06) * (float(c.game.z) / 180.0);
  tubeColor += waveColor1 * shockIntensity * 0.8;
 }

 // --- Multi-Touch Wave Simulation ---
 uint touchCount = min(getTouchCount(), 16u);
 float totalWave = 0.0;
 float markerInk = 0.0;

 for(uint i = 0u; i < 16u; i++){
  if(i >= touchCount) break;
  vec2 touchPt = getTouchPoint(i);
  if(touchPt.x <= 0.0 && touchPt.y <= 0.0) continue;

  float d = length(sp - touchPt);

  // Concentric wave ripple equation
  float ripple = sin(d * 0.09 - t * 8.0) * exp(-d * 0.0035);
  totalWave += ripple;

  // Touch point crosshair and glowing ring directly under finger
  float ring = abs(d - 32.0);
  float ringInk = smoothstep(3.0, 0.0, ring);
  float coreInk = smoothstep(10.0, 0.0, d);
  markerInk = max(markerInk, ringInk + coreInk);

  // Crosshair lines
  if((abs(sp.x - touchPt.x) < 1.5 && abs(sp.y - touchPt.y) < 48.0) ||
     (abs(sp.y - touchPt.y) < 1.5 && abs(sp.x - touchPt.x) < 48.0)){
   markerInk = max(markerInk, 0.85);
  }

  // Touch coordinates readout next to finger (smartly bounds-checked so it's always on screen)
  vec2 coordOrigin = touchPt + vec2(44.0, -16.0);
  if(coordOrigin.x > 1580.0) coordOrigin.x = touchPt.x - 300.0;
  if(coordOrigin.y > 1020.0) coordOrigin.y = touchPt.y - 48.0;
  if(coordOrigin.y < 80.0) coordOrigin.y = touchPt.y + 40.0;

  float cInk = drawDigit(sp, coordOrigin, i + 1u);
  cInk = max(cInk, drawChar(sp, coordOrigin + vec2(float(GLYPH_W), 0.0), 58u)); // :
  cInk = max(cInk, drawNumber4(sp, coordOrigin + vec2(float(GLYPH_W) * 2.5, 0.0), uint(touchPt.x)));
  cInk = max(cInk, drawChar(sp, coordOrigin + vec2(float(GLYPH_W) * 7.0, 0.0), 44u)); // ,
  cInk = max(cInk, drawNumber4(sp, coordOrigin + vec2(float(GLYPH_W) * 8.5, 0.0), uint(touchPt.y)));
  tubeColor = mix(tubeColor, vec3(1.0, 1.0, 1.0), cInk * 0.90);
 }

 // Wave interference glow
 tubeColor += waveColor1 * max(totalWave, 0.0) * 0.50;
 tubeColor += waveColor2 * max(-totalWave, 0.0) * 0.35;
 tubeColor = mix(tubeColor, vec3(1.0, 1.0, 1.0), markerInk);

 // Top and bottom border rails
 float topRail = fill(box(sp, vec2(960.0, 52.0), vec2(940.0, 2.0), 1.0));
 float botRail = fill(box(sp, vec2(960.0, 1028.0), vec2(940.0, 2.0), 1.0));
 tubeColor = mix(tubeColor, waveColor1 * 0.7, topRail + botRail);

 // Top Header: "TOUCH SCREEN WAVES  |  TOUCHES: <N>"
 float headerInk = 0.0;
 float gw = float(GLYPH_W);
 for(uint i = 0u; i < TITLE_LEN; i++){
  headerInk = max(headerInk, drawChar(sp, vec2(120.0 + float(i * uint(GLYPH_W)), 20.0), TITLE_CHARS[i]));
 }
 headerInk = max(headerInk, drawDigit(sp, vec2(120.0 + float(TITLE_LEN) * gw, 20.0), touchCount));
 tubeColor = mix(tubeColor, waveColor1, headerInk);

 // Bottom Navigation Hint Bar
 float hintInk = 0.0;
 for(uint i = 0u; i < HINT_LEN; i++){
  hintInk = max(hintInk, drawChar(sp, vec2(160.0 + float(i * uint(GLYPH_W)), 1045.0), HINT_CHARS[i]));
 }
 tubeColor = mix(tubeColor, vec3(0.65, 0.75, 0.85), hintInk);

 // Subtle CRT scanlines & edge vignette
 float scanline = 0.92 + 0.08 * cos(sp.y * 3.14159265);
 tubeColor *= scanline;
 vec2 uv = (sp - vec2(960.0, 540.0)) / vec2(960.0, 540.0);
 float edgeDist = max(abs(uv.x), abs(uv.y));
 tubeColor *= smoothstep(1.0, 0.96, edgeDist);

 outColor = vec4(tubeColor, 1.0);
}
