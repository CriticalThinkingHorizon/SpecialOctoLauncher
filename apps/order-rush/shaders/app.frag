#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#define HB_READONLY
#include "abi.glsl"
#include "hb.glsl"
#include "text.glsl"
#include "draw.glsl"

float drawChar(vec2 p, vec2 origin, uint ch){
 if (ch < GLYPH_FIRST || ch >= GLYPH_FIRST + GLYPH_COUNT) return 0.0;
 uint idx = ch - GLYPH_FIRST;
 ivec4 rect = ivec4(int(idx % uint(GLYPH_COLS)) * GLYPH_W, int(idx / uint(GLYPH_COLS)) * GLYPH_H, GLYPH_W, GLYPH_H);
 return text(p, origin, rect);
}

float drawDigit(vec2 p, vec2 origin, uint d){
 if (d > 9u) return 0.0;
 return drawChar(p, origin, 48u + d);
}

float drawUint5(vec2 p, vec2 origin, uint v){
 float ink = 0.0;
 float gw = float(GLYPH_W);
 ink = max(ink, drawDigit(p, origin, (v / 10000u) % 10u));
 ink = max(ink, drawDigit(p, origin + vec2(gw, 0.0), (v / 1000u) % 10u));
 ink = max(ink, drawDigit(p, origin + vec2(gw * 2.0, 0.0), (v / 100u) % 10u));
 ink = max(ink, drawDigit(p, origin + vec2(gw * 3.0, 0.0), (v / 10u) % 10u));
 ink = max(ink, drawDigit(p, origin + vec2(gw * 4.0, 0.0), v % 10u));
 return ink;
}

float drawUint2(vec2 p, vec2 origin, uint v){
 float ink = 0.0;
 float gw = float(GLYPH_W);
 ink = max(ink, drawDigit(p, origin, (v / 10u) % 10u));
 ink = max(ink, drawDigit(p, origin + vec2(gw, 0.0), v % 10u));
 return ink;
}

// String Constants
const uint TITLE_LEN = 13u;
const uint TITLE_CHARS[13] = uint[13](79u,82u,68u,69u,82u,32u,82u,85u,83u,72u,32u,50u,68u);

const uint LBL_SCORE_LEN = 6u;
const uint LBL_SCORE_CHARS[6] = uint[6](83u,67u,79u,82u,69u,58u);

const uint LBL_HIGH_LEN = 5u;
const uint LBL_HIGH_CHARS[5] = uint[5](72u,73u,71u,72u,58u);

const uint LBL_SERVED_LEN = 7u;
const uint LBL_SERVED_CHARS[7] = uint[7](83u,69u,82u,86u,69u,68u,58u);

const uint LBL_MISSED_LEN = 7u;
const uint LBL_MISSED_CHARS[7] = uint[7](77u,73u,83u,83u,69u,68u,58u);

const uint LBL_APPLES_LEN = 7u;
const uint LBL_APPLES_CHARS[7] = uint[7](65u,80u,80u,76u,69u,83u,58u);

const uint LBL_STICKS_LEN = 7u;
const uint LBL_STICKS_CHARS[7] = uint[7](83u,84u,73u,67u,75u,83u,58u);

const uint LBL_ORDER_LEN = 6u;
const uint LBL_ORDER_CHARS[6] = uint[6](79u,82u,68u,69u,82u,58u);

const uint PROMPT_PICK_APPLE_LEN = 14u;
const uint PROMPT_PICK_APPLE_CHARS[14] = uint[14](91u,65u,93u,32u,80u,73u,67u,75u,32u,65u,80u,80u,76u,69u);

const uint PROMPT_PICK_STICK_LEN = 14u;
const uint PROMPT_PICK_STICK_CHARS[14] = uint[14](91u,65u,93u,32u,80u,73u,67u,75u,32u,83u,84u,73u,67u,75u);

const uint PROMPT_APPLE_FULL_LEN = 22u;
const uint PROMPT_APPLE_FULL_CHARS[22] = uint[22](91u,65u,80u,80u,76u,69u,32u,66u,65u,71u,32u,70u,85u,76u,76u,32u,40u,52u,47u,52u,41u,93u);

