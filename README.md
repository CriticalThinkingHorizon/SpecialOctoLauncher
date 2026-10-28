# HelloWorldS2

A cross-platform host & GPU-driven homebrew runtime for **S2** via **SmileBASIC 4.4.9** (`HOS 23.0.1`), featuring an interactive **Homebrew Launcher**, **File Explorer**, **On-Console HTTP File Server (`:8080`)**, **`tmp:/` Write & Persistence Tools**, and a comprehensive **official-aligned `nn::*` GLSL SDK**—all without requiring a Raspberry Pi Pico keyboard server.

---

## ⚠️ Risk Warning

**Running homebrew software, custom native code execution, and memory RPC tools on proprietary console hardware carries inherent risks.** Improper usage, incorrect memory writes, network configuration issues, or incompatible firmware states can cause system instability, crashes, system freezes, or unresponsiveness.

We (Main developer and contributors) are not responsible for any damage to your S2, PC, or other hardware; data loss; corrupted saves; or any other consequences arising from the use of this software. Always back up important data before making modifications. This software is provided as-is, without warranties of any kind. Use at your own risk and discretion.

---

## Overview & Version Support

- **Supported Environment:** Proven and validated exclusively on **HOS 23.0.1** and **SmileBASIC 4.4.9**.
- **Platform Compatibility:** Primarily tested and developed on **Windows**, with cross-platform support for **macOS** and **Linux**.
- **Architecture:**
  - **Console-Side Autonomous 60 FPS Loop:** Runs an independent `nn::vi::Layer` + Vulkan 1.4 swapchain (`1920×1080`) driven by a native `pthread` executing a self-restoring `setcontext`/`longjmp` frame loop on the S2. Controller/touch polling (`nn::hid`) and GPU compute/fragment shader rendering run at 60 FPS directly on the console.
  - **Host-Side RPC Bridge & On-Demand App Loader:** The PC host (`server.js` + `runtime/hello-runner.cjs`) qualifies the native session, prepares Vulkan pipelines **on-demand** when apps are launched, and services asynchronous SDK mailbox requests (`nn::fs`, `nn::socket`, `nn::nifm`, `nn::hid`, `nn::time`, `nn::os`, `nn::irsensor`, `nn::nfc`, `nn::audio`).

---

## Included Homebrew Applications (`apps/`)

By default, `node server.js` boots into the **Homebrew Launcher** (`apps/launcher`), where you can launch any compiled app on demand, rescan the server catalog live, or close the Vulkan overlay layer cleanly.

> **Navigation Rule:** Across all apps, **`-` (MINUS)** is reserved exclusively as the **Exit to Homebrew Launcher** button so apps can freely use `A`, `B`, `X`, `Y`, `L`, `R`, `+`, and D-Pad without conflict.

| App ID | Name | Description & Controls |
| --- | --- | --- |
| `launcher` | **Homebrew Launcher** | Interactive app picker with animated loading modal, live server catalog rescan (`X` or `[UPDATE]` row), and clean `nn::vi::Layer` teardown (`-` or `[EXIT]` row to close the Vulkan layer and return to SmileBASIC). |
| `file-explorer` | **File Explorer** | Read-only S2 filesystem browser across `rom:/`, `save:/`, `tmp:/`, and virtual `exefs:/` (loaded process modules & sections). Supports 15-entry 2-column directory pages and a 20-line `.TXT`/`.PRG`/`T*` viewer with automatic SmileBASIC 4 container header stripping and `zlib` decompression. (`A`: Open/Read, `B`: Parent/Close File, `D-Pad`: Navigate/Scroll, `-`: Exit). |
| `http-server` | **On-Console HTTP File Server (`:8080`)** | Binds a listening TCP socket (`nn::socket`) directly on the S2's LAN IP (`http://<s2-ip>:8080/`). Open the URL on any PC or phone browser to browse `rom:/`, `save:/`, `tmp:/`, and `exefs:/`, preview decompressed `.PRG`/`.TXT` or hex dumps, and download files directly from the console. (`X`: Restart Socket, `-`: Exit). |
| `http-client` | **HTTP Client & Downloader** | Outbound HTTP `GET` queries and file streaming directly into console storage (`tmp:/download.bin`) using official-aligned `nn::http` abstractions. (`A`: GET /get, `X`: GET /ip, `Y`: Download robots.txt, `-`: Exit). |
| `swkbd-demo` | **Native Keyboard POC** | Direct on-console integration with the S2 Native Soft Keyboard (`nn::swkbd`), triggering the OS library applet for text input into a glowing terminal display. (`A`: Open Keyboard, `X`: Clear, `-`: Exit). |
| `wolv-view` | **Wolverine 1080p Viewer** | Downloads a 1920×1080 PNG image live from `https://ferreirapablo.com/files/wolv.png` via `nnHttpDownloadImage` and renders it edge-to-edge fullscreen on the S2. (`A`: Reload, `X`: Toggle HUD, `-`: Exit). |
| `chip8` | **CHIP-8 Virtual Machine** | On-console compute-shader interpreter running ROM programs directly from `tmp:/rom.ch8` at 60 FPS on the GPU. Features retro CRT bloom, 4 selectable phosphor palettes, Joy-Con controls, and HD rumble sound buzzer (`nnHidSendVibrationPulse`). (`A`: Reload tmp:/rom.ch8, `X`: Palette, `Y`: Speed, `+`: Reset, `-`: Exit). |
| `hello-world` | **Hello World** | Interactive controller visualizer displaying real-time button states (including `-` and `+`) for attached and detached Joy-Con controllers. (`-`: Exit). |
| `tmp-test` | **TMP Write & Persistence Test** | Verifies `nn::fs::GetEntryType` and `nn::fs::CreateFile` on SmileBASIC's `tmp:/` (`MountCacheStorage`) mount by checking and creating `tmp:/tmptest` and reporting persistence across runs. (`A`: Re-check, `X`: Delete & Recreate, `-`: Exit). |
| `tmp-delete` | **TMP Cleaner (`Delete tmptest`)** | Built using pure shader-side `nnFsGetEntryType` + `nnFsDeleteFile` SDK primitives to check for `tmp:/tmptest` and remove it if present. (`A`: Re-check & Delete, `-`: Exit). |

