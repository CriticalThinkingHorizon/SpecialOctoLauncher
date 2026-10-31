# Native S2 Audio Playback & Sound Synthesis (`nn::audio`)

This document details the reverse engineering, native symbol resolution, host bridge architecture, procedural audio synthesis engine, and GLSL SDK bindings for hardware audio playback on S2.

---

## 1. Architectural Overview

The S2 operating system provides high-performance, low-latency audio hardware playback via the **`nn::audio`** subsystem in `sdk.nso`. The audio pipeline drives native 48,000 Hz, 16-bit signed integer Little-Endian stereo PCM output to the console's integrated stereo speakers or 3.5mm headphone jack.

```
+-------------------------------------------------------------------------------+
| S2 Console Display & Controls (Vulkan 1.4 Overlay)                            |
|                                                                               |
|  +------------------------+          +-------------------------------------+  |
|  | GPU Compute Shader     |  Mailbox | S2 Host Runtime / Audio Service     |  |
|  | apps/audio-lab         | -------->| sdk/host/audio.cjs & runtime.cjs    |  |
|  | (app.comp / app.frag)  | (OP = 12)|                                     |  |
|  +------------------------+          +------------------+------------------+  |
+---------------------------------------------------------|---------------------+
                                                          │
                                                          v
                                        +--------------------------------------+
                                        | Native Client Dispatcher             |
                                        | (ARM64 Machine Code Dispatch)        |
                                        +-----------------+--------------------+
                                                          │
                                                          v
                                        +--------------------------------------+
                                        | SDK Module: nn::audio                |
                                        | - InitializeAudioOutParameter        |
                                        | - OpenDefaultAudioOut                |
                                        | - StartAudioOut                      |
                                        | - SetAudioOutBufferInfo              |
                                        | - AppendAudioOutBuffer               |
                                        | - GetReleasedAudioOutBuffer          |
                                        | - SetAudioOutVolume                  |
                                        +-----------------+--------------------+
                                                          │
                                                          v
                                        +--------------------------------------+
                                        | S2 Hardware Audio Output Endpoint    |
                                        | (48 kHz Stereo Speakers / Headphones)|
                                        +--------------------------------------+
```

---

## 2. Native Symbols & Memory Layout

Dynamic inspection of `sdk.nso` confirms the following official entry points:

| Native S2 Symbol | Offset | Size | Purpose |
| :--- | :--- | :--- | :--- |
| `_ZN2nn5audio27InitializeAudioOutParameterEPNS0_17AudioOutParameterE` | `+1867568` | 12 B | Initializes audio parameter struct (48 kHz, Stereo) |
| `_ZN2nn5audio19OpenDefaultAudioOutEPNS0_8AudioOutERKNS0_17AudioOutParameterE` | `+1969792` | 16 B | Opens default hardware audio output device |
| `_ZN2nn5audio13StartAudioOutEPNS0_8AudioOutE` | `+1971232` | 128 B | Starts hardware audio output playback stream |
| `_ZN2nn5audio12StopAudioOutEPNS0_8AudioOutE` | `+1971360` | 128 B | Pauses/stops audio playback stream |
| `_ZN2nn5audio13CloseAudioOutEPNS0_8AudioOutE` | `+1970944` | 284 B | Releases hardware audio output device |
| `_ZN2nn5audio21SetAudioOutBufferInfoEPNS0_14AudioOutBufferEPvmm` | `+1867584` | 12 B | Binds PCM samples to an `AudioOutBuffer` structure |
| `_ZN2nn5audio20AppendAudioOutBufferEPNS0_8AudioOutEPNS0_14AudioOutBufferE` | `+1971776` | 200 B | Queues buffer for hardware DMA audio output |
| `_ZN2nn5audio25GetReleasedAudioOutBufferEPNS0_8AudioOutE` | `+1971984` | 164 B | Retrieves completed/released playback buffer |
| `_ZN2nn5audio17SetAudioOutVolumeEPNS0_8AudioOutEf` | `+1972832` | 172 B | Adjusts master hardware volume gain (`0.0` - `1.0`) |
| `_ZN2nn5audio28GetAudioOutPlayedSampleCountEPKNS0_8AudioOutE` | `+1972496` | 164 B | Queries cumulative played sample count |

### Scratch Memory Allocation (128 KiB Buffer)

