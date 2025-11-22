// script.js - Final version with reset + FlowMode messages + upgraded orb

/* ========== DOM refs ========== */
const pomoInput = document.getElementById("pomoInput");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const autoToggle = document.getElementById("autoToggle");

const timerEl = document.getElementById("timer");
const videoEl = document.getElementById("webcam");
const webcamStatusEl = document.getElementById("webcamStatus");
const permissionHelpEl = document.getElementById("permissionHelp");

const scoreCanvas = document.getElementById("scoreChart");
const orbPercentEl = document.getElementById("orbPercent");
const orbEl = document.getElementById("orb");
const currentScoreEl = document.getElementById("currentScore");
const currentStateEl = document.getElementById("currentState");
const sampleCountEl = document.getElementById("sampleCount");
const sessionDetailsBox = document.querySelector(".session-details");

/* ========== Utils ========== */
function log(...args) { console.log("[FT]", ...args); }
function err(...args) { console.error("[FT]", ...args); }

/* ========== State ========== */
let POMODORO_DURATION = 25 * 60;
let remainingSeconds = POMODORO_DURATION;
let timerInterval = null;
let started = false;

let faceMesh = null;
let cameraHelper = null;
let localStream = null;

let focusData = [];
let chart = null;

/* ========== Timer helpers ========== */
function formatMMSS(sec) {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function tickTimer() {
  remainingSeconds--;
  if (remainingSeconds < 0) remainingSeconds = 0;
  if (timerEl) timerEl.innerText = formatMMSS(remainingSeconds);

  if (remainingSeconds <= 0) {
    log("Timer finished. Ending session.");
    endSession(true);
  }
}

/* ========== Chart.js ========== */
function initChart() {
  if (!scoreCanvas) {
    err("scoreChart canvas not found");
    return;
  }
  const ctx = scoreCanvas.getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Focus Score",
          data: [],
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: { y: { min: 0, max: 1 } }
    }
  });
}

function addDataToChart(score) {
  if (!chart) return;
  chart.data.labels.push(chart.data.labels.length);
  chart.data.datasets[0].data.push(score);
  if (chart.data.labels.length > 120) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update("none");
}

/* ========== Camera permission ========== */
async function ensureCameraPermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Browser does not support getUserMedia.");
  }

  try {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: "camera" });
        log("Camera permission state:", status.state);
        if (status.state === "denied") {
          if (permissionHelpEl) permissionHelpEl.style.display = "block";
          throw new Error("Camera permission is blocked. Allow via site settings.");
        }
      } catch (e) {
        log("permissions.query(camera) not supported or failed:", e);
      }
    }
  } catch (e) {
    // ignore
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    stream.getTracks().forEach((t) => t.stop());
    if (webcamStatusEl) webcamStatusEl.textContent = "Camera permission granted.";
    if (permissionHelpEl) permissionHelpEl.style.display = "none";
  } catch (errPerm) {
    err("getUserMedia failed:", errPerm);
    if (webcamStatusEl) webcamStatusEl.textContent =
      "Unable to access camera. Check permissions.";
    if (permissionHelpEl) permissionHelpEl.style.display = "block";
    throw errPerm;
  }
}

/* ========== Start camera + FaceMesh ========== */
async function startCameraAndFaceMesh() {
  log("Setting up FaceMesh + camera...");

  try {
    if (window.FaceMesh && window.FaceMesh.FaceMesh) {
      faceMesh = new window.FaceMesh.FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });
    } else if (window.FaceMesh) {
      faceMesh = new window.FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });
    } else {
      throw new Error(
        "FaceMesh global not found. Make sure mediapipe face_mesh script is included."
      );
    }
  } catch (e) {
    throw new Error("Failed to create FaceMesh: " + e.message);
  }

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  faceMesh.onResults(onResults);

  try {
    if (typeof window.Camera !== "undefined") {
      log("Using window.Camera helper.");
      cameraHelper = new window.Camera(videoEl, {
        onFrame: async () => {
          try {
            await faceMesh.send({ image: videoEl });
          } catch (e) {
            err("faceMesh.send err:", e);
          }
        },
        width: 640,
        height: 480
      });
      cameraHelper.start();
      if (webcamStatusEl) webcamStatusEl.textContent = "Webcam running ✅";
      return;
    }
    if (window.CameraUtils && window.CameraUtils.Camera) {
      log("Using CameraUtils.Camera helper.");
      cameraHelper = new window.CameraUtils.Camera(videoEl, {
        onFrame: async () => {
          try {
            await faceMesh.send({ image: videoEl });
          } catch (e) {
            err("faceMesh.send err:", e);
          }
        },
        width: 640,
        height: 480
      });
      cameraHelper.start();
      if (webcamStatusEl) webcamStatusEl.textContent = "Webcam running ✅";
      return;
    }
  } catch (e) {
    log("Camera helper failed, falling back to getUserMedia", e);
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("getUserMedia not supported.");
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false
  });
  videoEl.srcObject = localStream;
  await videoEl.play();
  if (webcamStatusEl) webcamStatusEl.textContent = "Webcam running ✅";

  (function frameLoop() {
    if (!started || !faceMesh) return;
    try {
      faceMesh.send({ image: videoEl }).catch((e) =>
        err("faceMesh.send inner err", e)
      );
    } catch (e) {
      err("faceMesh.send top-level err", e);
    }
    setTimeout(frameLoop, 50);
  })();
}

