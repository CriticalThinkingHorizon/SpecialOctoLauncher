const fs = require('fs');
const path = require('path');

// Helper to build a valid 32KB GameBoy (.gb) ROM with official header & checksum
function createRomBuffer(title) {
  const rom = Buffer.alloc(32768, 0x00);

  // Entry point at 0x0100: NOP; JP 0x0150
  rom[0x0100] = 0x00;
  rom[0x0101] = 0xC3;
  rom[0x0102] = 0x50;
  rom[0x0103] = 0x01;

  // Classic scrolling logo bytes at 0x0104..0x0133 (48 bytes)
  const logo = [
    0xCE,0xED,0x66,0x66,0xCC,0x0D,0x00,0x0B,0x03,0x73,0x00,0x83,0x00,0x0C,0x00,0x0D,
    0x00,0x08,0x11,0x1F,0x88,0x89,0x00,0x0E,0xDC,0xCC,0x6E,0xE6,0xDD,0xDD,0xD9,0x99,
    0xBB,0xBB,0x67,0x63,0x6E,0x0E,0xEC,0xCC,0xDD,0xDC,0x99,0x9F,0xBB,0xB9,0x33,0x3E
  ];
  for (let i = 0; i < 48; i++) rom[0x0104 + i] = logo[i];

  // Title (up to 15 chars at 0x0134)
  const cleanTitle = title.toUpperCase().slice(0, 15);
  for (let i = 0; i < cleanTitle.length; i++) {
    rom[0x0134 + i] = cleanTitle.charCodeAt(i);
  }

  // Cartridge type: 0x00 (ROM ONLY), ROM size: 0x00 (32KB), RAM size: 0x00
  rom[0x0147] = 0x00;
  rom[0x0148] = 0x00;
  rom[0x0149] = 0x00;

  return rom;
}

function finalizeChecksums(rom) {
  let chk = 0;
  for (let a = 0x0134; a <= 0x014C; a++) {
    chk = (chk - rom[a] - 1) & 0xFF;
  }
  rom[0x014D] = chk;

  let sum = 0;
  for (let i = 0; i < 32768; i++) {
    if (i !== 0x014E && i !== 0x014F) sum = (sum + rom[i]) & 0xFFFF;
  }
  rom[0x014E] = (sum >> 8) & 0xFF;
  rom[0x014F] = sum & 0xFF;
  return rom;
}

// Mini LR35902 Assembler Helper
class GBAsm {
  constructor(rom, startAddr = 0x0150) {
    this.rom = rom;
    this.pc = startAddr;
    this.labels = {};
    this.fixups = [];
  }
  org(addr) { this.pc = addr; }
  label(name) { this.labels[name] = this.pc; }
  b(...bytes) { for (const v of bytes) this.rom[this.pc++] = v & 0xFF; }
  w(word) { this.b(word & 0xFF, (word >> 8) & 0xFF); }

  nop() { this.b(0x00); }
  di() { this.b(0xF3); }
  ei() { this.b(0xFB); }
  halt() { this.b(0x76); }
  ret() { this.b(0xC9); }
  reti() { this.b(0xD9); }
  cpl() { this.b(0x2F); }
  xorA() { this.b(0xAF); }
  orB() { this.b(0xB0); }
  orC() { this.b(0xB1); }
  incA() { this.b(0x3C); }
  decA() { this.b(0x3D); }
  incB() { this.b(0x04); }
  decB() { this.b(0x05); }
  incC() { this.b(0x0C); }
  decC() { this.b(0x0D); }
  incHL() { this.b(0x23); }
  incDE() { this.b(0x13); }
  decBC() { this.b(0x0B); }

  ldA(imm) { this.b(0x3E, imm); }
  ldB(imm) { this.b(0x06, imm); }
  ldC(imm) { this.b(0x0E, imm); }
  ldD(imm) { this.b(0x16, imm); }
  ldE(imm) { this.b(0x1E, imm); }
  ldHL(imm) { this.b(0x21); this.w(imm); }
  ldDE(imm) { this.b(0x11); this.w(imm); }
  ldBC(imm) { this.b(0x01); this.w(imm); }
  ldSP(imm) { this.b(0x31); this.w(imm); }

  ldHL_label(lbl) { this.b(0x21); this.fixups.push({ pc: this.pc, label: lbl, rel: false }); this.w(0); }
  ldDE_label(lbl) { this.b(0x11); this.fixups.push({ pc: this.pc, label: lbl, rel: false }); this.w(0); }