The native audio client allocates a 128 KiB coherent buffer partitioned as follows:

- **`0x0000` (512 B)**: `AudioOut` state descriptor.
- **`0x0200` (64 B)**: `AudioOutParameter` (48,000 Hz sample rate, 2 channels).
- **`0x0400` (160 B)**: Array of 4 $\times$ 40-byte `AudioOutBuffer` queue descriptors.
- **`0x1000` (124 KiB)**: PCM sample pool (double/quad-buffered sample staging blocks).

---

## 3. Procedural Audio Synthesis Engine (`AudioSynth`)

The host service includes an on-demand procedural audio synthesizer that computes mathematically pure 16-bit signed PCM frames:

### 3.1 Waveform Generator
- **Sine**: Clean fundamental harmonic ($\sin(2\pi f t)$).
- **Square**: Authentic 8-bit pulse wave ($50\%$ duty cycle).
- **Triangle**: Warm melodic lead with linear slope.
- **Sawtooth**: Rich buzzy harmonic series.
- **White Noise**: Filtered random acoustic noise for percussion & explosions.

### 3.2 Retro Sound Effects Library
1. **Coin Chime** (`SFX 0`): Two-tone ascending chime (B5 $987\text{ Hz} \rightarrow$ E6 $1319\text{ Hz}$).
2. **Laser Blaster** (`SFX 1`): Exponential frequency sweep ($880\text{ Hz} \rightarrow 110\text{ Hz}$).
3. **Jump** (`SFX 2`): Rising chirped frequency envelope ($140\text{ Hz} \rightarrow 580\text{ Hz}$).
4. **Explosion** (`SFX 3`): Band-limited low-pass noise rumble paired with Joy-Con HD Rumble haptics.
5. **Powerup Fanfare** (`SFX 4`): Arpeggiated C-E-G-C major triad progression.
6. **Damage / Hit** (`SFX 5`): Low square punch ($120\text{ Hz} \rightarrow 40\text{ Hz}$) with noise tail.
7. **1-Up Jingle** (`SFX 6`): Retro 6-note victory sequence (E5, G5, E6, C6, D6, G6).
8. **Beep Ping** (`SFX 7`): High-precision 1,000 Hz acoustic marker.

---

## 4. GLSL SDK Interface (`sdk/include/hb.glsl`)

Applications access audio playback through the mailbox protocol (`OP.audio = 12`).

```glsl
// --- nn::audio Response Accessors ---
uint nnAudioGetResult();
uint nnAudioGetPlayedCount();
uint nnAudioGetVolume();
int  nnAudioGetWaveSample(uint index);

// --- nn::audio Request Primitives ---
// Query hardware audio state and fetch live preview samples
bool nnAudioQueryStatus();
bool hbAudioQuery();

// Trigger playback of a built-in sound effect (0..7)
bool nnAudioPlaySfx(uint sfxId, uint volumePercent);
bool hbAudioSfx(uint sfxId);

// Play a synthesized waveform tone (waveType: 0=Sine, 1=Square, 2=Triangle, 3=Saw, 4=Noise)
bool nnAudioPlayTone(uint waveType, uint freqHz, uint durationMs);
bool hbAudioTone(uint waveType, uint freqHz, uint durationMs);

// Set master hardware volume (0% to 100%)
bool nnAudioSetVolume(uint volumePercent);
bool hbAudioVolume(uint volumePercent);

// Stop/flush active audio playback
bool nnAudioStop();
bool hbAudioStopPlayback();
```

---

## 5. Proof of Concept Application (`apps/audio-lab`)

The included **`audio-lab`** application provides an interactive test bench:

- **Tektronix CRT Oscilloscope**: Renders a live P31 green phosphor cathode tube screen with calibrated grid lines and dynamic waveform beam intensity.
- **Dual VU Meters**: Displays real-time audio output volume and channel balance.
- **Soundboard Mode**: Quick Joy-Con button bindings (`A`, `B`, `X`, `Y`, `L`, `R`) for instantaneous sound effects.
- **Synth Mode (`+` PLUS)**: Live piano scale ($C_4$ through $C_5$), adjustable frequency, duration tuning, and waveform switching.
- **Haptic Pairing**: Synchronizes Joy-Con HD Rumble vibration with audio peak envelopes.
- **Universal Exit**: Pressing **`-` (MINUS)** cleanly returns to the Homebrew Launcher.
