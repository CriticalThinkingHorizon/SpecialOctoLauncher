# Moonlight S2 (Sunshine Game Streaming Client)

Native game streaming client for the S2 console, connecting to Sunshine / NVIDIA GameStream hosts. Streams PC games with low-latency controller input, app selection, and PIN pairing.

## Features

- **Sunshine NVHTTP Pairing**: Integrated PIN authorization with Sunshine Web UI (`https://<PC_IP>:47990/pin`).
- **Game & App Browser**: Live app listing from Sunshine (`/applist`), supporting Steam, Desktop, and installed PC games.
- **Real-Time S2 Controller Input**: Maps S2 Joy-Con and Pro Controller buttons, triggers (ZL/ZR), and analog sticks to virtual Xbox 360 controller inputs over UDP (Port 47999).
- **In-Stream Performance HUD**: Real-time FPS, bitrate, packet count, latency, and active controller visualizer.
- **Multiple Setup Methods**:
  1. **S2 Software Keyboard (`nn::swkbd`)**: Press `(+)` in the app to enter your PC IP on-screen.
  2. **Web Configuration Portal**: Open `http://<S2_IP>:39382` in any browser on your network.
  3. **Host File / Storage**: Place your PC IP in `moonlight-host.txt` or `save:/hbstorage/moonlight.json`.

## Controls

### Menu Mode
- **D-Pad Up / Down**: Browse PC games and applications.
- **Button (A)**: Launch selected game (or confirm pairing).
- **Button (X)**: Refresh connection & app list.
- **Button (+)**: Enter Sunshine Host PC IP via S2 native keyboard.
- **Button (Y)**: Re-pair / generate new PIN.
- **Button (-)**: Exit to S2 Homebrew Launcher.

### Streaming Mode
- **Joy-Con / Pro Controller**: Full real-time control (ABXY, D-Pad, L/R bumpers, ZL/ZR triggers, dual analog sticks, stick clicks).
- **Tap Button (-)**: Toggle in-game telemetry HUD.
- **Hold (-) + (+)** for 1 second: Disconnect stream session and return to game browser.
