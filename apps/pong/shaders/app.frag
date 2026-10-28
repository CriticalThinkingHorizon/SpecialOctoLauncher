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

float drawNumber2(vec2 p,vec2 origin,uint v){
 float ink=0.0;
 float gw=float(GLYPH_W);
 if(v>=10u){
  ink=max(ink,drawDigit(p,origin,(v/10u)%10u));
  ink=max(ink,drawDigit(p,origin+vec2(gw,0.0),v%10u));
 }else{
  ink=max(ink,drawDigit(p,origin,v));
 }
 return ink;
}

// "JOY-CON PONG  |  HD RUMBLE ACTIVE" (35 chars)
const uint TITLE_CHARS[] = uint[](
 74u,79u,89u,45u,67u,79u,78u,32u,80u,79u,78u,71u,32u,32u,124u,32u,32u,
 72u,68u,32u,82u,85u,77u,66u,76u,69u,32u,65u,67u,84u,73u,86u,69u,33u,33u
);
const uint TITLE_LEN = uint(TITLE_CHARS.length());

// "L-STICK / D-PAD: Left  |  R-STICK / X,B: Right  |  Y: Toggle AI  |  +: Reset  |  -: Exit"
const uint HINT_CHARS[] = uint[](
 76u,45u,83u,84u,73u,67u,75u,32u,47u,32u,68u,45u,80u,65u,68u,58u,32u,76u,101u,102u,116u,
 32u,32u,124u,32u,32u,82u,45u,83u,84u,73u,67u,75u,32u,47u,32u,88u,44u,66u,58u,32u,82u,105u,103u,104u,116u,
 32u,32u,124u,32u,32u,89u,58u,32u,84u,111u,103u,103u,108u,101u,32u,65u,73u,
 32u,32u,124u,32u,32u,43u,58u,32u,82u,101u,115u,101u,116u,
 32u,32u,124u,32u,32u,45u,58u,32u,69u,120u,105u,116u
);
const uint HINT_LEN = uint(HINT_CHARS.length());

