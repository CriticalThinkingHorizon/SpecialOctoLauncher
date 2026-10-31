// S2 Native Audio Output & Sound Synthesis Service (nn::audio)
// Directly drives hardware audio output (48,000 Hz, Stereo 16-bit PCM) on S2
// using 64 KiB page-aligned audio memory and native ARM64 IPC dispatch.

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BYTES_PER_FRAME = CHANNELS * 2; // 16-bit stereo = 4 bytes per frame

// Buffer layout matching the native Horizon OS audio allocator:
// - Descriptors at base + 0x400 + i * 0x40
// - 8 audio sample buffers of 131,072 bytes (128 KiB) each, starting at base + 65,536
const BUFFER_CAPACITY = 131072; // 128 KiB per buffer
const NUM_BUFFERS = 8;
const TOTAL_ALLOC_BYTES = 65536 + NUM_BUFFERS * BUFFER_CAPACITY; // 1,114,112 bytes (~1.06 MiB)

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Procedural Waveform & SFX Synthesizer (generates 16-bit signed PCM, 48 kHz stereo)
class AudioSynth {
  static writeFrame(buf, frameIdx, leftSample, rightSample) {
    const offset = frameIdx * 4;
    if (offset + 3 >= buf.length) return;
    const lInt = clamp(Math.round(leftSample * 32767), -32768, 32767);
    const rInt = clamp(Math.round(rightSample * 32767), -32768, 32767);
    buf.writeInt16LE(lInt, offset);
    buf.writeInt16LE(rInt, offset + 2);
  }

  static synthTone(waveType, freqHz, durationMs, volume = 0.8) {
    const frameCount = Math.floor((durationMs / 1000) * SAMPLE_RATE);
    const buf = Buffer.alloc(frameCount * BYTES_PER_FRAME);
    const attackFrames = Math.min(frameCount / 4, Math.floor(0.01 * SAMPLE_RATE)); // 10ms attack
    const releaseFrames = Math.min(frameCount / 4, Math.floor(0.02 * SAMPLE_RATE)); // 20ms release

    let phase = 0.0;
    const phaseInc = (2.0 * Math.PI * freqHz) / SAMPLE_RATE;

    for (let i = 0; i < frameCount; i++) {
      let env = 1.0;
      if (i < attackFrames) env = i / attackFrames;
      else if (i > frameCount - releaseFrames) env = (frameCount - i) / releaseFrames;

      let val = 0.0;
      switch (waveType) {
        case 0: // Sine
          val = Math.sin(phase);
          break;
        case 1: // Square (50% pulse)
          val = Math.sin(phase) >= 0.0 ? 1.0 : -1.0;
          break;
        case 2: // Triangle
          val = (2.0 / Math.PI) * Math.asin(Math.sin(phase));
          break;
        case 3: // Sawtooth
          val = (2.0 * (phase / (2.0 * Math.PI) - Math.floor(phase / (2.0 * Math.PI) + 0.5)));
          break;
        case 4: // White Noise
          val = Math.random() * 2.0 - 1.0;
          break;
        default:
          val = Math.sin(phase);
      }

      val *= volume * env;
      this.writeFrame(buf, i, val, val);
      phase += phaseInc;
      if (phase >= 2.0 * Math.PI) phase -= 2.0 * Math.PI;
    }
    return buf;
  }

  static synthSfx(sfxId, volume = 0.85) {
    switch (sfxId) {
      case 0: // Coin (Two-tone chime: 987 Hz -> 1319 Hz)
        return this.synthCoin(volume);
      case 1: // Laser (Exponential down sweep: 880 Hz -> 110 Hz)
        return this.synthLaser(volume);
      case 2: // Jump (Rising chirp: 140 Hz -> 580 Hz)
        return this.synthJump(volume);
      case 3: // Explosion (Filtered rumble noise)
        return this.synthExplosion(volume);
      case 4: // Powerup (C-E-G-C major chord arpeggio)
        return this.synthPowerup(volume);
      case 5: // Hit / Damage (Punch + noise)
        return this.synthHit(volume);
      case 6: // 1-Up (Victory jingle: E5, G5, E6, C6, D6, G6)
        return this.synthOneUp(volume);
      case 7: // Beep (Short 1000 Hz UI ping)
      default:
        return this.synthTone(0, 1000, 75, volume);
    }
  }

