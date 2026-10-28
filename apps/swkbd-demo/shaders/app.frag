#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#define HB_READONLY
#include "abi.glsl"
#include "hb.glsl"
#include "text.glsl"
#include "draw.glsl"

float drawChar(vec2 p, vec2 origin, uint ch) {
 if (ch < GLYPH_FIRST || ch >= GLYPH_FIRST + GLYPH_COUNT) return 0.0;
 uint idx = ch - GLYPH_FIRST;
 ivec4 rect = ivec4(int(idx % uint(GLYPH_COLS)) * GLYPH_W, int(idx / uint(GLYPH_COLS)) * GLYPH_H, GLYPH_W, GLYPH_H);
 return text(p, origin, rect);
}

float drawString(vec2 p, vec2 origin, uint textArray[32], uint len) {
 float ink = 0.0;
 for (uint i = 0u; i < 32u; i++) {
  if (i >= len) break;
  ink = max(ink, drawChar(p, origin + vec2(float(i * uint(GLYPH_W)), 0.0), textArray[i]));
 }
 return ink;
}

uint getTypedChar(uint idx) {
 if (idx >= 64u) return 0u;
 uint wordIdx = idx / 4u;
 uint shift = (idx % 4u) * 8u;
 return (c.rows[wordIdx] >> shift) & 255u;
}

// String constants for UI
const uint titleStr[40] = uint[](
 83u, 87u, 73u, 84u, 67u, 72u, 32u, 50u, 32u, 78u, 65u, 84u, 73u, 86u, 69u, 32u,
 83u, 79u, 70u, 84u, 87u, 65u, 82u, 69u, 32u, 75u, 69u, 89u, 66u, 79u, 65u, 82u, 68u, 32u, 80u, 79u, 67u, 0u, 0u, 0u
);

const uint subStr[36] = uint[](
 110u, 110u, 58u, 58u, 115u, 119u, 107u, 98u, 100u, 32u, 76u, 105u, 98u, 114u, 97u, 114u,
 121u, 32u, 65u, 112u, 112u, 108u, 101u, 116u, 32u, 68u, 101u, 109u, 111u, 110u, 115u, 116u, 114u, 97u, 116u, 105u
);

const uint promptLabel[12] = uint[](
 80u, 82u, 79u, 77u, 80u, 84u, 32u, 58u, 32u, 32u, 32u, 0u
);

const uint promptText[28] = uint[](
 72u, 101u, 108u, 108u, 111u, 87u, 111u, 114u, 108u, 100u, 83u, 50u, 32u,
 78u, 97u, 116u, 105u, 118u, 101u, 32u, 75u, 101u, 121u, 98u, 111u, 97u, 114u, 100u
);

const uint resultLabel[12] = uint[](
 84u, 69u, 88u, 84u, 32u, 32u, 32u, 58u, 32u, 32u, 32u, 0u
);

const uint statusReady[24] = uint[](
 83u, 84u, 65u, 84u, 85u, 83u, 58u, 32u, 82u, 69u, 65u, 68u, 89u, 32u, 40u, 80u, 82u, 69u, 83u, 83u, 32u, 65u, 41u, 0u
);

const uint statusOpen[24] = uint[](
 75u, 69u, 89u, 66u, 79u, 65u, 82u, 68u, 32u, 65u, 67u, 84u, 73u, 86u, 69u, 32u, 79u, 78u, 32u, 83u, 50u, 46u, 46u, 46u
);

const uint statusSuccess[24] = uint[](
 83u, 84u, 65u, 84u, 85u, 83u, 58u, 32u, 84u, 69u, 88u, 84u, 32u, 82u, 69u, 67u, 69u, 73u, 86u, 69u, 68u, 33u, 32u, 0u
);

const uint statusCancel[24] = uint[](
 83u, 84u, 65u, 84u, 85u, 83u, 58u, 32u, 68u, 73u, 83u, 77u, 73u, 83u, 83u, 69u, 68u, 47u, 67u, 65u, 78u, 67u, 69u, 76u
);

