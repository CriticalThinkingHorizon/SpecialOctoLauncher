#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#define HB_READONLY
#include "abi.glsl"
#include "hb.glsl"
#include "draw.glsl"
#include "text.glsl"
#include "dmg.glsl"

// -----------------------------------------------------------------------------
// SDK Font Atlas Helpers (gl_FragCoord.y = 0 at TOP, 1080 at BOTTOM)
// -----------------------------------------------------------------------------
float drawChar(vec2 p, vec2 origin, uint ascii) {
    if (ascii < GLYPH_FIRST || ascii >= GLYPH_FIRST + GLYPH_COUNT) return 0.0;
    uint idx = ascii - GLYPH_FIRST;
    ivec4 rect = ivec4(
        int(idx % uint(GLYPH_COLS)) * GLYPH_W,
        int(idx / uint(GLYPH_COLS)) * GLYPH_H,
        GLYPH_W,
        GLYPH_H
    );
    return text(p, origin, rect);
}

float drawCharScaled(vec2 p, vec2 origin, uint ascii, float scale) {
    vec2 sp = origin + (p - origin) / scale;
    return drawChar(sp, origin, ascii);
}

float drawDigit(vec2 p, vec2 origin, uint d) {
    if (d > 9u) return 0.0;
    return drawChar(p, origin, 48u + d);
}

float drawNumber5(vec2 p, vec2 origin, uint v) {
    float ink = 0.0;
    float gw = float(GLYPH_W);
    ink = max(ink, drawDigit(p, origin, (v / 10000u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw, 0.0), (v / 1000u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw * 2.0, 0.0), (v / 100u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw * 3.0, 0.0), (v / 10u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw * 4.0, 0.0), v % 10u));
    return ink;
}

float drawHex16(vec2 p, vec2 origin, uint v) {
    float ink = 0.0;
    float gw = float(GLYPH_W);
    for (int i = 0; i < 4; i++) {
        uint nib = (v >> uint((3 - i) * 4)) & 0xFu;
        uint ascii = (nib < 10u) ? (48u + nib) : (55u + nib);
        ink = max(ink, drawChar(p, origin + vec2(float(i) * gw, 0.0), ascii));
    }
    return ink;
}