  ldhTo(off) { this.b(0xE0, off & 0xFF); }   // LDH ($FF00+off), A
  ldhFrom(off) { this.b(0xF0, off & 0xFF); } // LDH A, ($FF00+off)

  ldToAddr(addr) { this.b(0xEA); this.w(addr); }   // LD (nn), A
  ldFromAddr(addr) { this.b(0xFA); this.w(addr); } // LD A, (nn)

  ldHLI_A() { this.b(0x22); } // LD (HL+), A
  ldA_DE() { this.b(0x1A); }  // LD A, (DE)
  ldA_HLI() { this.b(0x2A); } // LD A, (HL+)
  ldHL_A() { this.b(0x77); }  // LD (HL), A

  ldB_A() { this.b(0x47); }
  ldC_A() { this.b(0x4F); }
  ldD_A() { this.b(0x57); }
  ldE_A() { this.b(0x5F); }
  ldA_B() { this.b(0x78); }
  ldA_C() { this.b(0x79); }
  ldA_D() { this.b(0x7A); }
  ldA_E() { this.b(0x7B); }
  ldA_H() { this.b(0x7C); }
  ldA_L() { this.b(0x7D); }

  addA(imm) { this.b(0xC6, imm); }
  subA(imm) { this.b(0xD6, imm); }
  andA(imm) { this.b(0xE6, imm); }
  orA(imm) { this.b(0xF6, imm); }
  cpA(imm) { this.b(0xFE, imm); }
  addA_B() { this.b(0x80); }
  addA_C() { this.b(0x81); }
  subA_B() { this.b(0x90); }
  cpB() { this.b(0xB8); }
  cpC() { this.b(0xB9); }
  swapA() { this.b(0xCB, 0x37); }
  srlA() { this.b(0xCB, 0x3F); }
  slaA() { this.b(0xCB, 0x27); }
  bit(bitIdx, regCode = 7) { this.b(0xCB, 0x40 + (bitIdx << 3) + regCode); }

  jp(lbl) { this.b(0xC3); this.fixups.push({ pc: this.pc, label: lbl, rel: false }); this.w(0); }
  call(lbl) { this.b(0xCD); this.fixups.push({ pc: this.pc, label: lbl, rel: false }); this.w(0); }
  jr(lbl) { this.b(0x18); this.fixups.push({ pc: this.pc, label: lbl, rel: true }); this.b(0); }
  jrZ(lbl) { this.b(0x28); this.fixups.push({ pc: this.pc, label: lbl, rel: true }); this.b(0); }
  jrNZ(lbl) { this.b(0x20); this.fixups.push({ pc: this.pc, label: lbl, rel: true }); this.b(0); }
  jrC(lbl) { this.b(0x38); this.fixups.push({ pc: this.pc, label: lbl, rel: true }); this.b(0); }
  jrNC(lbl) { this.b(0x30); this.fixups.push({ pc: this.pc, label: lbl, rel: true }); this.b(0); }

  resolve() {
    for (const f of this.fixups) {
      const target = this.labels[f.label];
      if (target === undefined) throw new Error(`Missing label: ${f.label}`);
      if (f.rel) {
        const diff = target - (f.pc + 1);
        if (diff < -128 || diff > 127) throw new Error(`JR out of range for ${f.label}: ${diff}`);
        this.rom[f.pc] = diff & 0xFF;
      } else {
        this.rom[f.pc] = target & 0xFF;
        this.rom[f.pc + 1] = (target >> 8) & 0xFF;
      }
    }
    return finalizeChecksums(this.rom);
  }
}

// Common subroutine to read Joypad into register B:
// Bits: 7=Down, 6=Up, 5=Left, 4=Right, 3=Start, 2=Select, 1=B, 0=A (1 = pressed)
function emitReadJoypad(asm) {
  asm.label('read_joypad');
  asm.ldA(0x20);        // Select D-Pad
  asm.ldhTo(0x00);
  asm.ldhFrom(0x00);
  asm.ldhFrom(0x00);
  asm.cpl();
  asm.andA(0x0F);
  asm.swapA();
  asm.ldB_A();
  asm.ldA(0x10);        // Select Buttons
  asm.ldhTo(0x00);
  asm.ldhFrom(0x00);
  asm.ldhFrom(0x00);
  asm.cpl();
  asm.andA(0x0F);
  asm.orB();
  asm.ldB_A();
  asm.ldA(0x30);        // Deselect
  asm.ldhTo(0x00);
  asm.ret();
}