/* ========== Focus calculation (EAR) ========== */
function onResults(results) {
  if (
    !results ||
    !results.multiFaceLandmarks ||
    results.multiFaceLandmarks.length === 0
  ) {
    return;
  }

  const lm = results.multiFaceLandmarks[0];

  const L = [33, 160, 158, 133, 153, 144];
  const R = [362, 385, 387, 263, 373, 380];

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function EAR(eye) {
    const A = dist(lm[eye[1]], lm[eye[5]]);
    const B = dist(lm[eye[2]], lm[eye[4]]);
    const C = dist(lm[eye[0]], lm[eye[3]]) + 1e-6;
    return (A + B) / (2.0 * C);
  }

  const ear = (EAR(L) + EAR(R)) / 2;
  const earNorm = Math.max(0, Math.min(1, (ear - 0.12) / (0.35 - 0.12)));
  const focus = earNorm;
  const pct = Math.round(focus * 100);

  if (orbPercentEl) orbPercentEl.innerText = `${pct}%`;

  if (orbEl) {
    const angle = pct * 3.6; // 0–100 -> 0–360deg
    orbEl.style.transform = `scale(${0.9 + focus * 0.3})`;
    orbEl.style.setProperty("--focus-angle", angle + "deg");

    const glow = 0.3 + focus * 0.5;
    orbEl.style.boxShadow = `
      0 0 0 1px rgba(148,163,184,0.4),
      0 18px 45px rgba(15,23,42,0.9),
      0 0 30px rgba(37,99,235, ${glow})
    `;
  }

  if (currentScoreEl) currentScoreEl.innerText = focus.toFixed(2);
  if (currentStateEl) currentStateEl.innerText = started ? "RUNNING" : "IDLE";

  if (started) {
    focusData.push(focus);
    if (sampleCountEl) sampleCountEl.innerText = focusData.length;
    addDataToChart(focus);
  }
}

/* ========== Start ========== */
startBtn.onclick = async () => {
  if (started) return;
  started = true;

  // Tell extension: Flow Mode ON
  window.postMessage(
    { from: "focus-app", type: "FLOW_MODE", enabled: true },
    "*"
  );

  let userMinutes = parseInt(pomoInput.value, 10);
  if (isNaN(userMinutes) || userMinutes <= 0) userMinutes = 25;
  if (userMinutes > 180) userMinutes = 180;

  POMODORO_DURATION = userMinutes * 60;
  remainingSeconds = POMODORO_DURATION;

  log("Starting session for", userMinutes, "minutes");

  startBtn.disabled = true;
  stopBtn.disabled = false;
  focusData = [];

  if (timerEl) timerEl.innerText = formatMMSS(remainingSeconds);
  if (sessionDetailsBox) sessionDetailsBox.style.display = "none";
  if (currentStateEl) currentStateEl.innerText = "RUNNING";
  if (sampleCountEl) sampleCountEl.innerText = "0";
  if (webcamStatusEl) webcamStatusEl.textContent = "Starting camera…";
  if (permissionHelpEl) permissionHelpEl.style.display = "none";

  timerInterval = setInterval(tickTimer, 1000);

  try {
    await ensureCameraPermission();
    await startCameraAndFaceMesh();
    log("Camera & FaceMesh started.");
  } catch (e) {
    err("Camera/FaceMesh start failed:", e);
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    started = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (currentStateEl) currentStateEl.innerText = "IDLE";
    if (webcamStatusEl)
      webcamStatusEl.textContent = "Camera error. Check permissions.";

    window.postMessage(
      { from: "focus-app", type: "FLOW_MODE", enabled: false },
      "*"
    );
  }
};

