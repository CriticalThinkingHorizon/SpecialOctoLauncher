#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "draw.glsl"
#include "text.glsl"

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

// "HD RUMBLE & HAPTICS LAB"
const uint TITLE_CHARS[] = uint[](
 72u,68u,32u,82u,85u,77u,66u,76u,69u,32u,38u,32u,72u,65u,80u,84u,73u,67u,83u,32u,76u,65u,66u
);
const uint TITLE_LEN = uint(TITLE_CHARS.length());

// "A: Left Joy-Con  |  B: Right Joy-Con  |  Y: Dual Stereo  |  X: Preset  |  -: Exit"
const uint HINT_CHARS[] = uint[](
 65u,58u,32u,76u,101u,102u,116u,32u,32u,124u,32u,32u,
 66u,58u,32u,82u,105u,103u,104u,116u,32u,32u,124u,32u,32u,
 89u,58u,32u,68u,117u,97u,108u,32u,83u,116u,101u,114u,101u,111u,32u,32u,124u,32u,32u,
 88u,58u,32u,80u,114u,101u,115u,101u,116u,32u,32u,124u,32u,32u,
 45u,58u,32u,69u,120u,105u,116u
);
const uint HINT_LEN = uint(HINT_CHARS.length());

void main(){
 vec2 p = gl_FragCoord.xy;
 vec2 screenCenter = vec2(960.0, 540.0);
 vec2 tubeHalfSize = vec2(890.0, 500.0);
 vec2 crtUv = (p - screenCenter) / tubeHalfSize;

 float crtR2 = dot(crtUv, crtUv);
 crtUv += crtUv * crtR2 * 0.025;
 bool insideTube = abs(crtUv.x) <= 1.0 && abs(crtUv.y) <= 1.0;

 vec3 color = vec3(0.015, 0.02, 0.035);

 if(insideTube){
  vec2 sp = crtUv * tubeHalfSize + screenCenter;
  vec3 tubeColor = mix(vec3(0.018, 0.025, 0.045), vec3(0.025, 0.04, 0.07), sp.y / 1080.0);

  float gw = float(GLYPH_W);
  float gh = float(GLYPH_H);

  // Top header rail
  float topRail = fill(box(sp, vec2(960.0, 54.0), vec2(880.0, 2.0), 1.0));
  float botRail = fill(box(sp, vec2(960.0, 1026.0), vec2(880.0, 2.0), 1.0));
  tubeColor = mix(tubeColor, vec3(0.9, 0.3, 0.6), topRail + botRail);

  // Header Title
  float titleInk = 0.0;
  for(uint i = 0u; i < TITLE_LEN; i++){
   titleInk = max(titleInk, drawChar(sp, vec2(120.0 + float(i) * gw, 22.0), TITLE_CHARS[i]));
  }
  tubeColor = mix(tubeColor, vec3(1.0, 0.40, 0.70), titleInk);

  // === LEFT JOY-CON MOTOR CARD (Left) ===
  vec2 leftCardPos = vec2(460.0, 300.0);
  vec2 cardHalf = vec2(340.0, 180.0);
  float leftCard = fill(box(sp, leftCardPos, cardHalf, 12.0));
  float leftBorder = line(box(sp, leftCardPos, cardHalf, 12.0), 2.0);
  tubeColor = mix(tubeColor, vec3(0.025, 0.05, 0.08), leftCard);
  tubeColor = mix(tubeColor, vec3(0.30, 0.85, 1.0), leftBorder);

  // Left Active Rumble Aura
  float leftAmp = c.flow.x;
  if(leftAmp > 0.01){
   float aura = fill(box(sp, leftCardPos, cardHalf + vec2(12.0, 12.0), 16.0));
   tubeColor += vec3(0.15, 0.50, 0.80) * aura * leftAmp * 0.5;
  }

  // Left Label: "LEFT MOTOR (SIDE 0)"
  vec2 leftLabelPos = vec2(160.0, 160.0);
  float lLabelInk = drawChar(sp, leftLabelPos, 76u); // L
  lLabelInk = max(lLabelInk, drawChar(sp, leftLabelPos + vec2(gw, 0.0), 69u)); // E
  lLabelInk = max(lLabelInk, drawChar(sp, leftLabelPos + vec2(gw * 2.0, 0.0), 70u)); // F
  lLabelInk = max(lLabelInk, drawChar(sp, leftLabelPos + vec2(gw * 3.0, 0.0), 84u)); // T
  lLabelInk = max(lLabelInk, drawChar(sp, leftLabelPos + vec2(gw * 4.0, 0.0), 32u));
  lLabelInk = max(lLabelInk, drawChar(sp, leftLabelPos + vec2(gw * 5.0, 0.0), 77u)); // M
  lLabelInk = max(lLabelInk, drawChar(sp, leftLabelPos + vec2(gw * 6.0, 0.0), 79u)); // O
  lLabelInk = max(lLabelInk, drawChar(sp, leftLabelPos + vec2(gw * 7.0, 0.0), 84u)); // T
  lLabelInk = max(lLabelInk, drawChar(sp, leftLabelPos + vec2(gw * 8.0, 0.0), 79u)); // O
  lLabelInk = max(lLabelInk, drawChar(sp, leftLabelPos + vec2(gw * 9.0, 0.0), 82u)); // R
  tubeColor = mix(tubeColor, vec3(0.40, 0.90, 1.0), lLabelInk);

  // Left Button trigger prompt: "[PRESS A]"
  vec2 lBtnPos = vec2(160.0, 420.0);
  float lBtnInk = drawChar(sp, lBtnPos, 91u);
  lBtnInk = max(lBtnInk, drawChar(sp, lBtnPos + vec2(gw, 0.0), 65u)); // A
  lBtnInk = max(lBtnInk, drawChar(sp, lBtnPos + vec2(gw * 2.0, 0.0), 93u));
  tubeColor = mix(tubeColor, vec3(0.20, 1.0, 0.60), lBtnInk);

  // === RIGHT JOY-CON MOTOR CARD (Right) ===
  vec2 rightCardPos = vec2(1460.0, 300.0);
  float rightCard = fill(box(sp, rightCardPos, cardHalf, 12.0));
  float rightBorder = line(box(sp, rightCardPos, cardHalf, 12.0), 2.0);
  tubeColor = mix(tubeColor, vec3(0.06, 0.025, 0.05), rightCard);
  tubeColor = mix(tubeColor, vec3(1.0, 0.35, 0.70), rightBorder);

  float rightAmp = c.flow.y;
  if(rightAmp > 0.01){
   float aura = fill(box(sp, rightCardPos, cardHalf + vec2(12.0, 12.0), 16.0));
   tubeColor += vec3(0.80, 0.20, 0.50) * aura * rightAmp * 0.5;
  }

  // Right Label: "RIGHT MOTOR (SIDE 1)"
  vec2 rightLabelPos = vec2(1160.0, 160.0);
  float rLabelInk = drawChar(sp, rightLabelPos, 82u); // R
  rLabelInk = max(rLabelInk, drawChar(sp, rightLabelPos + vec2(gw, 0.0), 73u)); // I
  rLabelInk = max(rLabelInk, drawChar(sp, rightLabelPos + vec2(gw * 2.0, 0.0), 71u)); // G
  rLabelInk = max(rLabelInk, drawChar(sp, rightLabelPos + vec2(gw * 3.0, 0.0), 72u)); // H
  rLabelInk = max(rLabelInk, drawChar(sp, rightLabelPos + vec2(gw * 4.0, 0.0), 84u)); // T
  tubeColor = mix(tubeColor, vec3(1.0, 0.40, 0.75), rLabelInk);

  // Right Button trigger prompt: "[PRESS B]"
  vec2 rBtnPos = vec2(1160.0, 420.0);
  float rBtnInk = drawChar(sp, rBtnPos, 91u);
  rBtnInk = max(rBtnInk, drawChar(sp, rBtnPos + vec2(gw, 0.0), 66u)); // B
  rBtnInk = max(rBtnInk, drawChar(sp, rBtnPos + vec2(gw * 2.0, 0.0), 93u));
  tubeColor = mix(tubeColor, vec3(0.20, 1.0, 0.60), rBtnInk);

  // === OSCILLOSCOPE WAVEFORM DISPLAY (Center Bottom) ===
  vec2 oscCenter = vec2(960.0, 720.0);
  vec2 oscHalf = vec2(840.0, 180.0);
  float oscBox = fill(box(sp, oscCenter, oscHalf, 12.0));
  float oscBorder = line(box(sp, oscCenter, oscHalf, 12.0), 2.0);
  tubeColor = mix(tubeColor, vec3(0.015, 0.03, 0.04), oscBox);
  tubeColor = mix(tubeColor, vec3(0.25, 0.70, 0.60), oscBorder);

  // Grid lines inside oscilloscope
  if(sp.x >= oscCenter.x - oscHalf.x && sp.x <= oscCenter.x + oscHalf.x &&
     sp.y >= oscCenter.y - oscHalf.y && sp.y <= oscCenter.y + oscHalf.y){
   if(abs(mod(sp.x, 80.0)) < 1.0 || abs(mod(sp.y, 60.0)) < 1.0){
    tubeColor += vec3(0.03, 0.08, 0.06);
   }
   // Center baseline
   if(abs(sp.y - oscCenter.y) < 1.2){
    tubeColor += vec3(0.10, 0.35, 0.25);
   }

   // Left Waveform (Cyan)
   float leftOscY = oscCenter.y - 40.0 + sin(sp.x * 0.04 + c.flow.w * 0.25) * (leftAmp * 70.0 + 4.0);
   float leftWaveDist = abs(sp.y - leftOscY);
   tubeColor += vec3(0.30, 0.90, 1.0) * smoothstep(3.0, 0.0, leftWaveDist);

   // Right Waveform (Magenta)
   float rightOscY = oscCenter.y + 40.0 + sin(sp.x * 0.04 - c.flow.w * 0.25) * (rightAmp * 70.0 + 4.0);
   float rightWaveDist = abs(sp.y - rightOscY);
   tubeColor += vec3(1.0, 0.30, 0.70) * smoothstep(3.0, 0.0, rightWaveDist);
  }

  // Preset Info readout
  vec2 pInfoPos = vec2(160.0, 560.0);
  float pInfoInk = drawChar(sp, pInfoPos, 80u); // P
  pInfoInk = max(pInfoInk, drawChar(sp, pInfoPos + vec2(gw, 0.0), 82u)); // R
  pInfoInk = max(pInfoInk, drawChar(sp, pInfoPos + vec2(gw * 2.0, 0.0), 69u)); // E
  pInfoInk = max(pInfoInk, drawChar(sp, pInfoPos + vec2(gw * 3.0, 0.0), 83u)); // S
  pInfoInk = max(pInfoInk, drawChar(sp, pInfoPos + vec2(gw * 4.0, 0.0), 69u)); // E
  pInfoInk = max(pInfoInk, drawChar(sp, pInfoPos + vec2(gw * 5.0, 0.0), 84u)); // T
  pInfoInk = max(pInfoInk, drawChar(sp, pInfoPos + vec2(gw * 6.0, 0.0), 58u)); // :
  pInfoInk = max(pInfoInk, drawDigit(sp, pInfoPos + vec2(gw * 8.0, 0.0), c.game.x + 1u));
  tubeColor = mix(tubeColor, vec3(0.9, 0.8, 0.3), pInfoInk);

  // Amplitude & Duration parameters
  vec2 paramPos = vec2(600.0, 560.0);
  float paramInk = drawChar(sp, paramPos, 65u); // A
  paramInk = max(paramInk, drawChar(sp, paramPos + vec2(gw, 0.0), 77u)); // M
  paramInk = max(paramInk, drawChar(sp, paramPos + vec2(gw * 2.0, 0.0), 80u)); // P
  paramInk = max(paramInk, drawChar(sp, paramPos + vec2(gw * 3.0, 0.0), 58u)); // :
  paramInk = max(paramInk, drawNumber4(sp, paramPos + vec2(gw * 5.0, 0.0), c.game.y));
  tubeColor = mix(tubeColor, vec3(0.40, 0.90, 0.80), paramInk);

  vec2 durPos = vec2(1100.0, 560.0);
  float durInk = drawChar(sp, durPos, 68u); // D
  durInk = max(durInk, drawChar(sp, durPos + vec2(gw, 0.0), 85u)); // U
  durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 2.0, 0.0), 82u)); // R
  durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 3.0, 0.0), 58u)); // :
  durInk = max(durInk, drawNumber4(sp, durPos + vec2(gw * 5.0, 0.0), c.game.z));
  tubeColor = mix(tubeColor, vec3(0.40, 0.90, 0.80), durInk);

  // Footer Navigation Hint Bar
  float hintInk = 0.0;
  for(uint i = 0u; i < HINT_LEN; i++){
   hintInk = max(hintInk, drawChar(sp, vec2(200.0 + float(i) * gw, 1045.0), HINT_CHARS[i]));
  }
  tubeColor = mix(tubeColor, vec3(0.60, 0.75, 0.85), hintInk);

  // CRT Scanlines & Vignette
  float scanline = 0.88 + 0.12 * cos(sp.y * 3.14159265);
  tubeColor *= scanline;
  float edgeDist = max(abs(crtUv.x), abs(crtUv.y));
  tubeColor *= smoothstep(1.0, 0.93, edgeDist);

  color = tubeColor;
 }

 outColor = vec4(color, 1.0);
}