  static synthCoin(volume) {
    const dur1 = 70, dur2 = 250;
    const frames1 = Math.floor((dur1 / 1000) * SAMPLE_RATE);
    const frames2 = Math.floor((dur2 / 1000) * SAMPLE_RATE);
    const totalFrames = frames1 + frames2;
    const buf = Buffer.alloc(totalFrames * BYTES_PER_FRAME);

    let phase = 0;
    const inc1 = (2 * Math.PI * 987.77) / SAMPLE_RATE; // B5
    const inc2 = (2 * Math.PI * 1318.51) / SAMPLE_RATE; // E6

    for (let i = 0; i < totalFrames; i++) {
      let val = 0;
      if (i < frames1) {
        val = (Math.sin(phase) >= 0 ? 0.7 : -0.7);
        phase += inc1;
      } else {
        const t2 = (i - frames1) / frames2;
        const env = Math.exp(-t2 * 4.5);
        val = (Math.sin(phase) >= 0 ? 0.8 : -0.8) * env;
        phase += inc2;
      }
      val *= volume;
      this.writeFrame(buf, i, val, val);
    }
    return buf;
  }

  static synthLaser(volume) {
    const durMs = 150;
    const totalFrames = Math.floor((durMs / 1000) * SAMPLE_RATE);
    const buf = Buffer.alloc(totalFrames * BYTES_PER_FRAME);

    let phase = 0;
    for (let i = 0; i < totalFrames; i++) {
      const t = i / totalFrames;
      const freq = 880 * Math.exp(-t * 2.5); // 880 down to ~72 Hz
      const inc = (2 * Math.PI * freq) / SAMPLE_RATE;
      const env = 1.0 - t * 0.9;
      const saw = 2.0 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
      const val = saw * env * volume;
      this.writeFrame(buf, i, val, val);
      phase += inc;
      if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
    }
    return buf;
  }

  static synthJump(volume) {
    const durMs = 160;
    const totalFrames = Math.floor((durMs / 1000) * SAMPLE_RATE);
    const buf = Buffer.alloc(totalFrames * BYTES_PER_FRAME);

    let phase = 0;
    for (let i = 0; i < totalFrames; i++) {
      const t = i / totalFrames;
      const freq = 140 + 440 * Math.pow(t, 0.7); // 140 up to 580 Hz
      const inc = (2 * Math.PI * freq) / SAMPLE_RATE;
      const env = (1.0 - t) * (t < 0.1 ? t / 0.1 : 1.0);
      const square = Math.sin(phase) >= 0 ? 1.0 : -1.0;
      const val = square * env * volume * 0.75;
      this.writeFrame(buf, i, val, val);
      phase += inc;
      if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
    }
    return buf;
  }

  static synthExplosion(volume) {
    const durMs = 450;
    const totalFrames = Math.floor((durMs / 1000) * SAMPLE_RATE);
    const buf = Buffer.alloc(totalFrames * BYTES_PER_FRAME);

    let lastNoise = 0;
    for (let i = 0; i < totalFrames; i++) {
      const t = i / totalFrames;
      const env = Math.exp(-t * 4.0);
      const white = Math.random() * 2.0 - 1.0;
      lastNoise = lastNoise * 0.88 + white * 0.12;
      const val = lastNoise * env * volume * 1.4;
      this.writeFrame(buf, i, val, val);
    }
    return buf;
  }

  static synthPowerup(volume) {
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const noteFrames = Math.floor(0.065 * SAMPLE_RATE);
    const totalFrames = noteFrames * notes.length;
    const buf = Buffer.alloc(totalFrames * BYTES_PER_FRAME);

    let phase = 0;
    for (let n = 0; n < notes.length; n++) {
      const freq = notes[n];
      const inc = (2 * Math.PI * freq) / SAMPLE_RATE;
      for (let i = 0; i < noteFrames; i++) {
        const frameIdx = n * noteFrames + i;
        const env = 1.0 - (i / noteFrames) * 0.25;
        const square = Math.sin(phase) >= 0 ? 0.8 : -0.8;
        const val = square * env * volume;
        this.writeFrame(buf, frameIdx, val, val);
        phase += inc;
        if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
      }
    }
    return buf;
  }

