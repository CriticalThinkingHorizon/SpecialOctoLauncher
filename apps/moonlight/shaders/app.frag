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

// "MOONLIGHT S2" (12 chars)
const uint LOGO_CHARS[12] = uint[12](77u,79u,79u,78u,76u,73u,71u,72u,84u,32u,83u,50u);

// Setup Card Strings:
// "SUNSHINE HOST PC SETUP" (22 chars)
const uint SETUP_HDR[22] = uint[22](83u,85u,78u,83u,72u,73u,78u,69u,32u,72u,79u,83u,84u,32u,80u,67u,32u,83u,69u,84u,85u,80u);
// "1. Press (+) to enter Sunshine PC IP via S2 Keyboard" (52 chars)
const uint SETUP_LINE1[52] = uint[52](49u,46u,32u,80u,114u,101u,115u,115u,32u,40u,43u,41u,32u,116u,111u,32u,101u,110u,116u,101u,114u,32u,83u,117u,110u,115u,104u,105u,110u,101u,32u,80u,67u,32u,73u,80u,32u,118u,105u,97u,32u,83u,50u,32u,75u,101u,121u,98u,111u,97u,114u,100u);
// "2. Web Portal: Open http://<s2_ip>:39382 in browser" (51 chars)
const uint SETUP_LINE2[51] = uint[51](50u,46u,32u,87u,101u,98u,32u,80u,111u,114u,116u,97u,108u,58u,32u,79u,112u,101u,110u,32u,104u,116u,116u,112u,58u,47u,47u,60u,115u,50u,95u,105u,112u,62u,58u,51u,57u,51u,56u,50u,32u,105u,110u,32u,98u,114u,111u,119u,115u,101u,114u);
// "3. Or write PC IP into moonlight-host.txt on host" (49 chars)
const uint SETUP_LINE3[49] = uint[49](51u,46u,32u,79u,114u,32u,119u,114u,105u,116u,101u,32u,80u,67u,32u,73u,80u,32u,105u,110u,116u,111u,32u,109u,111u,111u,110u,108u,105u,103u,104u,116u,45u,104u,111u,115u,116u,46u,116u,120u,116u,32u,111u,110u,32u,104u,111u,115u,116u);

// Pairing Card Strings:
// "SUNSHINE PAIRING REQUIRED" (25 chars)
const uint PAIR_HDR[25] = uint[25](83u,85u,78u,83u,72u,73u,78u,69u,32u,80u,65u,73u,82u,73u,78u,71u,32u,82u,69u,81u,85u,73u,82u,69u,68u);
// "Open Sunshine Web UI on your PC: https://<pc_ip>:47990/pin" (58 chars)
const uint PAIR_LINE1[58] = uint[58](79u,112u,101u,110u,32u,83u,117u,110u,115u,104u,105u,110u,101u,32u,87u,101u,98u,32u,85u,73u,32u,111u,110u,32u,121u,111u,117u,114u,32u,80u,67u,58u,32u,104u,116u,116u,112u,115u,58u,47u,47u,60u,112u,99u,95u,105u,112u,62u,58u,52u,55u,57u,57u,48u,47u,112u,105u,110u);
// "Type this 4-digit PIN on your PC to authorize Moonlight S2:" (59 chars)
const uint PAIR_LINE2[59] = uint[59](84u,121u,112u,101u,32u,116u,104u,105u,115u,32u,52u,45u,100u,105u,103u,105u,116u,32u,80u,73u,78u,32u,111u,110u,32u,121u,111u,117u,114u,32u,80u,67u,32u,116u,111u,32u,97u,117u,116u,104u,111u,114u,105u,122u,101u,32u,77u,111u,111u,110u,108u,105u,103u,104u,116u,32u,83u,50u,58u);