const uint PROMPT_STICK_FULL_LEN = 22u;
const uint PROMPT_STICK_FULL_CHARS[22] = uint[22](91u,83u,84u,73u,67u,75u,32u,66u,65u,71u,32u,70u,85u,76u,76u,32u,40u,52u,47u,52u,41u,93u);

const uint PROMPT_DELIVER_LEN = 18u;
const uint PROMPT_DELIVER_CHARS[18] = uint[18](91u,65u,93u,32u,68u,69u,76u,73u,86u,69u,82u,32u,79u,82u,68u,69u,82u,33u);

const uint PROMPT_NEED_ITEMS_LEN = 17u;
const uint PROMPT_NEED_ITEMS_CHARS[17] = uint[17](91u,78u,69u,69u,68u,32u,77u,79u,82u,69u,32u,73u,84u,69u,77u,83u,93u);

const uint PROMPT_WAITING_LEN = 19u;
const uint PROMPT_WAITING_CHARS[19] = uint[19](91u,87u,65u,73u,84u,73u,78u,71u,32u,70u,79u,82u,32u,79u,82u,68u,69u,82u,93u);

const uint MSG_SUCCESS_LEN = 27u;
const uint MSG_SUCCESS_CHARS[27] = uint[27](79u,82u,68u,69u,82u,32u,68u,69u,76u,73u,86u,69u,82u,69u,68u,33u,32u,66u,79u,78u,85u,83u,32u,80u,84u,83u,33u);

const uint MSG_MISSED_LEN = 24u;
const uint MSG_MISSED_CHARS[24] = uint[24](79u,82u,68u,69u,82u,32u,84u,73u,77u,69u,68u,32u,79u,85u,84u,33u,32u,45u,55u,53u,32u,80u,84u,83u);

// Item Positions
const vec2 APPLE_POS[4] = vec2[4](
 vec2(380.0, 480.0),
 vec2(420.0, 800.0),
 vec2(680.0, 620.0),
 vec2(580.0, 880.0)
);

const vec2 STICK_POS[4] = vec2[4](
 vec2(1540.0, 480.0),
 vec2(1500.0, 800.0),
 vec2(1240.0, 620.0),
 vec2(1340.0, 880.0)
);

// Pixel Art Drawing Helpers
float renderApple(vec2 p, vec2 c, float scale){
 vec2 q = (p - c) / scale;
 // Apple body
 float dBody = length(q) - 1.0;
 float apple = fill(dBody);
 // Stem
 float dStem = box(q - vec2(0.0, 1.2), vec2(0.0, 0.0), vec2(0.12, 0.3), 0.05);
 apple = max(apple, fill(dStem));
 return apple;
}

float renderStick(vec2 p, vec2 c, float scale){
 vec2 q = (p - c) / scale;
 // Diagonal wood branch
 vec2 rot = vec2(q.x * 0.707 - q.y * 0.707, q.x * 0.707 + q.y * 0.707);
 float dStick = box(rot, vec2(0.0), vec2(0.22, 1.3), 0.1);
 return fill(dStick);
}

