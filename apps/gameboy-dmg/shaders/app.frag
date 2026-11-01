#version 450

// -----------------------------------------------------------------------------
// GameBoy DMG-01 GPU Emulator — Authentic 1989 DMG-01 Shell, Bezel & PPU
// -----------------------------------------------------------------------------
// Vulkan Coordinate Space: gl_FragCoord.y = 0.0 is TOP, 1080.0 is BOTTOM.
// Renders:
//   - Authentic 1989 GameBoy DMG-01 putty-gray ABS shell with asymmetric
//     bottom-right curve, molded top groove, "< OFF•ON >" power engraving
//   - Dark grey screen lens bezel with asymmetric bottom-right corner,
//     magenta (#8B1D41) & navy (#1D2951) double accent stripes,
//     "DOT MATRIX WITH STEREO SOUND", glowing red BATTERY LED
//   - Authentic 4-shade olive-green Dot Matrix LCD (5x integer scale: 800x720)
//     with sub-pixel dot matrix grid, drop shadow, and interactive controls
//   - Lower faceplate with "GAME BOY TM" navy text, cross D-Pad, angled
//     magenta A & B buttons, angled Select/Start buttons, and 6 speaker slots
//   - Live LR35902 CPU + PPU + VRAM/OAM Hardware Debugger wings on left/right
// -----------------------------------------------------------------------------

layout(location = 0) in vec2 vUV;
layout(location = 0) out vec4 outColor;

struct CPUState {
    uvec4 regs0;     // x=AF, y=BC, z=DE, w=HL
    uvec4 regs1;     // x=SP, y=PC, z=IME, w=halted
    uvec4 io0;       // x=LCDC, y=STAT, z=SCY, w=SCX
    uvec4 io1;       // x=LY, y=LYC, z=BGP, w=OBP0
    uvec4 io2;       // x=OBP1, y=WY, z=WX, w=IF_reg
    uvec4 io3;       // x=IE_reg, y=DIV, z=TIMA, w=TAC
    uvec4 stats;     // x=totalCycles, y=frameCount, z=romLoaded, w=joypSelect
    uvec4 events;    // x=lastInput, y=audioPulse, z=bootDone, w=reserved
};

layout(std430, set = 0, binding = 0) readonly buffer StateBuf {
    CPUState cpu;
    uint vram[2048];     // 8 KB VRAM
    uint wram[2048];     // 8 KB WRAM
    uint oam[40];        // 160 B OAM
    uint hram[32];       // 128 B HRAM
    uint lcd[5760];      // 160 x 144 pixels (4 pixels per uint)
    uint rom[8192];      // 32 KB Cartridge ROM
};

// -----------------------------------------------------------------------------
// 5x7 Arcade Font Engine
// -----------------------------------------------------------------------------
int getGlyphRow(int c, int row) {
    int r = 0;
    if (c == 32) r = 0x00000;
    else if (c == 33) r = 0x2082020; // !
    else if (c == 40) r = 0x1104104; // (
    else if (c == 41) r = 0x4104110; // )
    else if (c == 43) r = 0x0087E20; // +
    else if (c == 45) r = 0x0003800; // -
    else if (c == 46) r = 0x0000020; // .
    else if (c == 47) r = 0x0841040; // /
    else if (c == 48) r = 0x3A6B52E; // 0
    else if (c == 49) r = 0x118208E; // 1
    else if (c == 50) r = 0x3A0F84F; // 2
    else if (c == 51) r = 0x3A0982E; // 3
    else if (c == 52) r = 0x0B29F22; // 4
    else if (c == 53) r = 0x7E1F02E; // 5
    else if (c == 54) r = 0x3A1F46E; // 6
    else if (c == 55) r = 0x7C10844; // 7
    else if (c == 56) r = 0x3A2746E; // 8
    else if (c == 57) r = 0x3A2782E; // 9
    else if (c == 58) r = 0x0020020; // :
    else if (c == 60) r = 0x0908082; // <
    else if (c == 62) r = 0x4102110; // >
    else if (c == 65) r = 0x3A2F462; // A
    else if (c == 66) r = 0x7A2F46E; // B
    else if (c == 67) r = 0x3A2104E; // C
    else if (c == 68) r = 0x7A2346E; // D
    else if (c == 69) r = 0x7E1F04F; // E
    else if (c == 70) r = 0x7E1F041; // F
    else if (c == 71) r = 0x3A2746E; // G
    else if (c == 72) r = 0x462F462; // H
    else if (c == 73) r = 0x388208E; // I
    else if (c == 74) r = 0x041094C; // J
    else if (c == 75) r = 0x4653262; // K
    else if (c == 76) r = 0x421084F; // L
    else if (c == 77) r = 0x4775462; // M
    else if (c == 78) r = 0x4735662; // N
    else if (c == 79) r = 0x3A2344E; // O
    else if (c == 80) r = 0x7A2F041; // P
    else if (c == 81) r = 0x3A2354A; // Q
    else if (c == 82) r = 0x7A2F262; // R
    else if (c == 83) r = 0x3A1702E; // S
    else if (c == 84) r = 0x7C82084; // T
    else if (c == 85) r = 0x462346E; // U
    else if (c == 86) r = 0x4623454; // V
    else if (c == 87) r = 0x46256B5; // W
    else if (c == 88) r = 0x4542152; // X
    else if (c == 89) r = 0x4542084; // Y
    else if (c == 90) r = 0x7C1110F; // Z

    int shift = (6 - row) * 4;
    if (row == 6) return (r & 0xF) << 1;
    return (r >> shift) & 0x1F;
}