// Menu Footer:
// "A: Launch Game  |  X: Refresh  |  +: Set Host IP  |  Y: Pair PIN  |  -: Exit" (74 chars)
const uint FOOT_CHARS[76] = uint[76](
 65u,58u,32u,76u,97u,117u,110u,99u,104u,32u,71u,97u,109u,101u,32u,32u,124u,32u,32u,
 88u,58u,32u,82u,101u,102u,114u,101u,115u,104u,32u,32u,124u,32u,32u,
 43u,58u,32u,83u,101u,116u,32u,72u,111u,115u,116u,32u,73u,80u,32u,32u,124u,32u,32u,
 89u,58u,32u,80u,97u,105u,114u,32u,80u,73u,78u,32u,32u,124u,32u,32u,
 45u,58u,32u,69u,120u,105u,116u
);

// Stream Overlay Footer:
// "HOLD (-) + (+) FOR 1s TO DISCONNECT  |  TAP (-) TO TOGGLE HUD" (59 chars)
const uint STREAM_HUD_TXT[61] = uint[61](
 72u,79u,76u,68u,32u,40u,45u,41u,32u,43u,32u,40u,43u,41u,32u,70u,79u,82u,32u,49u,115u,32u,84u,79u,32u,68u,73u,83u,67u,79u,78u,78u,69u,67u,84u,32u,32u,124u,32u,32u,
 84u,65u,80u,32u,40u,45u,41u,32u,84u,79u,32u,84u,79u,71u,71u,76u,69u,32u,72u,85u,68u
);

