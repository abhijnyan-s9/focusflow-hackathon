# FocusFlow Dashboard 🧠

A browser-based **focus tracking dashboard** that uses your **webcam + MediaPipe FaceMesh** to estimate eye openness (EAR), visualize focus in real time, and run **Pomodoro-style sessions**.  

It also integrates with a Chrome extension **FocusGuard** to block distracting websites (YouTube Shorts, Instagram, etc.) while a session is running.

---

## 🎥 Project Demo Video

A complete walkthrough of **FocusFlow** — including the dashboard, focus tracking, Pomodoro timer, webcam-based attention detection, and Flow Mode distraction blocker — is available in the video below:

👉 **[Click here to watch the full demo (Google Drive)](https://drive.google.com/file/d/1w8A1p-Kgaz2jYOClsG4KDaHXQn7e03ID/view?usp=sharing)**

This video demonstrates:

- Starting a focus session  
- Real-time face tracking & focus score  
- Dynamic Orb visualization  
- Pomodoro-style timer  
- Focus drop notifications  
- Flow Mode extension auto-blocking distracting websites  
- Session summary and analytics  

Make sure to watch it for a complete understanding of how FocusFlow works.

## ✨ Features

### 🎯 Focus Dashboard (Frontend)
- **Pomodoro Timer**
  - User-defined session length (1–180 minutes)
  - Countdown timer with Start / Stop / Reset
- **Webcam-based Focus Detection**
  - Uses **MediaPipe FaceMesh** to estimate eye aspect ratio (EAR)
  - Converts EAR into a normalized **focus score (0–100%)**
- **Focus Indicator Orb**
  - Glowing circular gauge in a black + blue theme
  - Animated ring fills according to current focus score
- **Live Focus Graph**
  - Line chart of focus score over time using **Chart.js**
- **Session Summary**
  - Average focus percentage
  - Total samples recorded
  - Short suggestion based on your focus level
- **Minimal, dashboard-style UI**
  - Dark background and blue accents
  - Fake stats cards (sessions, average focus, total time) for now

### 🛡 FocusGuard Chrome Extension (optional integration)
- **Flow Mode**
  - When the session starts, the page sends a message to the extension:  
    → Flow Mode **ON** → distracting sites are blocked  
  - When the session stops/ends:  
    → Flow Mode **OFF** → sites are unblocked
- **Blocking rules**
  - Blocks specific distracting patterns, e.g.:
    - `youtube.com/shorts`
    - `youtube.com/feed/trending`
    - `instagram.com`
    - `facebook.com`
    - `twitter.com`
    - `netflix.com`
  - Allows normal YouTube video URLs (`watch?v=`)

> Note: The extension must be installed & enabled manually in Chrome once.  
> After that, the page controls Flow Mode automatically.

---

## 🧰 Tech Stack

### Frontend
- **HTML5 / CSS3 / Vanilla JavaScript**
- **MediaPipe FaceMesh**
  - `@mediapipe/face_mesh`
  - `@mediapipe/camera_utils`
- **Chart.js** for the focus line chart

### Browser Extension (FocusGuard)
- **Chrome Extension Manifest v3**
- Background Service Worker (`background.js`)
- Content Script (`content.js`)
- Simple blocked page (`blocked.html`)

---

## 🗂 Project Structure (simplified)

```bash
hackathon/
└── frontend/
    ├── index.html        # Focus dashboard UI
    ├── style.css         # Black + blue theme styles
    └── script.js         # Timer + FaceMesh + Chart + FlowMode messages

└── FocusGuard/
    ├── manifest.json     # Chrome extension manifest (MV3)
    ├── background.js     # Flow Mode state + blocking logic
    ├── content.js        # Bridge between webpage and extension
    ├── blocked.html      # "Distraction Blocked" page
    └── icon.png          # Extension icon
