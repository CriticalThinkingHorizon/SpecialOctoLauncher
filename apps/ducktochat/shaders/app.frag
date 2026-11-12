#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#define HB_READONLY
#include "abi.glsl"
#include "hb.glsl"
#include "kbd.glsl"
#include "text.glsl"
#include "draw.glsl"

const vec3 BG_TOP    = vec3(0.958, 0.966, 0.976);
const vec3 BG_BOT    = vec3(1.000, 1.000, 1.000);
const vec3 CARD      = vec3(1.000, 1.000, 1.000);
const vec3 CARD_SOFT = vec3(0.984, 0.988, 0.992);
const vec3 CHAT_BG   = vec3(0.966, 0.974, 0.982);
const vec3 EDGE      = vec3(0.862, 0.890, 0.922);
const vec3 EDGE_SOFT = vec3(0.918, 0.936, 0.954);
const vec3 KEY_EDGE  = vec3(0.780, 0.820, 0.870);
const vec3 KEY_SIDE  = vec3(0.870, 0.900, 0.935);
const vec3 SHADOW    = vec3(0.820, 0.850, 0.885);
const vec3 TEXT      = vec3(0.145, 0.190, 0.245);
const vec3 TEXT_2    = vec3(0.430, 0.480, 0.540);
const vec3 PRESSED   = vec3(0.930, 0.950, 0.970);

vec3 pcRoomColor(uint room){
 if (room == 0u) return vec3(0.52, 0.78, 0.98);
 if (room == 1u) return vec3(1.00, 0.62, 0.68);
 if (room == 2u) return vec3(0.55, 0.86, 0.60);
 return vec3(1.00, 0.80, 0.38);
}

vec3 pcAuthorColor(uint h){
 uint k = h % 4u;
 if (k == 0u) return vec3(1.00, 0.92, 0.70);
 if (k == 1u) return vec3(1.00, 0.84, 0.89);
 if (k == 2u) return vec3(0.80, 0.93, 1.00);
 return vec3(0.84, 0.96, 0.80);
}

float drawCharS(vec2 p, vec2 origin, uint ch, float s){
 if (ch < GLYPH_FIRST || ch >= GLYPH_FIRST + GLYPH_COUNT) return 0.0;
 vec2 q = (p - origin) / s;
 if (q.x < 0.0 || q.y < 0.0) return 0.0;
 uint idx = ch - GLYPH_FIRST;
 ivec4 rect = ivec4(int(idx % uint(GLYPH_COLS)) * GLYPH_W,
                    int(idx / uint(GLYPH_COLS)) * GLYPH_H,
                    GLYPH_W, GLYPH_H);
 return text(q, vec2(0.0), rect);
}

void pcKey(vec2 p, vec2 center, vec2 halfSize, float radius, uint code, inout vec3 color){
 bool lit = (c.flow.x > 0.0 && uint(max(c.piece.y, 0)) == code);
 color = mix(color, SHADOW, fill(box(p, center + vec2(0.0, 3.0), halfSize, radius)));
 color = mix(color, KEY_EDGE, fill(box(p, center, halfSize, radius)));
 vec3 face = lit ? PRESSED : CARD;
 color = mix(color, face, fill(box(p, center, halfSize - vec2(1.5), radius - 1.0)));
}

