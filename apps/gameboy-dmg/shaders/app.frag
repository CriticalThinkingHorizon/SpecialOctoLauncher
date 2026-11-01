#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "draw.glsl"
#include "text.glsl"
#include "dmg.glsl"

float drawChar(vec2 p, vec2 origin, uint ascii){
    if(ascii<GLYPH_FIRST||ascii>=GLYPH_FIRST+GLYPH_COUNT)return 0.0;
    uint idx=ascii-GLYPH_FIRST;
    ivec4 rect=ivec4(int(idx%uint(GLYPH_COLS))*GLYPH_W,int(idx/uint(GLYPH_COLS))*GLYPH_H,GLYPH_W,GLYPH_H);
    return text(p,origin,rect);
}

float drawDigit(vec2 p, vec2 origin, uint d){
    if(d>9u)return 0.0;
    return drawChar(p, origin, 48u + d);
}

float drawNumber5(vec2 p, vec2 origin, uint v){
    float ink = 0.0;
    float gw = float(GLYPH_W);
    ink = max(ink, drawDigit(p, origin, (v / 10000u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw, 0.0), (v / 1000u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw * 2.0, 0.0), (v / 100u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw * 3.0, 0.0), (v / 10u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw * 4.0, 0.0), v % 10u));
    return ink;
}

// Render pixel-art game scene in 160x144 GameBoy screen space
uint renderDmgPixel(ivec2 p, uint palMode) {
    int worldX = p.x + c.piece.x;
    int worldY = p.y;

    float px = c.flow.x;
    float py = c.flow.y;
    int facing = c.piece.z;
    int anim = c.piece.y;
    uint score = c.game.y;
    uint lives = c.game.w;

    // --- A. LCD Status Bar (Top 12 pixels) ---
    if (p.y < 12) {
        // Top background bar
        if (p.y == 11) return 3u; // black separator line
        // Text "SCORE 00500"
        int sX = p.x - 4;
        if (sX >= 0 && sX < 30 && p.y >= 2 && p.y <= 9) {
            return 2u; // text label
        }
        // Heart icons for lives
        for (uint i = 0u; i < 3u; i++) {
            if (i < lives) {
                int hx = 130 + int(i) * 9;
                if (p.x >= hx && p.x <= hx + 6 && p.y >= 3 && p.y <= 8) {
                    return 3u; // dark heart
                }
            }
        }
        return 0u;
    }

    // --- B. Ground & Tilemap ---
    if (worldY >= 120) {
        // Underground solid rock
        bool checker = ((worldX / 8) + (worldY / 8)) % 2 == 0;
        return checker ? 3u : 2u;
    } else if (worldY >= 112) {
        // Ground grass surface
        if (worldY == 112) return 3u; // grass edge
        return (worldX % 4 == 0) ? 2u : 1u;
    }

    // Floating Platform 1: X in [80..130], Y in [84..90]
    if (worldX >= 80 && worldX <= 130 && worldY >= 84 && worldY <= 90) {
        bool brickLine = (worldX % 8 == 0) || (worldY == 84) || (worldY == 90);
        return brickLine ? 3u : 2u;
    }
    // Floating Platform 2: X in [170..230], Y in [64..70]
    if (worldX >= 170 && worldX <= 230 && worldY >= 64 && worldY <= 70) {
        bool brickLine = (worldX % 8 == 0) || (worldY == 64) || (worldY == 70);
        return brickLine ? 3u : 2u;
    }

    // --- C. Collectible Coins ---
    // Coin 1 at (105, 68)
    if ((c.game.z & 1u) == 0u) {
        ivec2 cd = abs(ivec2(worldX, worldY) - ivec2(105, 68));
        int coinW = int(abs(sin(c.motion.x * 6.0)) * 4.0) + 1;
        if (cd.x <= coinW && cd.y <= 5) {
            return (cd.x == coinW || cd.y == 5) ? 3u : 1u;
        }
    }
    // Coin 2 at (200, 48)
    if ((c.game.z & 2u) == 0u) {
        ivec2 cd = abs(ivec2(worldX, worldY) - ivec2(200, 48));
        int coinW = int(abs(sin(c.motion.x * 6.0)) * 4.0) + 1;
        if (cd.x <= coinW && cd.y <= 5) {
            return (cd.x == coinW || cd.y == 5) ? 3u : 1u;
        }
    }

    // --- D. Enemies ---
    // Slime 1
    float e1x = float(c.stats.x);
    if (e1x < 500.0) {
        ivec2 ed = abs(ivec2(worldX - int(e1x), worldY - 110));
        if (ed.x <= 7 && ed.y <= 5) {
            if (ed.x == 7 || ed.y == 5) return 3u;
            if (ed.y == 1 && ed.x <= 3) return 0u; // eye
            return 2u;
        }
    }

    // Bat 2
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

    // --- E. Hero Character (Player) ---
    // Size: 12 wide x 16 high centered at (px, py - 8)
    int hRelX = (worldX - int(px)) * facing;
    int hRelY = worldY - (int(py) - 8);

    if (abs(hRelX) <= 6 && abs(hRelY) <= 8) {
        // Hat / Hair (top 4 pixels)
        if (hRelY < -4) return 3u;
        // Face / Eyes (middle 4 pixels)
        if (hRelY >= -4 && hRelY <= 0) {
            if (hRelX == 2 && hRelY >= -2 && hRelY <= -1) return 3u; // eye
            return 1u; // face skin
        }
        // Body / Shirt
        if (hRelY > 0 && hRelY <= 5) {
            return 2u; // overalls
        }
        // Legs (animated running)
        if (hRelY > 5) {
            bool legStep = (anim % 16) < 8;
            if (legStep && hRelX < 0) return 3u;
            if (!legStep && hRelX >= 0) return 3u;
            return 1u;
        }
    }

    // --- F. Background Clouds & Hills ---
    // Distant mountain parallax
    int hillY = 112 - int(sin(float(worldX) * 0.04) * 16.0 + 12.0);
    if (worldY >= hillY) {
        return (worldY - hillY < 2) ? 2u : 1u;
    }

    // Clouds
    int cloudX = int(worldX * 0.5 + c.motion.x * 6.0) % 180;
    if (cloudX > 30 && cloudX < 75 && worldY >= 26 && worldY <= 38) {
        return 1u;
    }

    return 0u; // Sky background (lightest tone)
}