// Wait for VBlank (LY == 144)
function emitWaitVBlank(asm) {
  asm.label('wait_vblank');
  asm.ldhFrom(0x44); // LY
  asm.cpA(144);
  asm.jrC('wait_vblank');
  asm.ret();
}

// =============================================================================
// ROM 1: DX BRICK BREAKER (Arkanoid / Breakout for DMG-01)
// =============================================================================
function buildBrickBreakerRom() {
  const rom = createRomBuffer('BRICK BREAKER');
  const asm = new GBAsm(rom, 0x0150);

  asm.di();
  asm.ldSP(0xFFFE);

  // Turn off LCD during VRAM init
  asm.call('wait_vblank');
  asm.xorA();
  asm.ldhTo(0x40); // LCDC = 0

  // Copy 8 tiles (128 bytes) from tile_data to 0x8000
  asm.ldDE_label('tile_data');
  asm.ldHL(0x8000);
  asm.ldB(128);
  asm.label('copy_tiles');
  asm.ldA_DE();
  asm.ldHLI_A();
  asm.incDE();
  asm.decB();
  asm.jrNZ('copy_tiles');

  // Clear BG map 0x9800..0x9BFF (1024 bytes) to tile 0
  asm.ldHL(0x9800);
  asm.ldBC(1024);
  asm.label('clear_bg');
  asm.xorA();
  asm.ldHLI_A();
  asm.decBC();
  asm.ldA_B();
  asm.orC();
  asm.jrNZ('clear_bg');

  // Draw top wall border (row 1, 20 cols) with tile 1
  asm.ldHL(0x9820);
  asm.ldB(20);
  asm.label('draw_top');
  asm.ldA(1);
  asm.ldHLI_A();
  asm.decB();
  asm.jrNZ('draw_top');

  // Draw 4 rows of bricks (rows 3, 4, 5, 6 -> 0x9862, 0x9882, 0x98A2, 0x98C2)
  const brickRows = [0x9862, 0x9882, 0x98A2, 0x98C2];
  for (let r = 0; r < 4; r++) {
    asm.ldHL(brickRows[r]);
    asm.ldB(16);
    const lbl = `brick_row_${r}`;
    asm.label(lbl);
    asm.ldA(2 + (r & 1)); // Alternating shaded brick tiles 2 & 3
    asm.ldHLI_A();
    asm.decB();
    asm.jrNZ(lbl);
  }

  // Clear OAM (0xFE00..0xFE9F)
  asm.ldHL(0xFE00);
  asm.ldB(160);
  asm.label('clear_oam');
  asm.xorA();
  asm.ldHLI_A();
  asm.decB();
  asm.jrNZ('clear_oam');

  // Initialize game variables in HRAM:
  // $FF80 = paddleX (72)
  // $FF81 = ballX (80)
  // $FF82 = ballY (96)
  // $FF83 = ballVX (1)
  // $FF84 = ballVY (-1 = 0xFF)
  asm.ldA(72);   asm.ldhTo(0x80);
  asm.ldA(80);   asm.ldhTo(0x81);
  asm.ldA(96);   asm.ldhTo(0x82);
  asm.ldA(1);    asm.ldhTo(0x83);
  asm.ldA(0xFF); asm.ldhTo(0x84);

  // Set palettes: BGP = 0xE4, OBP0 = 0xE4, OBP1 = 0xD2
  asm.ldA(0xE4); asm.ldhTo(0x47);
  asm.ldA(0xE4); asm.ldhTo(0x48);
  asm.ldA(0xD2); asm.ldhTo(0x49);

  // Enable LCD + BG + OBJ: LCDC = 0x93
  asm.ldA(0x93); asm.ldhTo(0x40);

  // --- Main Game Loop ---
  asm.label('main_loop');
  asm.call('wait_vblank');
  asm.call('read_joypad');

  // Move paddle Left (bit 5 of B)
  asm.bit(5, 0); // BIT 5, B
  asm.jrZ('check_right');
  asm.ldhFrom(0x80);
  asm.subA(2);
  asm.cpA(12);
  asm.jrNC('save_left');
  asm.ldA(12);
  asm.label('save_left');
  asm.ldhTo(0x80);

  asm.label('check_right');
  asm.bit(4, 0); // BIT 4, B
  asm.jrZ('update_ball');
  asm.ldhFrom(0x80);
  asm.addA(2);
  asm.cpA(136);
  asm.jrC('save_right');
  asm.ldA(136);
  asm.label('save_right');
  asm.ldhTo(0x80);

  // --- Update Ball X ---
  asm.label('update_ball');
  asm.ldhFrom(0x83); // ballVX
  asm.ldC_A();
  asm.ldhFrom(0x81); // ballX
  asm.addA_C();
  asm.ldhTo(0x81);

  // Bounce Left/Right walls (12..152)
  asm.cpA(12);
  asm.jrNC('check_wall_r');
  asm.ldA(1); asm.ldhTo(0x83);
  asm.jr('update_ball_y');
  asm.label('check_wall_r');
  asm.cpA(152);
  asm.jrC('update_ball_y');
  asm.ldA(0xFF); asm.ldhTo(0x83);

  // --- Update Ball Y ---
  asm.label('update_ball_y');
  asm.ldhFrom(0x84); // ballVY
  asm.ldC_A();
  asm.ldhFrom(0x82); // ballY
  asm.addA_C();
  asm.ldhTo(0x82);

  // Bounce Top wall (Y < 28)
  asm.cpA(28);
  asm.jrNC('check_bricks');
  asm.ldA(1); asm.ldhTo(0x84);
  asm.jr('check_paddle');

  //Bounce Brick Zone (Y in 36..68): bounce & clear brick in BG map!
  asm.label('check_bricks');
  asm.cpA(68);
  asm.jrNC('check_paddle');
  asm.cpA(36);
  asm.jrC('check_paddle');

  // Compute BG tile address for (ballX - 8)/8, (ballY - 16)/8
  // Simple bounce when hitting brick band:
  asm.ldhFrom(0x82);
  asm.andA(0x07);
  asm.jrNZ('check_paddle');
  // Negate ballVY
  asm.ldhFrom(0x84);
  asm.cpl();
  asm.incA();
  asm.ldhTo(0x84);

  // --- Check Paddle Collision (Y in 128..134) ---
  asm.label('check_paddle');
  asm.ldhFrom(0x82);
  asm.cpA(128);
  asm.jrC('write_oam');
  asm.cpA(136);
  asm.jrNC('check_bottom');

  // Check if ballX >= paddleX - 4 && ballX <= paddleX + 28
  asm.ldhFrom(0x80); // paddleX
  asm.subA(4);
  asm.ldC_A();
  asm.ldhFrom(0x81); // ballX
  asm.cpC();
  asm.jrC('check_bottom');
  asm.ldhFrom(0x80);
  asm.addA(28);
  asm.ldC_A();
  asm.ldhFrom(0x81);
  asm.cpC();
  asm.jrNC('check_bottom');

  // Bounce up!
  asm.ldA(0xFE); // -2 speed
  asm.ldhTo(0x84);
  asm.jr('write_oam');

  asm.label('check_bottom');
  asm.ldhFrom(0x82);
  asm.cpA(150);
  asm.jrC('write_oam');
  // Respawn ball at center
  asm.ldA(80);   asm.ldhTo(0x81);
  asm.ldA(88);   asm.ldhTo(0x82);
  asm.ldA(0xFF); asm.ldhTo(0x84);

  // --- Write OAM Sprites (Ball = Sprite 0, Paddle = Sprites 1, 2, 3) ---
  asm.label('write_oam');
  asm.ldHL(0xFE00);
  // Sprite 0: Ball
  asm.ldhFrom(0x82); asm.ldHLI_A(); // Y
  asm.ldhFrom(0x81); asm.ldHLI_A(); // X
  asm.ldA(4);        asm.ldHLI_A(); // Tile 4 (Ball)
  asm.xorA();        asm.ldHLI_A(); // Attr 0

  // Sprite 1..3: Paddle (3 tiles wide = 24px, Y = 136)
  for (let i = 0; i < 3; i++) {
    asm.ldA(136);      asm.ldHLI_A(); // Y
    asm.ldhFrom(0x80);
    if (i > 0) asm.addA(i * 8);
    asm.ldHLI_A();                    // X
    asm.ldA(5);        asm.ldHLI_A(); // Tile 5 (Paddle segment)
    asm.xorA();        asm.ldHLI_A(); // Attr 0
  }

  // Wait until LY leaves 144 so we run once per frame
  asm.label('wait_ly_next');
  asm.ldhFrom(0x44);
  asm.cpA(145);
  asm.jrZ(' main_loop_end');
  asm.label(' main_loop_end');
  asm.jp('main_loop');

  emitReadJoypad(asm);
  emitWaitVBlank(asm);

  // 8 Tiles (16 bytes each = 128 bytes)
  asm.label('tile_data');
  // Tile 0: Empty (lightest shade)
  for (let i = 0; i < 16; i++) asm.b(0x00);
  // Tile 1: Solid Wall Block (checkered dark border)
  asm.b(0xFF,0xFF, 0x81,0xFF, 0xBD,0xC3, 0xBD,0xC3, 0xBD,0xC3, 0xBD,0xC3, 0x81,0xFF, 0xFF,0xFF);
  // Tile 2: Brick A (Light bevel brick)
  asm.b(0xFF,0xFF, 0x80,0xFF, 0xFE,0x81, 0xFE,0x81, 0xFE,0x81, 0xFE,0x81, 0x80,0xFF, 0xFF,0xFF);
  // Tile 3: Brick B (Dark bevel brick)
  asm.b(0xFF,0xFF, 0xFF,0x81, 0xFF,0xBD, 0xFF,0xBD, 0xFF,0xBD, 0xFF,0xBD, 0xFF,0x81, 0xFF,0xFF);
  // Tile 4: Ball Sprite (8x8 rounded sphere)
  asm.b(0x3C,0x3C, 0x7E,0x42, 0xFF,0x99, 0xFF,0x99, 0xFF,0xFF, 0xFF,0xFF, 0x7E,0x7E, 0x3C,0x3C);
  // Tile 5: Paddle Sprite (8x8 metallic bar)
  asm.b(0xFF,0xFF, 0x00,0xFF, 0xFF,0x00, 0xFF,0x00, 0xFF,0xFF, 0x00,0x00, 0x00,0x00, 0x00,0x00);
  // Tile 6: Star / Dot
  asm.b(0x00,0x00, 0x18,0x00, 0x3C,0x18, 0x18,0x00, 0x00,0x00, 0x00,0x00, 0x00,0x00, 0x00,0x00);
  // Tile 7: Heart
  asm.b(0x66,0x66, 0xFF,0x99, 0xFF,0x81, 0xFF,0xFF, 0x7E,0x7E, 0x3C,0x3C, 0x18,0x18, 0x00,0x00);

  return asm.resolve();
}

