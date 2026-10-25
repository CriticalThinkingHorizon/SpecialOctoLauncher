#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#define HB_READONLY
#include "abi.glsl"
#include "hb.glsl"
#include "text.glsl"
#include "draw.glsl"

float drawChar(vec2 p,vec2 origin,uint ch){
 if(ch<GLYPH_FIRST||ch>=GLYPH_FIRST+GLYPH_COUNT)return 0.0;
 uint idx=ch-GLYPH_FIRST;
 ivec4 rect=ivec4(int(idx%uint(GLYPH_COLS))*GLYPH_W,int(idx/uint(GLYPH_COLS))*GLYPH_H,GLYPH_W,GLYPH_H);
 return text(p,origin,rect);
}

// Title: "=== TMP:/ CLEANER (Generic SDK hbFsStat / hbFsDelete) ===" (57 chars)
const uint TITLE_LEN = 57u;
const uint TITLE_CHARS[57] = uint[57](
 61u,61u,61u,32u,84u,77u,80u,58u,47u,32u,67u,76u,69u,65u,78u,69u,82u,32u,40u,71u,101u,110u,101u,114u,105u,99u,32u,
 83u,68u,75u,32u,104u,98u,70u,115u,83u,116u,97u,116u,32u,47u,32u,104u,98u,70u,115u,68u,101u,108u,101u,116u,101u,41u,32u,61u,61u,61u
);

// Line 1 (Found): "[STEP 1] hbFsStat(\"tmp:/tmptest\"): FOUND FILE!" (46 chars)
const uint L1_FOUND_LEN = 46u;
const uint L1_FOUND[46] = uint[46](
 91u,83u,84u,69u,80u,32u,49u,93u,32u,104u,98u,70u,115u,83u,116u,97u,116u,40u,34u,116u,109u,112u,58u,47u,116u,109u,112u,116u,101u,115u,116u,34u,41u,58u,32u,
 70u,79u,85u,78u,68u,32u,70u,73u,76u,69u,33u
);

// Line 1 (Missing): "[STEP 1] hbFsStat(\"tmp:/tmptest\"): NOT FOUND (Clean)" (52 chars)
const uint L1_MISS_LEN = 52u;
const uint L1_MISS[52] = uint[52](
 91u,83u,84u,69u,80u,32u,49u,93u,32u,104u,98u,70u,115u,83u,116u,97u,116u,40u,34u,116u,109u,112u,58u,47u,116u,109u,112u,116u,101u,115u,116u,34u,41u,58u,32u,
 78u,79u,84u,32u,70u,79u,85u,78u,68u,32u,40u,67u,108u,101u,97u,110u,41u
);

// Line 2 (Deleted): "[STEP 2] hbFsDelete(\"tmp:/tmptest\"): DELETED OK (0x0)" (53 chars)
const uint L2_DEL_LEN = 53u;
const uint L2_DEL[53] = uint[53](
 91u,83u,84u,69u,80u,32u,50u,93u,32u,104u,98u,70u,115u,68u,101u,108u,101u,116u,101u,40u,34u,116u,109u,112u,58u,47u,116u,109u,112u,116u,101u,115u,116u,34u,41u,58u,32u,
 68u,69u,76u,69u,84u,69u,68u,32u,79u,75u,32u,40u,48u,120u,48u,41u
);

// Line 2 (Skipped): "[STEP 2] hbFsDelete skipped (file did not exist)" (48 chars)
const uint L2_SKIP_LEN = 48u;
const uint L2_SKIP[48] = uint[48](
 91u,83u,84u,69u,80u,32u,50u,93u,32u,104u,98u,70u,115u,68u,101u,108u,101u,116u,101u,32u,115u,107u,105u,112u,112u,101u,100u,32u,
 40u,102u,105u,108u,101u,32u,100u,105u,100u,32u,110u,111u,116u,32u,101u,120u,105u,115u,116u,41u
);

// Footer: "A: Re-run Check & Delete   |   -: Exit to Launcher" (50 chars)
const uint FOOT_LEN = 50u;
const uint FOOT_CHARS[50] = uint[50](
 65u,58u,32u,82u,101u,45u,114u,117u,110u,32u,67u,104u,101u,99u,107u,32u,38u,32u,68u,101u,108u,101u,116u,101u,32u,32u,32u,124u,32u,32u,32u,
 45u,58u,32u,69u,120u,105u,116u,32u,116u,111u,32u,76u,97u,117u,110u,99u,104u,101u,114u
);

void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 bg=mix(vec3(0.10,0.04,0.06),vec3(0.16,0.06,0.10),p.y/1080.0);
 vec3 color=bg;

 float card=fill(box(p,vec2(960.0,540.0),vec2(760.0,320.0),18.0));
 float border=line(box(p,vec2(960.0,540.0),vec2(760.0,320.0),18.0),2.5);
 color=mix(color,vec3(0.14,0.07,0.10),card);
 color=mix(color,vec3(0.85,0.35,0.40),border*0.6);

 bool existed=(c.piece.x==1);
 vec3 badgeCol=existed?vec3(0.85,0.35,0.20):vec3(0.15,0.65,0.40);
 float badge=fill(box(p,vec2(960.0,295.0),vec2(700.0,30.0),10.0));
 color=mix(color,badgeCol,badge*0.45);

 float titleInk=0.0;
 for(uint i=0u;i<TITLE_LEN;i++)titleInk=max(titleInk,drawChar(p,vec2(280.0+float(i*uint(GLYPH_W)),280.0),TITLE_CHARS[i]));
 color=mix(color,vec3(1.0,0.85,0.80),titleInk);

 float l1Ink=0.0;
 if(existed){
  for(uint i=0u;i<L1_FOUND_LEN;i++)l1Ink=max(l1Ink,drawChar(p,vec2(280.0+float(i*uint(GLYPH_W)),420.0),L1_FOUND[i]));
 }else{
  for(uint i=0u;i<L1_MISS_LEN;i++)l1Ink=max(l1Ink,drawChar(p,vec2(280.0+float(i*uint(GLYPH_W)),420.0),L1_MISS[i]));
 }
 color=mix(color,existed?vec3(1.0,0.75,0.40):vec3(0.45,1.0,0.65),l1Ink);

 float l2Ink=0.0;
 if(c.piece.z==1){
  for(uint i=0u;i<L2_DEL_LEN;i++)l2Ink=max(l2Ink,drawChar(p,vec2(280.0+float(i*uint(GLYPH_W)),500.0),L2_DEL[i]));
 }else{
  for(uint i=0u;i<L2_SKIP_LEN;i++)l2Ink=max(l2Ink,drawChar(p,vec2(280.0+float(i*uint(GLYPH_W)),500.0),L2_SKIP[i]));
 }
 color=mix(color,vec3(0.55,0.95,1.0),l2Ink);

 float footInk=0.0;
 for(uint i=0u;i<FOOT_LEN;i++)footInk=max(footInk,drawChar(p,vec2(280.0+float(i*uint(GLYPH_W)),680.0),FOOT_CHARS[i]));
 color=mix(color,vec3(0.80,0.85,0.92),footInk);

 outColor=vec4(color,1.0);
}
