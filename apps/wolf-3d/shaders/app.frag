#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "draw.glsl"
#include "text.glsl"
#include "map.glsl"

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

float drawNumber(vec2 p, vec2 origin, uint v){
    float ink = 0.0;
    float gw = float(GLYPH_W);
    ink = max(ink, drawDigit(p, origin, (v / 100u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw, 0.0), (v / 10u) % 10u));
    ink = max(ink, drawDigit(p, origin + vec2(gw * 2.0, 0.0), v % 10u));
    return ink;
}

// Procedural Wall Textures (64x64 style pixel art)
vec3 getWallTexColor(uint tileType, vec2 uv, float side) {
    ivec2 p = ivec2(floor(uv * 64.0));
    vec3 col = vec3(0.5);

    if (tileType == 1u) {
        // Gray Stone Bricks
        bool mortar = (p.y % 16 == 0) || ((p.y / 16) % 2 == 0 ? (p.x % 32 == 0) : ((p.x + 16) % 32 == 0));
        float noise = fract(sin(dot(vec2(p), vec2(12.9898, 78.233))) * 43758.5453);
        col = mortar ? vec3(0.22, 0.22, 0.24) : mix(vec3(0.48, 0.50, 0.54), vec3(0.60, 0.62, 0.66), noise * 0.4);

    } else if (tileType == 2u) {
        // Blue Stone Wall
        bool mortar = (p.y % 16 == 0) || ((p.y / 16) % 2 == 0 ? (p.x % 32 == 0) : ((p.x + 16) % 32 == 0));
        float noise = fract(sin(dot(vec2(p), vec2(34.123, 89.456))) * 23421.123);
        col = mortar ? vec3(0.12, 0.16, 0.26) : mix(vec3(0.22, 0.38, 0.65), vec3(0.32, 0.48, 0.78), noise * 0.35);

    } else if (tileType == 3u) {
        // Wood Panels
        bool seam = (p.x % 16 == 0);
        float woodGrain = 0.5 + 0.5 * sin(float(p.y) * 0.4 + float(p.x) * 0.1);
        col = seam ? vec3(0.20, 0.10, 0.05) : mix(vec3(0.42, 0.24, 0.12), vec3(0.55, 0.32, 0.16), woodGrain * 0.3);

    } else if (tileType == 4u) {
        // Eagle Banner on Gray Stone
        bool mortar = (p.y % 16 == 0) || ((p.y / 16) % 2 == 0 ? (p.x % 32 == 0) : ((p.x + 16) % 32 == 0));
        col = mortar ? vec3(0.20) : vec3(0.50);
        // Red Banner rectangle
        if (p.x >= 14 && p.x <= 50 && p.y >= 8 && p.y <= 56) {
            col = vec3(0.75, 0.12, 0.12);
            // Gold Eagle / Emblem in center
            vec2 d = abs(vec2(p) - vec2(32.0, 32.0));
            if (d.x + d.y < 12.0) {
                col = vec3(0.95, 0.85, 0.25);
            }
        }

    } else if (tileType == 5u) {
        // Prison Cell Bars
        bool bar = (p.x % 8 == 0) || (p.y == 8) || (p.y == 56);
        col = bar ? vec3(0.30, 0.32, 0.35) : vec3(0.04, 0.03, 0.03);

    } else if (tileType == 6u || tileType == 8u) {
        // Steel Elevator Wall / Switch
        bool panel = (p.x % 32 == 0) || (p.y % 32 == 0);
        bool rivet = (p.x % 32 == 4 || p.x % 32 == 28) && (p.y % 32 == 4 || p.y % 32 == 28);
        col = panel ? vec3(0.25) : (rivet ? vec3(0.85) : vec3(0.52, 0.55, 0.58));
        if (tileType == 8u && p.x >= 24 && p.x <= 40 && p.y >= 24 && p.y <= 40) {
            col = vec3(0.95, 0.20, 0.20); // Red elevator lever switch
        }

    } else if (tileType == 7u) {
        // Sliding Door (Steel Plate with Warning Stripes)
        bool seam = (p.x == 0 || p.x == 63 || p.y == 0 || p.y == 63);
        bool centerPlate = (p.x >= 16 && p.x <= 48 && p.y >= 16 && p.y <= 48);
        col = seam ? vec3(0.15) : (centerPlate ? vec3(0.35, 0.45, 0.55) : vec3(0.48, 0.50, 0.52));
    }

    // Side contrast shading (North-South vs East-West)
    if (side > 0.5) col *= 0.72;

    return col;
}

