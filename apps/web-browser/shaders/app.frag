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

float drawHex(vec2 p, vec2 origin, uint val){
 float ink = 0.0;
 float gw = float(GLYPH_W);
 for (int i = 7; i >= 0; i--) {
  uint digit = (val >> (uint(i) * 4u)) & 15u;
  uint ch = (digit < 10u) ? (48u + digit) : (65u + (digit - 10u));
  ink = max(ink, drawChar(p, origin + vec2(gw * float(7 - i), 0.0), ch));
 }
 return ink;
}

// Header: "S2 WEB BROWSER APPLET POC  |  A: Open  |  Y: Keyboard URL  |  -: Exit" (69 chars)
const uint HEADER_LEN = 69u;
const uint HEADER_CHARS[69] = uint[69](83u,50u,32u,87u,69u,66u,32u,66u,82u,79u,87u,83u,69u,82u,32u,65u,80u,80u,76u,69u,84u,32u,80u,79u,67u,32u,32u,124u,32u,32u,65u,58u,32u,79u,112u,101u,110u,32u,32u,124u,32u,32u,89u,58u,32u,75u,101u,121u,98u,111u,97u,114u,100u,32u,85u,82u,76u,32u,32u,124u,32u,32u,45u,58u,32u,69u,120u,105u,116u);

// URL strings
const uint URL_0_LEN = 18u;
const uint URL_0_CHARS[18] = uint[18](104u,116u,116u,112u,115u,58u,47u,47u,103u,111u,111u,103u,108u,101u,46u,99u,111u,109u);
const uint URL_1_LEN = 21u;
const uint URL_1_CHARS[21] = uint[21](104u,116u,116u,112u,115u,58u,47u,47u,119u,105u,107u,105u,112u,101u,100u,105u,97u,46u,111u,114u,103u);
const uint URL_2_LEN = 28u;
const uint URL_2_CHARS[28] = uint[28](104u,116u,116u,112u,115u,58u,47u,47u,110u,101u,119u,115u,46u,121u,99u,111u,109u,98u,105u,110u,97u,116u,111u,114u,46u,99u,111u,109u);
const uint URL_3_LEN = 18u;
const uint URL_3_CHARS[18] = uint[18](104u,116u,116u,112u,115u,58u,47u,47u,103u,105u,116u,104u,117u,98u,46u,99u,111u,109u);
const uint URL_4_LEN = 22u;
const uint URL_4_CHARS[22] = uint[22](104u,116u,116u,112u,115u,58u,47u,47u,100u,117u,99u,107u,100u,117u,99u,107u,103u,111u,46u,99u,111u,109u);
const uint URL_5_LEN = 20u;
const uint URL_5_CHARS[20] = uint[20](104u,116u,116u,112u,115u,58u,47u,47u,110u,111u,110u,111u,112u,111u,115u,116u,46u,99u,111u,109u);