  static synthHit(volume) {
    const durMs = 140;
    const totalFrames = Math.floor((durMs / 1000) * SAMPLE_RATE);
    const buf = Buffer.alloc(totalFrames * BYTES_PER_FRAME);

    let phase = 0;
    let lastNoise = 0;
    for (let i = 0; i < totalFrames; i++) {
      const t = i / totalFrames;
      const freq = 120 * Math.exp(-t * 3.0);
      const inc = (2 * Math.PI * freq) / SAMPLE_RATE;
      const env = Math.exp(-t * 5.0);
      const square = Math.sin(phase) >= 0 ? 0.7 : -0.7;
      const white = Math.random() * 2.0 - 1.0;
      lastNoise = lastNoise * 0.7 + white * 0.3;
      const val = (square * 0.6 + lastNoise * 0.4) * env * volume;
      this.writeFrame(buf, i, val, val);
      phase += inc;
      if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
    }
    return buf;
  }

  static synthOneUp(volume) {
    const freqs = [659.25, 783.99, 1318.51, 1046.50, 1174.66, 1567.98];
    const noteFrames = Math.floor(0.065 * SAMPLE_RATE);
    const totalFrames = noteFrames * freqs.length;
    const buf = Buffer.alloc(totalFrames * BYTES_PER_FRAME);

    let phase = 0;
    for (let n = 0; n < freqs.length; n++) {
      const inc = (2 * Math.PI * freqs[n]) / SAMPLE_RATE;
      for (let i = 0; i < noteFrames; i++) {
        const frameIdx = n * noteFrames + i;
        const env = 1.0 - (i / noteFrames) * 0.2;
        const val = (Math.sin(phase) >= 0 ? 0.75 : -0.75) * env * volume;
        this.writeFrame(buf, frameIdx, val, val);
        phase += inc;
        if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
      }
    }
    return buf;
  }
}