void main(){
 vec2 p = gl_FragCoord.xy;
 vec3 color = mix(BG_TOP, BG_BOT, p.y / 1080.0);

 // barely-there dot texture
 vec2 grid = floor(p / 28.0);
 float dotMask = step(0.965, fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453));
 color = mix(color, vec3(1.0), dotMask * 0.12);

 // panel shadows + panel bodies
 color = mix(color, SHADOW, fill(box(p, vec2(482.0,552.0), vec2(454.0,514.0), 26.0)) * 0.35);
 color = mix(color, SHADOW, fill(box(p, vec2(1442.0,552.0), vec2(454.0,514.0), 26.0)) * 0.35);
 color = mix(color, CARD, fill(box(p, vec2(480.0,540.0), vec2(450.0,510.0), 26.0)));
 color = mix(color, CARD, fill(box(p, vec2(1440.0,540.0), vec2(450.0,510.0), 26.0)));
 color = mix(color, EDGE, fill(box(p, vec2(480.0,540.0), vec2(450.0,510.0), 26.0) - fill(box(p, vec2(480.0,542.0), vec2(447.0,508.0), 24.0))));
 color = mix(color, EDGE, fill(box(p, vec2(1440.0,540.0), vec2(450.0,510.0), 26.0) - fill(box(p, vec2(1440.0,542.0), vec2(447.0,508.0), 24.0))));

 // ================================================================== LEFT SIDE
 uint title[10] = uint[10](68u,117u,99u,107u,116u,111u,67u,104u,97u,116u);
 for (uint i=0u;i<10u;i++) color = mix(color, TEXT, drawCharS(p, vec2(60.0+float(i)*40.0, 30.0), title[i], 2.2));
 uint subtitle[17] = uint[17](83u,72u,65u,82u,69u,68u,32u,67u,72u,65u,84u,32u,82u,79u,79u,77u,83u);
 for (uint i=0u;i<17u;i++) color = mix(color, TEXT_2, drawCharS(p, vec2(64.0+float(i)*16.2, 112.0), subtitle[i], 0.90));

 for (uint r=0u;r<4u;r++){
  vec2 rc = pcRoomCenter(r);
  bool isCur = (r == (c.game.z % 4u));
  color = mix(color, SHADOW, fill(box(p, rc + vec2(0.0,2.0), vec2(34.0,32.0), 11.0)) * 0.40);
  color = mix(color, CARD, fill(box(p, rc, vec2(34.0,32.0), 11.0)));
  color = mix(color, pcRoomColor(r), fill(box(p, rc, vec2(34.0,32.0), 11.0) - fill(box(p, rc, vec2(31.5,29.5), 9.5))));
  if (isCur) color = mix(color, pcRoomColor(r), fill(box(p, rc, vec2(28.0,26.0), 8.0)) * 0.20);
  color = mix(color, isCur ? pcRoomColor(r) : TEXT_2, drawCharS(p, rc - vec2(14.0, 26.5), 65u+r, 1.55));
 }
 color = mix(color, EDGE_SOFT, fill(box(p, vec2(480.0,145.0), vec2(420.0,0.8), 0.4)));

 // message input card
 vec2 inC = vec2(480.0, 250.0);
 color = mix(color, SHADOW, fill(box(p, inC + vec2(0.0,4.0), vec2(425.0,92.0), 18.0)) * 0.35);
 color = mix(color, CARD, fill(box(p, inC, vec2(425.0,90.0), 16.0)));
 color = mix(color, EDGE, fill(box(p, inC, vec2(425.0,90.0), 16.0) - fill(box(p, inC, vec2(422.5,87.5), 14.5))));
 uint label[7] = uint[7](77u,69u,83u,83u,65u,71u,69u);
 for (uint i=0u;i<7u;i++) color = mix(color, TEXT_2, drawCharS(p, vec2(90.0+float(i)*15.3, 170.0), label[i], 0.85));
 color = mix(color, EDGE_SOFT, fill(box(p, vec2(480.0,202.0), vec2(395.0,0.7), 0.3)));

 uint inputLen = uint(clamp(c.piece.x, 0, 104));
 if (inputLen == 0u){
  uint ph[31] = uint[31](84u,97u,112u,32u,116u,104u,101u,32u,107u,101u,121u,98u,111u,97u,114u,100u,32u,111u,114u,32u,112u,114u,101u,115u,115u,32u,89u,32u,46u,46u,46u);
  for (uint i=0u;i<31u;i++) color = mix(color, TEXT_2, drawCharS(p, vec2(100.0+float(i)*18.0, 225.0), ph[i], 1.0));
 } else {
  for (uint i=0u;i<inputLen;i++){
   uint ch = pcInputByte(i);
   if (ch == 0u) break;
   uint row = i % 40u;
   uint col = i / 40u;
   color = mix(color, TEXT, drawCharS(p, vec2(100.0+float(row)*18.0, 218.0+float(col)*38.0), ch, 1.0));
  }
  uint row = inputLen % 40u;
  uint col = inputLen / 40u;
  float blink = step(0.5, fract(c.flow.w / 40.0));
  color = mix(color, vec3(0.30,0.42,0.55), fill(box(p, vec2(100.0+float(row)*18.0, 218.0+float(col)*38.0+17.0), vec2(8.0,16.0), 1.0))*blink);
 }

 // keyboard card
 vec2 kbC = vec2(480.0, 650.0);
 color = mix(color, SHADOW, fill(box(p, kbC + vec2(0.0,5.0), vec2(425.0,260.0), 22.0)) * 0.35);
 color = mix(color, CARD_SOFT, fill(box(p, kbC, vec2(425.0,258.0), 20.0)));
 color = mix(color, EDGE, fill(box(p, kbC, vec2(425.0,258.0), 20.0) - fill(box(p, kbC, vec2(422.5,255.5), 18.5))));

 for (int r=0;r<4;r++){
  for (int c=0;c<12;c++){
   uint code = pcKeyCode(r,c);
   if (code == 0u) continue;
   vec2 ck = pcKeyCenter(r,c);
   pcKey(p, ck, vec2(PC_KEY_W*0.5, PC_KEY_H*0.5), 6.0, code, color);
   color = mix(color, TEXT, drawCharS(p, ck - vec2(9.0, 17.0), code, 1.0));
  }
 }

 // action row
 vec2 cl = pcClearCenter();
 pcKey(p, cl, vec2(90.0,23.0), 8.0, PC_KEY_CLEAR, color);
 uint clearWord[5] = uint[5](67u,76u,69u,65u,82u);
 for (uint i=0u;i<5u;i++) color = mix(color, TEXT_2, drawCharS(p, cl + vec2(-45.0+float(i)*18.0, -17.0), clearWord[i], 1.0));

 vec2 sp = pcSpaceCenter();
 pcKey(p, sp, vec2(205.0,23.0), 8.0, PC_KEY_SPACE, color);
 uint spaceWord[5] = uint[5](83u,80u,65u,67u,69u);
 for (uint i=0u;i<5u;i++) color = mix(color, TEXT_2, drawCharS(p, sp + vec2(-45.0+float(i)*18.0, -17.0), spaceWord[i], 1.0));

 vec2 bk = pcBackCenter();
 pcKey(p, bk, vec2(40.0,23.0), 8.0, PC_KEY_BACK, color);
 uint delWord[3] = uint[3](68u,69u,76u);
 for (uint i=0u;i<3u;i++) color = mix(color, vec3(0.62,0.22,0.26), drawCharS(p, bk + vec2(-27.0+float(i)*18.0, -17.0), delWord[i], 1.0));

 vec2 sd = pcSendCenter();
 pcKey(p, sd, vec2(45.0,23.0), 8.0, PC_KEY_SEND, color);
 color = mix(color, TEXT, fill(box(p, sd, vec2(45.0,23.0), 8.0) - fill(box(p, sd, vec2(42.0,20.0), 6.0))));
 uint sendWord[4] = uint[4](83u,69u,78u,68u);
 for (uint i=0u;i<4u;i++) color = mix(color, TEXT, drawCharS(p, sd + vec2(-30.0+float(i)*14.8, -14.0), sendWord[i], 0.82));

 uint hint[25] = uint[25](84u,79u,85u,67u,72u,32u,75u,69u,89u,66u,79u,65u,82u,68u,32u,79u,82u,32u,80u,82u,69u,83u,83u,32u,89u);
 for (uint i=0u;i<25u;i++) color = mix(color, TEXT_2, drawCharS(p, vec2(260.0+float(i)*15.3, 840.0), hint[i], 0.85));

 // footer card
 vec2 ftC = vec2(480.0, 975.0);
 color = mix(color, SHADOW, fill(box(p, ftC + vec2(0.0,3.0), vec2(425.0,42.0), 14.0)) * 0.30);
 color = mix(color, CARD, fill(box(p, ftC, vec2(425.0,40.0), 14.0)));
 color = mix(color, EDGE, fill(box(p, ftC, vec2(425.0,40.0), 14.0) - fill(box(p, ftC, vec2(422.5,37.5), 12.5))));
 uint footer[34] = uint[34](76u,47u,82u,58u,82u,79u,79u,77u,32u,88u,58u,82u,69u,70u,82u,69u,83u,72u,32u,45u,58u,69u,88u,73u,84u,0u,0u,0u,0u,0u,0u,0u,0u,0u);
 for (uint i=0u;i<25u;i++) color = mix(color, TEXT_2, drawCharS(p, vec2(100.0+float(i)*14.4, 958.0), footer[i], 0.80));
 color = mix(color, vec3(0.30,0.68,0.42), fill(length(p - vec2(760.0,975.0)) - 6.0));
 uint online[6] = uint[6](79u,78u,76u,73u,78u,69u);
 for (uint i=0u;i<6u;i++) color = mix(color, TEXT_2, drawCharS(p, vec2(780.0+float(i)*14.4, 958.0), online[i], 0.80));

 // ================================================================= RIGHT SIDE
 // chat surface
 vec2 chatC = vec2(1440.0, 575.0);
 color = mix(color, CHAT_BG, fill(box(p, chatC, vec2(420.0,445.0), 18.0)));
 color = mix(color, EDGE_SOFT, fill(box(p, chatC, vec2(420.0,445.0), 18.0) - fill(box(p, chatC, vec2(417.5,442.5), 16.5))));

 // header
 color = mix(color, pcRoomColor(c.game.z), fill(box(p, vec2(1120.0,68.0), vec2(50.0,22.0), 7.0)));
 color = mix(color, TEXT, drawCharS(p, vec2(1111.0, 52.0), 65u+(c.game.z%4u), 1.0));
 uint header[10] = uint[10](67u,72u,65u,84u,32u,82u,79u,79u,77u,32u);
 for (uint i=0u;i<10u;i++) color = mix(color, TEXT, drawCharS(p, vec2(1185.0+float(i)*15.3, 52.0), header[i], 0.85));
 color = mix(color, TEXT, drawCharS(p, vec2(1340.0, 52.0), 65u+(c.game.z%4u), 0.85));

 uint count = nnDucktochatGetMessageCount();
 uint total = nnDucktochatGetTotalCount();
 uint msgWord[8] = uint[8](77u,69u,83u,83u,65u,71u,69u,83u);
 for (uint i=0u;i<8u;i++) color = mix(color, TEXT_2, drawCharS(p, vec2(1680.0+float(i)*14.4, 55.0), msgWord[i], 0.80));
 uint hundreds = (total / 100u) % 10u;
 uint tens = (total / 10u) % 10u;
 uint ones = total % 10u;
 float nx = 1800.0;
 if (total >= 100u) { color = mix(color, TEXT, drawCharS(p, vec2(nx,55.0), 48u+hundreds, 0.85)); nx += 14.0; }
 if (total >= 10u) { color = mix(color, TEXT, drawCharS(p, vec2(nx,55.0), 48u+tens, 0.85)); nx += 14.0; }
 color = mix(color, TEXT, drawCharS(p, vec2(nx,55.0), 48u+ones, 0.85));
 color = mix(color, EDGE_SOFT, fill(box(p, vec2(1440.0,115.0), vec2(390.0,0.8), 0.4)));

 // message cards
 if (count == 0u){
  vec2 ec = vec2(1440.0, 575.0);
  color = mix(color, SHADOW, fill(box(p, ec + vec2(0.0,4.0), vec2(360.0,250.0), 18.0)) * 0.30);
  color = mix(color, CARD, fill(box(p, ec, vec2(360.0,248.0), 16.0)));
  color = mix(color, EDGE, fill(box(p, ec, vec2(360.0,248.0), 16.0) - fill(box(p, ec, vec2(357.5,245.5), 14.5))));
  vec2 sc = vec2(1440.0, 530.0);
  color = mix(color, TEXT_2, fill(abs(length(p-sc)-70.0)-2.5));
  color = mix(color, TEXT_2, fill(length(p-(sc+vec2(-22.0,20.0)))-5.0));
  color = mix(color, TEXT_2, fill(length(p-(sc+vec2(22.0,20.0)))-5.0));
  color = mix(color, TEXT_2, fill(stroke(p, sc+vec2(-32.0,-22.0), sc+vec2(0.0,-37.0))-3.0));
  color = mix(color, TEXT_2, fill(stroke(p, sc+vec2(0.0,-37.0), sc+vec2(32.0,-22.0))-3.0));
  uint empty[16] = uint[16](78u,111u,32u,109u,101u,115u,115u,97u,103u,101u,115u,32u,121u,101u,116u,33u);
  for (uint i=0u;i<16u;i++) color = mix(color, TEXT, drawCharS(p, vec2(1310.0+float(i)*16.2, 650.0), empty[i], 0.90));
  uint hint2[27] = uint[27](80u,114u,101u,115u,115u,32u,89u,32u,116u,111u,32u,119u,114u,105u,116u,101u,32u,115u,111u,109u,101u,116u,104u,105u,110u,103u,33u);
  for (uint i=0u;i<27u;i++) color = mix(color, TEXT_2, drawCharS(p, vec2(1250.0+float(i)*14.0, 700.0), hint2[i], 0.78));
 } else {
  for (uint idx=0u;idx<count && idx<5u;idx++){
   uint m = count - 1u - idx;
   float cardY = 140.0 + float(idx)*170.0;
   vec2 cc = vec2(1440.0, cardY+80.0);
   color = mix(color, SHADOW, fill(box(p, cc + vec2(0.0,4.0), vec2(410.0,80.0), 14.0)) * 0.30);
   color = mix(color, CARD, fill(box(p, cc, vec2(410.0,80.0), 12.0)));
   color = mix(color, EDGE, fill(box(p, cc, vec2(410.0,80.0), 12.0) - fill(box(p, cc, vec2(407.5,77.5), 10.5))));

   uint h = 0u;
   for (uint a=0u;a<16u;a++) h += nnDucktochatGetMessageAuthorByte(m,a)*(a+1u);
   color = mix(color, pcAuthorColor(h), fill(box(p, vec2(1120.0,cardY+20.0), vec2(76.0,15.0), 6.0)));
   color = mix(color, pcRoomColor(c.game.z), fill(box(p, vec2(1038.0,cardY+80.0), vec2(3.5,68.0), 2.0)));
   for (uint a=0u;a<16u;a++){
    uint ch = nnDucktochatGetMessageAuthorByte(m,a);
    if (ch == 0u) break;
    color = mix(color, TEXT, drawCharS(p, vec2(1060.0+float(a)*13.5, cardY+9.0), ch, 0.75));
   }
   for (uint t=0u;t<104u;t++){
    uint ch = nnDucktochatGetMessageTextByte(m,t);
    if (ch == 0u) break;
    uint row = t % 40u;
    uint col = t / 40u;
    color = mix(color, TEXT, drawCharS(p, vec2(1050.0+float(row)*17.1, cardY+48.0+float(col)*36.0), ch, 0.95));
   }
  }
 }

 if (c.flow.y > 0.0){
  uint sent[5] = uint[5](83u,69u,78u,84u,33u);
  for (uint i=0u;i<5u;i++) color = mix(color, vec3(0.30,0.62,0.40), drawCharS(p, vec2(700.0+float(i)*14.0, 800.0), sent[i], 0.85));
 }

 outColor = vec4(color * (1.0 - c.transition.x), 1.0);
}