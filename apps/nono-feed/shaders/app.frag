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

// Header: "NONOPOST SOCIAL  |  Y: New Post  |  X: Refresh  |  A: 10*  |  R: 5*  |  -: Exit" (79 chars)
const uint HEADER_LEN = 79u;
const uint HEADER_CHARS[79] = uint[79](78u,79u,78u,79u,80u,79u,83u,84u,32u,83u,79u,67u,73u,65u,76u,32u,32u,124u,32u,32u,89u,58u,32u,78u,101u,119u,32u,80u,111u,115u,116u,32u,32u,124u,32u,32u,88u,58u,32u,82u,101u,102u,114u,101u,115u,104u,32u,32u,124u,32u,32u,65u,58u,32u,49u,48u,42u,32u,32u,124u,32u,32u,82u,58u,32u,53u,42u,32u,32u,124u,32u,32u,45u,58u,32u,69u,120u,105u,116u);

float drawHeader(vec2 p, vec2 origin){
 float ink = 0.0;
 for (uint i = 0u; i < HEADER_LEN; i++) {
  ink = max(ink, drawChar(p, origin + vec2(float(i * uint(GLYPH_W)), 0.0), HEADER_CHARS[i]));
 }
 return ink;
}

// "PUBLISHING POST TO NONOPOST... PLEASE WAIT" (42 chars)
const uint PUB_LEN = 42u;
const uint PUB_CHARS[42] = uint[42](80u,85u,66u,76u,73u,83u,72u,73u,78u,71u,32u,80u,79u,83u,84u,32u,84u,79u,32u,78u,79u,78u,79u,80u,79u,83u,84u,46u,46u,46u,32u,80u,76u,69u,65u,83u,69u,32u,87u,65u,73u,84u);

// "RATING SUBMITTED! THANK YOU!" (28 chars)
const uint RATE_LEN = 28u;
const uint RATE_CHARS[28] = uint[28](82u,65u,84u,73u,78u,71u,32u,83u,85u,66u,77u,73u,84u,84u,69u,68u,33u,32u,84u,72u,65u,78u,75u,32u,89u,79u,85u,33u);

// "LOADING FEED FROM NONOPOST.COM..." (33 chars)
const uint LOAD_LEN = 33u;
const uint LOAD_CHARS[33] = uint[33](76u,79u,65u,68u,73u,78u,71u,32u,70u,69u,69u,68u,32u,70u,82u,79u,77u,32u,78u,79u,78u,79u,80u,79u,83u,84u,46u,67u,79u,109u,46u,46u,46u);

// "FEED: POSTS 1-3  |  D-PAD UP/DOWN TO SCROLL" (43 chars)
const uint INFO_LEN = 43u;
const uint INFO_CHARS[43] = uint[43](70u,69u,69u,68u,58u,32u,80u,79u,83u,84u,83u,32u,49u,45u,51u,32u,32u,124u,32u,32u,68u,45u,80u,65u,68u,32u,85u,80u,47u,68u,79u,87u,78u,32u,84u,79u,32u,83u,67u,82u,79u,76u,76u);

// "[Rate: A = 10*, R = 5*]" (23 chars)
const uint FOOT_LEN = 23u;
const uint FOOT_CHARS[23] = uint[23](91u,82u,97u,116u,101u,58u,32u,65u,61u,49u,48u,42u,44u,32u,82u,61u,53u,42u,93u,0u,0u,0u,0u);

float drawAuthor(vec2 p, vec2 origin, uint cardIdx){
 float ink = 0.0;
 float gw = float(GLYPH_W);
 // Draw '@'
 ink = max(ink, drawChar(p, origin, 64u));
 for (uint i = 0u; i < 20u; i++) {
  uint ch = nnNonopostGetAuthorByte(cardIdx, i);
  if (ch == 0u) break;
  ink = max(ink, drawChar(p, origin + vec2(gw * float(i + 1u), 0.0), ch));
 }
 return ink;
}

float drawDate(vec2 p, vec2 origin, uint cardIdx){
 float ink = 0.0;
 float gw = float(GLYPH_W);
 for (uint i = 0u; i < 12u; i++) {
  uint ch = nnNonopostGetDateByte(cardIdx, i);
  if (ch == 0u) break;
  ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), ch));
 }
 return ink;
}

float drawContentLine(vec2 p, vec2 origin, uint cardIdx, uint startChar, uint maxChars){
 float ink = 0.0;
 float gw = float(GLYPH_W);
 for (uint i = 0u; i < maxChars; i++) {
  uint ch = nnNonopostGetContentByte(cardIdx, startChar + i);
  if (ch == 0u) break;
  ink = max(ink, drawChar(p, origin + vec2(gw * float(i), 0.0), ch));
 }
 return ink;
}