async function create(rpc) {
  const sdk = rpc.a.sdk;
  const audioSymbols = require('../../inspection/audio-symbols.json');

  // Helper to find symbol by substring
  function findSym(part) {
    return audioSymbols.find(s => s.name.includes(part));
  }

  const symInitParam = findSym('InitializeAudioOutParameter') || { offset: 1867568, size: 12, name: 'InitializeAudioOutParameter' };
  // The 2-argument overload: OpenDefaultAudioOut(AudioOut*, const AudioOutParameter&)
  const symOpenAudio = audioSymbols.find(s => s.name.includes('OpenDefaultAudioOutEPNS0_8AudioOutER')) ||
                       audioSymbols.find(s => s.name.includes('OpenDefaultAudioOut') && s.size === 16) ||
                       { offset: 1969792, size: 16, name: 'OpenDefaultAudioOut' };
  const symStartAudio = findSym('StartAudioOut') || { offset: 1971232, size: 128, name: 'StartAudioOut' };
  const symStopAudio = findSym('StopAudioOut') || { offset: 1971360, size: 128, name: 'StopAudioOut' };
  const symCloseAudio = findSym('CloseAudioOut') || { offset: 1970944, size: 284, name: 'CloseAudioOut' };
  const symSetBufInfo = findSym('SetAudioOutBufferInfo') || { offset: 1867584, size: 12, name: 'SetAudioOutBufferInfo' };
  const symAppendBuf = findSym('AppendAudioOutBuffer') || { offset: 1971776, size: 200, name: 'AppendAudioOutBuffer' };
  const symReleaseBuf = findSym('GetReleasedAudioOutBuffer') || { offset: 1971984, size: 164, name: 'GetReleasedAudioOutBuffer' };
  const symSetVolume = findSym('SetAudioOutVolume') || { offset: 1972832, size: 172, name: 'SetAudioOutVolume' };
  const symFlushBuf = findSym('FlushAudioOutBuffers') || { offset: 1972672, size: 160, name: 'FlushAudioOutBuffers' };
  const symGetRate = findSym('GetAudioOutSampleRate') || { offset: 1971728, size: 8, name: 'GetAudioOutSampleRate' };
  const symGetChannels = findSym('GetAudioOutChannelCount') || { offset: 1971744, size: 8, name: 'GetAudioOutChannelCount' };
  const symGetPlayed = findSym('GetAudioOutPlayedSampleCount') || { offset: 1972496, size: 164, name: 'GetAudioOutPlayedSampleCount' };
  const symGetState = findSym('GetAudioOutState') || { offset: 1971488, size: 224, name: 'GetAudioOutState' };

  // Print full inspection table with offsets and addresses
  console.log('\n========================================================================');
  console.log('[AUDIO INSPECT] Resolved nn::audio Subsystem Symbols & Offsets:');
  console.log(`  SDK Module Base: 0x${sdk.toString(16)}`);
  const symList = [
    ['InitializeAudioOutParameter', symInitParam],
    ['OpenDefaultAudioOut', symOpenAudio],
    ['StartAudioOut', symStartAudio],
    ['StopAudioOut', symStopAudio],
    ['CloseAudioOut', symCloseAudio],
    ['SetAudioOutBufferInfo', symSetBufInfo],
    ['AppendAudioOutBuffer', symAppendBuf],
    ['GetReleasedAudioOutBuffer', symReleaseBuf],
    ['FlushAudioOutBuffers', symFlushBuf],
    ['SetAudioOutVolume', symSetVolume],
    ['GetAudioOutSampleRate', symGetRate],
    ['GetAudioOutChannelCount', symGetChannels],
    ['GetAudioOutPlayedSampleCount', symGetPlayed],
    ['GetAudioOutState', symGetState]
  ];

  for (const [label, s] of symList) {
    const addr = sdk + s.offset;
    console.log(`  - ${label.padEnd(28)}: offset +${s.offset.toString().padEnd(8)} (0x${s.offset.toString(16).toUpperCase().padStart(6, '0')}) -> 0x${addr.toString(16)} (size ${s.size} B)`);
  }
  console.log('========================================================================\n');

  // Helper to verify and call function by address
  const fnAddresses = {};
  async function call(name, ...args) {
    if (!fnAddresses[name]) {
      const entry = symList.find(x => x[0] === name);
      if (!entry) throw Error(`Unknown audio symbol: ${name}`);
      const s = entry[1];
      const address = sdk + s.offset;
      const readLen = Math.min(32, s.size || 16);
      const hex = (await rpc.read(address, readLen)).toString('hex');
      await rpc.request({ command: 'verify-function', address, hex });
      fnAddresses[name] = address;
    }
    return (await rpc.callAddress(fnAddresses[name], args)).result;
  }

  // 1. Allocate 64 KiB page-aligned audio buffer block using function 5732112
  console.log(`[AUDIO HOST] Allocating ${TOTAL_ALLOC_BYTES} bytes of 64 KiB-aligned audio memory...`);
  const allocRes = await rpc.call(5732112, [rpc.output, 65536, TOTAL_ALLOC_BYTES]);
  if (allocRes.result !== 0n) throw Error('Audio 64K-aligned memory allocation failed');
  const base = Number(allocRes.output.readBigUInt64LE());
  if (!Number.isSafeInteger(base) || base <= 0 || base % 65536 !== 0) {
    throw Error(`Invalid audio base allocation: 0x${base.toString(16)}`);
  }
  console.log(`[AUDIO HOST] Audio memory allocated at: 0x${base.toString(16)} (aligned to 65536)`);

  // Clear header region
  await rpc.write(base, Buffer.alloc(65536));

  const audio = base; // AudioOut instance at base
  const param = base + 0x300; // AudioOutParameter at base + 0x300

  // Descriptors: 4 descriptors at base + 0x400 + i * 0x40 (64 bytes stride)
  const descriptorAddresses = Array.from({ length: NUM_BUFFERS }, (_, i) => base + 0x400 + i * 0x40);
  const freeDescriptors = new Set(descriptorAddresses);

  // Buffer slots: 4 slots of 131,072 bytes each at base + 65536 + i * 131072
  const slotAddresses = Array.from({ length: NUM_BUFFERS }, (_, i) => base + 65536 + i * BUFFER_CAPACITY);

  // Map descriptor to slot index
  const descToSlot = new Map();
  descriptorAddresses.forEach((desc, i) => descToSlot.set(desc, i));

  let isInitialized = false;
  let isStarted = false;
  let currentVolume = 1.0;
  let lastPcmPreview = Buffer.alloc(128); // 32 sample frames for oscilloscope

  // Periodic harvester to reap finished buffers in background
  const harvestTimer = setInterval(() => {
    if (isInitialized && freeDescriptors.size < NUM_BUFFERS) {
      releaseFinishedBuffers().catch(() => {});
    }
  }, 50);

  async function ensureInitialized() {
    if (isInitialized) return;

    // 2. Initialize AudioOutParameter (48000 Hz, 2 channels)
    console.log('[AUDIO HOST] Initializing AudioOutParameter (48000 Hz, 2 channels)...');
    await call('InitializeAudioOutParameter', param);
    const pBuf = await rpc.read(param, 8);
    pBuf.writeUInt32LE(SAMPLE_RATE, 0);
    pBuf.writeUInt16LE(CHANNELS, 4);
    await rpc.write(param, pBuf);

    // 3. OpenDefaultAudioOut(audio, param)
    console.log('[AUDIO HOST] Calling OpenDefaultAudioOut...');
    const openRes = await call('OpenDefaultAudioOut', audio, param);
    if (openRes !== 0n) throw Error(`OpenDefaultAudioOut failed with result: 0x${openRes.toString(16)}`);

    // Verify format
    const rate = Number(await call('GetAudioOutSampleRate', audio));
    const chans = Number(await call('GetAudioOutChannelCount', audio));
    console.log(`[AUDIO HOST] Hardware stream opened: ${rate} Hz, ${chans} channels.`);

    isInitialized = true;
  }

  // Release completed playback buffers back to the free pool
  async function releaseFinishedBuffers() {
    if (!isInitialized) return;
    for (let i = 0; i < NUM_BUFFERS; i++) {
      const releasedAddr = Number(await call('GetReleasedAudioOutBuffer', audio));
      if (!releasedAddr || releasedAddr === 0) break;
      if (descToSlot.has(releasedAddr)) {
        freeDescriptors.add(releasedAddr);
      }
    }
  }

  async function playPcmBuffer(pcmBuffer) {
    await ensureInitialized();
    await releaseFinishedBuffers();

    // Store preview for waveform visualizer
    const copyLen = Math.min(lastPcmPreview.length, pcmBuffer.length);
    pcmBuffer.copy(lastPcmPreview, 0, 0, copyLen);

    // Check for free descriptor
    if (freeDescriptors.size === 0) {
      // Force wait for at least one buffer to complete
      for (let retry = 0; retry < 8; retry++) {
        await new Promise(r => setTimeout(r, 15));
        await releaseFinishedBuffers();
        if (freeDescriptors.size > 0) break;
      }
      if (freeDescriptors.size === 0) {
        console.warn('[AUDIO HOST] Audio queue starved, flushing hardware buffers to reclaim...');
        try {
          await call('FlushAudioOutBuffers', audio);
        } catch (_) {}
        await releaseFinishedBuffers();
        if (freeDescriptors.size === 0) {
          freeDescriptors.clear();
          for (const d of descriptorAddresses) freeDescriptors.add(d);
          console.log('[AUDIO HOST] Buffer pool reset complete.');
        }
      }
    }

    const descAddr = freeDescriptors.values().next().value;
    const slotIdx = descToSlot.get(descAddr);
    const targetSlot = slotAddresses[slotIdx];

    // Stage samples into 64K-aligned target slot
    const uploadLen = Math.min(pcmBuffer.length, BUFFER_CAPACITY);
    const uploadBuf = Buffer.alloc(BUFFER_CAPACITY);
    pcmBuffer.copy(uploadBuf, 0, 0, uploadLen);
    await rpc.write(targetSlot, uploadBuf);

    // SetAudioOutBufferInfo(descriptor, sampleAddress, capacity=131072, dataSize)
    await call('SetAudioOutBufferInfo', descAddr, targetSlot, BUFFER_CAPACITY, uploadLen);

    // AppendAudioOutBuffer(audio, descriptor)
    const appendRes = await call('AppendAudioOutBuffer', audio, descAddr);
    if (appendRes !== 1n) {
      console.warn(`[AUDIO HOST] AppendAudioOutBuffer returned: ${appendRes}`);
      return 0;
    }
    freeDescriptors.delete(descAddr);

    // Check actual hardware stream state:
    // In Horizon OS / S2 OS audout, when the buffer queue drains/starves, the stream state
    // can transition to Stopped (state 1). If not running (state !== 0) or unstarted, restart it.
    try {
      const curState = Number(BigInt.asIntN(32, await call('GetAudioOutState', audio)));
      if (curState !== 0 || !isStarted) {
        const startRes = await call('StartAudioOut', audio);
        if (startRes === 0n) {
          if (!isStarted) console.log('[AUDIO HOST] StartAudioOut: Stream started successfully on S2 hardware.');
          isStarted = true;
        } else {
          console.warn(`[AUDIO HOST] StartAudioOut returned: 0x${startRes.toString(16)} (previous state was ${curState})`);
        }
      }
    } catch (err) {
      console.warn('[AUDIO HOST] Stream state check notice:', err.message);
    }

    return 1;
  }

  async function playSfx(sfxId, volume = 0.85) {
    const pcm = AudioSynth.synthSfx(sfxId, volume);
    console.log(`[AUDIO HOST] Playing SFX #${sfxId} (${pcm.length} bytes, duration: ${(pcm.length / (SAMPLE_RATE * 4) * 1000).toFixed(0)} ms)...`);
    return playPcmBuffer(pcm);
  }

  async function playTone(waveType, freqHz, durationMs, volume = 0.8) {
    const pcm = AudioSynth.synthTone(waveType, freqHz, durationMs, volume);
    console.log(`[AUDIO HOST] Playing tone wave=${waveType}, freq=${freqHz}Hz, dur=${durationMs}ms (${pcm.length} bytes)...`);
    return playPcmBuffer(pcm);
  }

  async function setVolume(volPercent) {
    const vol = clamp(volPercent / 100.0, 0.0, 1.0);
    currentVolume = vol;
    if (isInitialized) {
      const intBits = Buffer.alloc(4);
      intBits.writeFloatLE(vol, 0);
      const rawVal = intBits.readUInt32LE(0);
      try {
        await call('SetAudioOutVolume', audio, rawVal);
      } catch (err) {
        console.warn('[AUDIO HOST] SetAudioOutVolume notice:', err.message);
      }
    }
  }

  async function stop() {
    if (isInitialized && isStarted) {
      try {
        await call('StopAudioOut', audio);
      } catch (_) {}
      isStarted = false;
    }
  }

  async function getStatus() {
    let playedCount = 0;
    let state = 0;
    if (isInitialized) {
      try {
        await releaseFinishedBuffers();
        playedCount = Number(BigInt.asIntN(32, await call('GetAudioOutPlayedSampleCount', audio)));
        state = Number(BigInt.asIntN(32, await call('GetAudioOutState', audio)));
      } catch (_) {}
    }
    return {
      initialized: isInitialized ? 1 : 0,
      started: isStarted ? 1 : 0,
      volume: Math.round(currentVolume * 100),
      playedCount,
      state,
      preview: lastPcmPreview
    };
  }

  async function close() {
    clearInterval(harvestTimer);
    if (isInitialized) {
      try {
        if (isStarted) await call('StopAudioOut', audio);
        await call('CloseAudioOut', audio);
      } catch (_) {}
      isInitialized = false;
      isStarted = false;
    }
  }

  return {
    ensureInitialized,
    playSfx,
    playTone,
    setVolume,
    stop,
    getStatus,
    close,
    synth: AudioSynth
  };
}

module.exports = { create, AudioSynth, SAMPLE_RATE, CHANNELS };
