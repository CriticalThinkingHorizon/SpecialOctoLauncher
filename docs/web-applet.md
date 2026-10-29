# Native S2 Web Browser Applet (`nn::web`) Integration

This document details the reverse engineering, native symbol resolution, host bridge architecture, and GLSL SDK bindings for invoking the official S2 Native Web Browser Applet (`nn::web::ShowWebPage`) from custom homebrew GPU applications.

---

## 1. Architectural Overview

The S2 operating system provides a sandboxed system library applet for displaying web content, powered by the internal `nn::web` subsystem. Unlike traditional homebrew that relies on external proxies or stripped-down embedded parsers, this architecture invokes the **authentic OS web applet modal** directly from SmileBASIC 4 runtime memory over the S2 Vulkan overlay pipeline.

```
+-----------------------------------------------------------------------+
| S2 Console (Autonomous 60 FPS Vulkan 1.4 Overlay)                     |
|                                                                       |
|  +------------------------+          +-----------------------------+  |
|  | GPU Compute Shader     |  Mailbox | S2 Host Runtime / RPC       |  |
|  | apps/web-browser       | -------->| sdk/host/web.cjs            |  |
|  | (app.comp / app.frag)  |  (OP=14) |                             |  |
|  +------------------------+          +--------------+--------------+  |
+-----------------------------------------------------|-----------------+
                                                      |
                                                      v
                                    +----------------------------------+
                                    | S2 Native Execution Bridge       |
                                    | (ARM64 Machine Code Dispatch)    |
                                    +-----------------+----------------+
                                                      |
                     +--------------------------------+--------------------------------+
                     |                                                                 |
                     v                                                                 v
+------------------------------------------+     +------------------------------------------+
| Main Module (SmileBASIC MOD0 Imports)   |     | SDK Module (nn::web Dynamic Symbols)    |
| - ShowWebPage                            |     | - nn::web::ShowWebPage                   |
| - ShowWebPageArg::ShowWebPageArg(url)    |     | - nn::web::ShowWebPageArg::ShowWebPageArg|
| - WebPageReturnValue::WebPageReturnValue |     | - nn::web::WebPageReturnValue            |
| - WebPageReturnValue::GetWebExitReason   |     | - nn::web::WebPageReturnValue::GetExit...|
+------------------------------------------+     +------------------------------------------+
                                                      |
                                                      v
                                 +------------------------------------------+
                                 | S2 OS Native Web Browser Library Applet  |
                                 | (WebKit / Fullscreen Browser Modal)      |
                                 +------------------------------------------+
```

---

## 2. Dynamic Discovery & Symbol Resolution

The S2 binary layout splits functionality between the **Main executable module** (`SmileBASIC.nso`) and the shared **SDK runtime module** (`sdk.nso`).

Live hardware inspection via [`inspection/web-inspect.cjs`](../inspection/web-inspect.cjs) examines the dynamic symbol tables (`MOD0` structures) of both modules:

### 2.1 Main Module Imports
SmileBASIC imports 6 core symbols directly from `nn::web`:
1. `_ZN2nn3web14ShowWebPageArgC1EPKc` — `nn::web::ShowWebPageArg::ShowWebPageArg(const char* url)`
2. `_ZN2nn3web14ShowWebPageArg14SetCallbackUrlEPKc` — `nn::web::ShowWebPageArg::SetCallbackUrl(const char* url)`
3. `_ZN2nn3web18WebPageReturnValueC1Ev` — `nn::web::WebPageReturnValue::WebPageReturnValue()`
4. `_ZN2nn3web11ShowWebPageEPNS0_18WebPageReturnValueERKNS0_14ShowWebPageArgE` — `nn::web::ShowWebPage(WebPageReturnValue*, const ShowWebPageArg&)`
5. `_ZNK2nn3web18WebPageReturnValue16GetWebExitReasonEv` — `nn::web::WebPageReturnValue::GetWebExitReason() const`
6. `_ZNK2nn3web18WebPageReturnValue10GetLastUrlEv` — `nn::web::WebPageReturnValue::GetLastUrl() const`

### 2.2 SDK Dynamic Symbol Table
The SDK module exports 265 symbols under the `nn::web` namespace. Key function addresses and offsets resolved on `HOS 23.0.1`:

| Function / Constructor | Mangled Symbol | Relative Offset | Size | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`ShowWebPage`** | `_ZN2nn3web11ShowWebPageEPNS0_18WebPageReturnValueERKNS0_14ShowWebPageArgE` | `+5125680` (`0x4E3630`) | 344 B | Invokes the synchronous OS browser modal |
| **`ShowWebPageArg` Ctor** | `_ZN2nn3web14ShowWebPageArgC1EPKc` | `+5136996` (`0x4E6264`) | 152 B | Initializes argument container with target URL |
| **`WebPageReturnValue` Ctor** | `_ZN2nn3web18WebPageReturnValueC1Ev` | `+5140336` (`0x4E6F70`) | 12 B | Initializes the return value output block |
| **`GetWebExitReason`** | `_ZNK2nn3web18WebPageReturnValue16GetWebExitReasonEv` | `+5140348` (`0x4E6F7C`) | 76 B | Retrieves the exit reason enum code |

---

## 3. Host Bridge Implementation (`sdk/host/web.cjs`)

The host adapter uses the native client dispatcher (`sdk/native/client.cjs`) to allocate scratch memory buffers and construct ARM64 calling frames.

### Memory Layout
- **`0x2000` (8 KiB)**: `ShowWebPageArg` storage.
- **`0x4000` (1 KiB)**: `WebPageReturnValue` storage.
- **`0x5000` (4 KiB)**: Null-terminated UTF-8 URL string.

### Execution Flow
1. **Initialize `WebPageReturnValue`**:
   Calls `WebPageReturnValueCtor(retValPtr)` to set default struct state.
2. **Format & Write URL**:
   Ensures standard `https://` prefix, encodes null-terminated UTF-8 bytes, and writes to `urlPtr`.
3. **Construct `ShowWebPageArg`**:
   Invokes `ShowWebPageArgCtor(argPtr, urlPtr)` via native call convention (`x0 = argPtr`, `x1 = urlPtr`).
4. **Launch Browser Applet**:
   Executes `ShowWebPage(retValPtr, argPtr)`. Execution on the S2 suspends into the native browser modal until dismissed by the user.
5. **Extract Exit Telemetry**:
   Invokes `GetWebExitReason(retValPtr)` to read the native exit reason descriptor back into GPU memory.

---

## 4. GLSL SDK Interface (`sdk/include/hb.glsl`)

Applications access the web browser through the mailbox protocol (`OP.web = 14`).

### Function Reference

```glsl
// Write a single byte into the target URL staging buffer at index i
void nnWebSetUrlByte(uint i, uint byteVal);
void hbWebUrlByte(uint i, uint byteVal);

// Trigger launch of the native browser applet with a staged URL of length urlLen
void nnWebShowWebPage(uint urlLen);
void hbWebShow(uint urlLen);

// Read the OS return code (0 = SUCCESS)
uint nnWebGetResult();

// Read the OS exit reason descriptor (0 = USER_EXIT)
uint nnWebGetExitReason();
```

### Usage Example (Compute Shader)

```glsl
#include "hb.glsl"

void stageUrlAndLaunch() {
    // Stage URL: "https://google.com"
    const uint URL_LEN = 18u;
    const uint URL_CHARS[18] = uint[](
        104u, 116u, 116u, 112u, 115u, 58u, 47u, 47u, // "https://"
        103u, 111u, 111u, 103u, 108u, 101u, 46u, 99u, 111u, 109u // "google.com"
    );

    for (uint i = 0u; i < URL_LEN; ++i) {
        nnWebSetUrlByte(i, URL_CHARS[i]);
    }

    // Launch native browser modal
    nnWebShowWebPage(URL_LEN);
}
```

---

## 5. Proof of Concept Application (`apps/web-browser`)

The included **`web-browser`** application provides a complete reference implementation:

- **Interactive CRT Tube UI**: Renders an omnibox with live cursor blink, SSL lock icon, bookmark cards, and scanlines.
- **Pre-configured Bookmarks**:
  1. `https://en.m.wikipedia.org` — Wikipedia Mobile
  2. `https://news.ycombinator.com` — Hacker News
  3. `https://duckduckgo.com/lite` — DuckDuckGo Lite
  4. `https://w3.org` — W3C
  5. `https://api.nonopost.com` — Nonopost Social API
  6. `https://github.com` — GitHub
- **Custom URL Input**: Pressing **`Y`** opens the S2 native soft keyboard (`nn::swkbd`) to enter any custom website address.
- **Feedback & Exit Telemetry**: Displays a real-time toast notification displaying exit reason codes upon returning from the browser.
- **Universal Exit**: Pressing **`-` (MINUS)** exits cleanly back to the Homebrew Launcher.