// Titles
const uint TITLE_0_LEN = 31u;
const uint TITLE_0_CHARS[31] = uint[31](71u,111u,111u,103u,108u,101u,32u,83u,101u,97u,114u,99u,104u,32u,40u,83u,101u,97u,114u,99u,104u,32u,38u,32u,66u,114u,111u,119u,115u,101u,41u);
const uint TITLE_1_LEN = 33u;
const uint TITLE_1_CHARS[33] = uint[33](87u,105u,107u,105u,112u,101u,100u,105u,97u,32u,40u,84u,104u,101u,32u,70u,114u,101u,101u,32u,69u,110u,99u,121u,99u,108u,111u,112u,101u,100u,105u,97u,41u);
const uint TITLE_2_LEN = 30u;
const uint TITLE_2_CHARS[30] = uint[30](72u,97u,99u,107u,101u,114u,32u,78u,101u,119u,115u,32u,40u,84u,104u,101u,32u,83u,116u,97u,114u,116u,117u,112u,32u,78u,101u,119u,115u,41u);
const uint TITLE_3_LEN = 37u;
const uint TITLE_3_CHARS[37] = uint[37](71u,105u,116u,72u,117u,98u,32u,40u,67u,111u,100u,101u,32u,38u,32u,83u,111u,102u,116u,119u,97u,114u,101u,32u,82u,101u,112u,111u,115u,105u,116u,111u,114u,105u,101u,115u,41u);
const uint TITLE_4_LEN = 35u;
const uint TITLE_4_CHARS[35] = uint[35](68u,117u,99u,107u,68u,117u,99u,107u,71u,111u,32u,40u,80u,114u,105u,118u,97u,99u,121u,45u,70u,111u,99u,117u,115u,101u,100u,32u,83u,101u,97u,114u,99u,104u,41u);
const uint TITLE_5_LEN = 36u;
const uint TITLE_5_CHARS[36] = uint[36](78u,111u,110u,111u,112u,111u,115u,116u,32u,40u,68u,101u,99u,101u,110u,116u,114u,97u,108u,105u,122u,101u,100u,32u,83u,111u,99u,105u,97u,108u,32u,70u,101u,101u,100u,41u);
const uint TITLE_6_LEN = 36u;
const uint TITLE_6_CHARS[36] = uint[36](67u,117u,115u,116u,111u,109u,32u,87u,101u,98u,112u,97u,103u,101u,32u,85u,82u,76u,32u,40u,80u,114u,101u,115u,115u,32u,89u,32u,116u,111u,32u,69u,100u,105u,116u,41u);

// Toast Messages
const uint MSG_1_LEN = 45u;
const uint MSG_1_CHARS[45] = uint[45](76u,65u,85u,78u,67u,72u,73u,78u,71u,32u,83u,50u,32u,66u,82u,79u,87u,83u,69u,82u,32u,65u,80u,80u,76u,69u,84u,46u,46u,46u,32u,80u,76u,69u,65u,83u,69u,32u,87u,65u,73u,84u,46u,46u,46u);

const uint MSG_2_LEN = 42u;
const uint MSG_2_CHARS[42] = uint[42](66u,82u,79u,87u,83u,69u,82u,32u,65u,80u,80u,76u,69u,84u,32u,67u,76u,79u,83u,69u,68u,46u,32u,82u,69u,84u,85u,82u,78u,73u,78u,71u,32u,84u,79u,32u,80u,79u,67u,46u,46u,46u);

// "STATUS: READY - Select URL and press (A) to open browser" (56 chars)
const uint MSG_READY_LEN = 56u;
const uint MSG_READY_CHARS[56] = uint[56](83u,84u,65u,84u,85u,83u,58u,32u,82u,69u,65u,68u,89u,32u,45u,32u,83u,101u,108u,101u,99u,116u,32u,85u,82u,76u,32u,97u,110u,100u,32u,112u,114u,101u,115u,115u,32u,40u,65u,41u,32u,116u,111u,32u,111u,112u,101u,110u,32u,98u,114u,111u,119u,115u,101u,114u);

float drawUrl(vec2 p, vec2 origin, uint idx){
 float ink = 0.0;
 float gw = float(GLYPH_W);
 if (idx == 0u) {
  for (uint i = 0u; i < URL_0_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), URL_0_CHARS[i]));
 } else if (idx == 1u) {
  for (uint i = 0u; i < URL_1_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), URL_1_CHARS[i]));
 } else if (idx == 2u) {
  for (uint i = 0u; i < URL_2_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), URL_2_CHARS[i]));
 } else if (idx == 3u) {
  for (uint i = 0u; i < URL_3_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), URL_3_CHARS[i]));
 } else if (idx == 4u) {
  for (uint i = 0u; i < URL_4_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), URL_4_CHARS[i]));
 } else if (idx == 5u) {
  for (uint i = 0u; i < URL_5_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), URL_5_CHARS[i]));
 } else {
  uint len = uint(clamp(c.piece.x, 0, 80));
  for (uint i = 0u; i < len; i++) {
   uint wIdx = i / 4u;
   uint shift = (i % 4u) * 8u;
   uint ch = (c.rows[wIdx] >> shift) & 255u;
   ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), ch));
  }
 }
 return ink;
}