void main(){
 vec2 p = gl_FragCoord.xy;
 vec2 screenCenter = vec2(960.0, 540.0);
 vec2 tubeHalfSize = vec2(890.0, 500.0);

 // Normalized tube coordinates
 vec2 normUv = (p - screenCenter) / tubeHalfSize;
 vec2 d = normUv * 0.5;
 vec2 crtUv = normUv * (1.0 + dot(d, d) * 0.08);

 bool insideTube = (abs(crtUv.x) <= 1.0 && abs(crtUv.y) <= 1.0);
 vec3 cabinetCol = mix(vec3(0.015, 0.02, 0.03), vec3(0.03, 0.04, 0.05), p.y / 1080.0);

 vec3 color = cabinetCol;

 if (insideTube) {
  vec2 sp = crtUv * tubeHalfSize + screenCenter;

  // Deep cyber blue CRT background
  vec3 crtBg = mix(vec3(0.012, 0.025, 0.045), vec3(0.022, 0.045, 0.075), sp.y / 1080.0);
  float vig = clamp(1.0 - dot(crtUv * 0.45, crtUv * 0.45), 0.0, 1.0);
  crtBg *= vig;

  // 1. Render Header
  float headerInk = drawHeader(sp, vec2(120.0, 48.0));
  vec3 tubeColor = mix(crtBg, vec3(0.30, 0.90, 1.0), headerInk);

  // Header Divider
  if (abs(sp.y - 92.0) < 1.5 && sp.x >= 110.0 && sp.x <= 1810.0) {
   tubeColor = mix(tubeColor, vec3(0.0, 0.85, 1.0), 0.85);
  }

  uint batchCount = uint(max(c.piece.x, 0));
  uint selected = c.game.y;

  // 2. Render Post Cards (up to 3 cards per view)
  float cardW = 1660.0;
  float cardH = 246.0;
  float cardHalfW = cardW * 0.5;
  float cardHalfH = cardH * 0.5;
  float cardCenters[3] = float[3](232.0, 498.0, 764.0);

  for (uint k = 0u; k < 3u; k++) {
   if (k >= batchCount) {
    // Empty placeholder card
    vec2 cPos = vec2(960.0, cardCenters[k]);
    float boxBg = fill(box(sp, cPos, vec2(cardHalfW, cardHalfH), 12.0));
    float boxBorder = line(box(sp, cPos, vec2(cardHalfW, cardHalfH), 12.0), 1.5);
    tubeColor = mix(tubeColor, vec3(0.015, 0.025, 0.04), boxBg * 0.6);
    tubeColor = mix(tubeColor, vec3(0.08, 0.14, 0.22), boxBorder * 0.7);
    continue;
   }

   vec2 cPos = vec2(960.0, cardCenters[k]);
   bool isSel = (k == selected);

   float boxBg = fill(box(sp, cPos, vec2(cardHalfW, cardHalfH), 12.0));
   float boxBorder = line(box(sp, cPos, vec2(cardHalfW, cardHalfH), 12.0), isSel ? 2.5 : 1.5);

   vec3 cardBg = isSel ? vec3(0.035, 0.075, 0.13) : vec3(0.02, 0.035, 0.06);
   vec3 borderCol = isSel ? vec3(0.0, 0.95, 1.0) : vec3(0.12, 0.22, 0.35);

   tubeColor = mix(tubeColor, cardBg, boxBg * 0.92);
   tubeColor = mix(tubeColor, borderCol, boxBorder * 0.85);

   // Inner elements relative to card origin
   vec2 cardTopLeft = cPos - vec2(cardHalfW - 32.0, cardHalfH - 26.0);

   // Header: Author handle
   float authorInk = drawAuthor(sp, cardTopLeft, k);
   vec3 authorCol = isSel ? vec3(1.0, 0.90, 0.30) : vec3(0.35, 0.85, 1.0);
   tubeColor = mix(tubeColor, authorCol, authorInk);

   // Header: Timestamp
   vec2 datePos = cardTopLeft + vec2(420.0, 0.0);
   float dateInk = drawDate(sp, datePos, k);
   tubeColor = mix(tubeColor, vec3(0.55, 0.70, 0.85), dateInk);

   // Rating Badge: "[★ 5.0]"
   vec2 starPos = cardTopLeft + vec2(680.0, 0.0);
   float starInk = 0.0;
   float gw = float(GLYPH_W);
   starInk = max(starInk, drawChar(sp, starPos, 91u)); // '['
   starInk = max(starInk, drawChar(sp, starPos + vec2(gw, 0.0), 83u)); // 'S'
   starInk = max(starInk, drawChar(sp, starPos + vec2(gw * 2.0, 0.0), 116u)); // 't'
   starInk = max(starInk, drawChar(sp, starPos + vec2(gw * 3.0, 0.0), 97u)); // 'a'
   starInk = max(starInk, drawChar(sp, starPos + vec2(gw * 4.0, 0.0), 114u)); // 'r'
   starInk = max(starInk, drawChar(sp, starPos + vec2(gw * 5.0, 0.0), 58u)); // ':'
   float ratingVal = nnNonopostGetRating(k);
   uint rInt = uint(clamp(ratingVal, 0.0, 10.0));
   starInk = max(starInk, drawDigit(sp, starPos + vec2(gw * 7.0, 0.0), rInt));
   starInk = max(starInk, drawChar(sp, starPos + vec2(gw * 8.0, 0.0), 93u)); // ']'
   tubeColor = mix(tubeColor, vec3(1.0, 0.78, 0.20), starInk);

   // Thin divider inside card
   float divY = cardTopLeft.y + 38.0;
   if (abs(sp.y - divY) < 1.0 && sp.x >= cardTopLeft.x && sp.x <= cardTopLeft.x + cardW - 64.0) {
    tubeColor = mix(tubeColor, isSel ? vec3(0.15, 0.45, 0.65) : vec3(0.08, 0.16, 0.25), 0.70);
   }

   // Post Content: 3 text lines
   vec2 line1 = cardTopLeft + vec2(0.0, 52.0);
   vec2 line2 = cardTopLeft + vec2(0.0, 96.0);
   vec2 line3 = cardTopLeft + vec2(0.0, 140.0);

   float ink1 = drawContentLine(sp, line1, k, 0u, 52u);
   float ink2 = drawContentLine(sp, line2, k, 52u, 52u);
   float ink3 = drawContentLine(sp, line3, k, 104u, 52u);

   vec3 textCol = isSel ? vec3(0.95, 0.98, 1.0) : vec3(0.80, 0.88, 0.95);
   tubeColor = mix(tubeColor, textCol, max(max(ink1, ink2), ink3));

   // Card Footer: Action hints
   vec2 footPos = cardTopLeft + vec2(0.0, 184.0);
   float footInk = 0.0;
   for (uint f = 0u; f < 19u; f++) {
    footInk = max(footInk, drawChar(sp, footPos + vec2(gw * float(f), 0.0), FOOT_CHARS[f]));
   }
   tubeColor = mix(tubeColor, isSel ? vec3(0.20, 0.85, 0.95) : vec3(0.35, 0.50, 0.65), footInk);
  }

  // 3. Right Scrollbar Track
  float trackX = 1820.0;
  float trackTop = 110.0;
  float trackH = 800.0;
  float trackBox = fill(box(sp, vec2(trackX, trackTop + trackH * 0.5), vec2(3.0, trackH * 0.5), 2.0));
  tubeColor = mix(tubeColor, vec3(0.05, 0.12, 0.18), trackBox);

  uint totalP = max(c.game.w, 3u);
  float thumbH = max(48.0, trackH * 3.0 / float(totalP));
  float thumbY = trackTop + thumbH * 0.5 + (trackH - thumbH) * float(min(c.game.z, totalP - 3u)) / float(max(totalP - 3u, 1u));
  float thumbBox = fill(box(sp, vec2(trackX, thumbY), vec2(5.0, thumbH * 0.5), 3.0));
  float thumbLine = line(box(sp, vec2(trackX, thumbY), vec2(5.0, thumbH * 0.5), 3.0), 1.5);
  tubeColor = mix(tubeColor, vec3(0.0, 0.80, 1.0), thumbBox);
  tubeColor = mix(tubeColor, vec3(0.60, 0.95, 1.0), thumbLine);

  // 4. Bottom HUD / Status Bar
  if (abs(sp.y - 945.0) < 1.0 && sp.x >= 110.0 && sp.x <= 1810.0) {
   tubeColor = mix(tubeColor, vec3(0.0, 0.55, 0.75), 0.50);
  }

  vec2 botPos = vec2(120.0, 970.0);
  float botInk = 0.0;
  vec3 botCol = vec3(0.40, 0.85, 1.0);

  if (c.flow.y > 0.0) {
   // Publishing toast
   for (uint i = 0u; i < PUB_LEN; i++) {
    botInk = max(botInk, drawChar(sp, botPos + vec2(float(i * uint(GLYPH_W)), 0.0), PUB_CHARS[i]));
   }
   botCol = vec3(0.20, 1.0, 0.60);
  } else if (c.flow.z > 0.0) {
   // Rated toast
   for (uint i = 0u; i < RATE_LEN; i++) {
    botInk = max(botInk, drawChar(sp, botPos + vec2(float(i * uint(GLYPH_W)), 0.0), RATE_CHARS[i]));
   }
   botCol = vec3(1.0, 0.85, 0.20);
  } else if (c.game.x == 1u) {
   // Loading feed toast
   for (uint i = 0u; i < LOAD_LEN; i++) {
    botInk = max(botInk, drawChar(sp, botPos + vec2(float(i * uint(GLYPH_W)), 0.0), LOAD_CHARS[i]));
   }
   botCol = vec3(0.30, 0.90, 1.0);
  } else {
   for (uint i = 0u; i < INFO_LEN; i++) {
    botInk = max(botInk, drawChar(sp, botPos + vec2(float(i * uint(GLYPH_W)), 0.0), INFO_CHARS[i]));
   }
   botCol = vec3(0.45, 0.65, 0.85);
  }
  tubeColor = mix(tubeColor, botCol, botInk);

  // 5. CRT Scanlines & Phosphor Aperture Mask
  float scanline = 0.82 + 0.18 * cos(sp.y * 3.14159265);
  float shadowMask = 0.93 + 0.07 * sin(sp.x * 3.14159265 * 0.5);
  tubeColor = tubeColor * scanline * shadowMask;

  color = tubeColor;
 }

 outColor = vec4(color, 1.0);
}
