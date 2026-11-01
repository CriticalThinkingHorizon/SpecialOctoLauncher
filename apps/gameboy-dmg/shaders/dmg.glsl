// GameBoy DMG-01 Hardware Memory Layout inside c.atlas[]
// (Starts at word 65536 = byte 262144, preserving SDK font atlas at 0..65535)
const float DMG_W = 160.0;
const float DMG_H = 144.0;

const uint GB_CPU_BASE  = 65536u; // 64 uints (CPU & PPU I/O registers)
const uint GB_VRAM_BASE = 65600u; // 2048 uints (8 KB VRAM: 0x8000..0x9FFF)
const uint GB_WRAM_BASE = 67648u; // 2048 uints (8 KB WRAM: 0xC000..0xDFFF)
const uint GB_ERAM_BASE = 69696u; // 2048 uints (8 KB Cart RAM: 0xA000..0xBFFF)
const uint GB_OAM_BASE  = 71744u; // 40 uints   (160 B OAM: 0xFE00..0xFE9F)
const uint GB_HRAM_BASE = 71784u; // 32 uints   (128 B HRAM: 0xFF80..0xFFFE)
const uint GB_IO_BASE   = 71816u; // 32 uints   (128 B I/O: 0xFF00..0xFF7F)
const uint GB_LCD_BASE  = 71848u; // 5760 uints (160x144 pixels, 4 pixels/uint)
const uint GB_ROM_BASE  = 77608u; // Cartridge ROM (up to 256 KB = 65536 uints)

// Palettes: 4 shades (0=lightest/background, 3=darkest)
vec3 getDmgColor(uint shade, uint paletteMode) {
    if (paletteMode == 1u) {
        // GameBoy Pocket (Neutral Grayscale)
        if (shade == 0u) return vec3(0.88, 0.88, 0.88);
        if (shade == 1u) return vec3(0.62, 0.62, 0.62);
        if (shade == 2u) return vec3(0.32, 0.32, 0.32);
        return vec3(0.06, 0.06, 0.06);
    } else if (paletteMode == 2u) {
        // Super GameBoy (Warm Amber Gold)
        if (shade == 0u) return vec3(0.96, 0.88, 0.68);
        if (shade == 1u) return vec3(0.82, 0.62, 0.35);
        if (shade == 2u) return vec3(0.50, 0.30, 0.15);
        return vec3(0.16, 0.08, 0.04);
    }
    // Classic DMG Dot-Matrix (Olive Green)
    if (shade == 0u) return vec3(0.608, 0.737, 0.059);
    if (shade == 1u) return vec3(0.545, 0.675, 0.059);
    if (shade == 2u) return vec3(0.188, 0.384, 0.188);
    return vec3(0.059, 0.220, 0.059);
}

uint gbReadByteAt(uint baseWord, uint byteOffset) {
    uint w = c.atlas[baseWord + (byteOffset >> 2u)];
    return (w >> ((byteOffset & 3u) * 8u)) & 0xFFu;
}

uint gbReadLcdPixel(ivec2 p) {
    uint idx = uint(p.y * 160 + p.x);
    uint w = c.atlas[GB_LCD_BASE + (idx >> 2u)];
    return (w >> ((idx & 3u) * 8u)) & 3u;
}