void main(){
    vec2 sp = gl_FragCoord.xy; // 0..1920, 0..1080
    vec2 pos = c.flow.xy;
    float dirAngle = c.flow.z;
    float ammo = c.flow.w;
    uint health = c.game.w;
    uint kills = c.game.y;
    uint state = c.game.x;
    float headBob = sin(c.transition.x) * 12.0;

    vec2 dir = vec2(cos(dirAngle), sin(dirAngle));
    vec2 plane = vec2(-sin(dirAngle), cos(dirAngle)) * 0.66; // 66 degree FOV

    // --- 1. RAYCASTING ENGINE (DDA) ---
    float cameraX = 2.0 * sp.x / 1920.0 - 1.0;
    vec2 rayDir = dir + plane * cameraX;

    ivec2 mapPos = ivec2(floor(pos));
    vec2 deltaDist = abs(vec2(length(rayDir)) / rayDir);
    ivec2 stepDir;
    vec2 sideDist;

    if (rayDir.x < 0.0) {
        stepDir.x = -1;
        sideDist.x = (pos.x - float(mapPos.x)) * deltaDist.x;
    } else {
        stepDir.x = 1;
        sideDist.x = (float(mapPos.x) + 1.0 - pos.x) * deltaDist.x;
    }
    if (rayDir.y < 0.0) {
        stepDir.y = -1;
        sideDist.y = (pos.y - float(mapPos.y)) * deltaDist.y;
    } else {
        stepDir.y = 1;
        sideDist.y = (float(mapPos.y) + 1.0 - pos.y) * deltaDist.y;
    }

    uint hitTile = 0u;
    int hitSide = 0;

    for (int i = 0; i < 32; i++) {
        if (sideDist.x < sideDist.y) {
            sideDist.x += deltaDist.x;
            mapPos.x += stepDir.x;
            hitSide = 0;
        } else {
            sideDist.y += deltaDist.y;
            mapPos.y += stepDir.y;
            hitSide = 1;
        }
        uint tile = getMapTile(uint(mapPos.x), uint(mapPos.y));
        if (tile > 0u) {
            if (tile == 7u && c.piece.x > 50) {
                // Open door allows ray through
                continue;
            }
            hitTile = tile;
            break;
        }
    }

    float perpWallDist = (hitSide == 0) ?
        (float(mapPos.x) - pos.x + (1.0 - float(stepDir.x)) * 0.5) / rayDir.x :
        (float(mapPos.y) - pos.y + (1.0 - float(stepDir.y)) * 0.5) / rayDir.y;

    perpWallDist = max(perpWallDist, 0.1);

    // Projected wall slice coordinates
    float horizon = 540.0 + headBob;
    float lineHeight = 1080.0 / perpWallDist;
    float drawStart = horizon - lineHeight * 0.5;
    float drawEnd = horizon + lineHeight * 0.5;

    vec3 col = vec3(0.0);

    if (sp.y < drawStart) {
        // Ceiling (Slate Gray with distance darkening)
        float ceilNorm = (horizon - sp.y) / 540.0;
        col = mix(vec3(0.15, 0.16, 0.18), vec3(0.24, 0.25, 0.28), ceilNorm);

    } else if (sp.y > drawEnd) {
        // Floor (Brown / Stone with perspective distance fog)
        float floorNorm = (sp.y - horizon) / 540.0;
        col = mix(vec3(0.18, 0.14, 0.10), vec3(0.32, 0.26, 0.20), floorNorm);

    } else {
        // Wall Surface
        float wallX = (hitSide == 0) ? pos.y + perpWallDist * rayDir.y : pos.x + perpWallDist * rayDir.x;
        wallX = fract(wallX);
        float texY = clamp((sp.y - drawStart) / lineHeight, 0.0, 1.0);
        col = getWallTexColor(hitTile, vec2(wallX, texY), float(hitSide));

        // Depth fog attenuation
        float fog = clamp(1.0 - perpWallDist * 0.06, 0.15, 1.0);
        col *= fog;
    }

    // --- 2. BILLBOARD ENEMY SPRITES ---
    for (uint i = 0u; i < 4u; i++) {
        vec2 ePos = ENEMY_SPAWNS[i];
        vec2 spriteRel = ePos - pos;

        // Transform sprite with inverse camera matrix
        float invDet = 1.0 / (plane.x * dir.y - dir.x * plane.y);
        float transformX = invDet * (dir.y * spriteRel.x - dir.x * spriteRel.y);
        float transformY = invDet * (-plane.y * spriteRel.x + plane.x * spriteRel.y);

        if (transformY > 0.2 && transformY < perpWallDist) {
            float spriteScreenX = (1920.0 * 0.5) * (1.0 + transformX / transformY);
            float spriteHeight = abs(1080.0 / transformY);
            float spriteWidth = spriteHeight * 0.65;
            float sStartX = spriteScreenX - spriteWidth * 0.5;
            float sEndX = spriteScreenX + spriteWidth * 0.5;
            float sStartY = horizon - spriteHeight * 0.5;
            float sEndY = horizon + spriteHeight * 0.5;

            if (sp.x >= sStartX && sp.x <= sEndX && sp.y >= sStartY && sp.y <= sEndY) {
                vec2 sUV = vec2((sp.x - sStartX) / spriteWidth, (sEndY - sp.y) / spriteHeight);
                bool alive = (c.stats[i] == 1u);

                // Procedural Guard Sprite (Uniform, boots, helmet, weapon)
                if (alive) {
                    // Standing / Guarding Soldier
                    vec2 dHead = abs(sUV - vec2(0.5, 0.82));
                    vec2 dBody = abs(sUV - vec2(0.5, 0.52));
                    vec2 dLegs = abs(sUV - vec2(0.5, 0.20));

                    if (dHead.x < 0.16 && dHead.y < 0.12) {
                        col = (sUV.y > 0.85) ? vec3(0.40, 0.44, 0.42) : vec3(0.92, 0.72, 0.55); // Helmet / Face
                    } else if (dBody.x < 0.22 && dBody.y < 0.18) {
                        col = vec3(0.35, 0.42, 0.38); // Brownish-green tunic
                        if (sUV.x > 0.45 && sUV.x < 0.65 && sUV.y > 0.45 && sUV.y < 0.55) {
                            col = vec3(0.12); // Rifle
                        }
                    } else if (dLegs.x < 0.18 && dLegs.y < 0.18) {
                        col = (sUV.y < 0.12) ? vec3(0.10) : vec3(0.28, 0.32, 0.30); // Boots / Trousers
                    }
                } else {
                    // Fallen Guard Corpse on floor
                    if (sUV.y < 0.30 && abs(sUV.x - 0.5) < 0.45) {
                        col = vec3(0.28, 0.32, 0.30);
                        if (abs(sUV.x - 0.65) < 0.10 && sUV.y < 0.18) col = vec3(0.65, 0.10, 0.10); // Red pool
                    }
                }
            }
        }
    }

    // --- 3. FIRST-PERSON WEAPON (Classic German Luger Pistol) ---
    float recoilY = c.transition.z * 45.0;
    vec2 gunOrigin = vec2(960.0 + sin(c.motion.x * 2.0) * 4.0, 995.0 + recoilY);
    vec2 gp = vec2(sp.x - gunOrigin.x, gunOrigin.y - sp.y);

    if (gp.y > 0.0 && gp.y < 280.0 && abs(gp.x) < 120.0) {
        // Hand & Pistol Silhouette
        float dBarrel = box(gp, vec2(0.0, 180.0), vec2(18.0, 70.0), 4.0);
        float dSlide = box(gp, vec2(0.0, 130.0), vec2(28.0, 35.0), 6.0);
        float dGrip = box(gp, vec2(0.0, 45.0), vec2(36.0, 45.0), 8.0);

        if (dBarrel < 0.0) {
            col = vec3(0.22, 0.24, 0.26); // Gunmetal barrel
        } else if (dSlide < 0.0) {
            col = vec3(0.35, 0.38, 0.42); // Steel slide with highlight
        } else if (dGrip < 0.0) {
            col = (abs(gp.x) > 20.0) ? vec3(0.85, 0.68, 0.52) : vec3(0.18, 0.12, 0.08); // Flesh hand / grip
        }
    }

    // Muzzle Flash when firing
    if (c.game.z > 8u) {
        vec2 flashPos = vec2(gunOrigin.x, gunOrigin.y - 260.0);
        float distFlash = length(sp - flashPos);
        if (distFlash < 80.0) {
            col += mix(vec3(1.0, 0.9, 0.3), vec3(1.0, 0.4, 0.1), distFlash / 80.0) * (1.0 - distFlash / 80.0);
        }
    }

    // --- 4. DAMAGE RED FLASH OVERLAY ---
    if (c.transition.y > 0.01) {
        col = mix(col, vec3(0.85, 0.05, 0.05), c.transition.y * 0.7);
    }

    // --- 5. TOP-RIGHT MINIMAP RADAR ---
    if (sp.x > 1680.0 && sp.y < 240.0) {
        vec2 mapUV = (sp - vec2(1680.0, 20.0)) / 220.0; // 0..1 inside minimap
        if (mapUV.x >= 0.0 && mapUV.x <= 1.0 && mapUV.y >= 0.0 && mapUV.y <= 1.0) {
            uint mx = uint(clamp(floor(mapUV.x * float(MAP_W)), 0.0, float(MAP_W - 1u)));
            uint my = uint(clamp(floor(mapUV.y * float(MAP_H)), 0.0, float(MAP_H - 1u)));
            uint tile = getMapTile(mx, my);

            vec3 mapCol = (tile > 0u) ? vec3(0.40, 0.45, 0.50) : vec3(0.10, 0.12, 0.15);
            if (tile == 7u) mapCol = vec3(0.85, 0.70, 0.20); // door
            if (tile == 8u) mapCol = vec3(0.20, 0.90, 0.30); // exit elevator

            // Player dot on radar
            vec2 pGrid = vec2(pos.x / float(MAP_W), pos.y / float(MAP_H));
            if (length(mapUV - pGrid) < 0.025) {
                mapCol = vec3(0.10, 0.95, 1.0); // Cyan player blip
            }
            col = mix(col, mapCol, 0.85);
        }
    }

    // --- 6. RETRO HUD STATUS BAR ---
    float gw = float(GLYPH_W);
    float gh = float(GLYPH_H);

    // Bottom Bar (Wolf3D Classic Blue Status Bar: Y = 995..1080)
    if (sp.y > 995.0) {
        col = vec3(0.05, 0.18, 0.45); // Classic Wolf3D Blue HUD
        if (sp.y < 1002.0) col = vec3(0.10, 0.35, 0.75); // Top highlight border

        // "FLOOR: 1"
        const uint F_LABEL[] = uint[](70u,76u,79u,79u,82u,58u,32u,49u);
        for (uint i = 0u; i < 8u; i++) {
            col = mix(col, vec3(0.95, 0.85, 0.30), drawChar(sp, vec2(60.0 + float(i) * gw, 1024.0), F_LABEL[i]));
        }

        // "HEALTH: [XXX]"
        const uint H_LABEL[] = uint[](72u,69u,65u,76u,84u,72u,58u,32u);
        for (uint i = 0u; i < 8u; i++) {
            col = mix(col, vec3(0.95, 0.85, 0.30), drawChar(sp, vec2(500.0 + float(i) * gw, 1024.0), H_LABEL[i]));
        }
        col = mix(col, (health < 25u ? vec3(1.0, 0.2, 0.2) : vec3(1.0)), drawNumber(sp, vec2(500.0 + 8.0 * gw, 1024.0), health));

        // "AMMO: [XX]"
        const uint A_LABEL[] = uint[](65u,77u,77u,79u,58u,32u);
        for (uint i = 0u; i < 6u; i++) {
            col = mix(col, vec3(0.95, 0.85, 0.30), drawChar(sp, vec2(1000.0 + float(i) * gw, 1024.0), A_LABEL[i]));
        }
        col = mix(col, vec3(1.0), drawNumber(sp, vec2(1000.0 + 6.0 * gw, 1024.0), uint(ammo)));

        // "SCORE: [XXXX]"
        const uint S_LABEL[] = uint[](83u,67u,79u,82u,69u,58u,32u);
        for (uint i = 0u; i < 7u; i++) {
            col = mix(col, vec3(0.95, 0.85, 0.30), drawChar(sp, vec2(1450.0 + float(i) * gw, 1024.0), S_LABEL[i]));
        }
        col = mix(col, vec3(1.0), drawNumber(sp, vec2(1450.0 + 7.0 * gw, 1024.0), kills));
    }

    // Crosshair in center
    vec2 chDist = abs(sp - vec2(960.0, 540.0));
    if ((chDist.x < 10.0 && chDist.y < 2.0) || (chDist.y < 10.0 && chDist.x < 2.0)) {
        col = vec3(0.10, 0.95, 0.20);
    }

    // --- 7. VICTORY / GAME OVER MODALS ---
    if (state == 2u) {
        // Game Over modal
        float modal = box(sp, vec2(960.0, 540.0), vec2(400.0, 90.0), 16.0);
        if (modal < 0.0) col = mix(col, vec3(0.20, 0.04, 0.04), 0.92);
        col = mix(col, vec3(0.95, 0.15, 0.15), line(modal, 4.0));
        // "YOU DIED! PRESS (A) TO RETRY"
        const uint GO_MSG[] = uint[](89u,79u,85u,32u,68u,73u,69u,68u,33u,32u,40u,65u,41u,32u,82u,69u,84u,82u,89u);
        for (uint i = 0u; i < 19u; i++) {
            col = mix(col, vec3(1.0, 0.85, 0.30), drawChar(sp, vec2(680.0 + float(i) * gw, 525.0), GO_MSG[i]));
        }
    } else if (state == 3u) {
        // Level Clear modal
        float modal = box(sp, vec2(960.0, 540.0), vec2(440.0, 90.0), 16.0);
        if (modal < 0.0) col = mix(col, vec3(0.06, 0.18, 0.10), 0.92);
        col = mix(col, vec3(0.20, 0.95, 0.40), line(modal, 4.0));
        // "LEVEL COMPLETED! PRESS (A) RESTART"
        const uint VC_MSG[] = uint[](76u,69u,86u,69u,76u,32u,67u,76u,69u,65u,82u,69u,68u,33u,32u,40u,65u,41u,32u,78u,69u,88u,84u);
        for (uint i = 0u; i < 20u; i++) {
            col = mix(col, vec3(1.0, 0.90, 0.30), drawChar(sp, vec2(670.0 + float(i) * gw, 525.0), VC_MSG[i]));
        }
    }

    outColor = vec4(col, 1.0);
}