---

## Official-Aligned GLSL SDK (`sdk/include/hb.glsl`)

All apps have unrestricted access to the full native SDK mailbox (`mapped + 0x7f0000`). Functions in [`sdk/include/hb.glsl`](sdk/include/hb.glsl) use official S2 SDK (`nn::*`) naming conventions (with concise `hb*` aliases preserved):

### 1. `nn::fs` — Complete 18-Function Filesystem Suite (`OP.fs = 9`)
- **Path & Payload Staging:** `nnFsSetPathByte(i, ch)`, `nnFsSetSecondPathByte(i, ch)`, `nnFsSetWriteByte(i, val)`
- **File & Directory Primitives:**
  - `nnFsGetEntryType(pathLen)` → `nnFsResultExists()`, `nnFsResultEntryType()`, `nnFsResultFileSize()`, `nnFsResultCode()`
  - `nnFsCreateFile(initialSize, pathLen)` / `nnFsDeleteFile(pathLen)` / `nnFsRenameFile(oldLen, newLen)`
  - `nnFsReadFile(offset, maxBytes, pathLen)` → `nnFsResultBytesTransferred()`, `nnFsResultByte(i)`
  - `nnFsWriteFile(offset, dataLen, pathLen)` (auto-creates/resizes, writes, flushes, and closes)
  - `nnFsCreateDirectory(pathLen)` / `nnFsDeleteDirectory(pathLen)` / `nnFsRenameDirectory(oldLen, newLen)`
  - `nnFsCommitSaveData(mountLen)`
- **High-Level Helpers:** `nnFsReadDirectory(maxEntries, startOffset, pathLen)`, `nnFsReadTextLines(lineStart, pathLen)`

### 2. `nn::socket`, `nn::nifm` & `nn::http` — TCP/UDP & Outbound HTTP Client (`OP.net = 10`, `OP.udp = 3`)
- **Interface Status:** `nnNifmGetCurrentPrimaryIpAddress()` → `nnNifmResultIpAddress()`, `nnNifmResultConnectionStatus()`
- **TCP Server & Client:**
  - `nnSocketListenTcp(port, backlog)` → `nnSocketResultFd()`
  - `nnSocketAccept(listenFd, timeoutMs)` → `nnSocketResultFd()`, `nnSocketResultReady()`
  - `nnSocketConnect(ipv4BigEndian, port)` → `nnSocketResultFd()`
  - `nnSocketRecv(fd, maxBytes, timeoutMs)` → `nnSocketResultBytes()`, `nnSocketResultReady()`, `nnSocketResultByte(i)`
  - `nnSocketSetSendByte(i, val)` + `nnSocketSend(fd, byteLen)`
  - `nnSocketClose(fd)`, `nnSocketGetSockName(fd)`, `nnSocketGetLastErrno()`
- **UDP Datagram Exchange:** `nnSocketSendToUdpEndpoint(endpoint, bytes)`
- **HTTP / HTTPS Outbound Client (`nn::http`):**
  - **Staging Helpers:** `nnHttpSetUrlByte(i, ch)`, `nnHttpSetPostByte(i, val)`, `nnHttpSetSavePathByte(i, ch)`
  - **Requests:** `nnHttpGet(maxBytes, urlLen)` / `nnHttpPost(postLen, urlLen)`
  - **Direct File Downloads:** `nnHttpDownloadTo(savePathLen, urlLen)` / `nnHttpDownloadToTmp(urlLen)` (streams remote HTTP/HTTPS downloads directly into `tmp:/` or designated storage path)
  - **Live Image Downloads & Decode:** `nnHttpDownloadImage(urlLen)` (downloads PNG image, decodes to raw RGBA, and uploads directly into GPU storage memory for fullscreen rendering)
  - **Response Accessors:** `nnHttpResultStatusCode()`, `nnHttpResultTotalBytes()`, `nnHttpResultBodyBytes()`, `nnHttpResultErrno()`, `nnHttpResultBodyByte(i)`, `nnHttpImageWidth()`, `nnHttpImageHeight()`

