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

float drawUint(vec2 p, vec2 origin, uint v, uint minDigits){
 float ink = 0.0;
 float gw = float(GLYPH_W);
 uint div = 1u;
 for (uint i = 1u; i < minDigits; i++) div *= 10u;
 if (div == 0u) div = 1u;
 for (uint i = 0u; i < minDigits; i++) {
  uint digit = (v / div) % 10u;
  ink = max(ink, drawDigit(p, origin + vec2(gw * float(i), 0.0), digit));
  div /= 10u;
 }
 return ink;
}

// Header: "S2 AUDIO LAB  |  +: Mode  |  Up/Down: Vol  |  -: Exit" (53 chars)
const uint HEADER_LEN = 53u;
const uint HEADER_CHARS[53] = uint[](
 83u,50u,32u,65u,85u,68u,73u,79u,32u,76u,65u,66u,32u,32u,124u,32u,32u,43u,58u,32u,77u,111u,100u,101u,
 32u,32u,124u,32u,32u,85u,112u,47u,68u,111u,119u,110u,58u,32u,86u,111u,108u,
 32u,32u,124u,32u,32u,45u,58u,32u,69u,120u,105u,116u
);

// Labels for 8 SFX slots
const uint SFX_NAMES_LEN = 8u;
const uint SFX_NAME_CHARS[112] = uint[](
 // 0: "[A] COIN CHIME"
 91u,65u,93u,32u,67u,79u,73u,78u,32u,67u,72u,73u,77u,69u,
 // 1: "[X] LASER BEAM"
 91u,88u,93u,32u,76u,65u,83u,69u,82u,32u,66u,69u,65u,77u,
 // 2: "[Y] JUMP CHIRP"
 91u,89u,93u,32u,74u,85u,77u,80u,32u,67u,72u,73u,82u,80u,
 // 3: "[B] EXPLOSION "
 91u,66u,93u,32u,69u,88u,80u,76u,79u,83u,73u,79u,78u,32u,
 // 4: "[L] POWERUP   "
 91u,76u,93u,32u,80u,79u,87u,69u,82u,85u,80u,32u,32u,32u,
 // 5: "[R] HIT DAMAGE"
 91u,82u,93u,32u,72u,73u,84u,32u,68u,65u,77u,65u,71u,69u,
 // 6: "[1] 1-UP JINGL"
 91u,49u,93u,32u,49u,45u,85u,80u,32u,74u,73u,78u,71u,76u,
 // 7: "[2] BEEP PING "
 91u,50u,93u,32u,66u,69u,69u,80u,32u,80u,73u,78u,71u,32u
);

// Waveform names: SINE, SQUARE, TRIANGLE, SAWTOOTH, NOISE
const uint WAVE_CHARS[40] = uint[](
 83u,73u,78u,69u,32u,32u,32u,32u, // SINE
 83u,81u,85u,65u,82u,69u,32u,32u, // SQUARE
 84u,82u,73u,65u,78u,71u,76u,69u, // TRIANGLE
 83u,65u,87u,84u,79u,79u,84u,72u, // SAWTOOTH
 78u,79u,73u,83u,69u,32u,32u,32u  // NOISE
);

// Note names: C4, D4, E4, F4, G4, A4, B4, C5
const uint NOTE_CHARS[16] = uint[](
 67u,52u, 68u,52u, 69u,52u, 70u,52u, 71u,52u, 65u,52u, 66u,52u, 67u,53u
);

