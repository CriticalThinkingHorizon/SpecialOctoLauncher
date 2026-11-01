// 15x11 Grid Maze Definitions
const uint MAZE_W = 15u;
const uint MAZE_H = 11u;

// Tile types:
// 0: Floor / Path
// 1: Wall
// 2: Hazard Hole
// 3: Collectible Gem
// 4: Goal Portal
// 5: Start Spawn

// Level 1: Beginner's Grove
const uint LEVEL_1[165] = uint[](
    1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,
    1u,5u,0u,0u,1u,0u,0u,3u,0u,1u,0u,0u,0u,3u,1u,
    1u,0u,1u,0u,1u,0u,1u,1u,0u,1u,0u,1u,1u,0u,1u,
    1u,0u,1u,0u,0u,0u,0u,1u,0u,0u,0u,1u,0u,0u,1u,
    1u,0u,1u,1u,1u,2u,0u,1u,1u,1u,0u,1u,2u,0u,1u,
    1u,0u,0u,0u,1u,0u,0u,0u,0u,1u,0u,1u,0u,0u,1u,
    1u,1u,1u,0u,1u,0u,1u,1u,0u,1u,0u,1u,0u,1u,1u,
    1u,3u,0u,0u,0u,0u,0u,2u,0u,0u,0u,0u,0u,0u,1u,
    1u,0u,1u,1u,1u,1u,1u,0u,1u,1u,1u,1u,1u,0u,1u,
    1u,0u,0u,0u,0u,0u,0u,0u,1u,0u,0u,0u,0u,4u,1u,
    1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u
);

// Level 2: Perilous Crossroads
const uint LEVEL_2[165] = uint[](
    1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,
    1u,3u,0u,0u,1u,0u,0u,3u,0u,0u,1u,0u,0u,3u,1u,
    1u,0u,1u,0u,1u,0u,1u,0u,1u,0u,1u,0u,1u,0u,1u,
    1u,0u,1u,2u,0u,0u,1u,0u,1u,0u,0u,2u,1u,0u,1u,
    1u,0u,1u,1u,1u,0u,0u,0u,0u,0u,1u,1u,1u,0u,1u,
    1u,5u,0u,0u,0u,0u,1u,2u,1u,0u,0u,0u,0u,4u,1u,
    1u,0u,1u,1u,1u,0u,0u,0u,0u,0u,1u,1u,1u,0u,1u,
    1u,0u,1u,2u,0u,0u,1u,0u,1u,0u,0u,2u,1u,0u,1u,
    1u,0u,1u,0u,1u,0u,1u,0u,1u,0u,1u,0u,1u,0u,1u,
    1u,3u,0u,0u,1u,0u,0u,3u,0u,0u,1u,0u,0u,3u,1u,
    1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u
);

// Level 3: Master's Gauntlet
const uint LEVEL_3[165] = uint[](
    1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,
    1u,5u,0u,2u,0u,0u,0u,2u,0u,0u,0u,2u,0u,4u,1u,
    1u,1u,0u,1u,1u,1u,0u,1u,0u,1u,1u,1u,0u,1u,1u,
    1u,3u,0u,0u,0u,1u,0u,1u,0u,1u,0u,0u,0u,3u,1u,
    1u,1u,1u,2u,0u,1u,0u,2u,0u,1u,0u,2u,1u,1u,1u,
    1u,0u,0u,0u,0u,0u,0u,3u,0u,0u,0u,0u,0u,0u,1u,
    1u,1u,1u,2u,0u,1u,0u,2u,0u,1u,0u,2u,1u,1u,1u,
    1u,3u,0u,0u,0u,1u,0u,1u,0u,1u,0u,0u,0u,3u,1u,
    1u,1u,0u,1u,1u,1u,0u,1u,0u,1u,1u,1u,0u,1u,1u,
    1u,0u,0u,2u,0u,0u,0u,2u,0u,0u,0u,2u,0u,0u,1u,
    1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u
);

uint getMazeTile(uint level, uint gx, uint gy) {
    if (gx >= MAZE_W || gy >= MAZE_H) return 1u;
    uint idx = gy * MAZE_W + gx;
    if (level == 0u) return LEVEL_1[idx];
    if (level == 1u) return LEVEL_2[idx];
    return LEVEL_3[idx];
}

vec2 getMazeStart(uint level) {
    if (level == 0u) return vec2(1.5, 1.5);
    if (level == 1u) return vec2(1.5, 5.5);
    return vec2(1.5, 1.5);
}

vec2 getMazeGoal(uint level) {
    if (level == 0u) return vec2(13.5, 9.5);
    if (level == 1u) return vec2(13.5, 5.5);
    return vec2(13.5, 1.5);
}