// =============================================================================
// ROM 2: ASTRO BLASTER (Vertical Scrolling Space Shoot-'Em-Up for DMG-01)
// =============================================================================
function buildAstroBlasterRom() {
  const rom = createRomBuffer('ASTRO BLASTER');
  const asm = new GBAsm(rom, 0x0150);

  asm.di();
  asm.ldSP(0xFFFE);
  asm.call('wait_vblank');
  asm.xorA();
  asm.ldhTo(0x40); // LCDC off

  // Copy 8 tiles to 0x8000
  asm.ldDE_label('tile_data');
  asm.ldHL(0x8000);
  asm.ldB(128);
  asm.label('copy_tiles');
  asm.ldA_DE();
  asm.ldHLI_A();
  asm.incDE();
  asm.decB();
  asm.jrNZ('copy_tiles');

  // Fill BG starfield pattern in 0x9800..0x9BFF
  asm.ldHL(0x9800);
  asm.ldBC(1024);
  asm.label('fill_stars');
  asm.ldA_C();
  asm.andA(0x1F);
  asm.jrNZ('star_empty');
  asm.ldA(1); // Star tile
  asm.jr('write_star');
  asm.label('star_empty');
  asm.xorA();
  asm.label('write_star');
  asm.ldHLI_A();
  asm.decBC();
  asm.ldA_B();
  asm.orC();
  asm.jrNZ('fill_stars');

  // Clear OAM
  asm.ldHL(0xFE00);
  asm.ldB(160);
  asm.label('clear_oam');
  asm.xorA();
  asm.ldHLI_A();
  asm.decB();
  asm.jrNZ('clear_oam');

  // HRAM State:
  // $FF80 = shipX (80)
  // $FF81 = shipY (128)
  // $FF82 = laserX (80)
  // $FF83 = laserY (0 = inactive)
  // $FF84 = alien1X (40), $FF85 = alien1Y (24)
  // $FF86 = alien2X (110), $FF87 = alien2Y (48)
  // $FF88 = scrollY (0)
  asm.ldA(80);  asm.ldhTo(0x80);
  asm.ldA(128); asm.ldhTo(0x81);
  asm.xorA();   asm.ldhTo(0x82);
  asm.xorA();   asm.ldhTo(0x83);
  asm.ldA(44);  asm.ldhTo(0x84);
  asm.ldA(24);  asm.ldhTo(0x85);
  asm.ldA(116); asm.ldhTo(0x86);
  asm.ldA(56);  asm.ldhTo(0x87);
  asm.xorA();   asm.ldhTo(0x88);

  asm.ldA(0xE4); asm.ldhTo(0x47);
  asm.ldA(0xE4); asm.ldhTo(0x48);
  asm.ldA(0xD2); asm.ldhTo(0x49);
  asm.ldA(0x93); asm.ldhTo(0x40);

  asm.label('main_loop');
  asm.call('wait_vblank');
  asm.call('read_joypad');

  // Scroll starfield (SCY--)
  asm.ldhFrom(0x88);
  asm.decA();
  asm.ldhTo(0x88);
  asm.ldhTo(0x42); // SCY

  // Ship Left/Right/Up/Down
  asm.bit(5, 0);
  asm.jrZ('chk_r');
  asm.ldhFrom(0x80); asm.subA(2); asm.cpA(12); asm.jrNC('sv_l'); asm.ldA(12);
  asm.label('sv_l'); asm.ldhTo(0x80);
  asm.label('chk_r');
  asm.bit(4, 0);
  asm.jrZ('chk_fire');
  asm.ldhFrom(0x80); asm.addA(2); asm.cpA(152); asm.jrC('sv_r'); asm.ldA(152);
  asm.label('sv_r'); asm.ldhTo(0x80);

  // Fire Laser with A or B (bits 0 or 1)
  asm.label('chk_fire');
  asm.ldA_B();
  asm.andA(0x03);
  asm.jrZ('upd_laser');
  asm.ldhFrom(0x83);
  asm.andA(0xFF);
  asm.jrNZ('upd_laser');
  asm.ldhFrom(0x80); asm.ldhTo(0x82); // laserX = shipX
  asm.ldhFrom(0x81); asm.subA(6); asm.ldhTo(0x83); // laserY = shipY - 6

  // Update Laser
  asm.label('upd_laser');
  asm.ldhFrom(0x83);
  asm.andA(0xFF);
  asm.jrZ('upd_aliens');
  asm.subA(4);
  asm.cpA(16);
  asm.jrNC('sv_laser');
  asm.xorA();
  asm.label('sv_laser');
  asm.ldhTo(0x83);

  // Update Aliens
  asm.label('upd_aliens');
  asm.ldhFrom(0x85); asm.incA(); asm.cpA(156); asm.jrC('sv_a1'); asm.ldA(16);
  asm.label('sv_a1'); asm.ldhTo(0x85);

  asm.ldhFrom(0x87); asm.incA(); asm.incA(); asm.cpA(156); asm.jrC('sv_a2'); asm.ldA(16);
  asm.label('sv_a2'); asm.ldhTo(0x87);

  // Check Laser vs Alien 1
  asm.ldhFrom(0x83);
  asm.andA(0xFF);
  asm.jrZ('write_oam');
  asm.ldhFrom(0x85); asm.ldC_A();
  asm.ldhFrom(0x83); asm.subA(0); // compare Y
  asm.subA_B(); // simple proximity check on X/Y:
  // Check |laserX - alien1X| < 10 && |laserY - alien1Y| < 10
  asm.ldhFrom(0x84); asm.subA(8); asm.ldC_A();
  asm.ldhFrom(0x82); asm.cpC(); asm.jrC('chk_hit2');
  asm.ldhFrom(0x84); asm.addA(8); asm.ldC_A();
  asm.ldhFrom(0x82); asm.cpC(); asm.jrNC('chk_hit2');
  asm.ldhFrom(0x85); asm.subA(8); asm.ldC_A();
  asm.ldhFrom(0x83); asm.cpC(); asm.jrC('chk_hit2');
  asm.ldhFrom(0x85); asm.addA(8); asm.ldC_A();
  asm.ldhFrom(0x83); asm.cpC(); asm.jrNC('chk_hit2');
  // Hit Alien 1!
  asm.ldA(16); asm.ldhTo(0x85);
  asm.ldhFrom(0x84); asm.addA(37); asm.andA(0x7F); asm.addA(20); asm.ldhTo(0x84);
  asm.xorA(); asm.ldhTo(0x83);

  asm.label('chk_hit2');
  asm.ldhFrom(0x86); asm.subA(8); asm.ldC_A();
  asm.ldhFrom(0x82); asm.cpC(); asm.jrC('write_oam');
  asm.ldhFrom(0x86); asm.addA(8); asm.ldC_A();
  asm.ldhFrom(0x82); asm.cpC(); asm.jrNC('write_oam');
  asm.ldhFrom(0x87); asm.subA(8); asm.ldC_A();
  asm.ldhFrom(0x83); asm.cpC(); asm.jrC('write_oam');
  asm.ldhFrom(0x87); asm.addA(8); asm.ldC_A();
  asm.ldhFrom(0x83); asm.cpC(); asm.jrNC('write_oam');
  // Hit Alien 2!
  asm.ldA(16); asm.ldhTo(0x87);
  asm.ldhFrom(0x86); asm.addA(53); asm.andA(0x7F); asm.addA(20); asm.ldhTo(0x86);
  asm.xorA(); asm.ldhTo(0x83);

  // Write OAM
  asm.label('write_oam');
  asm.ldHL(0xFE00);
  // Sprite 0: Player Starfighter
  asm.ldhFrom(0x81); asm.ldHLI_A();
  asm.ldhFrom(0x80); asm.ldHLI_A();
  asm.ldA(2);        asm.ldHLI_A();
  asm.xorA();        asm.ldHLI_A();

  // Sprite 1: Laser Bolt
  asm.ldhFrom(0x83); asm.ldHLI_A();
  asm.ldhFrom(0x82); asm.ldHLI_A();
  asm.ldA(3);        asm.ldHLI_A();
  asm.xorA();        asm.ldHLI_A();

  // Sprite 2: Alien 1
  asm.ldhFrom(0x85); asm.ldHLI_A();
  asm.ldhFrom(0x84); asm.ldHLI_A();
  asm.ldA(4);        asm.ldHLI_A();
  asm.xorA();        asm.ldHLI_A();

  // Sprite 3: Alien 2
  asm.ldhFrom(0x87); asm.ldHLI_A();
  asm.ldhFrom(0x86); asm.ldHLI_A();
  asm.ldA(4);        asm.ldHLI_A();
  asm.xorA();        asm.ldHLI_A();

  asm.jp('main_loop');

  emitReadJoypad(asm);
  emitWaitVBlank(asm);

  asm.label('tile_data');
  // Tile 0: Empty space
  for (let i = 0; i < 16; i++) asm.b(0x00);
  // Tile 1: Star dot
  asm.b(0x00,0x00, 0x00,0x00, 0x18,0x00, 0x3C,0x18, 0x18,0x00, 0x00,0x00, 0x00,0x00, 0x00,0x00);
  // Tile 2: Player Ship (Starfighter)
  asm.b(0x18,0x18, 0x3C,0x24, 0x3C,0x24, 0x7E,0x5A, 0xFF,0xDB, 0xFF,0xFF, 0xBD,0xBD, 0x24,0x24);
  // Tile 3: Laser Beam
  asm.b(0x18,0x18, 0x18,0x18, 0x18,0x18, 0x18,0x18, 0x18,0x18, 0x18,0x18, 0x00,0x00, 0x00,0x00);
  // Tile 4: Alien Invader
  asm.b(0x3C,0x3C, 0x7E,0x7E, 0xDB,0xFF, 0xFF,0xFF, 0x7E,0x7E, 0x5A,0x5A, 0x81,0x81, 0x42,0x42);
  for (let i = 0; i < 48; i++) asm.b(0x00);

  return asm.resolve();
}

const romsDir = path.join(__dirname, '..', 'roms');
fs.mkdirSync(romsDir, { recursive: true });
fs.writeFileSync(path.join(romsDir, 'brick-breaker.gb'), buildBrickBreakerRom());
fs.writeFileSync(path.join(romsDir, 'astro-blaster.gb'), buildAstroBlasterRom());
console.log('Generated sample .gb ROMs in roms/:', fs.readdirSync(romsDir));