void main(){
 vec2 p = gl_FragCoord.xy;
 float gw = float(GLYPH_W);
 float gh = float(GLYPH_H);

 // 1. Retro Background & Playfield Floor
 // Gentle warm retro parchment / grass earth tile tone
 float checker = mod(floor(p.x / 40.0) + floor(p.y / 40.0), 2.0);
 vec3 floorCol = mix(vec3(0.07, 0.12, 0.08), vec3(0.08, 0.14, 0.09), checker);

 // Playfield arena border (140 to 1780 X, 270 to 990 Y)
 float arenaBox = box(p, vec2(960.0, 630.0), vec2(820.0, 360.0), 16.0);
 float arenaOutline = line(arenaBox, 3.0);
 float arenaInner = fill(arenaBox);

 vec3 col = mix(vec3(0.02, 0.03, 0.03), floorCol, arenaInner);
 col = mix(col, vec3(0.20, 0.50, 0.30), arenaOutline);

 // Orchard grass tint on left side (Apples)
 float orchardZone = fill(box(p, vec2(530.0, 670.0), vec2(360.0, 300.0), 20.0));
 col = mix(col, col + vec3(0.015, 0.04, 0.015), orchardZone * 0.5);

 // Forest wood tint on right side (Sticks)
 float forestZone = fill(box(p, vec2(1390.0, 670.0), vec2(360.0, 300.0), 20.0));
 col = mix(col, col + vec3(0.03, 0.02, 0.01), forestZone * 0.5);

 // 2. Render 4 Apple Groves
 for (uint i = 0u; i < 4u; i++) {
  vec2 pos = APPLE_POS[i];
  // Grove base circle
  float baseDist = length(p - pos) - 46.0;
  float baseFill = fill(baseDist);
  float baseLine = line(baseDist, 2.0);
  col = mix(col, vec3(0.05, 0.16, 0.07), baseFill * 0.7);
  col = mix(col, vec3(0.15, 0.40, 0.18), baseLine * 0.8);

  // If apple ready to pick (respawn timer == 0)
  if (c.rows[i] == 0u) {
   float bob = sin(c.motion.w * 5.0 + float(i)) * 4.0;
   vec2 aPos = pos + vec2(0.0, bob);
   float ap = renderApple(p, aPos, 18.0);
   float apGlow = fill(length(p - aPos) - 24.0);
   col = mix(col, vec3(0.4, 0.1, 0.1), apGlow * 0.35);
   col = mix(col, vec3(0.95, 0.18, 0.18), ap);
   // Apple highlight
   float hi = fill(length(p - (aPos + vec2(-4.0, -4.0))) - 5.0);
   col = mix(col, vec3(1.0, 0.65, 0.65), hi * ap);
  } else {
   // Respawning seedling indicator
   float seed = fill(length(p - pos) - 8.0);
   col = mix(col, vec3(0.35, 0.55, 0.25), seed);
  }
 }

 // 3. Render 4 Stick Groves
 for (uint i = 0u; i < 4u; i++) {
  vec2 pos = STICK_POS[i];
  float baseDist = length(p - pos) - 46.0;
  float baseFill = fill(baseDist);
  float baseLine = line(baseDist, 2.0);
  col = mix(col, vec3(0.14, 0.10, 0.06), baseFill * 0.7);
  col = mix(col, vec3(0.35, 0.25, 0.15), baseLine * 0.8);

  if (c.rows[4u + i] == 0u) {
   float bob = cos(c.motion.w * 5.0 + float(i)) * 3.0;
   vec2 sPos = pos + vec2(0.0, bob);
   float st = renderStick(p, sPos, 16.0);
   col = mix(col, vec3(0.78, 0.52, 0.28), st);
   // Darker wood grain stripe
   float st2 = renderStick(p, sPos + vec2(4.0, 2.0), 12.0);
   col = mix(col, vec3(0.55, 0.34, 0.16), st2 * st);
  } else {
   float stump = fill(length(p - pos) - 8.0);
   col = mix(col, vec3(0.40, 0.30, 0.20), stump);
  }
 }

 // 4. The Order Counter
 vec2 counterCenter = vec2(960.0, 220.0);
 vec2 counterSize = vec2(200.0, 36.0);
 float counterBox = box(p, counterCenter, counterSize, 8.0);
 float counterFill = fill(counterBox);
 float counterBorder = line(counterBox, 3.0);
 col = mix(col, vec3(0.48, 0.28, 0.14), counterFill);
 col = mix(col, vec3(0.75, 0.45, 0.22), counterBorder);

 // Counter wood planks pattern
 if (counterFill > 0.5) {
  float plank = mod(p.x, 40.0);
  if (plank < 2.0) col *= 0.75;
 }

 // Counter Interaction Zone highlight
 vec2 zonePos = vec2(960.0, 310.0);
 float zoneDist = length(p - zonePos) - 45.0;
 float zoneRing = line(zoneDist, 2.0);
 col = mix(col, vec3(0.85, 0.70, 0.25), zoneRing * 0.5);

 // 5. Customer NPC (Behind Counter)
 vec2 npcPos = vec2(960.0, 165.0);
 if (c.flow.x == 1.0 || c.flow.x == 2.0 || c.flow.x == 3.0) {
  // Customer Shadow
  float npcShadow = fill(box(p, npcPos + vec2(0.0, 24.0), vec2(20.0, 8.0), 6.0));
  col = mix(col, col * 0.45, npcShadow * 0.6);

  // Body
  float npcBody = fill(box(p, npcPos + vec2(0.0, 12.0), vec2(16.0, 16.0), 5.0));
  vec3 npcCol = (c.flow.x == 3.0) ? vec3(0.85, 0.25, 0.25) : ((c.flow.x == 2.0) ? vec3(0.20, 0.85, 0.40) : vec3(0.30, 0.60, 0.85));
  col = mix(col, npcCol, npcBody);

  // Head
  float npcHead = fill(length(p - (npcPos - vec2(0.0, 4.0))) - 15.0);
  vec3 headCol = (c.flow.x == 3.0) ? vec3(0.95, 0.50, 0.50) : vec3(0.96, 0.82, 0.68);
  col = mix(col, headCol, npcHead);

  // Eyes
  vec2 eyeOffset = (c.flow.x == 3.0) ? vec2(0.0, -1.0) : vec2(0.0, 1.0);
  float eye1 = fill(length(p - (npcPos + vec2(-5.0, -3.0) + eyeOffset)) - 2.2);
  float eye2 = fill(length(p - (npcPos + vec2(5.0, -3.0) + eyeOffset)) - 2.2);
  col = mix(col, vec3(0.1, 0.1, 0.1), max(eye1, eye2));

  // Customer Order Plaque & Speech Bubble (Floating Above Counter)
  if (c.flow.x == 1.0) {
   vec2 bubblePos = vec2(960.0, 95.0);
   float bubbleBox = box(p, bubblePos, vec2(195.0, 28.0), 8.0);
   float bubbleFill = fill(bubbleBox);
   float bubbleLine = line(bubbleBox, 2.0);
   col = mix(col, vec3(0.06, 0.10, 0.15), bubbleFill * 0.95);
   col = mix(col, vec3(0.0, 0.85, 1.0), bubbleLine * 0.9);

   // Speech bubble pointer tail pointing down towards NPC
   vec2 tailP = p - (bubblePos + vec2(0.0, 28.0));
   if (tailP.y >= 0.0 && tailP.y <= 10.0 && abs(tailP.x) <= (10.0 - tailP.y) * 0.8) {
    col = mix(col, vec3(0.06, 0.10, 0.15), 0.95);
   }

   // Draw "ORDER: X APPLES, Y STICKS"
   float orderInk = 0.0;
   vec2 textPos = bubblePos - vec2(165.0, 18.0);

   for (uint i = 0u; i < LBL_ORDER_LEN; i++) {
    orderInk = max(orderInk, drawChar(p, textPos + vec2(gw * float(i), 0.0), LBL_ORDER_CHARS[i]));
   }

   // Apple count
   uint reqApples = uint(c.motion.x);
   orderInk = max(orderInk, drawDigit(p, textPos + vec2(gw * 8.0, 0.0), reqApples));
   float apIco = renderApple(p, textPos + vec2(gw * 10.0, 9.0), 8.0);

   // Stick count
   uint reqSticks = uint(c.motion.y);
   orderInk = max(orderInk, drawDigit(p, textPos + vec2(gw * 13.0, 0.0), reqSticks));
   float stIco = renderStick(p, textPos + vec2(gw * 15.0, 9.0), 7.0);

   col = mix(col, vec3(1.0, 1.0, 1.0), orderInk);
   col = mix(col, vec3(0.95, 0.20, 0.20), apIco);
   col = mix(col, vec3(0.85, 0.55, 0.30), stIco);

   // Patience Bar Under Order Plaque
   vec2 barPos = bubblePos + vec2(0.0, 18.0);
   float barW = 320.0;
   float barH = 7.0;
   float barBg = fill(box(p, barPos, vec2(barW * 0.5, barH * 0.5), 3.0));
   col = mix(col, vec3(0.05, 0.05, 0.05), barBg * 0.9);

   float ratio = clamp(c.flow.y / max(c.flow.z, 1.0), 0.0, 1.0);
   float currentW = barW * ratio;
   vec2 fillPos = barPos - vec2((barW - currentW) * 0.5, 0.0);
   float barFill = fill(box(p, fillPos, vec2(currentW * 0.5, barH * 0.5 - 1.0), 2.0));

   vec3 pCol = (ratio > 0.5) ? vec3(0.20, 0.90, 0.35) : ((ratio > 0.20) ? vec3(0.95, 0.85, 0.20) : vec3(1.0, 0.25, 0.20));
   col = mix(col, pCol, barFill);
  }
 }

 // 6. Player Character (Clean Retro Top-Down Courier)
 float px = float(c.piece.x) * 0.1;
 float py = float(c.piece.y) * 0.1;
 vec2 playerPos = vec2(px, py);

 // Soft ground shadow under player
 float pShadow = fill(box(p, playerPos + vec2(0.0, 22.0), vec2(18.0, 8.0), 6.0));
 col = mix(col, col * 0.45, pShadow * 0.6);

 // Player Body / Tunic (Blue Courier Uniform)
 float pBody = fill(box(p, playerPos + vec2(0.0, 10.0), vec2(14.0, 14.0), 5.0));
 col = mix(col, vec3(0.18, 0.48, 0.88), pBody);

 // Dark belt detail
 float pBelt = fill(box(p, playerPos + vec2(0.0, 14.0), vec2(14.0, 3.0), 1.0));
 col = mix(col, vec3(0.12, 0.18, 0.25), pBelt * pBody);

 // Player Head
 float pHead = fill(length(p - (playerPos - vec2(0.0, 4.0))) - 14.0);
 col = mix(col, vec3(0.96, 0.82, 0.68), pHead);

 // Courier Red Cap (with visor pointing down/front)
 float pCap = fill(box(p, playerPos - vec2(0.0, 10.0), vec2(14.0, 7.0), 3.0));
 float pVisor = fill(box(p, playerPos - vec2(0.0, 3.0), vec2(15.0, 3.0), 1.0));
 col = mix(col, vec3(0.90, 0.25, 0.20), max(pCap, pVisor));

 // Cute retro eyes (looking forward/down)
 float pEye1 = fill(length(p - (playerPos + vec2(-4.5, 0.0))) - 2.2);
 float pEye2 = fill(length(p - (playerPos + vec2(4.5, 0.0))) - 2.2);
 col = mix(col, vec3(0.10, 0.10, 0.12), max(pEye1, pEye2));

 // Compact Shoulder Satchel (only visible when carrying items, never cuts through sprite)
 uint applesCarried = uint(clamp(c.piece.z, 0, 4));
 uint sticksCarried = uint(clamp(c.piece.w, 0, 4));
 uint totalCarried = applesCarried + sticksCarried;
 if (totalCarried > 0u) {
  vec2 bagPos = playerPos + vec2(-15.0, 6.0);
  float pBag = fill(box(p, bagPos, vec2(6.0, 8.0), 2.5));
  float pBagBorder = line(box(p, bagPos, vec2(6.0, 8.0), 2.5), 1.2);
  col = mix(col, vec3(0.55, 0.32, 0.16), pBag);
  col = mix(col, vec3(0.35, 0.20, 0.08), pBagBorder);

  if (applesCarried > 0u) {
   float dotA = fill(length(p - (bagPos - vec2(1.5, 2.0))) - 2.2);
   col = mix(col, vec3(0.95, 0.20, 0.20), dotA);
  }
  if (sticksCarried > 0u) {
   float dotS = fill(length(p - (bagPos + vec2(1.5, 2.0))) - 2.2);
   col = mix(col, vec3(0.85, 0.55, 0.25), dotS);
  }
 }

 // 7. Floating Context Prompts Above Player
 uint promptCode = c.rows[10];
 if (promptCode > 0u) {
  vec2 prPos = playerPos - vec2(0.0, 68.0);
  float prInk = 0.0;
  vec3 prCol = vec3(0.0, 0.95, 1.0);

  if (promptCode == 1u) {
   // [A] PICK APPLE
   float prBox = fill(box(p, prPos, vec2(140.0, 22.0), 6.0));
   float prLine = line(box(p, prPos, vec2(140.0, 22.0), 6.0), 2.0);
   col = mix(col, vec3(0.08, 0.02, 0.02), prBox * 0.9);
   col = mix(col, vec3(1.0, 0.35, 0.35), prLine * 0.9);
   vec2 startP = prPos - vec2(float(PROMPT_PICK_APPLE_LEN * uint(GLYPH_W)) * 0.5, 12.0);
   for (uint i = 0u; i < PROMPT_PICK_APPLE_LEN; i++) {
    prInk = max(prInk, drawChar(p, startP + vec2(gw * float(i), 0.0), PROMPT_PICK_APPLE_CHARS[i]));
   }
   prCol = vec3(1.0, 0.50, 0.50);
  } else if (promptCode == 2u) {
   // [A] PICK STICK
   float prBox = fill(box(p, prPos, vec2(140.0, 22.0), 6.0));
   float prLine = line(box(p, prPos, vec2(140.0, 22.0), 6.0), 2.0);
   col = mix(col, vec3(0.08, 0.05, 0.02), prBox * 0.9);
   col = mix(col, vec3(1.0, 0.70, 0.30), prLine * 0.9);
   vec2 startP = prPos - vec2(float(PROMPT_PICK_STICK_LEN * uint(GLYPH_W)) * 0.5, 12.0);
   for (uint i = 0u; i < PROMPT_PICK_STICK_LEN; i++) {
    prInk = max(prInk, drawChar(p, startP + vec2(gw * float(i), 0.0), PROMPT_PICK_STICK_CHARS[i]));
   }
   prCol = vec3(1.0, 0.80, 0.40);
  } else if (promptCode == 3u) {
   // [APPLE BAG FULL]
   float prBox = fill(box(p, prPos, vec2(210.0, 22.0), 6.0));
   float prLine = line(box(p, prPos, vec2(210.0, 22.0), 6.0), 2.0);
   col = mix(col, vec3(0.14, 0.02, 0.02), prBox * 0.9);
   col = mix(col, vec3(1.0, 0.20, 0.20), prLine * 0.9);
   vec2 startP = prPos - vec2(float(PROMPT_APPLE_FULL_LEN * uint(GLYPH_W)) * 0.5, 12.0);
   for (uint i = 0u; i < PROMPT_APPLE_FULL_LEN; i++) {
    prInk = max(prInk, drawChar(p, startP + vec2(gw * float(i), 0.0), PROMPT_APPLE_FULL_CHARS[i]));
   }
   prCol = vec3(1.0, 0.40, 0.40);
  } else if (promptCode == 4u) {
   // [STICK BAG FULL]
   float prBox = fill(box(p, prPos, vec2(210.0, 22.0), 6.0));
   float prLine = line(box(p, prPos, vec2(210.0, 22.0), 6.0), 2.0);
   col = mix(col, vec3(0.14, 0.02, 0.02), prBox * 0.9);
   col = mix(col, vec3(1.0, 0.20, 0.20), prLine * 0.9);
   vec2 startP = prPos - vec2(float(PROMPT_STICK_FULL_LEN * uint(GLYPH_W)) * 0.5, 12.0);
   for (uint i = 0u; i < PROMPT_STICK_FULL_LEN; i++) {
    prInk = max(prInk, drawChar(p, startP + vec2(gw * float(i), 0.0), PROMPT_STICK_FULL_CHARS[i]));
   }
   prCol = vec3(1.0, 0.40, 0.40);
  } else if (promptCode == 5u) {
   // [A] DELIVER ORDER! (Gold pulsing)
   float pulse = 0.85 + 0.15 * sin(c.motion.w * 8.0);
   float prBox = fill(box(p, prPos, vec2(180.0, 22.0), 6.0));
   float prLine = line(box(p, prPos, vec2(180.0, 22.0), 6.0), 2.5);
   col = mix(col, vec3(0.08, 0.06, 0.01), prBox * 0.95);
   col = mix(col, vec3(1.0, 0.85, 0.20) * pulse, prLine);
   vec2 startP = prPos - vec2(float(PROMPT_DELIVER_LEN * uint(GLYPH_W)) * 0.5, 12.0);
   for (uint i = 0u; i < PROMPT_DELIVER_LEN; i++) {
    prInk = max(prInk, drawChar(p, startP + vec2(gw * float(i), 0.0), PROMPT_DELIVER_CHARS[i]));
   }
   prCol = vec3(1.0, 0.95, 0.40);
  } else if (promptCode == 6u) {
   // [NEED MORE ITEMS]
   float prBox = fill(box(p, prPos, vec2(170.0, 22.0), 6.0));
   float prLine = line(box(p, prPos, vec2(170.0, 22.0), 6.0), 2.0);
   col = mix(col, vec3(0.10, 0.05, 0.01), prBox * 0.9);
   col = mix(col, vec3(1.0, 0.55, 0.15), prLine * 0.9);
   vec2 startP = prPos - vec2(float(PROMPT_NEED_ITEMS_LEN * uint(GLYPH_W)) * 0.5, 12.0);
   for (uint i = 0u; i < PROMPT_NEED_ITEMS_LEN; i++) {
    prInk = max(prInk, drawChar(p, startP + vec2(gw * float(i), 0.0), PROMPT_NEED_ITEMS_CHARS[i]));
   }
   prCol = vec3(1.0, 0.65, 0.25);
  }
  col = mix(col, prCol, prInk);
 }

 // 8. Floating Event Feedback Popups (Above Counter)
 if (c.rows[8] > 0u) {
  vec2 msgPos = vec2(960.0, 360.0);
  float msgInk = 0.0;
  vec3 msgCol = vec3(1.0, 0.85, 0.20);
  if (c.rows[9] == 9999u) {
   // Missed Order
   vec2 startP = msgPos - vec2(float(MSG_MISSED_LEN * uint(GLYPH_W)) * 0.5, 12.0);
   for (uint i = 0u; i < MSG_MISSED_LEN; i++) {
    msgInk = max(msgInk, drawChar(p, startP + vec2(gw * float(i), 0.0), MSG_MISSED_CHARS[i]));
   }
   msgCol = vec3(1.0, 0.25, 0.25);
  } else {
   // Successful delivery
   vec2 startP = msgPos - vec2(float(MSG_SUCCESS_LEN * uint(GLYPH_W)) * 0.5, 12.0);
   for (uint i = 0u; i < MSG_SUCCESS_LEN; i++) {
    msgInk = max(msgInk, drawChar(p, startP + vec2(gw * float(i), 0.0), MSG_SUCCESS_CHARS[i]));
   }
   msgCol = vec3(0.30, 1.0, 0.45);
  }
  col = mix(col, msgCol, msgInk);
 }

 // 9. Top HUD Banner
 float hudBox = fill(box(p, vec2(960.0, 40.0), vec2(840.0, 32.0), 8.0));
 float hudBorder = line(box(p, vec2(960.0, 40.0), vec2(840.0, 32.0), 8.0), 2.0);
 col = mix(col, vec3(0.02, 0.04, 0.06), hudBox * 0.9);
 col = mix(col, vec3(0.15, 0.35, 0.50), hudBorder * 0.8);

 float hudInk = 0.0;
 // Title: ORDER RUSH 2D
 vec2 tPos = vec2(150.0, 26.0);
 for (uint i = 0u; i < TITLE_LEN; i++) {
  hudInk = max(hudInk, drawChar(p, tPos + vec2(gw * float(i), 0.0), TITLE_CHARS[i]));
 }

 // SCORE: XXXXX
 vec2 sPos = vec2(500.0, 26.0);
 for (uint i = 0u; i < LBL_SCORE_LEN; i++) {
  hudInk = max(hudInk, drawChar(p, sPos + vec2(gw * float(i), 0.0), LBL_SCORE_CHARS[i]));
 }
 hudInk = max(hudInk, drawUint5(p, sPos + vec2(gw * 7.0, 0.0), c.game.x));

 // HIGH: XXXXX
 vec2 hPos = vec2(820.0, 26.0);
 for (uint i = 0u; i < LBL_HIGH_LEN; i++) {
  hudInk = max(hudInk, drawChar(p, hPos + vec2(gw * float(i), 0.0), LBL_HIGH_CHARS[i]));
 }
 hudInk = max(hudInk, drawUint5(p, hPos + vec2(gw * 6.0, 0.0), c.game.y));

 // SERVED: XX
 vec2 svPos = vec2(1140.0, 26.0);
 for (uint i = 0u; i < LBL_SERVED_LEN; i++) {
  hudInk = max(hudInk, drawChar(p, svPos + vec2(gw * float(i), 0.0), LBL_SERVED_CHARS[i]));
 }
 hudInk = max(hudInk, drawUint2(p, svPos + vec2(gw * 8.0, 0.0), c.game.z));

 // MISSED: XX
 vec2 msPos = vec2(1440.0, 26.0);
 for (uint i = 0u; i < LBL_MISSED_LEN; i++) {
  hudInk = max(hudInk, drawChar(p, msPos + vec2(gw * float(i), 0.0), LBL_MISSED_CHARS[i]));
 }
 hudInk = max(hudInk, drawUint2(p, msPos + vec2(gw * 8.0, 0.0), c.game.w));

 col = mix(col, vec3(0.95, 0.95, 1.0), hudInk);

 // 10. Bottom Inventory Backpack Bar
 vec2 invBoxPos = vec2(960.0, 1030.0);
 float invBox = fill(box(p, invBoxPos, vec2(420.0, 32.0), 10.0));
 float invBorder = line(box(p, invBoxPos, vec2(420.0, 32.0), 10.0), 2.5);
 col = mix(col, vec3(0.04, 0.06, 0.09), invBox * 0.95);
 col = mix(col, vec3(0.0, 0.85, 1.0), invBorder * 0.85);

 float invInk = 0.0;
 // Left Side: APPLES: N/4
 vec2 apLblPos = vec2(600.0, 1016.0);
 for (uint i = 0u; i < LBL_APPLES_LEN; i++) {
  invInk = max(invInk, drawChar(p, apLblPos + vec2(gw * float(i), 0.0), LBL_APPLES_CHARS[i]));
 }
 invInk = max(invInk, drawDigit(p, apLblPos + vec2(gw * 8.0, 0.0), uint(clamp(c.piece.z, 0, 4))));
 invInk = max(invInk, drawChar(p, apLblPos + vec2(gw * 9.0, 0.0), 47u)); // '/'
 invInk = max(invInk, drawDigit(p, apLblPos + vec2(gw * 10.0, 0.0), 4u));
 float apSlotIco = renderApple(p, apLblPos + vec2(gw * 12.5, 12.0), 10.0);

 // Right Side: STICKS: M/4
 vec2 stLblPos = vec2(980.0, 1016.0);
 for (uint i = 0u; i < LBL_STICKS_LEN; i++) {
  invInk = max(invInk, drawChar(p, stLblPos + vec2(gw * float(i), 0.0), LBL_STICKS_CHARS[i]));
 }
 invInk = max(invInk, drawDigit(p, stLblPos + vec2(gw * 8.0, 0.0), uint(clamp(c.piece.w, 0, 4))));
 invInk = max(invInk, drawChar(p, stLblPos + vec2(gw * 9.0, 0.0), 47u)); // '/'
 invInk = max(invInk, drawDigit(p, stLblPos + vec2(gw * 10.0, 0.0), 4u));
 float stSlotIco = renderStick(p, stLblPos + vec2(gw * 12.5, 12.0), 9.0);

 col = mix(col, vec3(1.0, 1.0, 1.0), invInk);
 col = mix(col, vec3(0.95, 0.20, 0.20), apSlotIco);
 col = mix(col, vec3(0.85, 0.55, 0.30), stSlotIco);

 // 11. Subtle Retro CRT Scanlines
 float scan = 0.88 + 0.12 * cos(p.y * 3.14159265);
 col *= scan;

 outColor = vec4(col, 1.0);
}
