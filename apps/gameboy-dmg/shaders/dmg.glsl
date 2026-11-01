// GameBoy DMG Hardware Specs
const float DMG_W = 160.0;
const float DMG_H = 144.0;

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
    if (shade == 0u) return vec3(0.61, 0.74, 0.06);
    if (shade == 1u) return vec3(0.55, 0.67, 0.06);
    if (shade == 2u) return vec3(0.19, 0.38, 0.19);
    return vec3(0.06, 0.22, 0.06);
}