void main(){
 vec2 sp = gl_FragCoord.xy;
 vec3 arenaColor = mix(vec3(0.015, 0.025, 0.04), vec3(0.025, 0.045, 0.075), sp.y / 1080.0);

 float gw = float(GLYPH_W);
 float gh = float(GLYPH_H);

 // Top and Bottom Boundary Rails
 float topRail = fill(box(sp, vec2(960.0, 76.0), vec2(880.0, 4.0), 2.0));
 float botRail = fill(box(sp, vec2(960.0, 1004.0), vec2(880.0, 4.0), 2.0));
 float topGlow = fill(box(sp, vec2(960.0, 76.0), vec2(884.0, 8.0), 4.0));
 float botGlow = fill(box(sp, vec2(960.0, 1004.0), vec2(884.0, 8.0), 4.0));
 arenaColor = mix(arenaColor, vec3(0.15, 0.45, 0.65), (topGlow + botGlow) * 0.4);
 arenaColor = mix(arenaColor, vec3(0.35, 0.85, 1.0), topRail + botRail);

 // Center Dashed Net Line
 if(abs(sp.x - 960.0) < 3.0 && sp.y >= 80.0 && sp.y <= 1000.0){
  if(mod(sp.y, 40.0) < 24.0){
   arenaColor = mix(arenaColor, vec3(0.25, 0.60, 0.75), 0.75);
  }
 }

 // --- Paddle Geometry ---
 const float paddleH = 160.0;
 const float paddleW = 28.0;
 const float leftX = 160.0;
 const float rightX = 1760.0;

 // Left Paddle (Cyan Neon)
 vec2 leftPaddlePos = vec2(leftX, c.flow.x);
 float leftPaddleBox = fill(box(sp, leftPaddlePos, vec2(paddleW * 0.5, paddleH * 0.5), 6.0));
 float leftPaddleGlow = fill(box(sp, leftPaddlePos, vec2(paddleW * 0.5 + 10.0, paddleH * 0.5 + 10.0), 12.0));
 arenaColor = mix(arenaColor, vec3(0.10, 0.50, 0.80), leftPaddleGlow * 0.5);
 arenaColor = mix(arenaColor, vec3(0.30, 0.95, 1.0), leftPaddleBox);

 // Right Paddle (Hot Pink / Magenta Neon)
 vec2 rightPaddlePos = vec2(rightX, c.flow.y);
 float rightPaddleBox = fill(box(sp, rightPaddlePos, vec2(paddleW * 0.5, paddleH * 0.5), 6.0));
 float rightPaddleGlow = fill(box(sp, rightPaddlePos, vec2(paddleW * 0.5 + 10.0, paddleH * 0.5 + 10.0), 12.0));
 arenaColor = mix(arenaColor, vec3(0.80, 0.15, 0.50), rightPaddleGlow * 0.5);
 arenaColor = mix(arenaColor, vec3(1.0, 0.35, 0.75), rightPaddleBox);

 // --- Ball ---
 vec2 ballPos = vec2(float(c.piece.x) * 0.1, float(c.piece.y) * 0.1);
 float ballDist = length(sp - ballPos);
 float ballCore = fill(ballDist - 14.0);
 float ballGlow = exp(-ballDist * 0.08);
 arenaColor += vec3(0.40, 0.85, 1.0) * ballGlow * 0.7;
 arenaColor = mix(arenaColor, vec3(1.0, 1.0, 1.0), ballCore);

 // --- Giant Digital Scores ---
 float leftScoreInk = drawNumber2(sp, vec2(820.0 - gw, 120.0), c.game.x);
 float rightScoreInk = drawNumber2(sp, vec2(1100.0, 120.0), c.game.y);
 arenaColor = mix(arenaColor, vec3(0.30, 0.95, 1.0), leftScoreInk);
 arenaColor = mix(arenaColor, vec3(1.0, 0.35, 0.75), rightScoreInk);

 // --- Header Title ---
 float titleInk = 0.0;
 for(uint i = 0u; i < TITLE_LEN; i++){
  titleInk = max(titleInk, drawChar(sp, vec2(700.0 + float(i) * gw, 25.0), TITLE_CHARS[i]));
 }
 arenaColor = mix(arenaColor, vec3(0.50, 0.85, 0.95), titleInk);

 // --- Mode Indicator (AI: ON vs 2-PLAYER) ---
 if(c.game.w == 1u){
  // "[AI: ON]" in glowing yellow
  float aiInk = drawChar(sp, vec2(1620.0, 25.0), 91u); // [
  aiInk = max(aiInk, drawChar(sp, vec2(1620.0 + gw, 25.0), 65u)); // A
  aiInk = max(aiInk, drawChar(sp, vec2(1620.0 + gw * 2.0, 25.0), 73u)); // I
  aiInk = max(aiInk, drawChar(sp, vec2(1620.0 + gw * 3.0, 25.0), 58u)); // :
  aiInk = max(aiInk, drawChar(sp, vec2(1620.0 + gw * 4.0, 25.0), 79u)); // O
  aiInk = max(aiInk, drawChar(sp, vec2(1620.0 + gw * 5.0, 25.0), 78u)); // N
  aiInk = max(aiInk, drawChar(sp, vec2(1620.0 + gw * 6.0, 25.0), 93u)); // ]
  arenaColor = mix(arenaColor, vec3(1.0, 0.85, 0.20), aiInk);
 }else{
  // "[2-PLAYER]" in cyan
  float p2Ink = drawChar(sp, vec2(1600.0, 25.0), 91u); // [
  p2Ink = max(p2Ink, drawChar(sp, vec2(1600.0 + gw, 25.0), 50u)); // 2
  p2Ink = max(p2Ink, drawChar(sp, vec2(1600.0 + gw * 2.0, 25.0), 45u)); // -
  p2Ink = max(p2Ink, drawChar(sp, vec2(1600.0 + gw * 3.0, 25.0), 80u)); // P
  p2Ink = max(p2Ink, drawChar(sp, vec2(1600.0 + gw * 4.0, 25.0), 76u)); // L
  p2Ink = max(p2Ink, drawChar(sp, vec2(1600.0 + gw * 5.0, 25.0), 65u)); // A
  p2Ink = max(p2Ink, drawChar(sp, vec2(1600.0 + gw * 6.0, 25.0), 89u)); // Y
  p2Ink = max(p2Ink, drawChar(sp, vec2(1600.0 + gw * 7.0, 25.0), 93u)); // ]
  arenaColor = mix(arenaColor, vec3(0.35, 0.95, 0.65), p2Ink);
 }

 // --- Bottom Navigation Hint Bar ---
 float hintInk = 0.0;
 for(uint i = 0u; i < HINT_LEN; i++){
  hintInk = max(hintInk, drawChar(sp, vec2(180.0 + float(i) * gw, 1035.0), HINT_CHARS[i]));
 }
 arenaColor = mix(arenaColor, vec3(0.60, 0.75, 0.85), hintInk);

 // --- Match Win Celebration Modal ---
 if(c.game.z == 2u){
  arenaColor *= 0.35;
  vec2 winCenter = vec2(960.0, 540.0);
  float winBox = fill(box(sp, winCenter, vec2(420.0, 100.0), 16.0));
  float winLine = line(box(sp, winCenter, vec2(420.0, 100.0), 16.0), 3.0);
  arenaColor = mix(arenaColor, vec3(0.04, 0.10, 0.08), winBox);
  arenaColor = mix(arenaColor, vec3(0.35, 1.0, 0.65), winLine);

  // "MATCH OVER! PRESS A OR + TO PLAY AGAIN"
  float winInk = drawChar(sp, vec2(680.0, 510.0), 77u); // M
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw, 510.0), 65u)); // A
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw * 2.0, 510.0), 84u)); // T
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw * 3.0, 510.0), 67u)); // C
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw * 4.0, 510.0), 72u)); // H
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw * 5.0, 510.0), 32u));
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw * 6.0, 510.0), 79u)); // O
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw * 7.0, 510.0), 86u)); // V
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw * 8.0, 510.0), 69u)); // E
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw * 9.0, 510.0), 82u)); // R
  winInk = max(winInk, drawChar(sp, vec2(680.0 + gw * 10.0, 510.0), 33u)); // !
  arenaColor = mix(arenaColor, vec3(1.0, 0.90, 0.30), winInk);
 }

 // Subtle TV Scanlines
 float scanline = 0.93 + 0.07 * cos(sp.y * 3.14159265);
 arenaColor *= scanline;

 outColor = vec4(arenaColor, 1.0);
}
