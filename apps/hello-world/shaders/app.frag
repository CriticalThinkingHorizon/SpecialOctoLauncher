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
 float panel=fill(box(p,vec2(960,540),vec2(650,260),32));
 color=mix(color,vec3(.07,.16,.25),panel);
 color=mix(color,vec3(.25,.85,.90),text(p,vec2(960-TEXT_HELLO.z/2,440),TEXT_HELLO));
 color=mix(color,vec3(.84,.91,.96),text(p,vec2(960-TEXT_MESSAGE.z/2,560),TEXT_MESSAGE));
 color=mix(color,vec3(.60,.72,.80),text(p,vec2(960-TEXT_RETURN.z/2,660),TEXT_RETURN));

 // Joy-Con Button Indicator Panel
 uint buttons=c.game.x;
 
 bool bX = (buttons & 4u) != 0u;
 bool bB = (buttons & 2u) != 0u;
 bool bY = (buttons & 8u) != 0u;
 bool bA = (buttons & 1u) != 0u;
 bool bUp = (buttons & 8192u) != 0u;
 bool bDown = (buttons & 32768u) != 0u;
 bool bLeft = (buttons & 4096u) != 0u;
 bool bRight = (buttons & 16384u) != 0u;

 vec2 rightCluster = vec2(1100, 740);
 vec2 leftCluster = vec2(820, 740);

 vec2 posX = rightCluster + vec2(0, -25);
 vec2 posB = rightCluster + vec2(0, 25);
 vec2 posY = rightCluster + vec2(-25, 0);
 vec2 posA = rightCluster + vec2(25, 0);

 vec2 posUp = leftCluster + vec2(0, -25);
 vec2 posDown = leftCluster + vec2(0, 25);
 vec2 posLeft = leftCluster + vec2(-25, 0);
 vec2 posRight = leftCluster + vec2(25, 0);

 vec3 activeCol = vec3(0.2, 0.95, 0.9);
 vec3 idleCol = vec3(0.1, 0.2, 0.3);

 color = mix(color, bX ? activeCol : idleCol, fill(length(p - posX) - 16.0));
 color = mix(color, bB ? activeCol : idleCol, fill(length(p - posB) - 16.0));
 color = mix(color, bY ? activeCol : idleCol, fill(length(p - posY) - 16.0));
 color = mix(color, bA ? activeCol : idleCol, fill(length(p - posA) - 16.0));

 color = mix(color, bUp ? activeCol : idleCol, fill(length(p - posUp) - 16.0));
 color = mix(color, bDown ? activeCol : idleCol, fill(length(p - posDown) - 16.0));
 color = mix(color, bLeft ? activeCol : idleCol, fill(length(p - posLeft) - 16.0));
 color = mix(color, bRight ? activeCol : idleCol, fill(length(p - posRight) - 16.0));

 outColor=vec4(color*(1.0-c.transition.x),1);
}
