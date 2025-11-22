# cam_focus.py
# Simple webcam focus sender -> websocket
import cv2, time, json
import numpy as np
import mediapipe as mp
from websocket import create_connection

WS_URL = "ws://localhost:8000/ws"

# Connect to backend websocket
try:
    ws = create_connection(WS_URL, timeout=5)
    print("Connected to", WS_URL)
except Exception as e:
    print("WebSocket connection failed:", e)
    ws = None

mp_face = mp.solutions.face_mesh.FaceMesh(static_image_mode=False,
                                          max_num_faces=1,
                                          refine_landmarks=True,
                                          min_detection_confidence=0.5,
                                          min_tracking_confidence=0.5)

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    raise SystemExit("Cannot open webcam")

# indices for left eye from MediaPipe Face Mesh (example)
L_EYE = [33, 160, 158, 133, 153, 144]  # (approx) - adjust if necessary
R_EYE = [362, 385, 387, 263, 373, 380]

def ear_from_landmarks(pts, eye_idx):
    # pts: Nx3 numpy array with normalized coords; scale not required since ratio is used
    p = pts[eye_idx]
    # vertical distances
    A = np.linalg.norm(p[1][:2] - p[5][:2])
    B = np.linalg.norm(p[2][:2] - p[4][:2])
    # horizontal
    C = np.linalg.norm(p[0][:2] - p[3][:2]) + 1e-6
    ear = (A + B) / (2.0 * C)
    return ear

def estimate_head_pose(pts, img_shape):
    # Very simple heuristic: compute nose tip relative position to face bbox center
    # Not a full solvePnP but good enough for hackathon heuristic
    h, w = img_shape[:2]
    xs = pts[:,0] * w
    ys = pts[:,1] * h
    cx, cy = xs.mean(), ys.mean()
    # nose tip index (1 is approximate; MediaPipe nose tip indexes vary; use 1 or 4)
    nose = pts[1]
    nx, ny = nose[0]*w, nose[1]*h
    dx = (nx - cx) / w
    dy = (ny - cy) / h
    # map to small penalty: 0 means centered, larger absolute -> penalty
    angle_score = max(0, 1 - (abs(dx)*3 + abs(dy)*3))
    return angle_score

blink_history = []
BLINK_SMOOTH = 5

while True:
    ret, frame = cap.read()
    if not ret:
        break
    img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    res = mp_face.process(img_rgb)
    focus_score = 0.5
    if res.multi_face_landmarks:
        lm = res.multi_face_landmarks[0].landmark
        pts = np.array([[p.x, p.y, p.z] for p in lm])
        # compute EAR left & right
        try:
            left_ear = ear_from_landmarks(pts, L_EYE)
            right_ear = ear_from_landmarks(pts, R_EYE)
            ear = (left_ear + right_ear) / 2.0
        except Exception:
            ear = 0.25
        # head pose heuristic
        head_score = estimate_head_pose(pts, frame.shape)

        # Normalize ear into [0,1] (typical EAR for open eyes ~0.25-0.3)
        # here we invert so lower EAR (blink/closed) reduces score
        ear_norm = np.clip((ear - 0.12) / (0.35 - 0.12), 0, 1)

        # blink smoothing
        blink_history.append(ear_norm)
        if len(blink_history) > BLINK_SMOOTH:
            blink_history.pop(0)
        ear_smooth = float(np.mean(blink_history))

        # combine metrics -> simple weighted sum
        focus_score = 0.5*ear_smooth + 0.45*head_score + 0.05  # small bias

        focus_score = float(np.clip(focus_score, 0.0, 1.0))

    ts = time.time()
    payload = json.dumps({"score": focus_score, "ts": ts})
    if ws:
        try:
            ws.send(payload)
        except Exception as e:
            print("WS send error:", e)
            ws = None

    # overlay for quick visual debug
    cv2.putText(frame, f"Focus: {focus_score:.2f}", (20,40),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,0), 2)

    cv2.imshow("FocusCam", frame)

    # Quit conditions:
    # ESC key OR Q key OR clicking X on the window
    key = cv2.waitKey(1) & 0xFF
    if key == 27 or key == ord('q'):
        break

    # If window is closed using the X button
    if cv2.getWindowProperty("FocusCam", cv2.WND_PROP_VISIBLE) < 1:
        break


cap.release()
cv2.destroyAllWindows()
if ws:
    ws.close()
