#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "text.glsl"
#include "draw.glsl"

void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 color=mix(vec3(.035,.10,.19),vec3(.04,.22,.32),p.y/1080.0);
 
 float panel=fill(box(p,vec2(960,540),vec2(750,420),32));
 color=mix(color,vec3(.07,.16,.25),panel);

 color=mix(color,vec3(.25,.85,.90),text(p,vec2(960-TEXT_TITLE.z/2,160),TEXT_TITLE));
 color=mix(color,vec3(.84,.91,.96),text(p,vec2(960-TEXT_SUBTITLE.z/2,230),TEXT_SUBTITLE));
 color=mix(color,vec3(.60,.72,.80),text(p,vec2(960-TEXT_HINT.z/2,880),TEXT_HINT));

 uint selected = c.game.y;
 float itemHeight = 90.0;

 for(uint i=0u; i<5u; i++) {
  vec2 itemCenter = vec2(960, 320 + float(i) * itemHeight);
  float itemBox = fill(box(p, itemCenter, vec2(680, 70), 16.0));
  vec3 itemBg = (i == selected) ? vec3(0.12, 0.35, 0.5) : vec3(0.05, 0.12, 0.2);
  color = mix(color, itemBg, itemBox);
 }

 outColor=vec4(color*(1.0-c.transition.x),1);
}
