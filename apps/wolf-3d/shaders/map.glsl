// 16x16 Castle Dungeon Map
const uint MAP_W = 16u;
const uint MAP_H = 16u;

// Tile types:
// 0: Empty Floor
// 1: Gray Stone Wall
// 2: Blue Stone Wall
// 3: Wood Panel Wall
// 4: Eagle Banner Wall
// 5: Prison Cell Bars
// 6: Steel Elevator Wall
// 7: Sliding Door
// 8: Exit Elevator Switch

const uint CASTLE_MAP[256] = uint[](
    1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,
    1u,0u,0u,0u,1u,0u,0u,0u,1u,0u,0u,0u,0u,0u,4u,1u,
    1u,0u,0u,0u,7u,0u,0u,0u,1u,0u,3u,3u,3u,0u,0u,1u,
    1u,0u,0u,0u,1u,0u,0u,0u,1u,0u,3u,0u,3u,0u,0u,1u,
    1u,1u,4u,1u,1u,0u,0u,0u,7u,0u,3u,0u,7u,0u,0u,1u,
    1u,0u,0u,0u,0u,0u,0u,0u,1u,0u,3u,3u,3u,0u,0u,1u,
    1u,0u,2u,2u,2u,0u,0u,0u,1u,0u,0u,0u,0u,0u,0u,1u,
    1u,0u,2u,0u,2u,0u,0u,0u,1u,1u,7u,1u,1u,1u,0u,1u,
    1u,0u,7u,0u,2u,0u,0u,0u,0u,0u,0u,0u,0u,1u,0u,1u,
    1u,0u,2u,2u,2u,0u,0u,0u,0u,0u,0u,0u,0u,1u,0u,1u,
    1u,0u,0u,0u,0u,0u,0u,1u,1u,0u,0u,0u,0u,1u,0u,1u,
    1u,5u,5u,7u,5u,0u,0u,1u,1u,0u,0u,0u,0u,1u,0u,1u,
    1u,5u,0u,0u,5u,0u,0u,0u,0u,0u,0u,0u,0u,7u,0u,1u,
    1u,5u,0u,0u,5u,0u,0u,0u,0u,0u,0u,0u,0u,1u,0u,1u,
    1u,1u,1u,1u,1u,1u,1u,1u,6u,6u,6u,8u,6u,1u,0u,1u,
    1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u,1u
);

uint getMapTile(uint x, uint y) {
    if (x >= MAP_W || y >= MAP_H) return 1u;
    return CASTLE_MAP[y * MAP_W + x];
}

const vec2 ENEMY_SPAWNS[4] = vec2[](
    vec2(6.5, 3.5),
    vec2(13.5, 4.5),
    vec2(12.5, 10.5),
    vec2(3.5, 8.5)
);