float drawChar(vec2 p, vec2 pos, float scale, int ch) {
    vec2 lp = (p - pos) / scale;
    if (lp.x < 0.0 || lp.x >= 5.0 || lp.y < 0.0 || lp.y >= 7.0) return 0.0;
    int col = int(lp.x);
    int row = int(lp.y);
    if (row == 6) {
        if (ch == 48 || ch == 50 || ch == 51 || ch == 53 || ch == 54 || ch == 56 || ch == 57 ||
            ch == 66 || ch == 67 || ch == 68 || ch == 69 || ch == 71 || ch == 73 || ch == 74 ||
            ch == 76 || ch == 79 || ch == 83 || ch == 85 || ch == 90) {
            return (col >= 1 && col <= 3) ? 1.0 : 0.0;
        }
        if (ch == 49 || ch == 55 || ch == 73 || ch == 84 || ch == 89) return (col == 2) ? 1.0 : 0.0;
        if (ch == 65 || ch == 72 || ch == 75 || ch == 77 || ch == 78 || ch == 82 || ch == 87 || ch == 88) {
            return (col == 0 || col == 4) ? 1.0 : 0.0;
        }
        if (ch == 80 || ch == 70) return (col == 0) ? 1.0 : 0.0;
        if (ch == 86) return (col == 2) ? 1.0 : 0.0;
        if (ch == 46 || ch == 58 || ch == 33) return (col == 2) ? 1.0 : 0.0;
        return 0.0;
    }
    int bits = getGlyphRow(ch, row);
    int bit = (bits >> (4 - col)) & 1;
    return float(bit);
}

int hexDigit(uint v, int nib) {
    uint d = (v >> (nib * 4)) & 0xFu;
    return (d < 10u) ? int(48u + d) : int(55u + d);
}

float drawHex16(vec2 p, vec2 pos, float scale, uint val) {
    float adv = 6.0 * scale;
    float a = 0.0;
    for (int i = 0; i < 4; i++) {
        a = max(a, drawChar(p, pos + vec2(float(i) * adv, 0.0), scale, hexDigit(val, 3 - i)));
    }
    return a;
}

float drawHex8(vec2 p, vec2 pos, float scale, uint val) {
    float adv = 6.0 * scale;
    float a = 0.0;
    a = max(a, drawChar(p, pos, scale, hexDigit(val, 1)));
    a = max(a, drawChar(p, pos + vec2(adv, 0.0), scale, hexDigit(val, 0)));
    return a;
}

