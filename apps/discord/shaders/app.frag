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

// "DISCORD S2" (10 chars)
const uint LOGO_CHARS[10] = uint[10](68u,73u,83u,67u,79u,82u,68u,32u,83u,50u);

// "SERVERS & DMS" (13 chars)
const uint SRV_HDR[13] = uint[13](83u,69u,82u,86u,69u,82u,83u,32u,38u,32u,68u,77u,83u);

// "[>>]" (4 chars) and "SRV" (3 chars) for collapsed Servers & DMs open button
const uint BTN_OPEN[4] = uint[4](91u,62u,62u,93u);
const uint BTN_SRV[3]  = uint[3](83u,82u,86u);

// "CHANNELS" (8 chars)
const uint CH_HDR[8] = uint[8](67u,72u,65u,78u,78u,69u,76u,83u);

// "L/R: Switch Pane  |  A: Open/Like  |  Y: Send Msg  |  X: Sync  |  +: Set JWT Token  |  -: Exit" (94 chars)
const uint FOOT_LEN = 79u;
const uint FOOT_CHARS[79] = uint[79](
 76u,47u,82u,58u,32u,80u,97u,110u,101u,32u,32u,124u,32u,32u,
 65u,58u,32u,83u,101u,108u,101u,99u,116u,47u,76u,105u,107u,101u,32u,32u,124u,32u,32u,
 89u,58u,32u,83u,101u,110u,100u,32u,77u,115u,103u,32u,32u,124u,32u,32u,
 88u,58u,32u,83u,121u,110u,99u,32u,32u,124u,32u,32u,
 43u,58u,32u,84u,111u,107u,101u,110u,32u,32u,124u,32u,32u,
 45u,58u,32u,69u,120u
);

// Setup Card Prompts when no token is configured:
// "DISCORD JWT TOKEN LOGIN REQUIRED" (32 chars)
const uint LOGIN1[32] = uint[32](68u,73u,83u,67u,79u,82u,68u,32u,74u,87u,84u,32u,84u,79u,75u,69u,78u,32u,76u,79u,71u,73u,78u,32u,82u,69u,81u,85u,73u,82u,69u,68u);
// "1. Web Portal: Open http://<server>:39381 in browser" (52 chars)
const uint LOGIN2[52] = uint[52](49u,46u,32u,87u,101u,98u,32u,80u,111u,114u,116u,97u,108u,58u,32u,79u,112u,101u,110u,32u,104u,116u,116u,112u,58u,47u,47u,60u,115u,101u,114u,118u,101u,114u,62u,58u,51u,57u,51u,56u,49u,32u,105u,110u,32u,98u,114u,111u,119u,115u,101u,114u);
// "2. Server CLI: node sdk/set-discord-token.cjs <TOK>" (51 chars)
const uint LOGIN3[51] = uint[51](50u,46u,32u,83u,101u,114u,118u,101u,114u,32u,67u,76u,73u,58u,32u,110u,111u,100u,101u,32u,115u,100u,107u,47u,115u,101u,116u,45u,100u,105u,115u,99u,111u,114u,100u,45u,116u,111u,107u,101u,110u,46u,99u,106u,115u,32u,60u,84u,79u,75u,62u);
// "3. Or press (+) to enter token via S2 Keyboard" (46 chars)
const uint LOGIN4[46] = uint[46](51u,46u,32u,79u,114u,32u,112u,114u,101u,115u,115u,32u,40u,43u,41u,32u,116u,111u,32u,101u,110u,116u,101u,114u,32u,116u,111u,107u,101u,110u,32u,118u,105u,97u,32u,83u,50u,32u,75u,101u,121u,98u,111u,97u,114u,100u);