float drawTitle(vec2 p, vec2 origin, uint idx){
 float ink = 0.0;
 float gw = float(GLYPH_W);
 if (idx == 0u) {
  for (uint i = 0u; i < TITLE_0_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), TITLE_0_CHARS[i]));
 } else if (idx == 1u) {
  for (uint i = 0u; i < TITLE_1_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), TITLE_1_CHARS[i]));
 } else if (idx == 2u) {
  for (uint i = 0u; i < TITLE_2_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), TITLE_2_CHARS[i]));
 } else if (idx == 3u) {
  for (uint i = 0u; i < TITLE_3_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), TITLE_3_CHARS[i]));
 } else if (idx == 4u) {
  for (uint i = 0u; i < TITLE_4_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), TITLE_4_CHARS[i]));
 } else if (idx == 5u) {
  for (uint i = 0u; i < TITLE_5_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), TITLE_5_CHARS[i]));
 } else {
  for (uint i = 0u; i < TITLE_6_LEN; i++) ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), TITLE_6_CHARS[i]));
 }
 return ink;
}

void main(){
 vec2 p = gl_FragCoord.xy;
 vec2 screenCenter = vec2(960.0, 540.0);
 vec2 tubeHalfSize = vec2(890.0, 500.0);

 vec2 normUv = (p - screenCenter) / tubeHalfSize;
 vec2 d = normUv * 0.5;
 vec2 crtUv = normUv * (1.0 + dot(d, d) * 0.08);

 bool insideTube = (abs(crtUv.x) <= 1.0 && abs(crtUv.y) <= 1.0);
 vec3 cabinetCol = mix(vec3(0.012, 0.016, 0.024), vec3(0.024, 0.032, 0.045), p.y / 1080.0);
 vec3 color = cabinetCol;

 if (insideTube) {
  vec2 sp = crtUv * tubeHalfSize + screenCenter;
  float gw = float(GLYPH_W);
  float gh = float(GLYPH_H);

  // Deep cyber blue CRT tube background
  vec3 crtBg = mix(vec3(0.012, 0.024, 0.042), vec3(0.022, 0.045, 0.075), sp.y / 1080.0);
  float vig = clamp(1.0 - dot(crtUv * 0.45, crtUv * 0.45), 0.0, 1.0);
  crtBg *= vig;

  // 1. Header Bar
  float headerInk = 0.0;
  vec2 hPos = vec2(120.0, 48.0);
  for (uint i = 0u; i < HEADER_LEN; i++) {
   headerInk = max(headerInk, drawChar(sp, hPos + vec2(gw * float(i), 0.0), HEADER_CHARS[i]));
  }
  vec3 tubeColor = mix(crtBg, vec3(0.25, 0.85, 1.0), headerInk);

  // Header Divider
  if (abs(sp.y - 88.0) < 1.5 && sp.x >= 110.0 && sp.x <= 1810.0) {
   tubeColor = mix(tubeColor, vec3(0.0, 0.85, 1.0), 0.85);
  }

  uint selected = c.game.y;

  // 2. Top URL Address Bar (Active Browser Omnibox)
  vec2 omniPos = vec2(960.0, 140.0);
  vec2 omniHalf = vec2(780.0, 32.0);
  float omniBox = fill(box(sp, omniPos, omniHalf, 8.0));
  float omniBorder = line(box(sp, omniPos, omniHalf, 8.0), 2.0);
  tubeColor = mix(tubeColor, vec3(0.03, 0.06, 0.10), omniBox * 0.95);
  tubeColor = mix(tubeColor, vec3(0.0, 0.90, 1.0), omniBorder * 0.85);

  // SSL Padlock Icon in URL bar
  vec2 lockPos = omniPos - vec2(omniHalf.x - 36.0, 0.0);
  float lockBody = fill(box(sp, lockPos + vec2(0.0, 4.0), vec2(8.0, 7.0), 2.0));
  float lockShackle = line(length(sp - (lockPos - vec2(0.0, 4.0))) - 5.5, 2.0);
  if (sp.y > lockPos.y - 4.0) lockShackle = 0.0;
  tubeColor = mix(tubeColor, vec3(0.20, 1.0, 0.60), max(lockBody, lockShackle));

  // "URL:" prefix in address bar
  float urlPrefixInk = 0.0;
  vec2 urlTextPos = omniPos - vec2(omniHalf.x - 64.0, 12.0);
  urlPrefixInk = max(urlPrefixInk, drawChar(sp, urlTextPos, 85u)); // 'U'
  urlPrefixInk = max(urlPrefixInk, drawChar(sp, urlTextPos + vec2(gw, 0.0), 82u)); // 'R'
  urlPrefixInk = max(urlPrefixInk, drawChar(sp, urlTextPos + vec2(gw * 2.0, 0.0), 76u)); // 'L'
  urlPrefixInk = max(urlPrefixInk, drawChar(sp, urlTextPos + vec2(gw * 3.0, 0.0), 58u)); // ':'
  tubeColor = mix(tubeColor, vec3(0.40, 0.80, 1.0), urlPrefixInk);

  // Currently Selected URL in Omnibox
  vec2 curUrlPos = urlTextPos + vec2(gw * 5.0, 0.0);
  float curUrlInk = drawUrl(sp, curUrlPos, selected);
  tubeColor = mix(tubeColor, vec3(1.0, 1.0, 1.0), curUrlInk);

  // Blinking cursor in URL bar
  if (mod(c.motion.x * 2.0, 1.0) > 0.5) {
   uint curLen = (selected == 0u) ? URL_0_LEN : ((selected == 1u) ? URL_1_LEN : ((selected == 2u) ? URL_2_LEN : ((selected == 3u) ? URL_3_LEN : ((selected == 4u) ? URL_4_LEN : ((selected == 5u) ? URL_5_LEN : uint(clamp(c.piece.x, 0, 80)))))));
   vec2 cursorP = curUrlPos + vec2(gw * float(curLen) + 4.0, 0.0);
   float curBox = fill(box(sp, cursorP + vec2(2.0, 12.0), vec2(2.0, 10.0), 1.0));
   tubeColor = mix(tubeColor, vec3(0.0, 1.0, 0.70), curBox);
  }

  // 3. Bookmarks List (7 Interactive Rows)
  float rowW = 1560.0;
  float rowH = 76.0;
  float rowHalfW = rowW * 0.5;
  float rowHalfH = rowH * 0.5;
  float startY = 236.0;
  float rowSpacing = 92.0;

  for (uint k = 0u; k < 7u; k++) {
   vec2 rowPos = vec2(960.0, startY + float(k) * rowSpacing);
   bool isSel = (k == selected);

   float rBox = fill(box(sp, rowPos, vec2(rowHalfW, rowHalfH), 8.0));
   float rBorder = line(box(sp, rowPos, vec2(rowHalfW, rowHalfH), 8.0), isSel ? 2.5 : 1.2);

   vec3 rBg = isSel ? vec3(0.04, 0.09, 0.16) : vec3(0.02, 0.035, 0.06);
   vec3 rCol = isSel ? vec3(0.0, 0.95, 1.0) : vec3(0.12, 0.24, 0.38);

   tubeColor = mix(tubeColor, rBg, rBox * 0.92);
   tubeColor = mix(tubeColor, rCol, rBorder * 0.85);

   vec2 rowOrigin = rowPos - vec2(rowHalfW - 24.0, rowHalfH - 14.0);

   // Selection Indicator Arrow "[>]" or "[ ]"
   float arrowInk = 0.0;
   arrowInk = max(arrowInk, drawChar(sp, rowOrigin, 91u)); // '['
   if (isSel) {
    arrowInk = max(arrowInk, drawChar(sp, rowOrigin + vec2(gw, 0.0), 62u)); // '>'
   } else {
    arrowInk = max(arrowInk, drawDigit(sp, rowOrigin + vec2(gw, 0.0), k + 1u));
   }
   arrowInk = max(arrowInk, drawChar(sp, rowOrigin + vec2(gw * 2.0, 0.0), 93u)); // ']'
   tubeColor = mix(tubeColor, isSel ? vec3(0.20, 1.0, 0.50) : vec3(0.35, 0.60, 0.80), arrowInk);

   // Bookmark Title
   vec2 titlePos = rowOrigin + vec2(gw * 4.5, 0.0);
   float tInk = drawTitle(sp, titlePos, k);
   vec3 tCol = isSel ? vec3(1.0, 0.95, 0.40) : vec3(0.70, 0.85, 0.95);
   tubeColor = mix(tubeColor, tCol, tInk);

   // Bookmark URL
   vec2 urlPos = rowOrigin + vec2(gw * 4.5, 26.0);
   float uInk = drawUrl(sp, urlPos, k);
   vec3 uCol = isSel ? vec3(0.20, 0.85, 1.0) : vec3(0.40, 0.55, 0.70);
   tubeColor = mix(tubeColor, uCol, uInk);
  }

  // 4. Bottom Status & Result Modal Toast
  vec2 botPos = vec2(960.0, 936.0);
  vec2 botHalf = vec2(780.0, 40.0);
  float botBox = fill(box(sp, botPos, botHalf, 8.0));
  float botBorder = line(box(sp, botPos, botHalf, 8.0), 2.0);

  vec3 modalBg = vec3(0.02, 0.05, 0.08);
  vec3 modalBorder = vec3(0.15, 0.35, 0.55);
  vec3 modalTextCol = vec3(0.40, 0.85, 1.0);
  float modalInk = 0.0;
  vec2 mTextPos = botPos - vec2(botHalf.x - 24.0, 12.0);

  if (c.game.x == 1u) {
   // Launching browser modal
   modalBg = vec3(0.04, 0.08, 0.14);
   modalBorder = vec3(0.0, 0.85, 1.0);
   modalTextCol = vec3(0.20, 1.0, 0.60);
   for (uint i = 0u; i < MSG_1_LEN; i++) {
    modalInk = max(modalInk, drawChar(sp, mTextPos + vec2(gw * float(i), 0.0), MSG_1_CHARS[i]));
   }
  } else if (c.game.x == 3u || c.flow.x > 0.0) {
   // Returned from browser applet
   modalBg = vec3(0.06, 0.08, 0.04);
   modalBorder = vec3(0.20, 0.90, 0.40);
   modalTextCol = vec3(1.0, 0.90, 0.30);
   for (uint i = 0u; i < MSG_2_LEN; i++) {
    modalInk = max(modalInk, drawChar(sp, mTextPos + vec2(gw * float(i), 0.0), MSG_2_CHARS[i]));
   }
   // Result: 0x...
   vec2 resPos = mTextPos + vec2(gw * float(MSG_2_LEN + 2u), 0.0);
   modalInk = max(modalInk, drawChar(sp, resPos, 48u)); // '0'
   modalInk = max(modalInk, drawChar(sp, resPos + vec2(gw, 0.0), 120u)); // 'x'
   modalInk = max(modalInk, drawHex(sp, resPos + vec2(gw * 2.0, 0.0), c.game.z));
  } else {
   // Ready prompt
   for (uint i = 0u; i < MSG_READY_LEN; i++) {
    modalInk = max(modalInk, drawChar(sp, mTextPos + vec2(gw * float(i), 0.0), MSG_READY_CHARS[i]));
   }
  }

  tubeColor = mix(tubeColor, modalBg, botBox * 0.95);
  tubeColor = mix(tubeColor, modalBorder, botBorder * 0.85);
  tubeColor = mix(tubeColor, modalTextCol, modalInk);

  // Subtle Retro CRT Scanline Filter
  float scan = 0.90 + 0.10 * cos(sp.y * 3.14159265);
  tubeColor *= scan;

  color = tubeColor;
 }

 outColor = vec4(color, 1.0);
}
