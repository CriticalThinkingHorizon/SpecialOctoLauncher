#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "draw.glsl"
#include "text.glsl"
#include "maze.glsl"

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

// Rotations
mat3 rotX(float a) {
    float s = sin(a), c = cos(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}
mat3 rotZ(float a) {
    float s = sin(a), c = cos(a);
    return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}
mat3 rotY(float a) {
    float s = sin(a), c = cos(a);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

// Distance Functions
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

// Scene Distance: returns vec2(distance, material_id)
// mat_id: 1=wood floor, 2=wall, 3=board frame/rim, 4=ball, 5=goal, 6=gem, 7=hole interior
vec2 mapScene(vec3 p, uint level, vec2 ballPos, float ballScale, uint gemMask) {
    // Transform into board local space
    mat3 tiltRot = rotX(c.transition.x) * rotZ(c.transition.y);
    vec3 lp = transpose(tiltRot) * p;

    // Board origin center offset:
    // Maze grid is 15.0 wide (X: -7.5 to +7.5) and 11.0 deep (Z: -5.5 to +5.5)
    vec3 gridP = lp + vec3(7.5, 0.0, 5.5);

    // Bounding box for entire board assembly
    float boardDist = sdBox(lp - vec3(0.0, -0.2, 0.0), vec3(8.3, 0.8, 6.3));
    if (boardDist > 3.5) {
        return vec2(boardDist, 3.0);
    }

    vec2 res = vec2(100.0, 0.0);

    // 1. Board Outer Tray / Beveled Rim
    float outerBox = sdBox(lp - vec3(0.0, -0.15, 0.0), vec3(8.0, 0.45, 6.0));
    float innerCut = sdBox(lp - vec3(0.0, 0.3, 0.0), vec3(7.55, 0.6, 5.55));
    float rim = max(outerBox, -innerCut);
    res = (rim < res.x) ? vec2(rim, 3.0) : res;

    // 2. Maze Floor Plane
    float floorDist = sdBox(lp - vec3(0.0, -0.1, 0.0), vec3(7.5, 0.1, 5.5));
    res = (floorDist < res.x) ? vec2(floorDist, 1.0) : res;

    // 3. Maze Walls & Holes (sample localized 3x3 grid around current ray position)
    int gx = int(clamp(floor(gridP.x), 0.0, float(MAZE_W - 1u)));
    int gz = int(clamp(floor(gridP.z), 0.0, float(MAZE_H - 1u)));

    for (int dz = -1; dz <= 1; dz++) {
        for (int dx = -1; dx <= 1; dx++) {
            int cx = gx + dx;
            int cz = gz + dz;
            if (cx >= 0 && cx < int(MAZE_W) && cz >= 0 && cz < int(MAZE_H)) {
                uint tile = getMazeTile(level, uint(cx), uint(cz));
                vec3 cellCenter = vec3(float(cx) + 0.5 - 7.5, 0.0, float(cz) + 0.5 - 5.5);
                
                if (tile == 1u) {
                    // Wall block
                    float wallD = sdBox(lp - (cellCenter + vec3(0.0, 0.28, 0.0)), vec3(0.48, 0.28, 0.48));
                    res = (wallD < res.x) ? vec2(wallD, 2.0) : res;
                } else if (tile == 2u) {
                    // Hazard hole cylinder
                    float holeCyl = sdCylinder(lp - (cellCenter + vec3(0.0, -0.15, 0.0)), 0.35, 0.32);
                    // Subtract from floor appearance
                    if (holeCyl < 0.1) {
                        res = vec2(holeCyl, 7.0);
                    }
                } else if (tile == 3u) {
                    // Collectible Gem
                    uint gemId = uint(cz) * MAZE_W + uint(cx);
                    if ((gemMask & (1u << (gemId % 32u))) == 0u) {
                        vec3 gemP = lp - (cellCenter + vec3(0.0, 0.32 + 0.06 * sin(c.motion.x * 4.0 + float(gemId)), 0.0));
                        gemP = rotY(c.motion.x * 2.5 + float(gemId)) * gemP;
                        float gemD = sdOctahedron(gemP, 0.22);
                        res = (gemD < res.x) ? vec2(gemD, 6.0) : res;
                    }
                } else if (tile == 4u) {
                    // Goal portal ring
                    float ringD = abs(length(lp.xz - cellCenter.xz) - 0.36) - 0.06;
                    ringD = max(ringD, abs(lp.y - 0.06) - 0.06);
                    res = (ringD < res.x) ? vec2(ringD, 5.0) : res;
                }
            }
        }
    }

    // 4. Ball (Chrome Sphere)
    vec3 ballLp = vec3(ballPos.x - 7.5, 0.28 * ballScale, ballPos.y - 5.5);
    float ballD = sdSphere(lp - ballLp, 0.28 * max(ballScale, 0.01));
    res = (ballD < res.x) ? vec2(ballD, 4.0) : res;

    return res;
}

vec3 calcNormal(vec3 p, uint level, vec2 ballPos, float ballScale, uint gemMask) {
    vec2 e = vec2(0.003, -0.003);
    return normalize(
        e.xyy * mapScene(p + e.xyy, level, ballPos, ballScale, gemMask).x +
        e.yyx * mapScene(p + e.yyx, level, ballPos, ballScale, gemMask).x +
        e.yxy * mapScene(p + e.yxy, level, ballPos, ballScale, gemMask).x +
        e.xxx * mapScene(p + e.xxx, level, ballPos, ballScale, gemMask).x
    );
}

void main(){
    vec2 sp = gl_FragCoord.xy; // 0..1920, 0..1080
    vec2 uv = (sp - 0.5 * vec2(1920.0, 1080.0)) / 1080.0;

    uint state = c.game.x;
    uint level = c.game.y;
    uint gemMask = c.game.w;
    vec2 ballPos = c.flow.xy;
    float ballScale = c.transition.z;

    // Camera setup
    vec3 ro = vec3(0.0, 15.5, 13.8);
    vec3 ta = vec3(0.0, 0.0, 0.3);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Raymarching loop
    float t = 0.5;
    float tMax = 32.0;
    vec2 hit = vec2(-1.0, 0.0);

    for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        vec2 d = mapScene(p, level, ballPos, ballScale, gemMask);
        if (d.x < 0.004) {
            hit = vec2(t, d.y);
            break;
        }
        if (t > tMax) break;
        t += d.x * 0.85;
    }

    // Sky / Studio Backdrop Background
    vec3 col = mix(vec3(0.07, 0.09, 0.13), vec3(0.14, 0.17, 0.24), uv.y + 0.5);

    if (hit.x > 0.0) {
        vec3 p = ro + rd * hit.x;
        vec3 n = calcNormal(p, level, ballPos, ballScale, gemMask);
        vec3 lightDir = normalize(vec3(0.4, 0.9, 0.6));
        vec3 viewDir = -rd;
        vec3 halfDir = normalize(lightDir + viewDir);

        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(n, halfDir), 0.0), 32.0);
        float amb = 0.25 + 0.15 * n.y;

        mat3 tiltRot = rotX(c.transition.x) * rotZ(c.transition.y);
        vec3 lp = transpose(tiltRot) * p;

        float matId = hit.y;

        if (matId == 1.0) {
            // Wood Floor with routed grid grooves
            vec2 gridFrac = fract(lp.xz + vec2(7.5, 5.5));
            float groove = smoothstep(0.02, 0.06, min(gridFrac.x, 1.0 - gridFrac.x)) *
                           smoothstep(0.02, 0.06, min(gridFrac.y, 1.0 - gridFrac.y));
            vec3 woodCol = mix(vec3(0.38, 0.24, 0.14), vec3(0.52, 0.35, 0.22), 0.5 + 0.5 * sin(lp.x * 8.0 + lp.z * 1.5));
            woodCol *= (0.65 + 0.35 * groove);

            // Ball contact shadow on floor
            vec2 bLp = vec2(ballPos.x - 7.5, ballPos.y - 5.5);
            float shadowDist = length(lp.xz - bLp);
            float shadow = smoothstep(0.25, 0.65, shadowDist);
            woodCol *= (0.45 + 0.55 * shadow);

            col = woodCol * (diff * 0.85 + amb) + vec3(0.12) * spec * groove;

        } else if (matId == 2.0) {
            // Maze Wall: Polished Mahogany with brass top trim
            vec3 wallCol = vec3(0.32, 0.18, 0.10);
            if (lp.y > 0.50) {
                // Brass cap trim
                wallCol = vec3(0.85, 0.70, 0.35);
                spec = pow(max(dot(n, halfDir), 0.0), 48.0);
            }
            col = wallCol * (diff * 0.90 + amb) + vec3(0.35, 0.30, 0.20) * spec;

        } else if (matId == 3.0) {
            // Beveled Outer Rim: Dark Walnut with golden bevel corner highlights
            vec3 rimCol = vec3(0.24, 0.14, 0.08);
            if (abs(lp.x) > 7.7 || abs(lp.z) > 5.7) {
                rimCol = vec3(0.75, 0.58, 0.28); // brass brackets
            }
            col = rimCol * (diff * 0.85 + amb) + vec3(0.3) * spec;

        } else if (matId == 4.0) {
            // Ball: Polished Chrome / Golden Sphere with environment reflection
            vec3 refDir = reflect(rd, n);
            float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
            vec3 envCol = mix(vec3(0.25, 0.35, 0.50), vec3(0.95, 0.90, 0.85), clamp(refDir.y * 0.5 + 0.5, 0.0, 1.0));
            // Add golden glint
            vec3 metalBase = vec3(0.92, 0.88, 0.80);
            spec = pow(max(dot(n, halfDir), 0.0), 80.0);
            col = metalBase * envCol * (amb + diff * 0.6) + vec3(1.2, 1.1, 0.9) * spec + fresnel * 0.4;

        } else if (matId == 5.0) {
            // Goal Portal: Glowing Pulsing Cyan Vortex
            float pulse = 0.5 + 0.5 * sin(c.motion.x * 6.0);
            vec3 goalCol = mix(vec3(0.1, 0.7, 0.9), vec3(0.3, 1.0, 0.95), pulse);
            col = goalCol * 1.5 + vec3(0.4) * spec;

        } else if (matId == 6.0) {
            // Collectible Gem: Brilliant Emerald Green
            vec3 gemCol = vec3(0.15, 0.95, 0.45);
            spec = pow(max(dot(n, halfDir), 0.0), 64.0);
            col = gemCol * (diff * 0.7 + 0.5) + vec3(0.9) * spec;

        } else if (matId == 7.0) {
            // Hazard Hole Interior
            col = vec3(0.04, 0.03, 0.03);
        }
    }

    // 2D UI / HUD OVERLAY
    float gw = float(GLYPH_W);
    float gh = float(GLYPH_H);

    // Top Header Background Ribbon
    float topBar = box(sp, vec2(960.0, 1035.0), vec2(940.0, 32.0), 10.0);
    if (topBar < 0.0) {
        col = mix(col, vec3(0.08, 0.12, 0.18), 0.85);
    }

    // Header Text: "GYRO 3D TILT MAZE"
    const uint H_TITLE[] = uint[](
        71u,89u,82u,79u,32u,51u,68u,32u,84u,73u,76u,84u,32u,77u,65u,90u,69u // "GYRO 3D TILT MAZE"
    );
    float hInk = 0.0;
    for (uint i = 0u; i < 17u; i++) {
        hInk = max(hInk, drawChar(sp, vec2(50.0 + float(i) * gw, 1022.0), H_TITLE[i]));
    }
    col = mix(col, vec3(0.95, 0.80, 0.35), hInk);

    // Level Display: "LEVEL 1/3"
    const uint L_CHARS[] = uint[](76u,69u,86u,69u,76u,32u); // "LEVEL "
    float lInk = 0.0;
    for (uint i = 0u; i < 6u; i++) {
        lInk = max(lInk, drawChar(sp, vec2(1500.0 + float(i) * gw, 1022.0), L_CHARS[i]));
    }
    lInk = max(lInk, drawDigit(sp, vec2(1500.0 + 6.0 * gw, 1022.0), level + 1u));
    lInk = max(lInk, drawChar(sp, vec2(1500.0 + 7.0 * gw, 1022.0), 47u)); // '/'
    lInk = max(lInk, drawDigit(sp, vec2(1500.0 + 8.0 * gw, 1022.0), 3u)); // '3'
    col = mix(col, vec3(0.30, 0.85, 1.0), lInk);

    // Bottom Controls Hint Bar
    float botBar = box(sp, vec2(960.0, 42.0), vec2(940.0, 26.0), 8.0);
    if (botBar < 0.0) {
        col = mix(col, vec3(0.08, 0.12, 0.18), 0.85);
    }

    // "TILT S2 / L-STICK  |  (A) RESET  |  (X) NEXT  |  (Y) TARE  |  (-) EXIT"
    const uint HINTS[] = uint[](
        84u,73u,76u,84u,32u,83u,50u,32u,47u,32u,76u,45u,83u,84u,73u,67u,75u, // "TILT S2 / L-STICK"
        32u,32u,124u,32u,32u,40u,65u,41u,32u,82u,69u,83u,69u,84u,             // " | (A) RESET"
        32u,32u,124u,32u,32u,40u,88u,41u,32u,78u,69u,88u,84u,                 // " | (X) NEXT"
        32u,32u,124u,32u,32u,40u,89u,41u,32u,84u,65u,82u,69u,                 // " | (Y) TARE"
        32u,32u,124u,32u,32u,40u,45u,41u,32u,69u,88u,73u,84u                  // " | (-) EXIT"
    );
    float hintInk = 0.0;
    for (uint i = 0u; i < uint(HINTS.length()); i++) {
        hintInk = max(hintInk, drawChar(sp, vec2(120.0 + float(i) * gw, 30.0), HINTS[i]));
    }
    col = mix(col, vec3(0.70, 0.78, 0.88), hintInk);

    // VICTORY CELEBRATION MODAL
    if (state == 2u) {
        float modal = box(sp, vec2(960.0, 540.0), vec2(420.0, 110.0), 20.0);
        if (modal < 0.0) {
            col = mix(col, vec3(0.10, 0.18, 0.14), 0.92);
        }
        float modalBorder = line(modal, 4.0);
        col = mix(col, vec3(0.20, 0.95, 0.50), modalBorder);

        // "LEVEL COMPLETED!"
        const uint V_MSG1[] = uint[](76u,69u,86u,69u,76u,32u,67u,79u,77u,80u,76u,69u,84u,69u,68u,33u);
        float vInk1 = 0.0;
        for (uint i = 0u; i < 16u; i++) {
            vInk1 = max(vInk1, drawChar(sp, vec2(780.0 + float(i) * gw, 570.0), V_MSG1[i]));
        }
        col = mix(col, vec3(1.0, 0.88, 0.25), vInk1);

        // "PRESS (A) FOR NEXT MAZE"
        const uint V_MSG2[] = uint[](
            80u,82u,69u,83u,83u,32u,40u,65u,41u,32u,70u,79u,82u,32u,78u,69u,88u,84u,32u,77u,65u,90u,69u
        );
        float vInk2 = 0.0;
        for (uint i = 0u; i < 23u; i++) {
            vInk2 = max(vInk2, drawChar(sp, vec2(710.0 + float(i) * gw, 510.0), V_MSG2[i]));
        }
        col = mix(col, vec3(0.90, 0.95, 1.0), vInk2);
    }

    outColor = vec4(col, 1.0);
}