const uint hints[36] = uint[](
 40u, 65u, 41u, 32u, 79u, 112u, 101u, 110u, 32u, 83u, 111u, 102u, 116u, 32u, 75u, 101u,
 121u, 98u, 111u, 97u, 114u, 100u, 32u, 32u, 40u, 88u, 41u, 32u, 67u, 108u, 101u, 97u,
 114u, 32u, 45u, 32u
);

void main(){
 vec2 p = gl_FragCoord.xy;

 // CRT screen curvature & vignette
 vec2 uv = p / vec2(1920.0, 1080.0);
 float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
 vignette = clamp(pow(16.0 * vignette, 0.25), 0.0, 1.0);

 // Background CRT green glow
 vec3 bg = mix(vec3(0.01, 0.035, 0.02), vec3(0.02, 0.065, 0.035), p.y / 1080.0);
 vec3 color = bg;

 // Scanlines
 float scan = 0.94 + 0.06 * sin(p.y * 3.14159 * 1.5);
 color *= scan;

 // Main container card
 float card = fill(box(p, vec2(960.0, 540.0), vec2(860.0, 460.0), 16.0));
 color = mix(color, vec3(0.02, 0.08, 0.04), card);

 // Outer border
 float cardBorder = line(box(p, vec2(960.0, 540.0), vec2(860.0, 460.0), 16.0), 2.5);
 color = mix(color, vec3(0.2, 0.8, 0.4), cardBorder);

 // Title text
 float ink = 0.0;
 for (uint i = 0u; i < 37u; i++) {
  ink = max(ink, drawChar(p, vec2(140.0, 130.0) + vec2(float(i * uint(GLYPH_W)), 0.0), titleStr[i]));
 }
 color = mix(color, vec3(0.4, 1.0, 0.6), ink);

 // Subtitle text
 float subInk = 0.0;
 for (uint i = 0u; i < 36u; i++) {
  subInk = max(subInk, drawChar(p, vec2(140.0, 175.0) + vec2(float(i * uint(GLYPH_W)), 0.0), subStr[i]));
 }
 color = mix(color, vec3(0.25, 0.65, 0.4), subInk);

 // Status Banner box
 uint stateKind = c.game.x;
 vec3 badgeColor = vec3(0.1, 0.5, 0.3);
 if (stateKind == 1u) {
  // Pulsing yellow when active
  float pulse = 0.5 + 0.5 * sin(float(c.game.w) * 0.15);
  badgeColor = mix(vec3(0.6, 0.5, 0.1), vec3(0.9, 0.8, 0.2), pulse);
 } else if (stateKind == 2u) {
  badgeColor = vec3(0.15, 0.85, 0.45); // Bright green for success
 } else if (stateKind == 3u) {
  badgeColor = vec3(0.8, 0.3, 0.2);   // Red/Orange for cancelled
 }

 float statusBox = fill(box(p, vec2(960.0, 245.0), vec2(820.0, 30.0), 8.0));
 color = mix(color, badgeColor * 0.25, statusBox);
 float statusBorder = line(box(p, vec2(960.0, 245.0), vec2(820.0, 30.0), 8.0), 1.5);
 color = mix(color, badgeColor, statusBorder);

 // Status text inside banner
 float statusInk = 0.0;
 for (uint i = 0u; i < 24u; i++) {
  uint ch = 0u;
  if (stateKind == 0u) ch = statusReady[i];
  else if (stateKind == 1u) ch = statusOpen[i];
  else if (stateKind == 2u) ch = statusSuccess[i];
  else ch = statusCancel[i];
  if (ch == 0u) break;
  statusInk = max(statusInk, drawChar(p, vec2(160.0, 230.0) + vec2(float(i * uint(GLYPH_W)), 0.0), ch));
 }
 color = mix(color, badgeColor, statusInk);

 // Text Box Container
 float textBox = fill(box(p, vec2(960.0, 500.0), vec2(820.0, 160.0), 10.0));
 color = mix(color, vec3(0.01, 0.04, 0.02), textBox);
 float textBorder = line(box(p, vec2(960.0, 500.0), vec2(820.0, 160.0), 10.0), 2.0);
 color = mix(color, vec3(0.2, 0.6, 0.35), textBorder);

 // Line 1 inside Text Box: Prompt label & value
 float promptInk = 0.0;
 for (uint i = 0u; i < 9u; i++) promptInk = max(promptInk, drawChar(p, vec2(170.0, 400.0) + vec2(float(i * uint(GLYPH_W)), 0.0), promptLabel[i]));
 for (uint i = 0u; i < 28u; i++) promptInk = max(promptInk, drawChar(p, vec2(340.0, 400.0) + vec2(float(i * uint(GLYPH_W)), 0.0), promptText[i]));
 color = mix(color, vec3(0.4, 0.75, 0.5), promptInk);

 // Line 2 inside Text Box: Typed Text result
 float textInk = 0.0;
 for (uint i = 0u; i < 9u; i++) textInk = max(textInk, drawChar(p, vec2(170.0, 470.0) + vec2(float(i * uint(GLYPH_W)), 0.0), resultLabel[i]));
 
 // Opening quote
 textInk = max(textInk, drawChar(p, vec2(340.0, 470.0), 34u)); // '"'

 uint textLen = min(c.game.y, 40u);
 for (uint i = 0u; i < 40u; i++) {
  if (i >= textLen) break;
  uint ch = getTypedChar(i);
  textInk = max(textInk, drawChar(p, vec2(340.0 + float((i + 1u) * uint(GLYPH_W)), 470.0), ch));
 }

 // Closing quote & blinking cursor
 textInk = max(textInk, drawChar(p, vec2(340.0 + float((textLen + 1u) * uint(GLYPH_W)), 470.0), 34u));
 if ((c.game.w % 40u) < 20u) {
  textInk = max(textInk, drawChar(p, vec2(340.0 + float((textLen + 2u) * uint(GLYPH_W)), 470.0), 95u)); // '_'
 }
 color = mix(color, vec3(0.5, 1.0, 0.7), textInk);

 // Line 3: Info stats (Length & Result)
 float infoInk = 0.0;
 // Length info
 infoInk = max(infoInk, drawChar(p, vec2(170.0, 540.0), 76u)); // 'L'
 infoInk = max(infoInk, drawChar(p, vec2(170.0 + float(GLYPH_W), 540.0), 69u)); // 'E'
 infoInk = max(infoInk, drawChar(p, vec2(170.0 + float(2u * uint(GLYPH_W)), 540.0), 78u)); // 'N'
 infoInk = max(infoInk, drawChar(p, vec2(170.0 + float(3u * uint(GLYPH_W)), 540.0), 58u)); // ':'
 uint lenTens = (c.game.y / 10u) % 10u;
 uint lenOnes = c.game.y % 10u;
 infoInk = max(infoInk, drawChar(p, vec2(170.0 + float(5u * uint(GLYPH_W)), 540.0), 48u + lenTens));
 infoInk = max(infoInk, drawChar(p, vec2(170.0 + float(6u * uint(GLYPH_W)), 540.0), 48u + lenOnes));
 color = mix(color, vec3(0.3, 0.7, 0.45), infoInk);

 // Bottom Hints
 float hintInk = 0.0;
 for (uint i = 0u; i < 36u; i++) {
  hintInk = max(hintInk, drawChar(p, vec2(160.0, 930.0) + vec2(float(i * uint(GLYPH_W)), 0.0), hints[i]));
 }
 color = mix(color, vec3(0.3, 0.8, 0.5), hintInk);

 color *= vignette;
 outColor = vec4(color, 1.0);
}
