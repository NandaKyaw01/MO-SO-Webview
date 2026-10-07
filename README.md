# 📺 Real-Time Digital Signage System

A lightweight, high-performance **Digital Signage System** engineered for commercial displays, TV screens, and kiosks. Features an **Admin Management Dashboard** and an ultra-clean **TV Display Client** that broadcasts Images (.JPG, .PNG, .WEBP) and PDF documents with zero browser chrome, zero toolbars, zero scrollbars, and instant real-time synchronization over WebSockets.

---

## 🌟 Key Features

- **True Full-Screen TV Client**:
  - Zero margins, zero padding, no scrollbars, pure black background (`#000000`).
  - **Image rendering**: 100vw × 100vh contain mode with smooth centering and crossfades.
  - **Pure PDF.js Canvas Rendering**: Directly parses and renders PDF pages to HTML5 `<canvas>` via Mozilla's PDF.js. **Zero `<iframe>`, `<embed>`, or `<object>` tags**, eliminating browser header bars, toolbars, download buttons, or borders.
  - **High-DPI / Retina / 4K Crispness**: Automatically renders at device pixel ratio (`window.devicePixelRatio`) for razor-sharp typography on 4K/1080p TVs.
  - **Auto-Hiding Cursor**: Automatically hides mouse cursor on the TV display after 2 seconds of inactivity.
  - **Graceful Error Recovery**: If an asset fails to load or the network reconnects, displays a subtle, dark status fallback rather than ugly browser 404 errors.
- **Admin Control Dashboard**:
  - Modern dark-mode glassmorphic interface.
  - Live on-air TV monitor displaying an exact preview of what is actively playing on the TV.
  - Drag-and-drop file uploader with real-time upload progress bar.
  - Option to "Push to TV automatically on upload".
  - Live TV Screen status counter (monitors how many TVs are connected in real-time).
  - Media library cards with thumbnail previews, file metadata, "LIVE ON TV" badges, and full-resolution modal preview.
  - "Clear TV Screen" button to quickly put displays into clean standby mode.
- **Real-Time Architecture**:
  - Powered by **Node.js, Express, and Socket.io**.
  - Immediate state synchronization: when a TV powers on or reconnects, it immediately requests and displays the active media without manual intervention.
  - Multi-client synchronization: changes made by any admin update all TVs and other admin consoles simultaneously.
  - In-memory active display state with persistent state backup (`active-state.json`).

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.io, Multer, CORS
- **Admin Client**: Vanilla HTML5, CSS3, JavaScript, Socket.io Client, Mozilla PDF.js
- **TV Display Client**: Vanilla HTML5, CSS3, JavaScript, Socket.io Client, Mozilla PDF.js (`pdf.min.js`)
- **Storage**: Local filesystem (`/uploads`) & JSON metadata

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
Or simply double-click **`start.bat`** on Windows.

Once running, the console will print your local URLs:
- **Admin Console**: `http://localhost:3000/admin`
- **TV Display**: `http://localhost:3000/tv`
- **Remote / LAN URL**: `http://<YOUR_LAN_IP>:3000/tv` (for TVs or secondary computers on the same Wi-Fi/Ethernet network)

---

## 🖥️ Launching TV in True Kiosk Mode

To ensure the TV runs without any OS address bars, tabs, or bookmarks, use the following options:

### Option A: 1-Click Windows Kiosk Launcher
Double-click **`launch-tv-kiosk.bat`**. This script automatically detects Google Chrome or Microsoft Edge and starts it in pure kiosk mode pointed to `http://localhost:3000/tv`.

### Option B: Google Chrome Command Line
```cmd
chrome.exe --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 http://localhost:3000/tv
```

### Option C: Microsoft Edge Command Line
```cmd
msedge.exe --kiosk http://localhost:3000/tv --edge-kiosk-type=fullscreen --no-first-run
```

### Option D: Manual Full-Screen
Open `http://localhost:3000/tv` in any browser, double-click anywhere on the screen, or press **F11** on your keyboard to enter browser full-screen mode.

### Option E: Smart TV / FireStick / Android TV Browser
1. Connect the TV to the same Wi-Fi network as the server computer.
2. Open the TV's built-in web browser (or Silk / Chrome).
3. Navigate to `http://<YOUR_COMPUTER_IP>:3000/tv`.
4. Select "Full Screen Mode" in the browser settings.

---

## 📂 Project Structure

```
MO-SO-WebView/
├── package.json               # Project manifest & dependencies
├── server.js                  # Express, Socket.io, Multer backend
├── start.bat                  # 1-click Windows server starter
├── launch-tv-kiosk.bat        # 1-click Chrome/Edge kiosk mode launcher
├── seed-samples.js            # Sample media generator
├── uploads/                   # Media directory (.jpg, .png, .pdf)
│   ├── metadata.json          # File metadata & timestamps
│   └── active-state.json      # Persisted active media state
└── public/
    ├── admin.html             # Admin Dashboard UI
    ├── admin.css              # Glassmorphic admin styling
    ├── admin.js               # Admin upload, control & monitor logic
    ├── tv.html                # TV Client layout & PDF.js container
    ├── tv.css                 # 100vw/100vh zero-margin TV styling
    └── tv.js                  # Socket listener & PDF.js canvas renderer
```

---

## 📡 API & Socket.io Reference

### REST Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload an image or PDF file (multipart/form-data) |
| `GET` | `/api/media` | Retrieve all media files with metadata and live status |
| `GET` | `/api/active-media` | Get the currently active media object |
| `POST` | `/api/active-media` | Set active media `{ filename: string }` or clear `{ filename: null }` |
| `DELETE` | `/api/media/:filename` | Delete a media item and clear screen if currently active |

### Socket.io Events
| Event | Direction | Payload | Description |
|---|---|---|---|
| `register_client` | Client ➔ Server | `{ role: 'tv' \| 'admin' }` | Identifies client type for connection counting |
| `media_update` | Server ➔ TV & Admin | Media object or `null` | Instant broadcast of active media to render |
| `library_update` | Server ➔ Admin | None | Triggers admin gallery refresh on upload/delete |
| `stats_update` | Server ➔ Admin | `{ tvCount, adminCount }` | Connected screen counters |