void main(){
 vec2 p = gl_FragCoord.xy;
 float gw = float(GLYPH_W);

 // Discord Dark Theme Palette
 vec3 colBgOuter   = vec3(0.08, 0.085, 0.10); // #141519
 vec3 colServersBg = vec3(0.118, 0.122, 0.133); // #1E1F22
 vec3 colChannelBg = vec3(0.169, 0.176, 0.192); // #2B2D31
 vec3 colChatBg    = vec3(0.192, 0.200, 0.220); // #313338
 vec3 colBlurple   = vec3(0.345, 0.396, 0.949); // #5865F2
 vec3 colEmerald   = vec3(0.137, 0.647, 0.353); // #23A55A
 vec3 colAmber     = vec3(0.941, 0.698, 0.196); // #F0B232
 vec3 colRed       = vec3(0.949, 0.247, 0.263); // #F23F43

 vec3 color = colBgOuter;

 uint status = hbDiscordStatus();
 uint activePane = c.game.y;
 bool srvCollapsed = (c.piece.w != 0);

 // ==========================================================================
 // 1. Top Header Bar (y = 14..74)
 // ==========================================================================
 float topBar = fill(box(p, vec2(960.0, 44.0), vec2(936.0, 28.0), 10.0));
 color = mix(color, colServersBg, topBar);

 // Blurple Logo Pill on left of Top Bar
 float logoPill = fill(box(p, vec2(142.0, 44.0), vec2(106.0, 20.0), 8.0));
 color = mix(color, colBlurple, logoPill);

 if (p.y >= 24.0 && p.y <= 64.0) {
  if (p.x >= 44.0 && p.x <= 245.0) {
   float logoInk = 0.0;
   for (uint i = 0u; i < 10u; i++) {
    logoInk = max(logoInk, drawChar(p, vec2(52.0 + float(i) * gw, 29.0), LOGO_CHARS[i]));
   }
   color = mix(color, vec3(1.0), logoInk);
  }
  // Center Banner (Active Guild > Channel [LIVE])
  if (p.x >= 275.0 && p.x <= 1450.0) {
   float banInk = 0.0;
   for (uint i = 0u; i < 60u; i++) {
    uint ch = hbDiscordBannerByte(i);
    if (ch == 0u) break;
    banInk = max(banInk, drawChar(p, vec2(280.0 + float(i) * gw, 29.0), ch));
   }
   vec3 banCol = (c.game.x == 1u) ? colAmber : vec3(0.92, 0.94, 0.98);
   color = mix(color, banCol, banInk);
  }
  // Right User Tag + Status Dot
  if (p.x >= 1460.0 && p.x <= 1890.0) {
   vec3 dotCol = (status == 2u) ? colEmerald : (c.game.x == 1u ? colAmber : colRed);
   float dot = fill(length(p - vec2(1480.0, 44.0)) - 7.0);
   color = mix(color, dotCol, dot);

   float usrInk = 0.0;
   for (uint i = 0u; i < 22u; i++) {
    uint ch = hbDiscordUserByte(i);
    if (ch == 0u) break;
    usrInk = max(usrInk, drawChar(p, vec2(1500.0 + float(i) * gw, 29.0), ch));
   }
   color = mix(color, vec3(0.82, 0.86, 0.95), usrInk);
  }
 }

 // ==========================================================================
 // 2. Left Sidebar: Servers & DMs (Expanded: x=24..394 | Collapsed: x=24..116)
 // ==========================================================================
 if (!srvCollapsed) {
  vec2 srvCenter = vec2(209.0, 540.0);
  vec2 srvHalf = vec2(185.0, 456.0);
  float srvPanel = fill(box(p, srvCenter, srvHalf, 12.0));
  float srvBorder = line(box(p, srvCenter, srvHalf, 12.0), activePane == 0u ? 2.5 : 1.0);
  color = mix(color, colServersBg, srvPanel);
  color = mix(color, activePane == 0u ? colBlurple : vec3(0.22, 0.24, 0.28), srvBorder);

  if (p.x >= 24.0 && p.x <= 394.0 && p.y >= 84.0 && p.y <= 996.0) {
   // Header "SERVERS & DMS"
   if (p.y >= 96.0 && p.y <= 134.0) {
    float hInk = 0.0;
    for (uint i = 0u; i < 13u; i++) {
     hInk = max(hInk, drawChar(p, vec2(44.0 + float(i) * gw, 100.0), SRV_HDR[i]));
    }
    color = mix(color, activePane == 0u ? vec3(0.65, 0.72, 1.0) : vec3(0.58, 0.61, 0.66), hInk);
   }

   uint gCount = min(hbDiscordGuildCount(), 12u);
   uint activeG = hbDiscordActiveGuild();
   uint cursorG = c.game.z;

   for (uint i = 0u; i < 12u; i++) {
    if (i >= gCount) break;
    float rowY = 166.0 + float(i) * 68.0;
    if (abs(p.y - rowY) > 33.0) continue;

    bool isAct = (i == activeG);
    bool isCur = (activePane == 0u && i == cursorG);

    vec2 rCenter = vec2(209.0, rowY);
    float rBox = fill(box(p, rCenter, vec2(170.0, 28.0), 8.0));
    float rLine = line(box(p, rCenter, vec2(170.0, 28.0), 8.0), 2.0);

    if (isAct) {
     color = mix(color, colBlurple * 0.45, rBox);
     // Left Discord pill bar
     float pill = fill(box(p, vec2(31.0, rowY), vec2(3.5, 18.0), 2.0));
     color = mix(color, vec3(1.0), pill);
    } else if (isCur) {
     color = mix(color, vec3(0.22, 0.24, 0.29), rBox);
    }
    if (isCur) {
     color = mix(color, colBlurple, rLine);
    }

    float gInk = 0.0;
    for (uint cIdx = 0u; cIdx < 18u; cIdx++) {
     uint ch = hbDiscordGuildByte(i, cIdx);
     if (ch == 0u) break;
     gInk = max(gInk, drawChar(p, vec2(48.0 + float(cIdx) * gw, rowY - 14.0), ch));
    }
    vec3 gCol = isAct ? vec3(1.0) : (isCur ? vec3(0.95, 0.96, 1.0) : vec3(0.70, 0.73, 0.78));
    color = mix(color, gCol, gInk);
   }
  }
 } else {
  // Collapsed Left Rail (x = 24..116, y = 84..996) with small Open Button at top
  vec2 railCenter = vec2(70.0, 540.0);
  vec2 railHalf = vec2(46.0, 456.0);
  float railPanel = fill(box(p, railCenter, railHalf, 12.0));
  float railBorder = line(box(p, railCenter, railHalf, 12.0), activePane == 0u ? 2.5 : 1.0);
  color = mix(color, colServersBg, railPanel);
  color = mix(color, activePane == 0u ? colBlurple : vec3(0.22, 0.24, 0.28), railBorder);

  if (p.x >= 24.0 && p.x <= 116.0 && p.y >= 84.0 && p.y <= 996.0) {
   // Small Open Button [>>] / SRV at top (x = 32..108, y = 96..176)
   vec2 btnCenter = vec2(70.0, 136.0);
   vec2 btnHalf = vec2(38.0, 38.0);
   float btnFill = fill(box(p, btnCenter, btnHalf, 10.0));
   float btnLine = line(box(p, btnCenter, btnHalf, 10.0), 2.5);
   vec3 btnBg = (activePane == 0u) ? colBlurple : vec3(0.22, 0.25, 0.34);
   color = mix(color, btnBg, btnFill);
   color = mix(color, (activePane == 0u) ? vec3(0.75, 0.82, 1.0) : colBlurple, btnLine);

   if (p.y >= 98.0 && p.y <= 174.0) {
    float bInk1 = 0.0;
    for (uint i = 0u; i < 4u; i++) {
     bInk1 = max(bInk1, drawChar(p, vec2(34.0 + float(i) * gw, 106.0), BTN_OPEN[i]));
    }
    float bInk2 = 0.0;
    for (uint i = 0u; i < 3u; i++) {
     bInk2 = max(bInk2, drawChar(p, vec2(43.0 + float(i) * gw, 138.0), BTN_SRV[i]));
    }
    color = mix(color, vec3(1.0), max(bInk1, bInk2));
   }

   // Active Server mini badge below the Open button
   uint activeG = hbDiscordActiveGuild();
   vec2 badgeCenter = vec2(70.0, 232.0);
   float badgeFill = fill(box(p, badgeCenter, vec2(34.0, 28.0), 10.0));
   color = mix(color, colBlurple * 0.45, badgeFill);
   float pill = fill(box(p, vec2(29.0, 232.0), vec2(3.5, 18.0), 2.0));
   color = mix(color, vec3(1.0), pill);

   if (p.y >= 204.0 && p.y <= 260.0) {
    float aInk = 0.0;
    for (uint i = 0u; i < 3u; i++) {
     uint ch = hbDiscordGuildByte(activeG, i);
     if (ch == 0u) break;
     aInk = max(aInk, drawChar(p, vec2(43.0 + float(i) * gw, 218.0), ch));
    }
    color = mix(color, vec3(0.95, 0.96, 1.0), aInk);
   }
  }
 }

 // ==========================================================================
 // 3. Middle Sidebar: Channels (Slides left when Servers & DMs is collapsed)
 // ==========================================================================
 float chMinX = srvCollapsed ? 128.0 : 406.0;
 float chMaxX = srvCollapsed ? 498.0 : 776.0;
 vec2 chCenter = vec2((chMinX + chMaxX) * 0.5, 540.0);
 vec2 chHalf = vec2(185.0, 456.0);
 float chPanel = fill(box(p, chCenter, chHalf, 12.0));
 float chBorder = line(box(p, chCenter, chHalf, 12.0), activePane == 1u ? 2.5 : 1.0);
 color = mix(color, colChannelBg, chPanel);
 color = mix(color, activePane == 1u ? colBlurple : vec3(0.24, 0.26, 0.30), chBorder);

 if (p.x >= chMinX && p.x <= chMaxX && p.y >= 84.0 && p.y <= 996.0) {
  if (p.y >= 90.0 && p.y <= 136.0) {
   // Server Name Header Box at top of Channels Sidebar
   float hdrBox = fill(box(p, vec2(chCenter.x, 112.0), vec2(173.0, 20.0), 7.0));
   color = mix(color, vec3(0.125, 0.132, 0.150), hdrBox);
   float hdrSep = fill(box(p, vec2(chCenter.x, 134.0), vec2(170.0, 1.0), 0.5));
   color = mix(color, activePane == 1u ? colBlurple : vec3(0.26, 0.28, 0.34), hdrSep);

   float hInk = 0.0;
   uint activeG = hbDiscordActiveGuild();
   if (status == 2u && hbDiscordGuildCount() > 0u) {
    for (uint i = 0u; i < 18u; i++) {
     uint ch = hbDiscordGuildByte(activeG, i);
     if (ch == 0u) break;
     hInk = max(hInk, drawChar(p, vec2(chMinX + 20.0 + float(i) * gw, 98.0), ch));
    }
   } else {
    for (uint i = 0u; i < 8u; i++) {
     hInk = max(hInk, drawChar(p, vec2(chMinX + 20.0 + float(i) * gw, 98.0), CH_HDR[i]));
    }
   }
   color = mix(color, activePane == 1u ? vec3(0.75, 0.82, 1.0) : vec3(0.92, 0.94, 0.98), hInk);
  }

  uint cCount = min(hbDiscordChannelCount(), 14u);
  uint activeC = hbDiscordActiveChannel();
  uint cursorC = c.game.w;

  for (uint i = 0u; i < 14u; i++) {
   if (i >= cCount) break;
   float rowY = 160.0 + float(i) * 58.0;
   if (abs(p.y - rowY) > 28.0) continue;

   uint chFlags = hbDiscordChannelFlags(i);
   bool isSec = (chFlags & 1u) != 0u;
   bool isSecCollapsed = (chFlags & 2u) != 0u;
   bool isAct = (!isSec && i == activeC);
   bool isCur = (activePane == 1u && i == cursorC);

   vec2 rCenter = vec2(chCenter.x, rowY);
   float rBox = fill(box(p, rCenter, vec2(170.0, isSec ? 21.0 : 24.0), 6.0));
   float rLine = line(box(p, rCenter, vec2(170.0, isSec ? 21.0 : 24.0), 6.0), 2.0);

   if (isSec) {
    color = mix(color, isCur ? vec3(0.21, 0.225, 0.27) : vec3(0.135, 0.142, 0.158), rBox);
    float secBar = fill(box(p, vec2(chCenter.x, rowY + 21.0), vec2(166.0, 1.0), 0.5));
    color = mix(color, vec3(0.28, 0.31, 0.38), secBar);
   } else if (isAct) {
    color = mix(color, vec3(0.25, 0.265, 0.30), rBox);
    float actPill = fill(box(p, vec2(chMinX + 18.0, rowY), vec2(3.0, 14.0), 1.5));
    color = mix(color, colBlurple, actPill);
   } else if (isCur) {
    color = mix(color, vec3(0.22, 0.23, 0.26), rBox);
   }
   if (isCur) {
    color = mix(color, colBlurple, rLine);
   }

   float cInk = 0.0;
   float textStartX = isSec ? (chMinX + 20.0) : (chMinX + 26.0);
   for (uint cIdx = 0u; cIdx < 18u; cIdx++) {
    uint ch = hbDiscordChannelByte(i, cIdx);
    if (ch == 0u) break;
    cInk = max(cInk, drawChar(p, vec2(textStartX + float(cIdx) * gw, rowY - 14.0), ch));
   }
   vec3 cCol;
   if (isSec) {
    cCol = isCur ? vec3(0.95, 0.85, 0.45) : (isSecCollapsed ? vec3(0.62, 0.66, 0.75) : vec3(0.55, 0.76, 1.0));
   } else {
    cCol = isAct ? vec3(1.0) : (isCur ? vec3(0.92, 0.94, 0.98) : vec3(0.62, 0.65, 0.70));
   }
   color = mix(color, cCol, cInk);
  }
 }

 // ==========================================================================
 // 4. Right Main Chat Pane (Expands wider when Servers & DMs is collapsed)
 // ==========================================================================
 float chatMinX = srvCollapsed ? 510.0 : 788.0;
 float chatMaxX = 1896.0;
 vec2 chatCenter = vec2((chatMinX + chatMaxX) * 0.5, 540.0);
 vec2 chatHalf = vec2((chatMaxX - chatMinX) * 0.5, 456.0);
 float chatPanel = fill(box(p, chatCenter, chatHalf, 12.0));
 float chatBorder = line(box(p, chatCenter, chatHalf, 12.0), activePane == 2u ? 2.5 : 1.0);
 color = mix(color, colChatBg, chatPanel);
 color = mix(color, activePane == 2u ? colBlurple : vec3(0.26, 0.28, 0.32), chatBorder);

 if (p.x >= chatMinX && p.x <= chatMaxX && p.y >= 84.0 && p.y <= 996.0) {
  if (status != 2u) {
   // Token Setup / Login Prompt Card
   vec2 cardCenter = vec2(chatCenter.x, 520.0);
   float loginBox = fill(box(p, cardCenter, vec2(470.0, 170.0), 14.0));
   float loginBdr = line(box(p, cardCenter, vec2(470.0, 170.0), 14.0), 2.5);
   color = mix(color, colServersBg, loginBox);
   color = mix(color, colBlurple, loginBdr);

   float cardLeft = cardCenter.x - 452.0;
   float i1 = 0.0, i2 = 0.0, i3 = 0.0, i4 = 0.0;
   if (p.y >= 380.0 && p.y <= 430.0) {
    for (uint i = 0u; i < 32u; i++) i1 = max(i1, drawChar(p, vec2(cardLeft + 70.0 + float(i) * gw, 392.0), LOGIN1[i]));
    color = mix(color, vec3(0.45, 0.80, 1.0), i1);
   }
   if (p.y >= 455.0 && p.y <= 505.0) {
    for (uint i = 0u; i < 52u; i++) i2 = max(i2, drawChar(p, vec2(cardLeft + float(i) * gw, 466.0), LOGIN2[i]));
    color = mix(color, vec3(0.95, 0.96, 1.0), i2);
   }
   if (p.y >= 515.0 && p.y <= 565.0) {
    for (uint i = 0u; i < 51u; i++) i3 = max(i3, drawChar(p, vec2(cardLeft + float(i) * gw, 526.0), LOGIN3[i]));
    color = mix(color, vec3(0.80, 0.85, 0.92), i3);
   }
   if (p.y >= 575.0 && p.y <= 625.0) {
    for (uint i = 0u; i < 46u; i++) i4 = max(i4, drawChar(p, vec2(cardLeft + float(i) * gw, 586.0), LOGIN4[i]));
    color = mix(color, vec3(0.80, 0.85, 0.92), i4);
   }
  } else {
   // Render up to 5 Message Cards
   uint mCount = min(hbDiscordMessageCount(), 5u);
   uint cursorM = uint(max(c.piece.x, 0));

   for (uint m = 0u; m < 5u; m++) {
    if (m >= mCount) break;
    float mCenterY = 174.0 + float(m) * 172.0;
    if (abs(p.y - mCenterY) > 84.0) continue;

    bool isCur = (activePane == 2u && m == cursorM);
    uint flags = hbDiscordMsgFlags(m);
    bool isMe = (flags & 1u) != 0u;
    bool hasMyLike = (flags & 2u) != 0u;

    vec2 mCenter = vec2(chatCenter.x, mCenterY);
    vec2 mHalf = vec2(chatHalf.x - 24.0, 78.0);
    float mBox = fill(box(p, mCenter, mHalf, 10.0));
    float mLine = line(box(p, mCenter, mHalf, 10.0), isCur ? 2.5 : 1.0);

    vec3 mBg = isCur ? vec3(0.23, 0.245, 0.28) : vec3(0.165, 0.172, 0.190);
    vec3 mBdr = isCur ? colBlurple : vec3(0.23, 0.24, 0.27);
    color = mix(color, mBg, mBox);
    color = mix(color, mBdr, mLine);

    float topY = mCenterY - 64.0;
    float leftX = chatMinX + 44.0;
    float rightEdge = chatMaxX - 44.0;

    // Author Name + Timestamp + Badge Row
    if (p.y >= topY - 4.0 && p.y <= topY + 34.0) {
     float aInk = 0.0;
     for (uint i = 0u; i < 22u; i++) {
      uint ch = hbDiscordMsgAuthorByte(m, i);
      if (ch == 0u) break;
      aInk = max(aInk, drawChar(p, vec2(leftX + float(i) * gw, topY), ch));
     }
     vec3 aCol = isMe ? colEmerald : vec3(0.45, 0.68, 1.0);
     color = mix(color, aCol, aInk);

     float tInk = 0.0;
     for (uint i = 0u; i < 12u; i++) {
      uint ch = hbDiscordMsgTimeByte(m, i);
      if (ch == 0u) break;
      tInk = max(tInk, drawChar(p, vec2(leftX + 420.0 + float(i) * gw, topY), ch));
     }
     color = mix(color, vec3(0.58, 0.61, 0.67), tInk);

     float bInk = 0.0;
     for (uint i = 0u; i < 15u; i++) {
      uint ch = hbDiscordMsgBadgeByte(m, i);
      if (ch == 0u) break;
      bInk = max(bInk, drawChar(p, vec2(rightEdge - 280.0 + float(i) * gw, topY), ch));
     }
     vec3 bCol = hasMyLike ? colAmber : vec3(0.55, 0.85, 0.95);
     color = mix(color, bCol, bInk);
    }

    // 3 Wrapped Content Lines (55 chars each)
    for (uint ln = 0u; ln < 3u; ln++) {
     float lineY = topY + 36.0 + float(ln) * 32.0;
     if (p.y >= lineY - 2.0 && p.y <= lineY + 30.0) {
      float lInk = 0.0;
      for (uint i = 0u; i < 55u; i++) {
       uint ch = hbDiscordMsgLineByte(m, ln, i);
       if (ch == 0u) break;
       lInk = max(lInk, drawChar(p, vec2(leftX + float(i) * gw, lineY), ch));
      }
      color = mix(color, vec3(0.92, 0.94, 0.96), lInk);
     }
    }
   }
  }
 }

 // ==========================================================================
 // 5. Bottom Controls Legend Bar (y = 1006..1066)
 // ==========================================================================
 float botBar = fill(box(p, vec2(960.0, 1036.0), vec2(936.0, 26.0), 10.0));
 color = mix(color, colServersBg, botBar);

 if (p.y >= 1018.0 && p.y <= 1056.0 && p.x >= 50.0 && p.x <= 1880.0) {
  float fInk = 0.0;
  for (uint i = 0u; i < FOOT_LEN; i++) {
   fInk = max(fInk, drawChar(p, vec2(64.0 + float(i) * gw, 1022.0), FOOT_CHARS[i]));
  }
  color = mix(color, vec3(0.80, 0.84, 0.92), fInk);
 }

 outColor = vec4(color, 1.0);
}