void main(){
 vec2 p = gl_FragCoord.xy;
 vec2 screenCenter = vec2(960.0, 540.0);
 vec2 uv = (p - screenCenter) / vec2(960.0, 540.0);

 // CRT screen barrel distortion
 vec2 crtUv = uv;
 crtUv.x *= 1.0 + 0.035 * (uv.y * uv.y);
 crtUv.y *= 1.0 + 0.045 * (uv.x * uv.x);
 vec2 tubeHalfSize = vec2(930.0, 515.0);

 bool insideTube = (abs(crtUv.x) <= 1.0 && abs(crtUv.y) <= 1.0);
 vec3 cabinetCol = mix(vec3(0.012, 0.016, 0.022), vec3(0.022, 0.028, 0.038), p.y / 1080.0);
 vec3 color = cabinetCol;

 if (insideTube) {
  vec2 sp = crtUv * tubeHalfSize + screenCenter;
  float gw = float(GLYPH_W);
  float gh = float(GLYPH_H);

  // Deep obsidian studio CRT background
  vec3 crtBg = mix(vec3(0.015, 0.025, 0.035), vec3(0.025, 0.045, 0.060), sp.y / 1080.0);
  vec3 tubeColor = crtBg;

  // Header Bar (Top: Y = 55.0)
  float hInk = 0.0;
  for (uint i = 0u; i < HEADER_LEN; i++) {
   hInk = max(hInk, drawChar(sp, vec2(140.0, 55.0) + vec2(gw * float(i), 0.0), HEADER_CHARS[i]));
  }
  tubeColor = mix(tubeColor, vec3(0.20, 0.95, 0.85), hInk);

  // Header Divider Line
  if (abs(sp.y - 95.0) < 1.5 && sp.x >= 130.0 && sp.x <= 1790.0) {
   tubeColor = mix(tubeColor, vec3(0.15, 0.60, 0.55), 0.8);
  }

  // =========================================================================
  // 1. LEFT PANEL: Stereo Channels & Hardware VU Meters (X: 140..475)
  // =========================================================================
  vec2 lPanCenter = vec2(307.0, 275.0);
  vec2 lPanHalf = vec2(167.0, 145.0);
  float lBox = fill(box(sp, lPanCenter, lPanHalf, 10.0));
  float lBorder = line(box(sp, lPanCenter, lPanHalf, 10.0), 1.8);
  tubeColor = mix(tubeColor, vec3(0.025, 0.055, 0.085), lBox * 0.92);
  tubeColor = mix(tubeColor, vec3(0.15, 0.55, 0.75), lBorder * 0.85);

  // Left Panel Header: "[CHANNELS]"
  vec2 lhPos = vec2(200.0, 160.0);
  float lhInk = drawChar(sp, lhPos, 91u); // '['
  lhInk = max(lhInk, drawChar(sp, lhPos + vec2(gw * 1.0, 0.0), 67u)); // 'C'
  lhInk = max(lhInk, drawChar(sp, lhPos + vec2(gw * 2.0, 0.0), 72u)); // 'H'
  lhInk = max(lhInk, drawChar(sp, lhPos + vec2(gw * 3.0, 0.0), 65u)); // 'A'
  lhInk = max(lhInk, drawChar(sp, lhPos + vec2(gw * 4.0, 0.0), 78u)); // 'N'
  lhInk = max(lhInk, drawChar(sp, lhPos + vec2(gw * 5.0, 0.0), 78u)); // 'N'
  lhInk = max(lhInk, drawChar(sp, lhPos + vec2(gw * 6.0, 0.0), 69u)); // 'E'
  lhInk = max(lhInk, drawChar(sp, lhPos + vec2(gw * 7.0, 0.0), 76u)); // 'L'
  lhInk = max(lhInk, drawChar(sp, lhPos + vec2(gw * 8.0, 0.0), 83u)); // 'S'
  lhInk = max(lhInk, drawChar(sp, lhPos + vec2(gw * 9.0, 0.0), 93u)); // ']'
  tubeColor = mix(tubeColor, vec3(0.30, 0.85, 1.0), lhInk);

  // VU Meter L
  vec2 vuLText = vec2(170.0, 220.0);
  float vuLInk = drawChar(sp, vuLText, 76u); // 'L'
  vuLInk = max(vuLInk, drawChar(sp, vuLText + vec2(gw, 0.0), 58u)); // ':'
  tubeColor = mix(tubeColor, vec3(0.20, 0.90, 0.60), vuLInk);

  // VU Bar L
  vec2 vuLBarCenter = vec2(330.0, 220.0);
  vec2 vuLBarHalf = vec2(105.0, 8.0);
  float vuLBox = fill(box(sp, vuLBarCenter, vuLBarHalf, 2.0));
  float vuLBorder = line(box(sp, vuLBarCenter, vuLBarHalf, 2.0), 1.2);
  tubeColor = mix(tubeColor, vec3(0.03, 0.08, 0.05), vuLBox);
  tubeColor = mix(tubeColor, vec3(0.15, 0.50, 0.30), vuLBorder);

  float vuLLevel = clamp(c.flow.z, 0.05, 1.0);
  float vuLWidth = vuLLevel * 210.0;
  if (sp.x >= (vuLBarCenter.x - 105.0) && sp.x <= (vuLBarCenter.x - 105.0 + vuLWidth) && abs(sp.y - vuLBarCenter.y) <= 6.0) {
   vec3 vuLCol = mix(vec3(0.10, 0.90, 0.40), vec3(1.0, 0.30, 0.20), (sp.x - (vuLBarCenter.x - 105.0)) / 210.0);
   tubeColor = mix(tubeColor, vuLCol, 0.95);
  }

  // VU Meter R
  vec2 vuRText = vec2(170.0, 275.0);
  float vuRInk = drawChar(sp, vuRText, 82u); // 'R'
  vuRInk = max(vuRInk, drawChar(sp, vuRText + vec2(gw, 0.0), 58u)); // ':'
  tubeColor = mix(tubeColor, vec3(0.20, 0.90, 0.60), vuRInk);

  // VU Bar R
  vec2 vuRBarCenter = vec2(330.0, 275.0);
  vec2 vuRBarHalf = vec2(105.0, 8.0);
  float vuRBox = fill(box(sp, vuRBarCenter, vuRBarHalf, 2.0));
  float vuRBorder = line(box(sp, vuRBarCenter, vuRBarHalf, 2.0), 1.2);
  tubeColor = mix(tubeColor, vec3(0.03, 0.08, 0.05), vuRBox);
  tubeColor = mix(tubeColor, vec3(0.15, 0.50, 0.30), vuRBorder);

  float vuRLevel = clamp(c.flow.w, 0.05, 1.0);
  float vuRWidth = vuRLevel * 210.0;
  if (sp.x >= (vuRBarCenter.x - 105.0) && sp.x <= (vuRBarCenter.x - 105.0 + vuRWidth) && abs(sp.y - vuRBarCenter.y) <= 6.0) {
   vec3 vuRCol = mix(vec3(0.10, 0.90, 0.40), vec3(1.0, 0.30, 0.20), (sp.x - (vuRBarCenter.x - 105.0)) / 210.0);
   tubeColor = mix(tubeColor, vuRCol, 0.95);
  }

  // Left Panel Subtitle: "STEREO 2-CH"
  vec2 stPos = vec2(170.0, 335.0);
  float stInk = drawChar(sp, stPos, 83u); // 'S'
  stInk = max(stInk, drawChar(sp, stPos + vec2(gw * 1.0, 0.0), 84u)); // 'T'
  stInk = max(stInk, drawChar(sp, stPos + vec2(gw * 2.0, 0.0), 69u)); // 'E'
  stInk = max(stInk, drawChar(sp, stPos + vec2(gw * 3.0, 0.0), 82u)); // 'R'
  stInk = max(stInk, drawChar(sp, stPos + vec2(gw * 4.0, 0.0), 69u)); // 'E'
  stInk = max(stInk, drawChar(sp, stPos + vec2(gw * 5.0, 0.0), 79u)); // 'O'
  stInk = max(stInk, drawChar(sp, stPos + vec2(gw * 7.0, 0.0), 50u)); // '2'
  stInk = max(stInk, drawChar(sp, stPos + vec2(gw * 8.0, 0.0), 45u)); // '-'
  stInk = max(stInk, drawChar(sp, stPos + vec2(gw * 9.0, 0.0), 67u)); // 'C'
  stInk = max(stInk, drawChar(sp, stPos + vec2(gw * 10.0, 0.0), 72u)); // 'H'
  tubeColor = mix(tubeColor, vec3(0.50, 0.75, 0.90), stInk);

  // Left Panel Footer: "HARDWARE: S2"
  vec2 hwPos = vec2(170.0, 380.0);
  float hwInk = drawChar(sp, hwPos, 72u); // 'H'
  hwInk = max(hwInk, drawChar(sp, hwPos + vec2(gw * 1.0, 0.0), 87u)); // 'W'
  hwInk = max(hwInk, drawChar(sp, hwPos + vec2(gw * 2.0, 0.0), 58u)); // ':'
  hwInk = max(hwInk, drawChar(sp, hwPos + vec2(gw * 4.0, 0.0), 83u)); // 'S'
  hwInk = max(hwInk, drawChar(sp, hwPos + vec2(gw * 5.0, 0.0), 50u)); // '2'
  hwInk = max(hwInk, drawChar(sp, hwPos + vec2(gw * 7.0, 0.0), 79u)); // 'O'
  hwInk = max(hwInk, drawChar(sp, hwPos + vec2(gw * 8.0, 0.0), 75u)); // 'K'
  tubeColor = mix(tubeColor, vec3(0.20, 0.90, 0.60), hwInk);

  // =========================================================================
  // 2. CENTER PANEL: Tektronix Green Phosphor Oscilloscope (X: 500..1420)
  // Completely isolated! No text, meters, or indicators overlay this screen!
  // =========================================================================
  vec2 oscCenter = vec2(960.0, 275.0);
  vec2 oscHalf = vec2(460.0, 145.0);

  float oscBox = fill(box(sp, oscCenter, oscHalf, 10.0));
  float oscBorder = line(box(sp, oscCenter, oscHalf, 10.0), 2.2);

  // Cathode glow background
  vec3 oscBg = mix(vec3(0.01, 0.05, 0.025), vec3(0.02, 0.09, 0.045), (sp.y - (oscCenter.y - oscHalf.y)) / (oscHalf.y * 2.0));
  tubeColor = mix(tubeColor, oscBg, oscBox * 0.95);
  tubeColor = mix(tubeColor, vec3(0.12, 0.85, 0.45), oscBorder * 0.85);

  if (abs(sp.x - oscCenter.x) <= oscHalf.x - 4.0 && abs(sp.y - oscCenter.y) <= oscHalf.y - 4.0) {
   vec2 oscLocal = sp - oscCenter;
   bool majorGrid = (mod(abs(oscLocal.x), 76.0) < 1.0 || mod(abs(oscLocal.y), 50.0) < 1.0);
   bool centerCross = (abs(oscLocal.x) < 1.2 || abs(oscLocal.y) < 1.2);

   if (centerCross) {
    tubeColor = mix(tubeColor, vec3(0.15, 0.45, 0.25), 0.7);
   } else if (majorGrid) {
    tubeColor = mix(tubeColor, vec3(0.08, 0.25, 0.14), 0.5);
   }

   // Waveform Beam
   float normX = (oscLocal.x / (oscHalf.x - 10.0)) * 0.5 + 0.5; // 0.0 to 1.0
   float wavePhase = normX * 8.0 * 3.14159 + c.motion.x * 20.0;

   float waveVal = 0.0;
   uint curWave = c.game.w;
   float amp = max(0.20, (c.flow.z + c.flow.w) * 0.5);

   if (curWave == 0u) { // Sine
    waveVal = sin(wavePhase);
   } else if (curWave == 1u) { // Square
    waveVal = sin(wavePhase) >= 0.0 ? 0.85 : -0.85;
   } else if (curWave == 2u) { // Triangle
    waveVal = (2.0 / 3.14159) * asin(sin(wavePhase));
   } else if (curWave == 3u) { // Saw
    waveVal = (fract(wavePhase / (2.0 * 3.14159)) * 2.0 - 1.0);
   } else { // Noise
    waveVal = (sin(wavePhase * 13.7) + cos(wavePhase * 29.3)) * 0.5;
   }

   // Combine with peak amp
   waveVal *= amp * (oscHalf.y - 25.0);
   float beamDist = abs(oscLocal.y - waveVal);
   float beam = exp(-beamDist * 0.45);
   float beamCore = smoothstep(2.0, 0.0, beamDist);

   vec3 beamCol = vec3(0.10, 1.0, 0.40) * beam * 0.9 + vec3(0.80, 1.0, 0.85) * beamCore;
   tubeColor += beamCol;
  }

  // =========================================================================
  // 3. RIGHT PANEL: Audio Hardware Spec & Master Volume (X: 1445..1780)
  // Completely isolated! Cleanly framed on the right flank!
  // =========================================================================
  vec2 rPanCenter = vec2(1613.0, 275.0);
  vec2 rPanHalf = vec2(167.0, 145.0);
  float rBox = fill(box(sp, rPanCenter, rPanHalf, 10.0));
  float rBorder = line(box(sp, rPanCenter, rPanHalf, 10.0), 1.8);
  tubeColor = mix(tubeColor, vec3(0.025, 0.055, 0.085), rBox * 0.92);
  tubeColor = mix(tubeColor, vec3(0.15, 0.55, 0.75), rBorder * 0.85);

  // Right Panel Header: "[AUDIO OUT]"
  vec2 rhPos = vec2(1500.0, 160.0);
  float rhInk = drawChar(sp, rhPos, 91u); // '['
  rhInk = max(rhInk, drawChar(sp, rhPos + vec2(gw * 1.0, 0.0), 65u)); // 'A'
  rhInk = max(rhInk, drawChar(sp, rhPos + vec2(gw * 2.0, 0.0), 85u)); // 'U'
  rhInk = max(rhInk, drawChar(sp, rhPos + vec2(gw * 3.0, 0.0), 68u)); // 'D'
  rhInk = max(rhInk, drawChar(sp, rhPos + vec2(gw * 4.0, 0.0), 73u)); // 'I'
  rhInk = max(rhInk, drawChar(sp, rhPos + vec2(gw * 5.0, 0.0), 79u)); // 'O'
  rhInk = max(rhInk, drawChar(sp, rhPos + vec2(gw * 7.0, 0.0), 79u)); // 'O'
  rhInk = max(rhInk, drawChar(sp, rhPos + vec2(gw * 8.0, 0.0), 85u)); // 'U'
  rhInk = max(rhInk, drawChar(sp, rhPos + vec2(gw * 9.0, 0.0), 84u)); // 'T'
  rhInk = max(rhInk, drawChar(sp, rhPos + vec2(gw * 10.0, 0.0), 93u)); // ']'
  tubeColor = mix(tubeColor, vec3(0.30, 0.85, 1.0), rhInk);

  // Sample Rate: "RATE: 48000 HZ"
  vec2 ratePos = vec2(1480.0, 215.0);
  float rateInk = drawChar(sp, ratePos, 82u); // 'R'
  rateInk = max(rateInk, drawChar(sp, ratePos + vec2(gw * 1.0, 0.0), 65u)); // 'A'
  rateInk = max(rateInk, drawChar(sp, ratePos + vec2(gw * 2.0, 0.0), 84u)); // 'T'
  rateInk = max(rateInk, drawChar(sp, ratePos + vec2(gw * 3.0, 0.0), 69u)); // 'E'
  rateInk = max(rateInk, drawChar(sp, ratePos + vec2(gw * 4.0, 0.0), 58u)); // ':'
  rateInk = max(rateInk, drawUint(sp, ratePos + vec2(gw * 6.0, 0.0), 48000u, 5u));
  rateInk = max(rateInk, drawChar(sp, ratePos + vec2(gw * 12.0, 0.0), 72u)); // 'H'
  rateInk = max(rateInk, drawChar(sp, ratePos + vec2(gw * 13.0, 0.0), 90u)); // 'Z'
  tubeColor = mix(tubeColor, vec3(0.25, 0.95, 0.70), rateInk);

  // Format: "FMT:  16-BIT PCM"
  vec2 fmtPos = vec2(1480.0, 255.0);
  float fmtInk = drawChar(sp, fmtPos, 70u); // 'F'
  fmtInk = max(fmtInk, drawChar(sp, fmtPos + vec2(gw * 1.0, 0.0), 77u)); // 'M'
  fmtInk = max(fmtInk, drawChar(sp, fmtPos + vec2(gw * 2.0, 0.0), 84u)); // 'T'
  fmtInk = max(fmtInk, drawChar(sp, fmtPos + vec2(gw * 3.0, 0.0), 58u)); // ':'
  fmtInk = max(fmtInk, drawChar(sp, fmtPos + vec2(gw * 6.0, 0.0), 49u)); // '1'
  fmtInk = max(fmtInk, drawChar(sp, fmtPos + vec2(gw * 7.0, 0.0), 54u)); // '6'
  fmtInk = max(fmtInk, drawChar(sp, fmtPos + vec2(gw * 8.0, 0.0), 45u)); // '-'
  fmtInk = max(fmtInk, drawChar(sp, fmtPos + vec2(gw * 9.0, 0.0), 66u)); // 'B'
  fmtInk = max(fmtInk, drawChar(sp, fmtPos + vec2(gw * 10.0, 0.0), 73u)); // 'I'
  fmtInk = max(fmtInk, drawChar(sp, fmtPos + vec2(gw * 11.0, 0.0), 84u)); // 'T'
  tubeColor = mix(tubeColor, vec3(0.50, 0.75, 0.90), fmtInk);

  // Master Volume Text: "VOL: [85]%"
  vec2 volPos = vec2(1480.0, 305.0);
  float volInk = drawChar(sp, volPos, 86u); // 'V'
  volInk = max(volInk, drawChar(sp, volPos + vec2(gw * 1.0, 0.0), 79u)); // 'O'
  volInk = max(volInk, drawChar(sp, volPos + vec2(gw * 2.0, 0.0), 76u)); // 'L'
  volInk = max(volInk, drawChar(sp, volPos + vec2(gw * 3.0, 0.0), 58u)); // ':'
  volInk = max(volInk, drawUint(sp, volPos + vec2(gw * 5.0, 0.0), c.game.z, 3u));
  volInk = max(volInk, drawChar(sp, volPos + vec2(gw * 8.5, 0.0), 37u)); // '%'
  tubeColor = mix(tubeColor, vec3(0.40, 0.90, 1.0), volInk);

  // Volume Bar
  vec2 vBarCenter = vec2(1613.0, 345.0);
  vec2 vBarHalf = vec2(125.0, 7.0);
  float vFill = fill(box(sp, vBarCenter, vBarHalf, 2.0));
  float vBorder = line(box(sp, vBarCenter, vBarHalf, 2.0), 1.2);
  tubeColor = mix(tubeColor, vec3(0.03, 0.08, 0.12), vFill);
  tubeColor = mix(tubeColor, vec3(0.20, 0.70, 0.90), vBorder);

  float volLevel = clamp(float(c.game.z) / 100.0, 0.0, 1.0);
  float vFillW = volLevel * 250.0;
  if (sp.x >= (vBarCenter.x - 125.0) && sp.x <= (vBarCenter.x - 125.0 + vFillW) && abs(sp.y - vBarCenter.y) <= 5.0) {
   tubeColor = mix(tubeColor, vec3(0.10, 0.90, 1.0), 0.95);
  }

  // Volume Hint: "D-PAD: VOL +/-"
  vec2 vHintPos = vec2(1480.0, 385.0);
  float vHintInk = drawChar(sp, vHintPos, 68u); // 'D'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 1.0, 0.0), 45u)); // '-'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 2.0, 0.0), 80u)); // 'P'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 3.0, 0.0), 65u)); // 'A'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 4.0, 0.0), 68u)); // 'D'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 5.0, 0.0), 58u)); // ':'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 7.0, 0.0), 86u)); // 'V'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 8.0, 0.0), 79u)); // 'O'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 9.0, 0.0), 76u)); // 'L'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 11.0, 0.0), 43u)); // '+'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 12.0, 0.0), 47u)); // '/'
  vHintInk = max(vHintInk, drawChar(sp, vHintPos + vec2(gw * 13.0, 0.0), 45u)); // '-'
  tubeColor = mix(tubeColor, vec3(0.40, 0.70, 0.85), vHintInk);

  // =========================================================================
  // 4. MAIN INTERACTIVE AREA: Soundboard (Mode 0) vs Synthesizer (Mode 1)
  // =========================================================================
  if (c.game.x == 0u) {
   // Mode 0: Soundboard Grid (8 slots in 2 rows of 4)
   float cardHalfW = 160.0;
   float cardHalfH = 42.0;
   float gridStartX = 420.0;
   float gridSpacingX = 360.0;
   float row1Y = 535.0;
   float row2Y = 645.0;

   for (uint k = 0u; k < 8u; k++) {
    float cx = gridStartX + float(k % 4u) * gridSpacingX;
    float cy = (k < 4u) ? row1Y : row2Y;
    vec2 cPos = vec2(cx, cy);

    bool isSel = (k == c.game.y);
    bool isTriggered = (c.flow.x > 0.0 && uint(c.piece.w) == k);

    float cBox = fill(box(sp, cPos, vec2(cardHalfW, cardHalfH), 8.0));
    float cBorder = line(box(sp, cPos, vec2(cardHalfW, cardHalfH), 8.0), isTriggered ? 3.0 : (isSel ? 2.0 : 1.2));

    vec3 cardBg = isTriggered ? vec3(0.08, 0.25, 0.35) : (isSel ? vec3(0.04, 0.12, 0.18) : vec3(0.02, 0.04, 0.06));
    vec3 borderCol = isTriggered ? vec3(0.0, 1.0, 0.90) : (isSel ? vec3(0.20, 0.85, 1.0) : vec3(0.15, 0.25, 0.35));

    tubeColor = mix(tubeColor, cardBg, cBox * 0.92);
    tubeColor = mix(tubeColor, borderCol, cBorder * 0.85);

    // SFX Title Text
    vec2 textOrigin = cPos - vec2(cardHalfW - 14.0, 14.0);
    float nameInk = 0.0;
    for (uint ch = 0u; ch < 14u; ch++) {
     nameInk = max(nameInk, drawChar(sp, textOrigin + vec2(gw * float(ch), 0.0), SFX_NAME_CHARS[k * 14u + ch]));
    }
    vec3 nameCol = isTriggered ? vec3(1.0, 1.0, 0.90) : (isSel ? vec3(0.30, 0.95, 1.0) : vec3(0.60, 0.75, 0.85));
    tubeColor = mix(tubeColor, nameCol, nameInk);
   }

   // Mode 0 Controller Guide
   vec2 gPos = vec2(280.0, 730.0);
   float gInk = drawChar(sp, gPos, 91u); // '['
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 1.0, 0.0), 65u)); // 'A'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 2.0, 0.0), 93u)); // ']'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 4.0, 0.0), 80u)); // 'P'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 5.0, 0.0), 76u)); // 'L'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 6.0, 0.0), 65u)); // 'A'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 7.0, 0.0), 89u)); // 'Y'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 12.0, 0.0), 91u)); // '['
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 13.0, 0.0), 88u)); // 'X'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 14.0, 0.0), 93u)); // ']'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 16.0, 0.0), 76u)); // 'L'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 17.0, 0.0), 65u)); // 'A'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 18.0, 0.0), 83u)); // 'S'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 19.0, 0.0), 69u)); // 'E'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 20.0, 0.0), 82u)); // 'R'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 25.0, 0.0), 91u)); // '['
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 26.0, 0.0), 89u)); // 'Y'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 27.0, 0.0), 93u)); // ']'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 29.0, 0.0), 74u)); // 'J'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 30.0, 0.0), 85u)); // 'U'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 31.0, 0.0), 77u)); // 'M'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 32.0, 0.0), 80u)); // 'P'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 37.0, 0.0), 91u)); // '['
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 38.0, 0.0), 66u)); // 'B'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 39.0, 0.0), 93u)); // ']'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 41.0, 0.0), 66u)); // 'B'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 42.0, 0.0), 79u)); // 'O'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 43.0, 0.0), 79u)); // 'O'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 44.0, 0.0), 77u)); // 'M'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 49.0, 0.0), 91u)); // '['
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 50.0, 0.0), 76u)); // 'L'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 51.0, 0.0), 47u)); // '/'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 52.0, 0.0), 82u)); // 'R'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 53.0, 0.0), 93u)); // ']'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 55.0, 0.0), 77u)); // 'M'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 56.0, 0.0), 79u)); // 'O'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 57.0, 0.0), 82u)); // 'R'
   gInk = max(gInk, drawChar(sp, gPos + vec2(gw * 58.0, 0.0), 69u)); // 'E'
   tubeColor = mix(tubeColor, vec3(0.35, 0.75, 0.85), gInk);

  } else {
   // Mode 1: Synthesizer Studio Panel
   vec2 pCenter = vec2(960.0, 590.0);
   vec2 pHalf = vec2(690.0, 95.0);
   float pBox = fill(box(sp, pCenter, pHalf, 10.0));
   float pBorder = line(box(sp, pCenter, pHalf, 10.0), 2.0);
   tubeColor = mix(tubeColor, vec3(0.03, 0.07, 0.12), pBox * 0.9);
   tubeColor = mix(tubeColor, vec3(0.15, 0.65, 0.85), pBorder * 0.8);

   // Waveform Selector: "[X] WAVEFORM: <NAME>"
   vec2 wPos = vec2(330.0, 545.0);
   float wInk = drawChar(sp, wPos, 91u); // '['
   wInk = max(wInk, drawChar(sp, wPos + vec2(gw, 0.0), 88u)); // 'X'
   wInk = max(wInk, drawChar(sp, wPos + vec2(gw * 2.0, 0.0), 93u)); // ']'
   wInk = max(wInk, drawChar(sp, wPos + vec2(gw * 4.0, 0.0), 87u)); // 'W'
   wInk = max(wInk, drawChar(sp, wPos + vec2(gw * 5.0, 0.0), 65u)); // 'A'
   wInk = max(wInk, drawChar(sp, wPos + vec2(gw * 6.0, 0.0), 86u)); // 'V'
   wInk = max(wInk, drawChar(sp, wPos + vec2(gw * 7.0, 0.0), 69u)); // 'E'
   wInk = max(wInk, drawChar(sp, wPos + vec2(gw * 8.0, 0.0), 58u)); // ':'
   for (uint i = 0u; i < 8u; i++) {
    wInk = max(wInk, drawChar(sp, wPos + vec2(gw * float(10u + i), 0.0), WAVE_CHARS[c.game.w * 8u + i]));
   }
   tubeColor = mix(tubeColor, vec3(1.0, 0.85, 0.20), wInk);

   // Frequency & Musical Note: "[< >] NOTE: A4 (440 HZ)"
   vec2 fPos = vec2(900.0, 545.0);
   float fInk = drawChar(sp, fPos, 78u); // 'N'
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw, 0.0), 79u)); // 'O'
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw * 2.0, 0.0), 84u)); // 'T'
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw * 3.0, 0.0), 69u)); // 'E'
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw * 4.0, 0.0), 58u)); // ':'
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw * 6.0, 0.0), NOTE_CHARS[uint(c.piece.z) * 2u]));
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw * 7.0, 0.0), NOTE_CHARS[uint(c.piece.z) * 2u + 1u]));
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw * 9.0, 0.0), 40u)); // '('
   fInk = max(fInk, drawUint(sp, fPos + vec2(gw * 10.0, 0.0), uint(c.piece.x), 3u));
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw * 13.5, 0.0), 72u)); // 'H'
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw * 14.5, 0.0), 90u)); // 'Z'
   fInk = max(fInk, drawChar(sp, fPos + vec2(gw * 15.5, 0.0), 41u)); // ')'
   tubeColor = mix(tubeColor, vec3(0.20, 0.95, 1.0), fInk);

   // Duration: "[L/R] DURATION: 200 MS"
   vec2 durPos = vec2(330.0, 615.0);
   float durInk = drawChar(sp, durPos, 91u); // '['
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 1.0, 0.0), 76u)); // 'L'
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 2.0, 0.0), 47u)); // '/'
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 3.0, 0.0), 82u)); // 'R'
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 4.0, 0.0), 93u)); // ']'
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 6.0, 0.0), 68u)); // 'D'
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 7.0, 0.0), 85u)); // 'U'
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 8.0, 0.0), 82u)); // 'R'
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 9.0, 0.0), 58u)); // ':'
   durInk = max(durInk, drawUint(sp, durPos + vec2(gw * 11.0, 0.0), uint(c.piece.y), 3u));
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 14.5, 0.0), 77u)); // 'M'
   durInk = max(durInk, drawChar(sp, durPos + vec2(gw * 15.5, 0.0), 83u)); // 'S'
   tubeColor = mix(tubeColor, vec3(0.70, 0.85, 0.95), durInk);

   // Trigger Prompt: "[A] PLAY SYNTHESIZED TONE"
   vec2 aPos = vec2(900.0, 615.0);
   float aInk = drawChar(sp, aPos, 91u); // '['
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 1.0, 0.0), 65u)); // 'A'
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 2.0, 0.0), 93u)); // ']'
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 4.0, 0.0), 80u)); // 'P'
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 5.0, 0.0), 76u)); // 'L'
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 6.0, 0.0), 65u)); // 'A'
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 7.0, 0.0), 89u)); // 'Y'
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 9.0, 0.0), 84u)); // 'T'
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 10.0, 0.0), 79u)); // 'O'
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 11.0, 0.0), 78u)); // 'N'
   aInk = max(aInk, drawChar(sp, aPos + vec2(gw * 12.0, 0.0), 69u)); // 'E'
   tubeColor = mix(tubeColor, vec3(0.20, 1.0, 0.50), aInk);
  }

  // =========================================================================
  // 5. BOTTOM STATUS TOAST BAR (Y = 820.0)
  // =========================================================================
  vec2 botPos = vec2(960.0, 820.0);
  vec2 botHalf = vec2(760.0, 26.0);
  float bBox = fill(box(sp, botPos, botHalf, 6.0));
  float bBorder = line(box(sp, botPos, botHalf, 6.0), 1.2);
  tubeColor = mix(tubeColor, vec3(0.02, 0.04, 0.07), bBox * 0.9);
  tubeColor = mix(tubeColor, vec3(0.12, 0.25, 0.35), bBorder);

  // Status message: "STATUS: S2 HARDWARE AUDIO READY  |  NN::AUDIO 48000 HZ STEREO"
  vec2 statPos = botPos - vec2(botHalf.x - 24.0, 14.0);
  float stBarInk = drawChar(sp, statPos, 83u); // 'S'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 1.0, 0.0), 84u)); // 'T'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 2.0, 0.0), 65u)); // 'A'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 3.0, 0.0), 84u)); // 'T'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 4.0, 0.0), 85u)); // 'U'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 5.0, 0.0), 83u)); // 'S'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 6.0, 0.0), 58u)); // ':'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 8.0, 0.0), 83u)); // 'S'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 9.0, 0.0), 50u)); // '2'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 11.0, 0.0), 72u)); // 'H'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 12.0, 0.0), 68u)); // 'D'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 13.0, 0.0), 87u)); // 'W'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 15.0, 0.0), 65u)); // 'A'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 16.0, 0.0), 85u)); // 'U'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 17.0, 0.0), 68u)); // 'D'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 18.0, 0.0), 73u)); // 'I'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 19.0, 0.0), 79u)); // 'O'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 22.0, 0.0), 79u)); // 'O'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 23.0, 0.0), 75u)); // 'K'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 26.0, 0.0), 124u)); // '|'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 28.0, 0.0), 78u)); // 'N'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 29.0, 0.0), 78u)); // 'N'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 30.0, 0.0), 58u)); // ':'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 31.0, 0.0), 58u)); // ':'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 32.0, 0.0), 65u)); // 'A'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 33.0, 0.0), 85u)); // 'U'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 34.0, 0.0), 68u)); // 'D'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 35.0, 0.0), 73u)); // 'I'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 36.0, 0.0), 79u)); // 'O'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 38.0, 0.0), 52u)); // '4'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 39.0, 0.0), 56u)); // '8'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 40.0, 0.0), 75u)); // 'K'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 41.0, 0.0), 72u)); // 'H'
  stBarInk = max(stBarInk, drawChar(sp, statPos + vec2(gw * 42.0, 0.0), 90u)); // 'Z'
  tubeColor = mix(tubeColor, vec3(0.20, 0.90, 0.60), stBarInk);

  // Scanline overlay
  float scanline = sin(sp.y * 1.5) * 0.035;
  tubeColor -= scanline;

  color = tubeColor;
 }

 outColor = vec4(color, 1.0);
}