void main(){
 vec2 p = gl_FragCoord.xy;
 float gw = float(GLYPH_W);

 // Palette
 vec3 colBgOuter   = vec3(0.05, 0.07, 0.10); // Deep Moonlight Charcoal
 vec3 colCardBg    = vec3(0.09, 0.12, 0.17); // Card Slate
 vec3 colCardAlt   = vec3(0.12, 0.16, 0.22); // Card Hover / Selection
 vec3 colTeal      = vec3(0.00, 0.82, 0.65); // Sunshine / Moonlight Teal
 vec3 colCyan      = vec3(0.15, 0.68, 0.98); // Moonlight Cyan Accent
 vec3 colGreen     = vec3(0.14, 0.78, 0.45); // Ready Green
 vec3 colYellow    = vec3(0.95, 0.72, 0.20); // Warning / PIN Yellow
 vec3 colRed       = vec3(0.95, 0.25, 0.28); // Error Red
 vec3 colWhite     = vec3(0.95, 0.97, 1.00);

 uint mode = c.game.x; // 0 = Menu, 1 = RPC Wait, 2 = Streaming
 uint status = hbMoonlightStatus();
 uint appCount = hbMoonlightAppCount();
 uint selectedApp = c.game.z;

 // =========================================================================
 // 1. STREAMING MODE RENDERER
 // =========================================================================
 if (mode == 2u) {
  // Deep Gaming Backdrop with subtle scanline / CRT vignette
  float vig = 1.0 - 0.25 * length((p - vec2(960.0, 540.0)) / vec2(960.0, 540.0));
  vec3 streamColor = vec3(0.04, 0.05, 0.07) * vig;

  // Center Animated Stream Viewport Indicator
  float streamBorder = fill(box(p, vec2(960.0, 540.0), vec2(880.0, 480.0), 16.0));
  float streamInner  = fill(box(p, vec2(960.0, 540.0), vec2(876.0, 476.0), 14.0));
  streamColor = mix(streamColor, vec3(0.02, 0.25, 0.35), streamBorder - streamInner);

  // Subtle animated game scanlines inside stream area
  if (p.x >= 84.0 && p.x <= 1836.0 && p.y >= 64.0 && p.y <= 1016.0) {
   float scan = sin(p.y * 1.5 + c.motion.x * 10.0) * 0.03 + 0.05;
   streamColor += vec3(0.02, 0.06, 0.10) + vec3(scan);
  }

  // Live Stream HUD Overlay (if enabled)
  if (c.game.w == 1u || c.flow.w < 180.0) {
   // Top Stream Info Banner
   float hudBar = fill(box(p, vec2(960.0, 40.0), vec2(700.0, 22.0), 8.0));
   streamColor = mix(streamColor, vec3(0.06, 0.08, 0.12), hudBar * 0.90);

   if (p.y >= 26.0 && p.y <= 58.0 && p.x >= 280.0 && p.x <= 1640.0) {
    float hudInk = 0.0;
    // Render Active Game Title
    for (uint i = 0u; i < 28u; i++) {
     uint ch = hbMoonlightActiveGameByte(i);
     if (ch == 0u) break;
     hudInk = max(hudInk, drawChar(p, vec2(290.0 + float(i) * gw, 28.0), ch));
    }
    streamColor = mix(streamColor, colCyan, hudInk);

    // Live specs: 1280x720 60FPS
    float specsInk = 0.0;
    const uint SPEC_CHARS[18] = uint[18](124u,32u,49u,50u,56u,48u,120u,55u,50u,48u,32u,54u,48u,70u,80u,83u,32u,124u);
    for (uint i = 0u; i < 18u; i++) {
     specsInk = max(specsInk, drawChar(p, vec2(780.0 + float(i) * gw, 28.0), SPEC_CHARS[i]));
    }
    streamColor = mix(streamColor, colTeal, specsInk);

    // Render Host IP
    float ipInk = 0.0;
    for (uint i = 0u; i < 20u; i++) {
     uint ch = hbMoonlightServerIpByte(i);
     if (ch == 0u) break;
     ipInk = max(ipInk, drawChar(p, vec2(1110.0 + float(i) * gw, 28.0), ch));
    }
    streamColor = mix(streamColor, colWhite, ipInk);
   }

   // Bottom Overlay Instructions
   float footPill = fill(box(p, vec2(960.0, 1045.0), vec2(560.0, 20.0), 8.0));
   streamColor = mix(streamColor, vec3(0.06, 0.08, 0.12), footPill * 0.90);
   if (p.y >= 1032.0 && p.y <= 1060.0 && p.x >= 420.0 && p.x <= 1500.0) {
    float footInk = 0.0;
    for (uint i = 0u; i < 61u; i++) {
     footInk = max(footInk, drawChar(p, vec2(430.0 + float(i) * gw, 1034.0), STREAM_HUD_TXT[i]));
    }
    streamColor = mix(streamColor, colYellow, footInk);
   }
  }

  // Active Controller Input Visualizer (Bottom-Right corner)
  uint heldButtons = hbButtons();
  vec2 stickL = hbStick(false);
  vec2 stickR = hbStick(true);
  vec2 padCluster = vec2(1740.0, 960.0);

  // Joy-Con / Pad Mini-Panel
  float padPanel = fill(box(p, padCluster, vec2(110.0, 48.0), 10.0));
  streamColor = mix(streamColor, vec3(0.06, 0.08, 0.12), padPanel * 0.75);

  // ABXY indicator
  bool bA = (heldButtons & HB_A) != 0u;
  bool bB = (heldButtons & HB_B) != 0u;
  bool bX = (heldButtons & HB_X) != 0u;
  bool bY = (heldButtons & HB_Y) != 0u;
  vec2 abxyCenter = padCluster + vec2(60.0, 0.0);
  streamColor = mix(streamColor, bA ? colTeal : vec3(0.25), fill(length(p - (abxyCenter + vec2(16, 0))) - 5.0));
  streamColor = mix(streamColor, bB ? colTeal : vec3(0.25), fill(length(p - (abxyCenter + vec2(0, 16))) - 5.0));
  streamColor = mix(streamColor, bX ? colTeal : vec3(0.25), fill(length(p - (abxyCenter + vec2(0, -16))) - 5.0));
  streamColor = mix(streamColor, bY ? colTeal : vec3(0.25), fill(length(p - (abxyCenter + vec2(-16, 0))) - 5.0));

  // Left & Right Joysticks
  vec2 stickPosL = padCluster + vec2(-60.0, 0.0) + stickL * 14.0;
  vec2 stickPosR = padCluster + vec2(-15.0, 0.0) + stickR * 14.0;
  streamColor = mix(streamColor, colCyan, fill(length(p - stickPosL) - 7.0));
  streamColor = mix(streamColor, colCyan, fill(length(p - stickPosR) - 7.0));

  outColor = vec4(streamColor, 1.0);
  return;
 }

 // =========================================================================
 // 2. MENU & BROWSER MODE RENDERER
 // =========================================================================
 vec3 color = colBgOuter;

 // --- Top Header Bar (y = 14..74) ---
 float topBar = fill(box(p, vec2(960.0, 44.0), vec2(936.0, 28.0), 10.0));
 color = mix(color, colCardBg, topBar);

 // Logo Pill on left
 float logoPill = fill(box(p, vec2(150.0, 44.0), vec2(120.0, 20.0), 8.0));
 color = mix(color, colTeal, logoPill);

 if (p.y >= 26.0 && p.y <= 62.0) {
  // Draw Logo "MOONLIGHT S2"
  if (p.x >= 40.0 && p.x <= 265.0) {
   float logoInk = 0.0;
   for (uint i = 0u; i < 12u; i++) {
    logoInk = max(logoInk, drawChar(p, vec2(46.0 + float(i) * gw, 29.0), LOGO_CHARS[i]));
   }
   color = mix(color, vec3(0.04, 0.07, 0.10), logoInk);
  }

  // Status Badge / Server Name in Center
  if (p.x >= 290.0 && p.x <= 1350.0) {
   vec3 stCol = (status == 2u) ? colGreen : ((status == 3u) ? colYellow : ((status == 1u) ? colYellow : colRed));
   // Status Dot
   float sDot = fill(length(p - vec2(305.0, 44.0)) - 7.0);
   color = mix(color, stCol, sDot);

   // Server Name & IP
   float srvInk = 0.0;
   for (uint i = 0u; i < 30u; i++) {
    uint ch = hbMoonlightServerNameByte(i);
    if (ch == 0u) break;
    srvInk = max(srvInk, drawChar(p, vec2(325.0 + float(i) * gw, 29.0), ch));
   }
   color = mix(color, colWhite, srvInk);

   // Server IP in Parentheses
   float ipInk = 0.0;
   for (uint i = 0u; i < 20u; i++) {
    uint ch = hbMoonlightServerIpByte(i);
    if (ch == 0u) break;
    ipInk = max(ipInk, drawChar(p, vec2(860.0 + float(i) * gw, 29.0), ch));
   }
   color = mix(color, colTeal, ipInk);
  }

  // Right Header: Port & 60 FPS
  if (p.x >= 1650.0 && p.x <= 1860.0) {
   float tagInk = 0.0;
   const uint GS_TAG[11] = uint[11](54u,48u,70u,80u,83u,32u,85u,68u,80u,52u,55u);
   for (uint i = 0u; i < 11u; i++) {
    tagInk = max(tagInk, drawChar(p, vec2(1660.0 + float(i) * gw, 29.0), GS_TAG[i]));
   }
   color = mix(color, colCyan, tagInk);
  }
 }

 // --- Center Content Cards ---
 // CASE A: UNCONFIGURED (Status 0 or Error 5)
 if (status == 0u || status == 5u) {
  float card = fill(box(p, vec2(960.0, 480.0), vec2(520.0, 220.0), 16.0));
  float border = line(box(p, vec2(960.0, 480.0), vec2(520.0, 220.0), 16.0), 2.0);
  color = mix(color, colCardBg, card);
  color = mix(color, colTeal, border);

  // Setup Title
  if (p.y >= 300.0 && p.y <= 340.0 && p.x >= 500.0 && p.x <= 1420.0) {
   float hInk = 0.0;
   for (uint i = 0u; i < 22u; i++) {
    hInk = max(hInk, drawChar(p, vec2(510.0 + float(i) * gw, 305.0), SETUP_HDR[i]));
   }
   color = mix(color, colTeal, hInk);
  }

  // Line 1: Press (+) to enter IP
  if (p.y >= 380.0 && p.y <= 420.0 && p.x >= 490.0 && p.x <= 1450.0) {
   float l1Ink = 0.0;
   for (uint i = 0u; i < 52u; i++) {
    l1Ink = max(l1Ink, drawChar(p, vec2(500.0 + float(i) * gw, 385.0), SETUP_LINE1[i]));
   }
   color = mix(color, colWhite, l1Ink);
  }

  // Line 2: Web Portal
  if (p.y >= 450.0 && p.y <= 490.0 && p.x >= 490.0 && p.x <= 1450.0) {
   float l2Ink = 0.0;
   for (uint i = 0u; i < 51u; i++) {
    l2Ink = max(l2Ink, drawChar(p, vec2(500.0 + float(i) * gw, 455.0), SETUP_LINE2[i]));
   }
   color = mix(color, colCyan, l2Ink);
  }

  // Line 3: Host File
  if (p.y >= 520.0 && p.y <= 560.0 && p.x >= 490.0 && p.x <= 1450.0) {
   float l3Ink = 0.0;
   for (uint i = 0u; i < 49u; i++) {
    l3Ink = max(l3Ink, drawChar(p, vec2(500.0 + float(i) * gw, 525.0), SETUP_LINE3[i]));
   }
   color = mix(color, vec3(0.70, 0.75, 0.82), l3Ink);
  }

  // Action Button at Bottom of Card
  float btn = fill(box(p, vec2(960.0, 620.0), vec2(200.0, 26.0), 8.0));
  color = mix(color, colTeal, btn);
  if (p.y >= 605.0 && p.y <= 635.0 && p.x >= 790.0 && p.x <= 1130.0) {
   float bInk = 0.0;
   const uint BTN_TXT[17] = uint[17](40u,43u,41u,32u,69u,78u,84u,69u,82u,32u,72u,79u,83u,84u,32u,73u,80u);
   for (uint i = 0u; i < 17u; i++) {
    bInk = max(bInk, drawChar(p, vec2(810.0 + float(i) * gw, 608.0), BTN_TXT[i]));
   }
   color = mix(color, vec3(0.04, 0.07, 0.10), bInk);
  }
 }
 // CASE B: PAIRING PIN PROMPT (Status 3)
 else if (status == 3u) {
  float card = fill(box(p, vec2(960.0, 480.0), vec2(520.0, 240.0), 16.0));
  float border = line(box(p, vec2(960.0, 480.0), vec2(520.0, 240.0), 16.0), 2.0);
  color = mix(color, colCardBg, card);
  color = mix(color, colYellow, border);

  // Pairing Header
  if (p.y >= 280.0 && p.y <= 320.0 && p.x >= 490.0 && p.x <= 1450.0) {
   float hInk = 0.0;
   for (uint i = 0u; i < 25u; i++) {
    hInk = max(hInk, drawChar(p, vec2(510.0 + float(i) * gw, 285.0), PAIR_HDR[i]));
   }
   color = mix(color, colYellow, hInk);
  }

  // Line 1: Open Sunshine Web UI
  if (p.y >= 340.0 && p.y <= 380.0 && p.x >= 470.0 && p.x <= 1450.0) {
   float l1Ink = 0.0;
   for (uint i = 0u; i < 58u; i++) {
    l1Ink = max(l1Ink, drawChar(p, vec2(480.0 + float(i) * gw, 345.0), PAIR_LINE1[i]));
   }
   color = mix(color, colWhite, l1Ink);
  }

  // Giant Glowing PIN Box in Center
  float pinPill = fill(box(p, vec2(960.0, 460.0), vec2(180.0, 44.0), 12.0));
  float pinGlow = line(box(p, vec2(960.0, 460.0), vec2(180.0, 44.0), 12.0), 3.0);
  color = mix(color, vec3(0.05, 0.07, 0.10), pinPill);
  color = mix(color, colYellow, pinGlow);

  // Draw 4 PIN digits (large spacing)
  if (p.y >= 440.0 && p.y <= 480.0 && p.x >= 840.0 && p.x <= 1080.0) {
   float pinInk = 0.0;
   for (uint i = 0u; i < 4u; i++) {
    uint ch = hbMoonlightPinByte(i);
    if (ch == 0u) break;
    pinInk = max(pinInk, drawChar(p, vec2(870.0 + float(i) * (gw + 22.0), 444.0), ch));
   }
   color = mix(color, colYellow, pinInk);
  }

  // Line 2: Type this PIN
  if (p.y >= 540.0 && p.y <= 580.0 && p.x >= 470.0 && p.x <= 1450.0) {
   float l2Ink = 0.0;
   for (uint i = 0u; i < 59u; i++) {
    l2Ink = max(l2Ink, drawChar(p, vec2(480.0 + float(i) * gw, 545.0), PAIR_LINE2[i]));
   }
   color = mix(color, colCyan, l2Ink);
  }

  // Bottom action buttons: (A) Check Pair  |  (Y) New PIN
  float btnA = fill(box(p, vec2(830.0, 630.0), vec2(110.0, 24.0), 6.0));
  float btnY = fill(box(p, vec2(1090.0, 630.0), vec2(110.0, 24.0), 6.0));
  color = mix(color, colGreen, btnA);
  color = mix(color, colYellow, btnY);

  if (p.y >= 615.0 && p.y <= 645.0) {
   if (p.x >= 730.0 && p.x <= 930.0) {
    float aInk = 0.0;
    const uint A_TXT[13] = uint[13](40u,65u,41u,32u,67u,111u,110u,110u,101u,99u,116u,101u,100u);
    for (uint i = 0u; i < 13u; i++) aInk = max(aInk, drawChar(p, vec2(745.0 + float(i) * gw, 618.0), A_TXT[i]));
    color = mix(color, vec3(0.04, 0.07, 0.10), aInk);
   }
   if (p.x >= 990.0 && p.x <= 1190.0) {
    float yInk = 0.0;
    const uint Y_TXT[11] = uint[11](40u,89u,41u,32u,78u,101u,119u,32u,80u,73u,78u);
    for (uint i = 0u; i < 11u; i++) yInk = max(yInk, drawChar(p, vec2(1010.0 + float(i) * gw, 618.0), Y_TXT[i]));
    color = mix(color, vec3(0.04, 0.07, 0.10), yInk);
   }
  }
 }
 // CASE C: READY / PAIRED (Status 2) - GAMES LIST & SPECS
 else {
  // Left Panel: Games List (x = 36..1200, y = 94..980)
  float gamesPanel = fill(box(p, vec2(618.0, 537.0), vec2(582.0, 443.0), 12.0));
  color = mix(color, colCardBg, gamesPanel);

  // Games List Header
  if (p.y >= 106.0 && p.y <= 140.0 && p.x >= 54.0 && p.x <= 600.0) {
   float ghInk = 0.0;
   const uint G_HDR[24] = uint[24](65u,86u,65u,73u,76u,65u,66u,76u,69u,32u,80u,67u,32u,71u,65u,77u,69u,83u,32u,38u,32u,65u,80u,80u);
   for (uint i = 0u; i < 24u; i++) {
    ghInk = max(ghInk, drawChar(p, vec2(60.0 + float(i) * gw, 110.0), G_HDR[i]));
   }
   color = mix(color, colTeal, ghInk);
  }

  // Draw App Rows (up to 12 visible)
  for (uint i = 0u; i < min(appCount, 12u); i++) {
   float rowY = 180.0 + float(i) * 64.0;
   bool isSelected = (i == selectedApp);

   // Row Card Box
   float rowBox = fill(box(p, vec2(618.0, rowY + 16.0), vec2(560.0, 24.0), 8.0));
   vec3 rowCol = isSelected ? colCardAlt : vec3(0.07, 0.09, 0.13);
   color = mix(color, rowCol, rowBox);

   // Cursor Selection Border & Indicator Pill
   if (isSelected) {
    float selBorder = line(box(p, vec2(618.0, rowY + 16.0), vec2(560.0, 24.0), 8.0), 2.0);
    color = mix(color, colTeal, selBorder);

    // Cyan Left Accent Bar
    float selBar = fill(box(p, vec2(70.0, rowY + 16.0), vec2(4.0, 20.0), 2.0));
    color = mix(color, colTeal, selBar);
   }

   // Row Text (Index + App Title)
   if (p.y >= rowY && p.y <= rowY + 32.0 && p.x >= 90.0 && p.x <= 1160.0) {
    float rowInk = 0.0;
    // Draw "#<idx+1> "
    uint digitCh = 49u + i; // '1' + i
    rowInk = max(rowInk, drawChar(p, vec2(90.0, rowY), 35u)); // '#'
    rowInk = max(rowInk, drawChar(p, vec2(90.0 + gw, rowY), digitCh));
    rowInk = max(rowInk, drawChar(p, vec2(90.0 + gw * 2.0, rowY), 32u));

    // Draw Title
    for (uint cIdx = 0u; cIdx < 28u; cIdx++) {
     uint ch = hbMoonlightAppTitleByte(i, cIdx);
     if (ch == 0u) break;
     rowInk = max(rowInk, drawChar(p, vec2(146.0 + float(cIdx) * gw, rowY), ch));
    }
    vec3 textCol = isSelected ? colWhite : vec3(0.72, 0.78, 0.86);
    color = mix(color, textCol, rowInk);
   }
  }

  // Right Panel: GameStream Specs & Telemetry (x = 1230..1884, y = 94..980)
  float rightPanel = fill(box(p, vec2(1557.0, 537.0), vec2(327.0, 443.0), 12.0));
  color = mix(color, colCardBg, rightPanel);

  // Specs Header
  if (p.y >= 106.0 && p.y <= 140.0 && p.x >= 1250.0 && p.x <= 1860.0) {
   float shInk = 0.0;
   const uint S_HDR[17] = uint[17](83u,84u,82u,69u,65u,77u,32u,83u,80u,69u,67u,73u,70u,73u,67u,65u,84u);
   for (uint i = 0u; i < 17u; i++) {
    shInk = max(shInk, drawChar(p, vec2(1260.0 + float(i) * gw, 110.0), S_HDR[i]));
   }
   color = mix(color, colCyan, shInk);
  }

  // Spec Lines (Resolution, FPS, Bitrate, Network, Controller)
  if (p.x >= 1250.0 && p.x <= 1860.0) {
   // Resolution: 1280x720 Native S2
   if (p.y >= 180.0 && p.y <= 214.0) {
    float rInk = 0.0;
    const uint R_LBL[23] = uint[23](82u,101u,115u,111u,108u,117u,116u,105u,111u,110u,58u,32u,49u,50u,56u,48u,120u,55u,50u,48u,32u,83u,50u);
    for (uint i = 0u; i < 23u; i++) rInk = max(rInk, drawChar(p, vec2(1260.0 + float(i) * gw, 180.0), R_LBL[i]));
    color = mix(color, colWhite, rInk);
   }
   // Frame Rate: 60 FPS Low-Latency
   if (p.y >= 240.0 && p.y <= 274.0) {
    float fInk = 0.0;
    const uint F_LBL[23] = uint[23](70u,114u,97u,109u,101u,32u,82u,97u,116u,101u,58u,32u,54u,48u,32u,70u,80u,83u,32u,70u,117u,108u,108u);
    for (uint i = 0u; i < 23u; i++) fInk = max(fInk, drawChar(p, vec2(1260.0 + float(i) * gw, 240.0), F_LBL[i]));
    color = mix(color, colTeal, fInk);
   }
   // Bitrate: 15.0 Mbps
   if (p.y >= 300.0 && p.y <= 334.0) {
    float bInk = 0.0;
    const uint B_LBL[22] = uint[22](66u,105u,116u,114u,97u,116u,101u,58u,32u,49u,53u,46u,48u,32u,77u,98u,112u,115u,32u,67u,66u,82u);
    for (uint i = 0u; i < 22u; i++) bInk = max(bInk, drawChar(p, vec2(1260.0 + float(i) * gw, 300.0), B_LBL[i]));
    color = mix(color, colCyan, bInk);
   }
   // Protocol: GameStream RTSP + UDP
   if (p.y >= 360.0 && p.y <= 394.0) {
    float pInk = 0.0;
    const uint P_LBL[24] = uint[24](80u,114u,111u,116u,111u,99u,111u,108u,58u,32u,82u,84u,83u,80u,32u,43u,32u,85u,68u,80u,32u,52u,55u,57u);
    for (uint i = 0u; i < 24u; i++) pInk = max(pInk, drawChar(p, vec2(1260.0 + float(i) * gw, 360.0), P_LBL[i]));
    color = mix(color, vec3(0.80), pInk);
   }
   // Controller: Emulated Xbox 360
   if (p.y >= 420.0 && p.y <= 454.0) {
    float cInk = 0.0;
    const uint C_LBL[25] = uint[25](71u,97u,109u,101u,112u,97u,100u,58u,32u,88u,98u,111u,120u,32u,51u,54u,48u,32u,86u,105u,114u,116u,117u,97u,108u);
    for (uint i = 0u; i < 25u; i++) cInk = max(cInk, drawChar(p, vec2(1260.0 + float(i) * gw, 420.0), C_LBL[i]));
    color = mix(color, colGreen, cInk);
   }
  }

  // Large "LAUNCH GAME" Button in Right Panel
  float launchBtn = fill(box(p, vec2(1557.0, 540.0), vec2(280.0, 36.0), 10.0));
  color = mix(color, colTeal, launchBtn);
  if (p.y >= 522.0 && p.y <= 558.0 && p.x >= 1340.0 && p.x <= 1780.0) {
   float lBtnInk = 0.0;
   const uint L_BTN_TXT[20] = uint[20](40u,65u,41u,32u,76u,65u,85u,78u,67u,72u,32u,83u,84u,82u,69u,65u,77u,73u,78u,71u);
   for (uint i = 0u; i < 20u; i++) {
    lBtnInk = max(lBtnInk, drawChar(p, vec2(1390.0 + float(i) * gw, 526.0), L_BTN_TXT[i]));
   }
   color = mix(color, vec3(0.04, 0.07, 0.10), lBtnInk);
  }
 }

 // --- Bottom Footer Bar (y = 1010..1066) ---
 float footBar = fill(box(p, vec2(960.0, 1038.0), vec2(936.0, 24.0), 8.0));
 color = mix(color, colCardBg, footBar);

 if (p.y >= 1022.0 && p.y <= 1054.0 && p.x >= 180.0 && p.x <= 1740.0) {
  float fInk = 0.0;
  for (uint i = 0u; i < 76u; i++) {
   fInk = max(fInk, drawChar(p, vec2(190.0 + float(i) * gw, 1024.0), FOOT_CHARS[i]));
  }
  color = mix(color, colTeal, fInk);
 }

 outColor = vec4(color * (1.0 - c.transition.x), 1.0);
}