void main(){
    vec2 sp = gl_FragCoord.xy; // 0..1920, 0..1080
    uint palMode = uint(c.transition.x);

    // Screen Center: 1920x1080
    // GameBoy DMG LCD Screen Area: 160x144 scaled 6x = 960x864 pixels
    // Centered: X from 480 to 1440, Y from 108 to 972
    vec2 lcdMin = vec2(480.0, 108.0);
    vec2 lcdMax = vec2(1440.0, 972.0);
    vec2 lcdSize = lcdMax - lcdMin;

    vec3 col = vec3(0.08, 0.09, 0.11); // Dark Studio Background

    // 1. GAMEBOY DMG CHASSIS (Bezel surrounding LCD)
    vec2 chassisMin = vec2(380.0, 50.0);
    vec2 chassisMax = vec2(1540.0, 1030.0);
    float dChassis = box(sp, vec2(960.0, 540.0), (chassisMax - chassisMin) * 0.5, 32.0);

    if (dChassis < 0.0) {
        // Classic DMG off-white / light warm gray plastic
        col = vec3(0.84, 0.83, 0.80);

        // Dark Gray Bezel Frame around LCD
        vec2 bezelMin = vec2(430.0, 80.0);
        vec2 bezelMax = vec2(1490.0, 1000.0);
        float dBezel = box(sp, vec2(960.0, 540.0), (bezelMax - bezelMin) * 0.5, 18.0);

        if (dBezel < 0.0) {
            col = vec3(0.44, 0.46, 0.48); // Matte Charcoal Bezel

            // Accent stripes above screen (Magenta & Cobalt Blue)
            if (sp.y >= 978.0 && sp.y <= 982.0 && sp.x >= 450.0 && sp.x <= 1470.0) {
                col = vec3(0.70, 0.15, 0.45); // Magenta line
            }
            if (sp.y >= 984.0 && sp.y <= 988.0 && sp.x >= 450.0 && sp.x <= 1470.0) {
                col = vec3(0.15, 0.25, 0.65); // Blue line
            }

            // Red Battery LED Indicator
            float dLed = length(sp - vec2(455.0, 680.0)) - 7.0;
            if (dLed < 0.0) {
                col = vec3(1.0, 0.15, 0.10); // Glowing Red LED
            } else if (dLed < 2.0) {
                col = vec3(0.20, 0.05, 0.05); // LED bezel ring
            }
        }
    }

    // 2. LCD DOT-MATRIX DISPLAY (160x144, 6x integer scale)
    if (sp.x >= lcdMin.x && sp.x < lcdMax.x && sp.y >= lcdMin.y && sp.y < lcdMax.y) {
        vec2 lcdP = (sp - lcdMin) / 6.0;
        ivec2 p = ivec2(floor(lcdP));
        p.y = 143 - p.y; // invert Y for screen coords

        uint shade = renderDmgPixel(p, palMode);
        vec3 pixelCol = getDmgColor(shade, palMode);

        // Sub-pixel dot-matrix grid lines (subtle gap between pixels)
        vec2 gridFrac = fract(lcdP);
        float gridLine = smoothstep(0.04, 0.10, min(gridFrac.x, 1.0 - gridFrac.x)) *
                         smoothstep(0.04, 0.10, min(gridFrac.y, 1.0 - gridFrac.y));
        pixelCol *= (0.88 + 0.12 * gridLine);

        col = pixelCol;
    }

    // 3. HARDWARE REGISTER DEBUG WINGS (Left & Right Panels)
    float gw = float(GLYPH_W);
    float gh = float(GLYPH_H);

    // Left Panel: Specs & Architecture Info
    if (sp.x < 360.0) {
        col = vec3(0.06, 0.07, 0.09);

        // "GAMEBOY DMG-01"
        const uint T1[] = uint[](71u,65u,77u,69u,66u,79u,89u,32u,68u,77u,71u,45u,48u,49u);
        for (uint i = 0u; i < 14u; i++) {
            col = mix(col, vec3(0.95, 0.85, 0.30), drawChar(sp, vec2(30.0 + float(i) * gw, 940.0), T1[i]));
        }

        // "CPU: LR35902"
        const uint T2[] = uint[](67u,80u,85u,58u,32u,76u,82u,51u,53u,57u,48u,50u);
        for (uint i = 0u; i < 12u; i++) {
            col = mix(col, vec3(0.75, 0.80, 0.90), drawChar(sp, vec2(30.0 + float(i) * gw, 880.0), T2[i]));
        }

        // "CLK: 4.194 MHz"
        const uint T3[] = uint[](67u,76u,75u,58u,32u,52u,46u,49u,57u,52u,32u,77u,72u,122u);
        for (uint i = 0u; i < 14u; i++) {
            col = mix(col, vec3(0.55, 0.65, 0.75), drawChar(sp, vec2(30.0 + float(i) * gw, 840.0), T3[i]));
        }

        // "PPU: 160x144"
        const uint T4[] = uint[](80u,80u,85u,58u,32u,49u,54u,48u,120u,49u,52u,52u);
        for (uint i = 0u; i < 12u; i++) {
            col = mix(col, vec3(0.55, 0.65, 0.75), drawChar(sp, vec2(30.0 + float(i) * gw, 800.0), T4[i]));
        }

        // "FPS: 59.73 Hz"
        const uint T5[] = uint[](70u,80u,83u,58u,32u,53u,57u,46u,55u,51u,32u,72u,122u);
        for (uint i = 0u; i < 13u; i++) {
            col = mix(col, vec3(0.40, 0.85, 0.40), drawChar(sp, vec2(30.0 + float(i) * gw, 760.0), T5[i]));
        }
    }

    // Right Panel: Live CPU Registers & Hardware Debug
    if (sp.x > 1560.0) {
        col = vec3(0.06, 0.07, 0.09);

        // "CPU REGISTERS"
        const uint R_HDR[] = uint[](67u,80u,85u,32u,82u,69u,71u,73u,83u,84u,69u,82u,83u);
        for (uint i = 0u; i < 13u; i++) {
            col = mix(col, vec3(0.30, 0.85, 1.0), drawChar(sp, vec2(1580.0 + float(i) * gw, 940.0), R_HDR[i]));
        }

        // "AF: 0x01B0"
        const uint R_AF[] = uint[](65u,70u,58u,32u,48u,120u,48u,49u,66u,48u);
        for (uint i = 0u; i < 10u; i++) col = mix(col, vec3(0.85), drawChar(sp, vec2(1580.0 + float(i) * gw, 880.0), R_AF[i]));

        // "BC: 0x0013"
        const uint R_BC[] = uint[](66u,67u,58u,32u,48u,120u,48u,48u,49u,51u);
        for (uint i = 0u; i < 10u; i++) col = mix(col, vec3(0.85), drawChar(sp, vec2(1580.0 + float(i) * gw, 840.0), R_BC[i]));

        // "DE: 0x00D8"
        const uint R_DE[] = uint[](68u,69u,58u,32u,48u,120u,48u,48u,68u,56u);
        for (uint i = 0u; i < 10u; i++) col = mix(col, vec3(0.85), drawChar(sp, vec2(1580.0 + float(i) * gw, 800.0), R_DE[i]));

        // "HL: 0x014D"
        const uint R_HL[] = uint[](72u,76u,58u,32u,48u,120u,48u,49u,52u,68u);
        for (uint i = 0u; i < 10u; i++) col = mix(col, vec3(0.85), drawChar(sp, vec2(1580.0 + float(i) * gw, 760.0), R_HL[i]));

        // "SP: 0xFFFE"
        const uint R_SP[] = uint[](83u,80u,58u,32u,48u,120u,70u,70u,70u,69u);
        for (uint i = 0u; i < 10u; i++) col = mix(col, vec3(0.85), drawChar(sp, vec2(1580.0 + float(i) * gw, 720.0), R_SP[i]));

        // "PC: 0x0100"
        const uint R_PC[] = uint[](80u,67u,58u,32u,48u,120u,48u,49u,48u,48u);
        for (uint i = 0u; i < 10u; i++) col = mix(col, vec3(0.85), drawChar(sp, vec2(1580.0 + float(i) * gw, 680.0), R_PC[i]));

        // "LY: 144" (VBlank line)
        const uint R_LY[] = uint[](76u,89u,58u,32u,49u,52u,52u);
        for (uint i = 0u; i < 7u; i++) col = mix(col, vec3(0.95, 0.65, 0.20), drawChar(sp, vec2(1580.0 + float(i) * gw, 640.0), R_LY[i]));
    }

    // Bottom Controls Bar: "(A) JUMP  |  (B) SPRINT  |  (X) PALETTE  |  (-) EXIT"
    const uint B_HINT[] = uint[](
        40u,65u,41u,32u,74u,85u,77u,80u,32u,32u,124u,32u,32u,
        40u,66u,41u,32u,83u,80u,82u,73u,78u,84u,32u,32u,124u,32u,32u,
        40u,88u,41u,32u,80u,65u,76u,69u,84u,84u,69u,32u,32u,124u,32u,32u,
        40u,45u,41u,32u,69u,88u,73u,84u
    );
    for (uint i = 0u; i < uint(B_HINT.length()); i++) {
        col = mix(col, vec3(0.60, 0.70, 0.80), drawChar(sp, vec2(420.0 + float(i) * gw, 18.0), B_HINT[i]));
    }

    outColor = vec4(col, 1.0);
}
