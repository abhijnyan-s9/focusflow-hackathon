# backend/main.py  (Option A: browser-only webcam)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List
import os, json

app = FastAPI()

# ---- Paths ----
BASE_DIR = os.path.dirname(os.path.dirname(__file__))   # D:\hackathon
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
INDEX_PATH = os.path.join(FRONTEND_DIR, "index.html")

# Serve /static/* -> frontend folder (style.css, script.js)
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# Serve index.html at "/"
@app.get("/")
async def serve_index():
    return FileResponse(INDEX_PATH)

# ---- WebSocket for focus scores ----
class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: str):
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

manager = ConnectionManager()
latest_focus = {"score": None, "ts": None}

@app.websocket("/ws")
async def focus_ws(ws: WebSocket):
    global latest_focus
    await manager.connect(ws)
    print("WS client connected. Total:", len(manager.active))
    try:
        while True:
            msg = await ws.receive_text()
            # expect JSON {"score": ..., "ts": ...}
            try:
                data = json.loads(msg)
                if "score" in data and "ts" in data:
                    latest_focus = data
            except Exception:
                pass
            # if you ever have multiple viewers, broadcast:
            await manager.broadcast(msg)
    except WebSocketDisconnect:
        manager.disconnect(ws)
        print("WS client disconnected. Total:", len(manager.active))
    except Exception as e:
        manager.disconnect(ws)
        print("WS error:", e)

@app.get("/latest_focus")
def get_latest_focus():
    return latest_focus

@app.get("/health")
def health():
    return {"ok": True}