float sdRoundBox4(vec2 p, vec2 b, vec4 r) {
    vec2 rad = (p.x > 0.0) ? r.xy : r.zw;
    float radius = (p.y > 0.0) ? rad.y : rad.x;
    vec2 q = abs(p) - b + radius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

bool tinyDigitPixel(uint d, int x, int y) {
    if (x < 0 || x > 2 || y < 0 || y > 4) return false;
    int masks[10] = int[10](
        0x7B6F, 0x2492, 0x73E7, 0x72CF, 0x5BC9,
        0x79CF, 0x79EF, 0x7249, 0x7BEF, 0x7BC9
    );
    int bitIdx = (4 - y) * 3 + (2 - x);
    return ((masks[d % 10u] >> bitIdx) & 1) != 0;
}

// -----------------------------------------------------------------------------
// Built-in "Super S2 Land" 160x144 pixel-art scene (when ROM #0 is selected)
// -----------------------------------------------------------------------------
uint renderBuiltinPixel(ivec2 p, uint palMode) {
    int worldX = p.x + c.piece.x;
    int worldY = p.y;

    float px = c.flow.x;
    float py = c.flow.y;
    int facing = c.piece.z;
    int anim = c.piece.y;
    uint score = c.game.y;
    uint lives = c.game.w;

    if (p.y < 12) {
        if (p.y == 11) return 3u;
        for (int i = 0; i < 5; i++) {
            uint div = (i == 0) ? 10000u : (i == 1) ? 1000u : (i == 2) ? 100u : (i == 3) ? 10u : 1u;
            uint d = (score / div) % 10u;
            if (tinyDigitPixel(d, p.x - (6 + i * 4), p.y - 3)) return 3u;
        }
        for (uint i = 0u; i < 3u; i++) {
            int hx = 128 + int(i) * 9;
            int rx = p.x - hx;
            int ry = p.y - 3;
            if (rx >= 0 && rx <= 6 && ry >= 0 && ry <= 5) {
                bool heartShape =
                    (ry == 0 && (rx == 1 || rx == 2 || rx == 4 || rx == 5)) ||
                    (ry == 1 && rx >= 0 && rx <= 6) ||
                    (ry == 2 && rx >= 0 && rx <= 6) ||
                    (ry == 3 && rx >= 1 && rx <= 5) ||
                    (ry == 4 && rx >= 2 && rx <= 4) ||
                    (ry == 5 && rx == 3);
                if (heartShape) return (i < lives) ? 3u : 1u;
            }
        }
        return 0u;
    }

    if (lives == 0u && p.x >= 32 && p.x <= 128 && p.y >= 54 && p.y <= 86) {
        if (p.x == 32 || p.x == 128 || p.y == 54 || p.y == 86) return 3u;
        if (p.x == 34 || p.x == 126 || p.y == 56 || p.y == 84) return 2u;
        if (p.y >= 66 && p.y <= 74 && p.x >= 48 && p.x <= 112) {
            bool blink = mod(c.motion.w, 30.0) < 20.0;
            if (blink && ((p.x / 4 + p.y / 2) % 2 == 0)) return 3u;
        }
        return 0u;
    }

    if (worldY >= 120) {
        bool checker = ((worldX / 8) + (worldY / 8)) % 2 == 0;
        return checker ? 3u : 2u;
    } else if (worldY >= 112) {
        if (worldY == 112) return 3u;
        return (worldX % 4 == 0) ? 2u : 1u;
    }

    if (worldX >= 80 && worldX <= 130 && worldY >= 84 && worldY <= 90) {
        bool brickLine = (worldX % 8 == 0) || (worldY == 84) || (worldY == 90);
        return brickLine ? 3u : 2u;
    }
    if (worldX >= 170 && worldX <= 230 && worldY >= 64 && worldY <= 70) {
        bool brickLine = (worldX % 8 == 0) || (worldY == 64) || (worldY == 70);
        return brickLine ? 3u : 2u;
    }

    if ((c.game.z & 1u) == 0u) {
        ivec2 cd = abs(ivec2(worldX, worldY) - ivec2(105, 68));
        int coinW = int(abs(sin(c.motion.x * 6.0)) * 4.0) + 1;
        if (cd.x <= coinW && cd.y <= 5) return (cd.x == coinW || cd.y == 5) ? 3u : 1u;
    }
    if ((c.game.z & 2u) == 0u) {
        ivec2 cd = abs(ivec2(worldX, worldY) - ivec2(200, 48));
        int coinW = int(abs(sin(c.motion.x * 6.0)) * 4.0) + 1;
        if (cd.x <= coinW && cd.y <= 5) return (cd.x == coinW || cd.y == 5) ? 3u : 1u;
    }

    float e1x = float(c.stats.x);
    if (e1x < 500.0) {
        ivec2 ed = abs(ivec2(worldX - int(e1x), worldY - 107));
        if (ed.x <= 7 && ed.y <= 5) {
            if (ed.x == 7 || ed.y == 5) return 3u;
            if (ed.y == 1 && ed.x <= 3) return 0u;
            return 2u;
        }
    }

    float e2x = float(c.stats.z);
    if (e2x < 500.0) {
        float e2y = 48.0 + sin(c.motion.x * 4.0) * 14.0;
        ivec2 bd = abs(ivec2(worldX - int(e2x), worldY - int(e2y)));
        if (bd.x <= 8 && bd.y <= 5) {
            bool flap = mod(c.motion.w, 16.0) < 8.0;
            if (flap && bd.y <= 2) return 3u;
            return 2u;
        }
    }

    int hRelX = (worldX - int(px)) * (facing == 0 ? 1 : facing);
    int hRelY = worldY - (int(py) - 8);
    if (abs(hRelX) <= 6 && abs(hRelY) <= 8) {
        if (hRelY < -4) return 3u;
        if (hRelY >= -4 && hRelY <= 0) {
            if (hRelX == 2 && hRelY >= -2 && hRelY <= -1) return 3u;
            return 1u;
        }
        if (hRelY > 0 && hRelY <= 5) return 2u;
        if (hRelY > 5) {
            bool legStep = (anim % 16) < 8;
            if (legStep && hRelX < 0) return 3u;
            if (!legStep && hRelX >= 0) return 3u;
            return 1u;
        }
    }

    int hillY = 112 - int(sin(float(worldX) * 0.04) * 16.0 + 12.0);
    if (worldY >= hillY) return (worldY - hillY < 2) ? 2u : 1u;

    int cloudX = int(float(worldX) * 0.5 + c.motion.x * 6.0) % 180;
    if (cloudX > 30 && cloudX < 75 && worldY >= 24 && worldY <= 36) return 1u;

    return 0u;
}

// -----------------------------------------------------------------------------
// Render DMG-01 Cartridge ROM Selector Menu on the 800x720 LCD area
// -----------------------------------------------------------------------------
vec3 renderRomMenuLCD(vec2 sp, uint palMode) {
    vec3 c0 = getDmgColor(0u, palMode); // Lightest olive background
    vec3 c1 = getDmgColor(1u, palMode);
    vec3 c2 = getDmgColor(2u, palMode);
    vec3 c3 = getDmgColor(3u, palMode); // Darkest olive ink

    // Subtle 5x5 dot-matrix grid over the menu background
    vec2 lcdP = (sp - vec2(560.0, 116.0)) / 5.0;
    vec2 sub = fract(lcdP);
    float dotMask = smoothstep(0.0, 0.16, sub.x) * smoothstep(1.0, 0.84, sub.x) *
                    smoothstep(0.0, 0.16, sub.y) * smoothstep(1.0, 0.84, sub.y);

    vec3 col = mix(c0 * 1.03, c0, dotMask);

    // Top banner bar inside LCD (Y: 116..172)
    if (sp.y < 172.0) {
        col = c3;
        // "DMG-01 .GB CARTRIDGE LOADER"
        const uint M_HDR[] = uint[](
            68u,77u,71u,45u,48u,49u,32u,46u,71u,66u,32u,
            67u,65u,82u,84u,82u,73u,68u,71u,69u,32u,
            76u,79u,65u,68u,69u,82u
        );
        float hInk = 0.0;
        for (uint i = 0u; i < 27u; i++) {
            hInk = max(hInk, drawChar(sp, vec2(610.0 + float(i) * float(GLYPH_W), 128.0), M_HDR[i]));
        }
        col = mix(col, c0, hInk);
        return col;
    }

    // Bottom hint bar inside LCD (Y: 784..836)
    if (sp.y > 784.0) {
        col = c2;
        // "(A) DOWNLOAD TO TMP:/ & BOOT  |  (Y) RESUME"
        const uint M_FTR[] = uint[](
            40u,65u,41u,32u,76u,79u,65u,68u,32u,84u,79u,32u,84u,77u,80u,58u,47u,32u,38u,32u,80u,76u,65u,89u,
            32u,32u,124u,32u,32u,40u,89u,41u,32u,67u,76u,79u,83u,69u
        );
        float fInk = 0.0;
        for (uint i = 0u; i < 38u; i++) {
            fInk = max(fInk, drawCharScaled(sp, vec2(582.0 + float(i) * 14.5, 796.0), M_FTR[i], 0.85));
        }
        col = mix(col, c0, fInk);
        return col;
    }

    // If currently downloading ROM to tmp:/ and loading into GPU (c.reserved.x == 2u)
    if (c.reserved.x == 2u) {
        float mBox = box(sp, vec2(960.0, 476.0), vec2(320.0, 65.0), 8.0);
        if (mBox < 0.0) {
            col = c3;
            const uint DL_MSG[] = uint[](
                68u,79u,87u,78u,76u,79u,65u,68u,73u,78u,71u,32u,82u,79u,77u,32u,84u,79u,32u,84u,77u,80u,58u,47u,46u,46u,46u
            );
            float dInk = 0.0;
            for (uint i = 0u; i < 27u; i++) {
                dInk = max(dInk, drawChar(sp, vec2(730.0 + float(i) * float(GLYPH_W), 460.0), DL_MSG[i]));
            }
            col = mix(col, c0, dInk);
        }
        return col;
    }

    // List up to 10 ROM entries from server roms/ + S2 tmp:/
    uint romCount = clamp(hbFsEntryCount(), 1u, 10u);
    uint selected = c.reserved.y;

    for (uint r = 0u; r < 10u; r++) {
        if (r >= romCount) break;
        float rowY = 192.0 + float(r) * 56.0;
        bool isSel = (r == selected);

        float rBox = box(sp, vec2(960.0, rowY + 18.0), vec2(376.0, 23.0), 6.0);
        if (isSel && rBox < 0.0) {
            col = c3;
        } else if (!isSel && abs(rBox) < 1.5) {
            col = c1;
        }

        vec3 txtCol = isSel ? c0 : c3;
        float rowInk = 0.0;
        for (uint cIdx = 0u; cIdx < 30u; cIdx++) {
            uint ch = hbFsEntryByte(r, cIdx);
            if (ch == 0u) break;
            rowInk = max(rowInk, drawChar(sp, vec2(600.0 + float(cIdx) * float(GLYPH_W), rowY + 2.0), ch));
        }

        // Badge on right of row: [TMP:/] if already on S2 tmp:/ (type==2), [SERVER] if on server (type==1)
        uint rType = hbFsEntryType(r);
        const uint B_TMP[] = uint[](91u, 84u, 77u, 80u, 58u, 47u, 93u); // "[TMP:/]"
        const uint B_SRV[] = uint[](91u, 83u, 82u, 86u, 93u);           // "[SRV]"
        if (rType == 2u) {
            for (uint b = 0u; b < 7u; b++) {
                rowInk = max(rowInk, drawChar(sp, vec2(1200.0 + float(b) * float(GLYPH_W), rowY + 2.0), B_TMP[b]));
            }
        } else {
            for (uint b = 0u; b < 5u; b++) {
                rowInk = max(rowInk, drawChar(sp, vec2(1234.0 + float(b) * float(GLYPH_W), rowY + 2.0), B_SRV[b]));
            }
        }

        col = mix(col, txtCol, rowInk);
    }

    return col;
}

void main() {
    vec2 sp = gl_FragCoord.xy; // sp.y = 0 at TOP, 1080 at BOTTOM
    uint palMode = uint(c.transition.x);
    uint buttons = c.state.y;
    uint romLoaded = c.atlas[GB_CPU_BASE + 31u];
    float gw = float(GLYPH_W);

    // Dark Studio Backdrop with subtle grid
    vec3 col = mix(vec3(0.05, 0.06, 0.09), vec3(0.09, 0.11, 0.15), sp.y / 1080.0);
    if (mod(sp.x, 32.0) < 1.0 || mod(sp.y, 32.0) < 1.0) {
        col += vec3(0.008, 0.010, 0.015);
    }

    // =========================================================================
    // 1. AUTHENTIC 1989 GAME BOY DMG-01 HANDHELD SHELL & SCREEN BEZEL
    // =========================================================================
    vec2 shellCenter = vec2(960.0, 540.0);
    vec2 shellHalf   = vec2(550.0, 526.0);
    float dShell = sdRoundBox4(sp - shellCenter, shellHalf, vec4(28.0, 115.0, 28.0, 28.0));

    float dShellShadow = sdRoundBox4(sp - (shellCenter + vec2(12.0, 16.0)), shellHalf, vec4(28.0, 115.0, 28.0, 28.0));
    if (dShellShadow < 0.0) {
        col *= 0.35;
    }

    if (dShell < 0.0) {
        vec3 puttyBase = vec3(0.831, 0.812, 0.761);
        float grain = fract(sin(dot(floor(sp), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 shellCol = puttyBase + (grain - 0.5) * 0.014;

        float edgeDist = -dShell;
        if (edgeDist < 10.0) {
            float bevel = 1.0 - edgeDist / 10.0;
            float lightDir = ((sp.x < 960.0 ? 0.4 : -0.5) + (sp.y < 540.0 ? 0.6 : -0.6));
            shellCol += vec3(lightDir * bevel * 0.14);
        }

        // Top relief seam grooves
        if (abs(sp.y - 46.0) < 2.0 && sp.x > 414.0 && sp.x < 1506.0) {
            shellCol = (sp.y < 46.0) ? shellCol * 0.68 : shellCol * 1.08;
        }
        if (sp.y < 46.0 && (abs(sp.x - 468.0) < 2.0 || abs(sp.x - 1452.0) < 2.0)) {
            shellCol *= 0.70;
        }

        // Molded "< OFF.ON >" pill badge on top-left
        float dOffOnPill = box(sp, vec2(555.0, 27.0), vec2(64.0, 10.0), 9.0);
        if (dOffOnPill < 0.0) shellCol *= 0.90;
        else if (dOffOnPill < 1.5) shellCol *= 1.05;
        const uint OFF_ON[] = uint[](60u, 79u, 70u, 70u, 46u, 79u, 78u, 62u);
        float offOnInk = 0.0;
        for (uint i = 0u; i < 8u; i++) {
            offOnInk = max(offOnInk, drawCharScaled(sp, vec2(512.0 + float(i) * 10.5, 18.0), OFF_ON[i], 0.55));
        }
        shellCol = mix(shellCol, shellCol * 0.62, offOnInk);

        // =====================================================================
        // 2. DARK GREY SCREEN LENS BEZEL (Y: 60 to 870, X: 446 to 1474)
        // =====================================================================
        vec2 bezelCenter = vec2(960.0, 465.0);
        vec2 bezelHalf   = vec2(514.0, 405.0);
        float dBezel = sdRoundBox4(sp - bezelCenter, bezelHalf, vec4(18.0, 78.0, 18.0, 18.0));

        if (abs(dBezel) < 2.5) shellCol *= 0.62;

        if (dBezel < 0.0) {
            vec3 lensCol = vec3(0.353, 0.345, 0.392);
            float sheen = smoothstep(0.0, 140.0, 140.0 - abs((sp.x - 960.0) * 0.55 + (sp.y - 465.0) + 180.0));
            lensCol += vec3(0.025) * sheen;
            if (-dBezel < 4.0) lensCol *= 0.78;

            vec3 stripeBurgundy = vec3(0.580, 0.125, 0.275);
            vec3 stripeNavy     = vec3(0.145, 0.195, 0.385);
            bool inStripeX = (sp.x >= 472.0 && sp.x <= 830.0) || (sp.x >= 1205.0 && sp.x <= 1448.0);
            if (inStripeX) {
                if (sp.y >= 77.0 && sp.y <= 81.0) lensCol = stripeBurgundy;
                if (sp.y >= 91.0 && sp.y <= 95.0) lensCol = stripeNavy;
            }

            const uint HDR[] = uint[](
                68u,79u,84u,32u,77u,65u,84u,82u,73u,88u,32u,
                87u,73u,84u,72u,32u,
                83u,84u,69u,82u,69u,79u,32u,
                83u,79u,85u,78u,68u
            );
            float hdrInk = 0.0;
            for (uint i = 0u; i < 28u; i++) {
                hdrInk = max(hdrInk, drawCharScaled(sp, vec2(842.0 + float(i) * 12.6, 75.0), HDR[i], 0.65));
            }
            lensCol = mix(lensCol, vec3(0.90, 0.90, 0.92), hdrInk);

            // Red "BATTERY" Indicator LED on Left Bezel
            vec2 ledPos = vec2(502.0, 430.0);
            float ledDist = length(sp - ledPos);
            lensCol += vec3(0.45, 0.04, 0.02) * exp(-ledDist * 0.09);
            if (ledDist < 12.0) lensCol = vec3(0.15, 0.05, 0.05);
            if (ledDist < 9.5) {
                float dome = sqrt(max(0.0, 1.0 - (ledDist / 9.5) * (ledDist / 9.5)));
                lensCol = vec3(0.85, 0.08, 0.05) + vec3(0.35, 0.25, 0.20) * pow(dome, 3.0);
                if (length(sp - (ledPos + vec2(-3.0, -3.0))) < 2.8) {
                    lensCol = vec3(1.0, 0.85, 0.80);
                }
            }

            const uint BAT[] = uint[](66u, 65u, 84u, 84u, 69u, 82u, 89u);
            float batInk = 0.0;
            for (uint i = 0u; i < 7u; i++) {
                batInk = max(batInk, drawCharScaled(sp, vec2(466.0 + float(i) * 10.5, 456.0), BAT[i], 0.56));
            }
            lensCol = mix(lensCol, vec3(0.88, 0.88, 0.90), batInk);

            // -----------------------------------------------------------------
            // 3. SUNKEN 160x144 DOT-MATRIX LCD WINDOW (5x scale -> 800x720)
            //    Spans X: [560, 1360], Y: [116, 836]
            // -----------------------------------------------------------------
            if (sp.x >= 548.0 && sp.x < 1372.0 && sp.y >= 106.0 && sp.y < 846.0) {
                lensCol = getDmgColor(0u, palMode) * 0.86;

                float shadowTop  = clamp((124.0 - sp.y) / 18.0, 0.0, 1.0);
                float shadowLeft = clamp((566.0 - sp.x) / 18.0, 0.0, 1.0);
                lensCol *= (1.0 - 0.38 * max(shadowTop, shadowLeft));

                if (sp.x >= 560.0 && sp.x < 1360.0 && sp.y >= 116.0 && sp.y < 836.0) {
                    if (c.reserved.x == 0u || c.reserved.x == 2u) {
                        // Render Cartridge ROM Selector Menu on LCD!
                        vec3 menuCol = renderRomMenuLCD(sp, palMode);
                        float innerShadowT = clamp((126.0 - sp.y) / 10.0, 0.0, 1.0);
                        float innerShadowL = clamp((570.0 - sp.x) / 10.0, 0.0, 1.0);
                        menuCol *= (1.0 - 0.24 * max(innerShadowT, innerShadowL));
                        lensCol = menuCol;
                    } else {
                        vec2 lcdP = (sp - vec2(560.0, 116.0)) / 5.0;
                        ivec2 p = clamp(ivec2(floor(lcdP)), ivec2(0), ivec2(159, 143));

                        // Read either real LR35902 PPU framebuffer or built-in platformer!
                        uint shade = (romLoaded == 1u) ? gbReadLcdPixel(p) : renderBuiltinPixel(p, palMode);
                        vec3 pixCol = getDmgColor(shade, palMode);

                        vec2 sub = fract(lcdP);
                        float gridX = smoothstep(0.0, 0.16, sub.x) * smoothstep(1.0, 0.84, sub.x);
                        float gridY = smoothstep(0.0, 0.16, sub.y) * smoothstep(1.0, 0.84, sub.y);
                        float dotMask = gridX * gridY;

                        vec3 substrate = getDmgColor(0u, palMode) * 1.04;
                        pixCol = mix(mix(substrate, pixCol, 0.42), pixCol, dotMask);

                        float innerShadowT = clamp((126.0 - sp.y) / 10.0, 0.0, 1.0);
                        float innerShadowL = clamp((570.0 - sp.x) / 10.0, 0.0, 1.0);
                        pixCol *= (1.0 - 0.24 * max(innerShadowT, innerShadowL));

                        lensCol = pixCol;
                    }
                }
            }

            shellCol = lensCol;
        }

        // =====================================================================
        // 4. LOWER FACEPLATE DETAILS (Y: 870 to 1066)
        // =====================================================================
        if (dBezel >= 0.0 && sp.y > 870.0) {
            vec3 logoNavy = vec3(0.14, 0.18, 0.42);
            const uint GB_LOGO[] = uint[](71u, 65u, 77u, 69u, 32u, 66u, 79u, 89u);
            float logoInk = 0.0;
            for (uint i = 0u; i < 8u; i++) {
                logoInk = max(logoInk, drawCharScaled(sp, vec2(456.0 + float(i) * 21.0, 882.0), GB_LOGO[i], 1.15));
            }
            logoInk = max(logoInk, drawCharScaled(sp, vec2(630.0, 896.0), 84u, 0.60));
            logoInk = max(logoInk, drawCharScaled(sp, vec2(641.0, 896.0), 77u, 0.60));
            shellCol = mix(shellCol, logoNavy, logoInk);

            // Cross D-Pad
            vec2 dpadC = vec2(565.0, 980.0);
            vec2 dp = sp - dpadC;
            if (length(dp) < 62.0) shellCol *= 0.96;
            float dHoriz = box(sp, dpadC, vec2(50.0, 17.0), 4.0);
            float dVert  = box(sp, dpadC, vec2(17.0, 50.0), 4.0);
            float dCross = min(dHoriz, dVert);
            if (dCross < 2.5 && dCross >= 0.0) {
                shellCol *= 0.55;
            } else if (dCross < 0.0) {
                vec3 dpadCol = vec3(0.14, 0.14, 0.16);
                if (-dCross < 3.5) dpadCol += vec3(0.08);
                if (length(dp) < 11.0) {
                    dpadCol = vec3(0.10, 0.10, 0.12) + vec3(0.04) * (dp.y / 11.0);
                }
                if (abs(dp.y) < 10.0 && (abs(abs(dp.x) - 24.0) < 1.8 || abs(abs(dp.x) - 32.0) < 1.8 || abs(abs(dp.x) - 40.0) < 1.8)) dpadCol *= 0.72;
                if (abs(dp.x) < 10.0 && (abs(abs(dp.y) - 24.0) < 1.8 || abs(abs(dp.y) - 32.0) < 1.8 || abs(abs(dp.y) - 40.0) < 1.8)) dpadCol *= 0.72;
                if ((buttons & 4096u)  != 0u && dp.x < -15.0 && abs(dp.y) < 15.0) dpadCol += vec3(0.22, 0.22, 0.26);
                if ((buttons & 16384u) != 0u && dp.x >  15.0 && abs(dp.y) < 15.0) dpadCol += vec3(0.22, 0.22, 0.26);
                if ((buttons & 8192u)  != 0u && dp.y < -15.0 && abs(dp.x) < 15.0) dpadCol += vec3(0.22, 0.22, 0.26);
                if ((buttons & 32768u) != 0u && dp.y >  15.0 && abs(dp.x) < 15.0) dpadCol += vec3(0.22, 0.22, 0.26);
                shellCol = dpadCol;
            }

            // Angled Burgundy A & B Buttons
            vec2 abCenter = vec2(1282.5, 970.0);
            vec2 abRel = sp - abCenter;
            float ang = -0.436;
            float ca = cos(ang), sa = sin(ang);
            vec2 abRot = vec2(ca * abRel.x - sa * abRel.y, sa * abRel.x + ca * abRel.y);
            float dABWell = box(abRot, vec2(0.0), vec2(86.0, 36.0), 36.0);
            if (dABWell < 0.0) {
                shellCol *= 0.91;
                if (-dABWell < 3.0) shellCol *= 0.88;
            }

            vec2 posB = vec2(1235.0, 992.0);
            vec2 posA = vec2(1330.0, 948.0);
            float distB = length(sp - posB);
            float distA = length(sp - posA);
            bool pressB = (buttons & 2u) != 0u;
            bool pressA = (buttons & 1u) != 0u;

            if (distB < 27.0 || distA < 27.0) {
                vec2 bRel = (distB < 27.0) ? (sp - posB) : (sp - posA);
                bool isPressed = (distB < 27.0) ? pressB : pressA;
                float r = length(bRel);
                if (r > 24.5) {
                    shellCol = vec3(0.15, 0.06, 0.10);
                } else {
                    float dome = sqrt(max(0.0, 1.0 - (r / 24.5) * (r / 24.5)));
                    vec3 btnCol = vec3(0.56, 0.10, 0.27) * (0.75 + 0.35 * dome);
                    float spec = exp(-length(bRel - vec2(-7.0, -8.0)) * 0.16);
                    btnCol += vec3(0.32, 0.18, 0.22) * spec;
                    if (isPressed) btnCol += vec3(0.24, 0.10, 0.14);
                    shellCol = btnCol;
                }
            }

            float lblB = drawCharScaled(sp, vec2(1248.0, 1020.0), 66u, 0.85);
            float lblA = drawCharScaled(sp, vec2(1343.0, 976.0), 65u, 0.85);
            shellCol = mix(shellCol, logoNavy, max(lblB, lblA));

            // SELECT & START Pill Buttons
            vec2 selCenter = vec2(885.0, 1018.0);
            vec2 staCenter = vec2(985.0, 1018.0);
            vec2 selRot = vec2(ca * (sp.x - selCenter.x) - sa * (sp.y - selCenter.y),
                               sa * (sp.x - selCenter.x) + ca * (sp.y - selCenter.y));
            vec2 staRot = vec2(ca * (sp.x - staCenter.x) - sa * (sp.y - staCenter.y),
                               sa * (sp.x - staCenter.x) + ca * (sp.y - staCenter.y));
            float dSel = box(selRot, vec2(0.0), vec2(24.0, 6.5), 6.5);
            float dSta = box(staRot, vec2(0.0), vec2(24.0, 6.5), 6.5);
            if (dSel < 2.0 && dSel >= 0.0) shellCol *= 0.72;
            if (dSta < 2.0 && dSta >= 0.0) shellCol *= 0.72;
            if (dSel < 0.0 || dSta < 0.0) {
                shellCol = vec3(0.38, 0.37, 0.41);
                bool selPressed = (buttons & (64u | 128u | 8u)) != 0u;
                bool staPressed = (buttons & 1024u) != 0u;
                if ((dSel < 0.0 && selPressed) || (dSta < 0.0 && staPressed)) {
                    shellCol += vec3(0.20);
                }
            }
            const uint SEL_TXT[] = uint[](83u, 69u, 76u, 69u, 67u, 84u);
            const uint STA_TXT[] = uint[](83u, 84u, 65u, 82u, 84u);
            float ssInk = 0.0;
            for (uint i = 0u; i < 6u; i++) ssInk = max(ssInk, drawCharScaled(sp, vec2(855.0 + float(i) * 9.5, 1036.0), SEL_TXT[i], 0.52));
            for (uint i = 0u; i < 5u; i++) ssInk = max(ssInk, drawCharScaled(sp, vec2(960.0 + float(i) * 9.5, 1036.0), STA_TXT[i], 0.52));
            shellCol = mix(shellCol, logoNavy, ssInk);

            // 6 Diagonal Speaker Grille Slots
            float spkAng = 0.58;
            float cs = cos(spkAng), ss = sin(spkAng);
            for (int i = 0; i < 6; i++) {
                vec2 slotC = vec2(1375.0 + float(i) * 18.0, 1028.0 - float(i) * 11.0);
                vec2 sr = sp - slotC;
                vec2 sRot = vec2(cs * sr.x - ss * sr.y, ss * sr.x + cs * sr.y);
                float dSlot = box(sRot, vec2(0.0), vec2(3.5, 30.0), 3.5);
                if (dSlot < 0.0) shellCol = vec3(0.12, 0.11, 0.10);
                else if (dSlot < 1.8) shellCol *= 0.78;
            }
        }

        col = shellCol;
    }

    // =========================================================================
    // 5. LEFT HARDWARE MONITOR WING (X: 20 to 385, Y: 60 to 1020)
    // =========================================================================
    float dLeftWing = box(sp, vec2(202.0, 540.0), vec2(182.0, 480.0), 14.0);
    if (dLeftWing < 0.0) {
        vec3 pCol = vec3(0.07, 0.09, 0.13);
        if (dLeftWing > -2.5) pCol = vec3(0.20, 0.26, 0.36);

        const uint T1[] = uint[](71u,65u,77u,69u,66u,79u,89u,32u,68u,77u,71u,45u,48u,49u);
        for (uint i = 0u; i < 14u; i++) {
            pCol = mix(pCol, vec3(0.61, 0.74, 0.06), drawChar(sp, vec2(45.0 + float(i) * gw, 90.0), T1[i]));
        }

        const uint T2[] = uint[](67u,80u,85u,58u,32u,76u,82u,51u,53u,57u,48u,50u);
        for (uint i = 0u; i < 12u; i++) {
            pCol = mix(pCol, vec3(0.82, 0.88, 0.96), drawChar(sp, vec2(45.0 + float(i) * gw, 150.0), T2[i]));
        }

        const uint T3[] = uint[](67u,76u,75u,58u,32u,52u,46u,49u,57u,52u,32u,77u,72u,122u);
        for (uint i = 0u; i < 14u; i++) {
            pCol = mix(pCol, vec3(0.60, 0.72, 0.84), drawChar(sp, vec2(45.0 + float(i) * gw, 200.0), T3[i]));
        }

        const uint T4[] = uint[](80u,80u,85u,58u,32u,49u,54u,48u,120u,49u,52u,52u);
        for (uint i = 0u; i < 12u; i++) {
            pCol = mix(pCol, vec3(0.60, 0.72, 0.84), drawChar(sp, vec2(45.0 + float(i) * gw, 250.0), T4[i]));
        }

        // Active Cartridge Header ("CART:" + filename)
        const uint L_CRT[] = uint[](67u,65u,82u,84u,58u); // "CART:"
        for (uint i = 0u; i < 5u; i++) {
            pCol = mix(pCol, vec3(0.95, 0.82, 0.30), drawChar(sp, vec2(45.0 + float(i) * gw, 330.0), L_CRT[i]));
        }
        if (romLoaded == 1u) {
            for (uint i = 0u; i < 18u; i++) {
                uint ch = gbReadByteAt(GB_CPU_BASE + 32u, i);
                if (ch == 0u) break;
                pCol = mix(pCol, vec3(0.40, 0.95, 0.55), drawChar(sp, vec2(45.0 + float(i) * gw, 375.0), ch));
            }
        } else {
            const uint BI_NAME[] = uint[](83u,85u,80u,69u,82u,32u,83u,50u,32u,76u,65u,78u,68u);
            for (uint i = 0u; i < 13u; i++) {
                pCol = mix(pCol, vec3(0.40, 0.95, 0.55), drawChar(sp, vec2(45.0 + float(i) * gw, 375.0), BI_NAME[i]));
            }
        }

        // Controls Guide at bottom of Left Wing
        const uint C_HDR[] = uint[](67u,79u,78u,84u,82u,79u,76u,83u); // "CONTROLS"
        for (uint i = 0u; i < 8u; i++) {
            pCol = mix(pCol, vec3(0.61, 0.74, 0.06), drawChar(sp, vec2(45.0 + float(i) * gw, 490.0), C_HDR[i]));
        }
        const uint C0[] = uint[](40u,89u,41u,32u,82u,79u,77u,32u,77u,69u,78u,85u);       // "(Y) ROM MENU"
        const uint C1[] = uint[](40u,65u,41u,47u,40u,66u,41u,32u,65u,67u,84u,73u,79u,78u); // "(A)/(B) ACTION"
        const uint C2[] = uint[](40u,43u,41u,32u,83u,84u,65u,82u,84u);                   // "(+) START"
        const uint C3[] = uint[](40u,88u,41u,32u,80u,65u,76u,69u,84u,84u,69u);           // "(X) PALETTE"
        const uint C4[] = uint[](40u,45u,41u,32u,69u,88u,73u,84u);                       // "(-) EXIT"
        for (uint i = 0u; i < 12u; i++) pCol = mix(pCol, vec3(1.0, 0.88, 0.30), drawChar(sp, vec2(45.0 + float(i) * gw, 550.0), C0[i]));
        for (uint i = 0u; i < 14u; i++) pCol = mix(pCol, vec3(0.80, 0.86, 0.94), drawChar(sp, vec2(45.0 + float(i) * gw, 600.0), C1[i]));
        for (uint i = 0u; i < 9u; i++)  pCol = mix(pCol, vec3(0.80, 0.86, 0.94), drawChar(sp, vec2(45.0 + float(i) * gw, 650.0), C2[i]));
        for (uint i = 0u; i < 11u; i++) pCol = mix(pCol, vec3(0.80, 0.86, 0.94), drawChar(sp, vec2(45.0 + float(i) * gw, 700.0), C3[i]));
        for (uint i = 0u; i < 8u; i++)  pCol = mix(pCol, vec3(0.80, 0.86, 0.94), drawChar(sp, vec2(45.0 + float(i) * gw, 750.0), C4[i]));

        col = pCol;
    }

    // =========================================================================
    // 6. RIGHT HARDWARE MONITOR WING (X: 1535 to 1900, Y: 60 to 1020)
    // =========================================================================
    float dRightWing = box(sp, vec2(1718.0, 540.0), vec2(182.0, 480.0), 14.0);
    if (dRightWing < 0.0) {
        vec3 pCol = vec3(0.07, 0.09, 0.13);
        if (dRightWing > -2.5) pCol = vec3(0.20, 0.26, 0.36);

        const uint R_HDR[] = uint[](67u,80u,85u,32u,82u,69u,71u,73u,83u,84u,69u,82u,83u);
        for (uint i = 0u; i < 13u; i++) {
            pCol = mix(pCol, vec3(0.30, 0.85, 1.0), drawChar(sp, vec2(1560.0 + float(i) * gw, 90.0), R_HDR[i]));
        }

        const uint R_NAMES[6][6] = uint[6][6](
            uint[6](65u,70u,58u,32u,48u,120u),
            uint[6](66u,67u,58u,32u,48u,120u),
            uint[6](68u,69u,58u,32u,48u,120u),
            uint[6](72u,76u,58u,32u,48u,120u),
            uint[6](83u,80u,58u,32u,48u,120u),
            uint[6](80u,67u,58u,32u,48u,120u)
        );
        uint regVals[6] = uint[6](
            (romLoaded == 1u) ? c.atlas[GB_CPU_BASE + 0u] : (0x01B0u | (buttons & 0xFFu)),
            (romLoaded == 1u) ? c.atlas[GB_CPU_BASE + 1u] : (uint(int(c.flow.x)) & 0xFFFFu),
            (romLoaded == 1u) ? c.atlas[GB_CPU_BASE + 2u] : (uint(int(c.flow.y)) & 0xFFFFu),
            (romLoaded == 1u) ? c.atlas[GB_CPU_BASE + 3u] : (uint(c.piece.x) & 0xFFFFu),
            (romLoaded == 1u) ? c.atlas[GB_CPU_BASE + 4u] : 0xFFFEu,
            (romLoaded == 1u) ? c.atlas[GB_CPU_BASE + 5u] : (0x0150u + (uint(c.motion.w) & 0x7Fu))
        );

        for (int r = 0; r < 6; r++) {
            float ry = 150.0 + float(r) * 48.0;
            for (uint i = 0u; i < 6u; i++) {
                pCol = mix(pCol, vec3(0.60, 0.72, 0.84), drawChar(sp, vec2(1560.0 + float(i) * gw, ry), R_NAMES[r][i]));
            }
            pCol = mix(pCol, vec3(0.92, 0.96, 1.0), drawHex16(sp, vec2(1560.0 + 6.0 * gw, ry), regVals[r]));
        }

        // Live VRAM 8x8 Tile Viewer (16x16 tiles = 128x128 scaled 2x -> 256x256 at Y: 495..751)
        const uint V_HDR[] = uint[](86u,82u,65u,77u,32u,84u,73u,76u,69u,83u); // "VRAM TILES"
        for (uint i = 0u; i < 10u; i++) {
            pCol = mix(pCol, vec3(0.61, 0.74, 0.06), drawChar(sp, vec2(1560.0 + float(i) * gw, 448.0), V_HDR[i]));
        }
        if (sp.x >= 1590.0 && sp.x < 1846.0 && sp.y >= 495.0 && sp.y < 751.0) {
            ivec2 vp = ivec2((sp - vec2(1590.0, 495.0)) / 2.0);
            uint tileIdx = uint((vp.y >> 3) * 16 + (vp.x >> 3));
            uint py = uint(vp.y & 7);
            uint bit = uint(7 - (vp.x & 7));
            uint addr = tileIdx * 16u + py * 2u;
            uint lo = gbReadByteAt(GB_VRAM_BASE, addr);
            uint hi = gbReadByteAt(GB_VRAM_BASE, addr + 1u);
            uint colorId = ((lo >> bit) & 1u) | (((hi >> bit) & 1u) << 1u);
            uint bgp = (romLoaded == 1u) ? (c.atlas[GB_CPU_BASE + 14u] & 0xFFu) : 0xE4u;
            uint shade = (bgp >> (colorId * 2u)) & 3u;
            pCol = getDmgColor(shade, palMode);
        }

        // 4-Shade Palette Swatch Preview at bottom of Right Wing
        for (uint s = 0u; s < 4u; s++) {
            vec2 swCenter = vec2(1598.0 + float(s) * 80.0, 820.0);
            float dSw = box(sp, swCenter, vec2(28.0, 28.0), 6.0);
            if (dSw < 0.0) pCol = getDmgColor(s, palMode);
            else if (dSw < 2.0) pCol = vec3(0.85);
        }

        col = pCol;
    }

    outColor = vec4(col, 1.0);
}