### 3. `nn::hid` & `nn::hid::detail` — Controllers, SixAxis, Colors, LEDs & Haptics
- **Input Polling:** `nnHidGetNpadButtons()`, `nnHidGetNpadPressed()`, `nnHidGetNpadSourceButtons(slot)`, `nnHidGetAnalogStick(right)`, `nnHidGetTouchScreenCount()`, `nnHidGetTouchScreenPoint(i)`, `nnHidGetKeyboardKey(usage)`, `nnHidGetMousePosition()`, `nnHidGetMouseButtons()`
- **6-Axis IMU:** `nnHidGetSixAxisSensorCount()`, `nnHidGetSixAxisAcceleration(i)`, `nnHidGetSixAxisGyroscope(i)`, `nnHidGetSixAxisDirection(i)`
- **Hardware Metadata & Haptics:** `nnHidGetNpadBodyColor()`, `nnHidGetNpadButtonColor()`, `nnHidGetPlayerLedPattern()`, `nnHidIsVibrationPermitted()`, `nnHidGetNpadControllerInfo(npadId)`, `nnHidSendVibrationPulse(...)`, `nnHidSendVibrationPattern(...)`

### 4. `nn::time`, `nn::os`, `nn::irsensor::detail`, `nn::nfc`, `nn::audio`
- **Clocks & System Info:** `nnTimeStandardSteadyClockNow()` (64-bit ARM `CNTPCT_EL0` tick, `19.2 MHz` frequency, POSIX seconds, and calendar fields), `nnOsGetSystemInfo()` (process `aruid`, steady tick, thread priority, `main`/`sdk` module bases)
- **Peripherals:** `nnIrSensorGetCameraStatus(npadId)`, `nnNfcScanTag()`, `nnAudioListAudioIns(maxCount)`

---

## Prerequisites & Dependencies

1. **Node.js (v22+)** — Runs `server.js`, the TCP RPC listener, and the Vulkan/SDK host runtime.
2. **Python 3 + Pillow (`PIL`)** — Used by each app's `assets.py` to generate glyph atlases (`text.bin`) and icons (`server.js` automatically verifies and installs Pillow if missing).
3. **Vulkan SDK (`glslangValidator` & `spirv-val`)** — Used when manually compiling app shaders via `sdk/build.cjs`.
4. **Network Access** — Inbound TCP port **39380** must be allowed through your firewall so the S2 can connect to your PC.

---

## Console Bootstrap Setup (Required)

1. Retrieve the content of `bootstrap.bas` from the [ns2jb repository](https://gitlab.com/pepsipu/ns2jb/-/tree/main?ref_type=heads).
2. Save it in SmileBASIC on your S2 as `TXT:NS2` in the default workspace.

---

## Getting Started

1. **Start the RPC Server on your PC:**
   ```bash
   node server.js [host-ip]
   ```
   *(Optional flags: `--app=<app-id>` to boot directly into a specific app instead of `launcher`, `--verbose` for low-level RPC transfer logs, `--pairingCode n1,n2,n3,n4`)*

2. **Connect from SmileBASIC Direct Mode on your S2:**
   ```basic
   LOAD "TXT:NS2"
   RUN
   REMOVE NSR,&H60000000,&H3FFFFFFF
   V=START(39380,10,0,0,2,0,0,0,0)
   ```
   *(Use the exact `V=START(...)` command printed by `server.js` for your host IP).*

3. **Building / Updating Apps Manually Without Restarting the Server:**
   - Apps are loaded **on-demand** from their pre-compiled `.spv` binaries.
   - If you create a new app or modify an existing app's shaders while `server.js` is running, compile it manually:
     ```powershell
     python apps/<app-id>/assets.py
     $env:GLSLANG="C:\VulkanSDK\1.4.363.0\Bin\glslangValidator.exe"
     $env:SPIRV_VAL="C:\VulkanSDK\1.4.363.0\Bin\spirv-val.exe"
     node sdk/build.cjs apps/<app-id>
     ```
   - Then press **`X`** (or select `[UPDATE]`) in the Homebrew Launcher on the S2 and launch the app—its updated `.spv` fingerprint will be detected and prepared on demand!

---

## Credits & Acknowledgements

- [HBLauncher by ravensclawx](https://github.com/ravensclawx/HBLauncher) — Homebrew launcher architecture and GPU rendering pipeline.
- [ns2jb by pepsipu](https://gitlab.com/pepsipu/ns2jb/-/tree/main?ref_type=heads) — Initial deployment code, bootstrap script, RPC foundations, and Hello World app structure.