float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// 4-corner independent radius rounded box:
// r.x = top-right, r.y = bottom-right, r.z = top-left, r.w = bottom-left
// (With Y=0 at TOP, p.y < 0 is TOP, p.y > 0 is BOTTOM)
float sdRoundBox4(vec2 p, vec2 b, vec4 r) {
    vec2 rad = (p.x > 0.0) ? r.xy : r.zw;
    float radius = (p.y > 0.0) ? rad.y : rad.x;
    vec2 q = abs(p) - b + radius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

// Authentic DMG-01 Olive-Green 4-shade LCD Palette
vec3 dmgColor(uint shade) {
    if (shade == 0u) return vec3(0.608, 0.737, 0.059); // #9BBC0F (Lightest Olive)
    if (shade == 1u) return vec3(0.545, 0.675, 0.059); // #8BAC0F (Light Olive)
    if (shade == 2u) return vec3(0.188, 0.384, 0.188); // #306230 (Dark Olive)
    return vec3(0.059, 0.220, 0.059);                  // #0F380F (Darkest Olive)
}

uint readLCD(ivec2 p) {
    int idx = p.y * 160 + p.x;
    uint word = lcd[idx >> 2];
    uint shift = uint(idx & 3) * 8u;
    return (word >> shift) & 3u;
}

uint readVRAMByte(uint addr) {
    uint a = addr & 0x1FFFu;
    uint w = vram[a >> 2];
    return (w >> ((a & 3u) * 8u)) & 0xFFu;
}

void main() {
    vec2 sp = gl_FragCoord.xy; // sp.y = 0 at TOP, 1080 at BOTTOM

    // Deep retro studio backdrop with subtle grid
    vec3 col = mix(vec3(0.05, 0.06, 0.09), vec3(0.09, 0.11, 0.15), sp.y / 1080.0);
    if (mod(sp.x, 32.0) < 1.0 || mod(sp.y, 32.0) < 1.0) {
        col += vec3(0.008, 0.010, 0.015);
    }

    uint buttons = cpu.events.x;

    // =========================================================================
    // 1. AUTHENTIC 1989 GAME BOY DMG-01 HANDHELD BODY & BEZEL
    // =========================================================================
    // Shell spans X: [410, 1510] (width 1100), Y: [14, 1066] (height 1052)
    vec2 shellCenter = vec2(960.0, 540.0);
    vec2 shellHalf   = vec2(550.0, 526.0);
    // Corners: TR=28, BR=115 (iconic DMG bottom-right curve), TL=28, BL=28
    float dShell = sdRoundBox4(sp - shellCenter, shellHalf, vec4(28.0, 115.0, 28.0, 28.0));

    // Soft drop shadow behind handheld shell
    float dShellShadow = sdRoundBox4(sp - (shellCenter + vec2(12.0, 16.0)), shellHalf, vec4(28.0, 115.0, 28.0, 28.0));
    if (dShellShadow < 0.0) {
        col *= 0.35;
    }

    if (dShell < 0.0) {
        // Authentic DMG-01 warm putty grey ABS plastic (#D4CFC2)
        vec3 puttyBase = vec3(0.831, 0.812, 0.761);
        // Subtle matte ABS texture noise
        float grain = fract(sin(dot(floor(sp), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 shellCol = puttyBase + (grain - 0.5) * 0.014;

        // 3D beveled plastic edge lighting along outer boundary
        float edgeDist = -dShell;
        if (edgeDist < 10.0) {
            float bevel = 1.0 - edgeDist / 10.0;
            // Top & left highlight, bottom & right shadow
            float lightDir = ((sp.x < 960.0 ? 0.4 : -0.5) + (sp.y < 540.0 ? 0.6 : -0.6));
            shellCol += vec3(lightDir * bevel * 0.14);
        }

        // Characteristic DMG-01 top horizontal relief seam groove (Y = 46)
        if (abs(sp.y - 46.0) < 2.0 && sp.x > 414.0 && sp.x < 1506.0) {
            shellCol = (sp.y < 46.0) ? shellCol * 0.68 : shellCol * 1.08;
        }
        // Top vertical corner notch grooves (X = 468 and X = 1452, above Y = 46)
        if (sp.y < 46.0 && (abs(sp.x - 468.0) < 2.0 || abs(sp.x - 1452.0) < 2.0)) {
            shellCol *= 0.70;
        }

        // Molded "< OFF•ON >" recessed pill badge on top-left (Y = 28)
        float dOffOnPill = sdRoundBox(sp - vec2(548.0, 28.0), vec2(58.0, 9.0), 8.0);
        if (dOffOnPill < 0.0) {
            shellCol *= 0.90;
        } else if (dOffOnPill < 1.5) {
            shellCol *= 1.05;
        }
        int offOnStr[8] = int[8](60, 79, 70, 70, 46, 79, 78, 62); // "<OFF.ON>"
        float offOnTxt = 0.0;
        for (int i = 0; i < 8; i++) {
            offOnTxt = max(offOnTxt, drawChar(sp, vec2(502.0 + float(i) * 11.5, 22.0), 1.6, offOnStr[i]));
        }
        shellCol = mix(shellCol, shellCol * 0.66, offOnTxt);

        // =====================================================================
        // 2. DARK GREY SCREEN LENS BEZEL (Y: 60 to 870, X: 446 to 1474)
        // =====================================================================
        vec2 bezelCenter = vec2(960.0, 465.0);
        vec2 bezelHalf   = vec2(514.0, 405.0);
        // Corners: TR=18, BR=78 (chamfered curve), TL=18, BL=18
        float dBezel = sdRoundBox4(sp - bezelCenter, bezelHalf, vec4(18.0, 78.0, 18.0, 18.0));

        // Recessed plastic seam around bezel lens
        if (abs(dBezel) < 2.5) {
            shellCol *= 0.62;
        }

        if (dBezel < 0.0) {
            // Authentic DMG-01 dark brownish-slate screen protector lens (#5A5864)
            vec3 lensCol = vec3(0.353, 0.345, 0.392);
            // Subtle diagonal glass reflection sheen
            float sheen = smoothstep(0.0, 140.0, 140.0 - abs((sp.x - 960.0) * 0.55 + (sp.y - 465.0) + 180.0));
            lensCol += vec3(0.025) * sheen;

            // Inner bevel at outer edge of lens
            if (-dBezel < 4.0) {
                lensCol *= 0.78;
            }

            // -----------------------------------------------------------------
            // Double Accent Lines (Magenta #8B1D41 & Navy #1D2951) + Header Text
            // -----------------------------------------------------------------
            vec3 stripeBurgundy = vec3(0.580, 0.125, 0.275);
            vec3 stripeNavy     = vec3(0.145, 0.195, 0.385);

            // Top header text: "DOT MATRIX WITH STEREO SOUND" at Y = 80..94
            // Stripe 1 (Burgundy): Y = 77..81
            // Stripe 2 (Navy):     Y = 91..95
            // Left segment of stripes: X = 472..788, Right segment: X = 1296..1448
            bool inStripeX = (sp.x >= 472.0 && sp.x <= 788.0) || (sp.x >= 1296.0 && sp.x <= 1448.0);
            if (inStripeX) {
                if (sp.y >= 77.0 && sp.y <= 81.0) lensCol = stripeBurgundy;
                if (sp.y >= 91.0 && sp.y <= 95.0) lensCol = stripeNavy;
            }

            // "DOT MATRIX WITH STEREO SOUND" in crisp silver-white at X = 800, Y = 80
            int hdr[28] = int[28](
                68, 79, 84, 32, 77, 65, 84, 82, 73, 88, 32,
                87, 73, 84, 72, 32,
                83, 84, 69, 82, 69, 79, 32,
                83, 79, 85, 78, 68
            );
            float hdrTxt = 0.0;
            for (int i = 0; i < 28; i++) {
                hdrTxt = max(hdrTxt, drawChar(sp, vec2(800.0 + float(i) * 17.5, 80.0), 2.2, hdr[i]));
            }
            lensCol = mix(lensCol, vec3(0.88, 0.88, 0.90), hdrTxt);

            // -----------------------------------------------------------------
            // Red "BATTERY" Indicator LED on Left Bezel (X = 502, Y = 430)
            // -----------------------------------------------------------------
            vec2 ledPos = vec2(502.0, 430.0);
            float ledDist = length(sp - ledPos);
            // Soft red glow halo
            lensCol += vec3(0.45, 0.04, 0.02) * exp(-ledDist * 0.09);
            if (ledDist < 12.0) {
                // Dark LED bezel ring
                lensCol = vec3(0.15, 0.05, 0.05);
            }
            if (ledDist < 9.5) {
                // 3D glossy red dome LED
                float dome = sqrt(max(0.0, 1.0 - (ledDist / 9.5) * (ledDist / 9.5)));
                lensCol = vec3(0.85, 0.08, 0.05) + vec3(0.35, 0.25, 0.20) * pow(dome, 3.0);
                // Specular highlight dot on top-left of LED
                if (length(sp - (ledPos + vec2(-3.0, -3.0))) < 2.8) {
                    lensCol = vec3(1.0, 0.85, 0.80);
                }
            }

            // "BATTERY" label below the LED (Y = 460)
            int batStr[7] = int[7](66, 65, 84, 84, 69, 82, 89);
            float batTxt = 0.0;
            for (int i = 0; i < 7; i++) {
                batTxt = max(batTxt, drawChar(sp, vec2(465.0 + float(i) * 11.5, 460.0), 1.65, batStr[i]));
            }
            lensCol = mix(lensCol, vec3(0.86, 0.86, 0.88), batTxt);

            // -----------------------------------------------------------------
            // 3. SUNKEN 160x144 DOT-MATRIX LCD WINDOW (5x scale -> 800x720)
            //    Spans X: [560, 1360], Y: [116, 836]
            // -----------------------------------------------------------------
            // Olive-green outer LCD frame border (X: [548, 1372], Y: [106, 846])
            if (sp.x >= 548.0 && sp.x < 1372.0 && sp.y >= 106.0 && sp.y < 846.0) {
                // Sunken olive margin around active pixel matrix
                lensCol = vec3(0.51, 0.62, 0.09);

                // Inner bezel drop shadow cast onto top & left of LCD glass
                float shadowTop  = clamp((124.0 - sp.y) / 18.0, 0.0, 1.0);
                float shadowLeft = clamp((566.0 - sp.x) / 18.0, 0.0, 1.0);
                lensCol *= (1.0 - 0.38 * max(shadowTop, shadowLeft));

                // Active 160x144 pixel matrix (X: [560, 1360], Y: [116, 836])
                if (sp.x >= 560.0 && sp.x < 1360.0 && sp.y >= 116.0 && sp.y < 836.0) {
                    vec2 lcdP = (sp - vec2(560.0, 116.0)) / 5.0;
                    // Right-side up: lcdP.y = 0 at top (row 0), 143 at bottom (row 143)
                    ivec2 p = ivec2(floor(lcdP));
                    p = clamp(p, ivec2(0), ivec2(159, 143));

                    uint shade = readLCD(p);
                    vec3 pixCol = dmgColor(shade);

                    // Authentic Dot-Matrix sub-pixel grid (5x5 screen pixels per GB pixel)
                    vec2 sub = fract(lcdP);
                    float gridX = smoothstep(0.0, 0.16, sub.x) * smoothstep(1.0, 0.84, sub.x);
                    float gridY = smoothstep(0.0, 0.16, sub.y) * smoothstep(1.0, 0.84, sub.y);
                    float dotMask = gridX * gridY;

                    // Unlit olive-green substrate visible between liquid crystal dots
                    vec3 substrate = vec3(0.635, 0.755, 0.095);
                    // Darker pixels cast a tiny shadow onto the reflective backing
                    pixCol = mix(mix(substrate, pixCol, 0.42), pixCol, dotMask);

                    // Top/left recessed shadow from the physical bezel frame onto the active LCD
                    float innerShadowT = clamp((126.0 - sp.y) / 10.0, 0.0, 1.0);
                    float innerShadowL = clamp((570.0 - sp.x) / 10.0, 0.0, 1.0);
                    pixCol *= (1.0 - 0.25 * max(innerShadowT, innerShadowL));

                    lensCol = pixCol;
                }
            }

            shellCol = lensCol;
        }

        // =====================================================================
        // 4. LOWER FACEPLATE DETAILS (Y: 870 to 1066)
        //    "GAME BOY TM" Logo, Cross D-Pad, A/B Buttons, Select/Start, Speaker
        // =====================================================================
        if (dBezel >= 0.0 && sp.y > 870.0) {
            // "GAME BOY TM" Navy Emblem below bottom-left of bezel (X = 460, Y = 886)
            vec3 logoNavy = vec3(0.14, 0.18, 0.42);
            int gbLogo[8] = int[8](71, 65, 77, 69, 32, 66, 79, 89); // "GAME BOY"
            float logoMask = 0.0;
            for (int i = 0; i < 8; i++) {
                logoMask = max(logoMask, drawChar(sp, vec2(460.0 + float(i) * 24.0, 886.0), 3.4, gbLogo[i]));
            }
            // Small "TM" next to GAME BOY
            logoMask = max(logoMask, drawChar(sp, vec2(660.0, 898.0), 1.6, 84)); // T
            logoMask = max(logoMask, drawChar(sp, vec2(671.0, 898.0), 1.6, 77)); // M
            shellCol = mix(shellCol, logoNavy, logoMask);

            // -----------------------------------------------------------------
            // Cross D-Pad on Left (Center: X = 565, Y = 980)
            // -----------------------------------------------------------------
            vec2 dpadC = vec2(565.0, 980.0);
            vec2 dp = sp - dpadC;
            // Subtle circular recessed well in the shell
            if (length(dp) < 62.0) {
                shellCol *= 0.96;
            }
            float dHoriz = sdRoundBox(dp, vec2(50.0, 17.0), 4.0);
            float dVert  = sdRoundBox(dp, vec2(17.0, 50.0), 4.0);
            float dCross = min(dHoriz, dVert);
            if (dCross < 2.5 && dCross >= 0.0) {
                shellCol *= 0.55; // Dark recess around D-Pad
            } else if (dCross < 0.0) {
                // Matte black/charcoal D-Pad plastic
                vec3 dpadCol = vec3(0.14, 0.14, 0.16);
                // Bevel highlight on edges
                if (-dCross < 3.5) dpadCol += vec3(0.08);
                // Center pivot circle dimple
                float rCenter = length(dp);
                if (rCenter < 11.0) {
                    dpadCol = vec3(0.10, 0.10, 0.12) + vec3(0.04) * (dp.y / 11.0);
                }
                // Molded directional grip ribs (3 ridges per arm)
                if (abs(dp.y) < 10.0 && (abs(abs(dp.x) - 24.0) < 1.8 || abs(abs(dp.x) - 32.0) < 1.8 || abs(abs(dp.x) - 40.0) < 1.8)) {
                    dpadCol *= 0.72;
                }
                if (abs(dp.x) < 10.0 && (abs(abs(dp.y) - 24.0) < 1.8 || abs(abs(dp.y) - 32.0) < 1.8 || abs(abs(dp.y) - 40.0) < 1.8)) {
                    dpadCol *= 0.72;
                }
                // Highlight active direction when pressed on S2 controller
                if ((buttons & (1u << 12)) != 0u && dp.x < -15.0 && abs(dp.y) < 15.0) dpadCol += vec3(0.18, 0.18, 0.22); // Left
                if ((buttons & (1u << 14)) != 0u && dp.x >  15.0 && abs(dp.y) < 15.0) dpadCol += vec3(0.18, 0.18, 0.22); // Right
                if ((buttons & (1u << 13)) != 0u && dp.y < -15.0 && abs(dp.x) < 15.0) dpadCol += vec3(0.18, 0.18, 0.22); // Up
                if ((buttons & (1u << 15)) != 0u && dp.y >  15.0 && abs(dp.x) < 15.0) dpadCol += vec3(0.18, 0.18, 0.22); // Down
                shellCol = dpadCol;
            }

            // -----------------------------------------------------------------
            // Angled Burgundy A & B Buttons in Sunken Pill Recess (Right)
            //   B at (1235, 992), A at (1330, 948) -> ~25 deg angle
            // -----------------------------------------------------------------
            vec2 abCenter = vec2(1282.5, 970.0);
            vec2 abRel = sp - abCenter;
            float ang = -0.436; // -25 degrees
            float ca = cos(ang), sa = sin(ang);
            vec2 abRot = vec2(ca * abRel.x - sa * abRel.y, sa * abRel.x + ca * abRel.y);
            // Sunken pill well around A & B buttons
            float dABWell = sdRoundBox(abRot, vec2(86.0, 36.0), 36.0);
            if (dABWell < 0.0) {
                shellCol *= 0.91;
                if (-dABWell < 3.0) shellCol *= 0.88;
            }

            vec2 posB = vec2(1235.0, 992.0);
            vec2 posA = vec2(1330.0, 948.0);
            float distB = length(sp - posB);
            float distA = length(sp - posA);
            bool pressB = (buttons & ((1u << 1) | (1u << 2))) != 0u;
            bool pressA = (buttons & ((1u << 0) | (1u << 3))) != 0u;

            if (distB < 27.0 || distA < 27.0) {
                vec2 bRel = (distB < 27.0) ? (sp - posB) : (sp - posA);
                bool isPressed = (distB < 27.0) ? pressB : pressA;
                float r = length(bRel);
                if (r > 24.5) {
                    shellCol = vec3(0.15, 0.06, 0.10); // Button hole shadow
                } else {
                    // Authentic DMG-01 glossy burgundy/magenta button (#8B1D41)
                    float dome = sqrt(max(0.0, 1.0 - (r / 24.5) * (r / 24.5)));
                    vec3 btnCol = vec3(0.56, 0.10, 0.27) * (0.75 + 0.35 * dome);
                    // Glossy specular reflection on top-left of button cap
                    float spec = exp(-length(bRel - vec2(-7.0, -8.0)) * 0.16);
                    btnCol += vec3(0.32, 0.18, 0.22) * spec;
                    if (isPressed) btnCol += vec3(0.22, 0.08, 0.12);
                    shellCol = btnCol;
                }
            }

            // "B" and "A" navy labels below-right of each button
            float lblB = drawChar(sp, vec2(1250.0, 1022.0), 2.5, 66); // B
            float lblA = drawChar(sp, vec2(1345.0, 978.0), 2.5, 65);  // A
            shellCol = mix(shellCol, logoNavy, max(lblB, lblA));

            // -----------------------------------------------------------------
            // Angled Silicone SELECT & START Pill Buttons (Center-Bottom)
            // -----------------------------------------------------------------
            vec2 selCenter = vec2(885.0, 1018.0);
            vec2 staCenter = vec2(985.0, 1018.0);
            vec2 selRot = vec2(ca * (sp.x - selCenter.x) - sa * (sp.y - selCenter.y),
                               sa * (sp.x - selCenter.x) + ca * (sp.y - selCenter.y));
            vec2 staRot = vec2(ca * (sp.x - staCenter.x) - sa * (sp.y - staCenter.y),
                               sa * (sp.x - staCenter.x) + ca * (sp.y - staCenter.y));
            float dSel = sdRoundBox(selRot, vec2(24.0, 6.5), 6.5);
            float dSta = sdRoundBox(staRot, vec2(24.0, 6.5), 6.5);
            if (dSel < 2.0 && dSel >= 0.0) shellCol *= 0.72;
            if (dSta < 2.0 && dSta >= 0.0) shellCol *= 0.72;
            if (dSel < 0.0 || dSta < 0.0) {
                shellCol = vec3(0.38, 0.37, 0.41); // Grey rubber silicone pill
                bool selPressed = (buttons & (1u << 11)) != 0u;
                bool staPressed = (buttons & (1u << 10)) != 0u;
                if ((dSel < 0.0 && selPressed) || (dSta < 0.0 && staPressed)) {
                    shellCol += vec3(0.20);
                }
            }
            // "SELECT" and "START" labels below the pills
            int selTxt[6] = int[6](83, 69, 76, 69, 67, 84);
            int staTxt[5] = int[5](83, 84, 65, 82, 84);
            float ssMask = 0.0;
            for (int i = 0; i < 6; i++) ssMask = max(ssMask, drawChar(sp, vec2(855.0 + float(i) * 10.5, 1038.0), 1.5, selTxt[i]));
            for (int i = 0; i < 5; i++) ssMask = max(ssMask, drawChar(sp, vec2(960.0 + float(i) * 10.5, 1038.0), 1.5, staTxt[i]));
            shellCol = mix(shellCol, logoNavy, ssMask);

            // -----------------------------------------------------------------
            // 6 Diagonal Speaker Grille Slots in Bottom-Right Curve
            // -----------------------------------------------------------------
            float spkAng = 0.58; // ~33 deg diagonal slots
            float cs = cos(spkAng), ss = sin(spkAng);
            for (int i = 0; i < 6; i++) {
                vec2 slotC = vec2(1375.0 + float(i) * 18.0, 1028.0 - float(i) * 11.0);
                vec2 sr = sp - slotC;
                vec2 sRot = vec2(cs * sr.x - ss * sr.y, ss * sr.x + cs * sr.y);
                float dSlot = sdRoundBox(sRot, vec2(3.5, 30.0), 3.5);
                if (dSlot < 0.0) {
                    shellCol = vec3(0.12, 0.11, 0.10); // Dark acoustic mesh inside slot
                } else if (dSlot < 1.8) {
                    shellCol *= 0.78; // Beveled slot lip
                }
            }
        }

        col = shellCol;
    }

    // =========================================================================
    // 5. LEFT HARDWARE MONITOR WING (X: 25 to 385, Y: 60 to 1020)
    //    Live Sharp LR35902 CPU Registers + Timer/Interrupt Status
    // =========================================================================
    float dLeftWing = sdRoundBox(sp - vec2(205.0, 540.0), vec2(180.0, 480.0), 14.0);
    if (dLeftWing < 0.0) {
        vec3 pCol = vec3(0.08, 0.10, 0.14);
        if (dLeftWing > -2.5) pCol = vec3(0.22, 0.28, 0.38);

        // Header: "LR35902 CPU" (Y = 85)
        int title[11] = int[11](76, 82, 51, 53, 57, 48, 50, 32, 67, 80, 85);
        float tm = 0.0;
        for (int i = 0; i < 11; i++) {
            tm = max(tm, drawChar(sp, vec2(50.0 + float(i) * 20.0, 85.0), 2.8, title[i]));
        }
        pCol = mix(pCol, vec3(0.608, 0.737, 0.059), tm);

        // 16-bit Register Readouts (AF, BC, DE, HL, SP, PC)
        uint regs[6] = uint[6](
            cpu.regs0.x, cpu.regs0.y, cpu.regs0.z,
            cpu.regs0.w, cpu.regs1.x, cpu.regs1.y
        );
        int rNames[12] = int[12](65, 70, 66, 67, 68, 69, 72, 76, 83, 80, 80, 67);

        for (int r = 0; r < 6; r++) {
            float ry = 145.0 + float(r) * 44.0;
            float lbl = 0.0;
            lbl = max(lbl, drawChar(sp, vec2(50.0, ry), 2.6, rNames[r * 2]));
            lbl = max(lbl, drawChar(sp, vec2(68.0, ry), 2.6, rNames[r * 2 + 1]));
            lbl = max(lbl, drawChar(sp, vec2(86.0, ry), 2.6, 58)); // :
            pCol = mix(pCol, vec3(0.55, 0.65, 0.78), lbl);

            float val = drawHex16(sp, vec2(125.0, ry), 2.6, regs[r]);
            pCol = mix(pCol, vec3(0.92, 0.96, 1.0), val);
        }

        // PPU Hardware Registers (LCDC, STAT, SCY, SCX, LY, BGP)
        int ioTitle[7] = int[7](80, 80, 85, 32, 82, 69, 71); // "PPU REG"
        float iot = 0.0;
        for (int i = 0; i < 7; i++) {
            iot = max(iot, drawChar(sp, vec2(50.0 + float(i) * 20.0, 440.0), 2.6, ioTitle[i]));
        }
        pCol = mix(pCol, vec3(0.608, 0.737, 0.059), iot);

        uint ios[6] = uint[6](
            cpu.io0.x, cpu.io0.y, cpu.io0.z,
            cpu.io0.w, cpu.io1.x, cpu.io1.z
        );
        int ioNames[18] = int[18](
            76, 67, 68,   // LCD
            83, 84, 65,   // STA
            83, 67, 89,   // SCY
            83, 67, 88,   // SCX
            76, 89, 32,   // LY
            66, 71, 80    // BGP
        );

        for (int r = 0; r < 6; r++) {
            float ry = 490.0 + float(r) * 40.0;
            float lbl = 0.0;
            lbl = max(lbl, drawChar(sp, vec2(50.0, ry), 2.4, ioNames[r * 3]));
            lbl = max(lbl, drawChar(sp, vec2(66.0, ry), 2.4, ioNames[r * 3 + 1]));
            lbl = max(lbl, drawChar(sp, vec2(82.0, ry), 2.4, ioNames[r * 3 + 2]));
            lbl = max(lbl, drawChar(sp, vec2(98.0, ry), 2.4, 58));
            pCol = mix(pCol, vec3(0.55, 0.65, 0.78), lbl);

            float val = drawHex8(sp, vec2(135.0, ry), 2.4, ios[r]);
            pCol = mix(pCol, vec3(0.92, 0.96, 1.0), val);
        }

        // Controls Guide at bottom of Left Wing (Y = 780..950)
        int cTitle[8] = int[8](67, 79, 78, 84, 82, 79, 76, 83); // "CONTROLS"
        float ct = 0.0;
        for (int i = 0; i < 8; i++) {
            ct = max(ct, drawChar(sp, vec2(50.0 + float(i) * 18.0, 780.0), 2.4, cTitle[i]));
        }
        pCol = mix(pCol, vec3(0.608, 0.737, 0.059), ct);

        // "DPAD: MOVE"
        int c1[10] = int[10](68, 80, 65, 68, 58, 32, 77, 79, 86, 69);
        // "A/B : ROTATE"
        int c2[12] = int[12](65, 47, 66, 32, 58, 32, 82, 79, 84, 65, 84, 69);
        // "PLUS: START"
        int c3[11] = int[11](80, 76, 85, 83, 58, 32, 83, 84, 65, 82, 84);
        float cm = 0.0;
        for (int i = 0; i < 10; i++) cm = max(cm, drawChar(sp, vec2(50.0 + float(i) * 14.0, 830.0), 2.0, c1[i]));
        for (int i = 0; i < 12; i++) cm = max(cm, drawChar(sp, vec2(50.0 + float(i) * 14.0, 866.0), 2.0, c2[i]));
        for (int i = 0; i < 11; i++) cm = max(cm, drawChar(sp, vec2(50.0 + float(i) * 14.0, 902.0), 2.0, c3[i]));
        pCol = mix(pCol, vec3(0.75, 0.82, 0.90), cm);

        col = pCol;
    }

    // =========================================================================
    // 6. RIGHT HARDWARE MONITOR WING (X: 1535 to 1895, Y: 60 to 1020)
    //    Live VRAM 8x8 Tile Viewer + OAM Sprite Table Inspector
    // =========================================================================
    float dRightWing = sdRoundBox(sp - vec2(1715.0, 540.0), vec2(180.0, 480.0), 14.0);
    if (dRightWing < 0.0) {
        vec3 pCol = vec3(0.08, 0.10, 0.14);
        if (dRightWing > -2.5) pCol = vec3(0.22, 0.28, 0.38);

        // Header: "VRAM TILES" (Y = 85)
        int vt[10] = int[10](86, 82, 65, 77, 32, 84, 73, 76, 69, 83);
        float vtm = 0.0;
        for (int i = 0; i < 10; i++) {
            vtm = max(vtm, drawChar(sp, vec2(1560.0 + float(i) * 20.0, 85.0), 2.8, vt[i]));
        }
        pCol = mix(pCol, vec3(0.608, 0.737, 0.059), vtm);

        // Live 16x16 Grid of 8x8 VRAM Tiles (128x128 pixels scaled 2x -> 256x256)
        // Spans X: [1587, 1843], Y: [135, 391]
        if (sp.x >= 1587.0 && sp.x < 1843.0 && sp.y >= 135.0 && sp.y < 391.0) {
            ivec2 vp = ivec2((sp - vec2(1587.0, 135.0)) / 2.0);
            int tileX = vp.x >> 3;
            int tileY = vp.y >> 3;
            int tileIdx = tileY * 16 + tileX;
            int py = vp.y & 7;
            int px = 7 - (vp.x & 7);

            uint addr = uint(tileIdx * 16 + py * 2);
            uint lo = readVRAMByte(addr);
            uint hi = readVRAMByte(addr + 1u);
            uint colorId = ((lo >> px) & 1u) | (((hi >> px) & 1u) << 1u);
            uint shade = (cpu.io1.z >> (colorId * 2u)) & 3u;
            pCol = dmgColor(shade);
        }

        // OAM Sprite Inspector below VRAM Viewer (Y = 435)
        int ot[11] = int[11](79, 65, 77, 32, 83, 80, 82, 73, 84, 69, 83);
        float otm = 0.0;
        for (int i = 0; i < 11; i++) {
            otm = max(otm, drawChar(sp, vec2(1560.0 + float(i) * 18.0, 435.0), 2.5, ot[i]));
        }
        pCol = mix(pCol, vec3(0.608, 0.737, 0.059), otm);

        // Display first 10 OAM entries (Y, X, Tile, Attr)
        for (int s = 0; s < 10; s++) {
            uint w = oam[s];
            uint sy = w & 0xFFu;
            uint sx = (w >> 8u) & 0xFFu;
            uint st = (w >> 16u) & 0xFFu;
            uint sa = (w >> 24u) & 0xFFu;

            float ry = 485.0 + float(s) * 44.0;
            float sm = 0.0;
            sm = max(sm, drawHex8(sp, vec2(1565.0, ry), 2.2, uint(s)));
            sm = max(sm, drawChar(sp, vec2(1600.0, ry), 2.2, 58));
            pCol = mix(pCol, vec3(0.50, 0.60, 0.72), sm);

            float vm = 0.0;
            vm = max(vm, drawHex8(sp, vec2(1625.0, ry), 2.2, sx));
            vm = max(vm, drawHex8(sp, vec2(1675.0, ry), 2.2, sy));
            vm = max(vm, drawHex8(sp, vec2(1725.0, ry), 2.2, st));
            vm = max(vm, drawHex8(sp, vec2(1775.0, ry), 2.2, sa));
            pCol = mix(pCol, vec3(0.88, 0.94, 1.0), vm);
        }

        col = pCol;
    }

    outColor = vec4(col, 1.0);
}