/* ========== End session / Stop ========== */
stopBtn.onclick = () => endSession(false);

function endSession(finishedNaturally) {
  // Tell extension: Flow Mode OFF
  window.postMessage(
    { from: "focus-app", type: "FLOW_MODE", enabled: false },
    "*"
  );

  if (!started && !timerInterval) return;

  log("Ending session. finishedNaturally =", finishedNaturally);
  started = false;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
  if (currentStateEl) currentStateEl.innerText = "IDLE";

  if (cameraHelper && cameraHelper.stop) {
    try { cameraHelper.stop(); } catch (e) { log("cameraHelper.stop err", e); }
    cameraHelper = null;
  }
  if (localStream) {
    try { localStream.getTracks().forEach((t) => t.stop()); } catch (e) { log("stop tracks err", e); }
    localStream = null;
  }

  const avg =
    focusData.length > 0
      ? focusData.reduce((a, b) => a + b, 0) / focusData.length
      : 0;

  showAnalysis(avg, finishedNaturally);
}

/* ========== Reset ========== */
resetBtn.onclick = () => resetSession();

function resetSession() {
  // Tell extension: Flow Mode OFF
  window.postMessage(
    { from: "focus-app", type: "FLOW_MODE", enabled: false },
    "*"
  );

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  started = false;

  if (cameraHelper && cameraHelper.stop) {
    try { cameraHelper.stop(); } catch (e) { log("cameraHelper.stop err", e); }
    cameraHelper = null;
  }
  if (localStream) {
    try { localStream.getTracks().forEach((t) => t.stop()); } catch (e) { log("stop tracks err", e); }
    localStream = null;
  }

  let userMinutes = parseInt(pomoInput.value, 10);
  if (isNaN(userMinutes) || userMinutes <= 0) userMinutes = 25;
  if (userMinutes > 180) userMinutes = 180;

  POMODORO_DURATION = userMinutes * 60;
  remainingSeconds = POMODORO_DURATION;
  if (timerEl) timerEl.innerText = formatMMSS(remainingSeconds);

  focusData = [];
  if (chart) {
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
  }

  if (orbPercentEl) orbPercentEl.innerText = "0%";
  if (orbEl) {
    orbEl.style.transform = "scale(1)";
    orbEl.style.boxShadow =
      "0 0 0 1px rgba(148,163,184,0.3), 0 18px 45px rgba(15, 23, 42, 0.9), inset 0 -10px 22px rgba(0, 0, 0, 0.6)";
    orbEl.style.setProperty("--focus-angle", "0deg");
  }

  if (currentScoreEl) currentScoreEl.innerText = "0.00";
  if (currentStateEl) currentStateEl.innerText = "IDLE";
  if (sampleCountEl) sampleCountEl.innerText = "0";
  if (sessionDetailsBox) sessionDetailsBox.style.display = "none";
  if (webcamStatusEl) webcamStatusEl.textContent = "Waiting to start session…";

  startBtn.disabled = false;
  stopBtn.disabled = true;
}

/* ========== Analysis UI ========== */
function showAnalysis(avg, finishedNaturally) {
  const avgPct = (avg * 100).toFixed(1);
  const suggestion =
    avg > 0.75
      ? "Excellent Focus!"
      : avg > 0.55
      ? "Good Focus. Small improvements possible."
      : avg > 0.4
      ? "Some distraction. Try silencing phone or short breaks."
      : "Low focus. Consider posture, light, and breaks.";

  const statusText = finishedNaturally
    ? "Session completed (timer finished)."
    : "Session stopped before time ended.";

  if (sessionDetailsBox) {
    sessionDetailsBox.style.display = "block";
    sessionDetailsBox.innerHTML = `
      <h2>Session Details</h2>
      <p><strong>Status:</strong> ${statusText}</p>
      <p><strong>Average Focus:</strong> ${avgPct}%</p>
      <p>${suggestion}</p>
      <p><strong>Samples recorded:</strong> ${focusData.length}</p>
    `;
  } else {
    alert(`${statusText}\nAverage Focus: ${avgPct}%\n${suggestion}`);
  }
}

/* ========== Init on load ========== */
initChart();

// Initialize timer display from input
(() => {
  let userMinutes = parseInt(pomoInput.value, 10);
  if (isNaN(userMinutes) || userMinutes <= 0) userMinutes = 25;
  POMODORO_DURATION = userMinutes * 60;
  remainingSeconds = POMODORO_DURATION;
  if (timerEl) timerEl.innerText = formatMMSS(remainingSeconds);
})();

log("Script loaded. Choose minutes, then click Start.");
