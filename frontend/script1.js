// frontend/script.js (robust debug-friendly version)

// ---------- CONFIG ----------
const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";

// DOM
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const timerEl = document.getElementById("timer");
const video = document.getElementById("video");
const focusValueEl = document.getElementById("focusValue");
const analysisBox = document.getElementById("analysisBox");
const canvasEl = document.getElementById("chartCanvas");

let ws;
let started = false;
let timerInterval;
let seconds = 0;
let focusData = [];
let chart;
let faceMesh;
let cameraHelper;
let localStream;

// ----- helper logs -----
function log(...args){ console.log("[FT]" , ...args); }
function err(...args){ console.error("[FT]" , ...args); }

// ----- timer -----
function updateTimer(){ seconds++; timerEl.innerText = String(Math.floor(seconds/60)).padStart(2,'0') + ":" + String(seconds%60).padStart(2,'0'); }

// ----- chart init -----
function initChart(){
  if(!canvasEl){ log("no canvas element"); return; }
  chart = new Chart(canvasEl, {
    type:"line",
    data:{ labels:[], datasets:[ { label:"Focus Score", data:[], tension:0.3 } ] },
    options:{ responsive:true, animation:false, scales:{ y:{ min:0, max:1 } } }
  });
}
function addDataToChart(score){
  if(!chart) return;
  chart.data.labels.push(chart.data.labels.length);
  chart.data.datasets[0].data.push(score);
  if(chart.data.labels.length>120){ chart.data.labels.shift(); chart.data.datasets[0].data.shift(); }
  chart.update();
}

// ----- start/stop handlers -----
startBtn.onclick = async () => {
  if(started) return;
  started = true;
  startBtn.disabled = true; stopBtn.disabled = false;
  focusData = []; seconds = 0; timerEl.innerText = "00:00"; analysisBox.style.display = "none";
  timerInterval = setInterval(updateTimer, 1000);
  initWebSocket();
  try {
    await startCameraAndFaceMesh();
    log("Camera + FaceMesh started successfully.");
  } catch(e){
    err("startCameraAndFaceMesh failed:", e);
    // stop timer if camera didn't start
    clearInterval(timerInterval);
    started = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
};

stopBtn.onclick = () => endSession();

function endSession(){
  started = false;
  clearInterval(timerInterval);
  stopBtn.disabled = true; startBtn.disabled = false;
  if(ws && ws.readyState===1) ws.close();
  if(cameraHelper && cameraHelper.stop) try{ cameraHelper.stop(); }catch(e){ log("cameraHelper.stop err",e); }
  if(localStream){
    localStream.getTracks().forEach(t=>t.stop());
    localStream = null;
  }
  let avg = focusData.length ? (focusData.reduce((a,b)=>a+b,0)/focusData.length) : 0;
  showAnalysis(avg);
}

// ----- analysis -----
function showAnalysis(avg){
  analysisBox.style.display = "block";
  let suggestion = avg > 0.75 ? "Excellent Focus!" :
                   avg > 0.55 ? "Good Focus. A little improvement needed." :
                   avg > 0.40 ? "Some distraction. Reduce phone/notifications." :
                   "Low focus. Try posture, light, short breaks.";
  analysisBox.innerHTML = `<h2>Session Summary</h2>
    <p><b>Average Focus:</b> ${(avg*100).toFixed(1)}%</p><p>${suggestion}</p>`;
}

// ----- websocket -----
function initWebSocket(){
  try{
    ws = new WebSocket(WS_URL);
    ws.onopen = ()=> log("WS connected to", WS_URL);
    ws.onclose = ()=> log("WS closed");
    ws.onerror = (e)=> err("WS error", e);
    ws.onmessage = (m)=> { /* optional display of server-sent */ };
  }catch(e){
    err("WS init failed:", e);
  }
}

// ----- camera & mediapipe -----
async function startCameraAndFaceMesh(){
  log("startCameraAndFaceMesh: checking MediaPipe globals...");
  // check FaceMesh and Camera presence
  const hasFaceMeshGlobal = typeof (window.FaceMesh) !== "undefined" || typeof (window.faceMesh) !== "undefined";
  const hasCameraUtils = typeof (window.Camera) !== "undefined" || typeof (window.CameraUtils) !== "undefined" || typeof (window.cameraUtils) !== "undefined";
  log("FaceMesh global exists:", hasFaceMeshGlobal, "Camera util exists:", hasCameraUtils);

  // create FaceMesh instance (wrap in try/catch)
  try{
    // Some CDN expose FaceMesh as FaceMesh.FaceMesh
    if(window.FaceMesh && window.FaceMesh.FaceMesh){
      faceMesh = new window.FaceMesh.FaceMesh({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    } else if(window.FaceMesh){
      // fallback
      faceMesh = new window.FaceMesh({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    } else {
      throw new Error("FaceMesh global not found (FaceMesh or FaceMesh.FaceMesh)");
    }
  } catch(e){
    throw new Error("Failed to create FaceMesh instance: " + e.message);
  }

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults(onResults);

  // If the provided Camera helper exists, use it. Otherwise use getUserMedia fallback.
  try {
    if(typeof window.Camera !== "undefined"){
      log("Using window.Camera helper.");
      cameraHelper = new window.Camera(video, { onFrame: async () => { await faceMesh.send({image: video}); }, width: 640, height: 480 });
      cameraHelper.start();
      return;
    }
    // Some builds expose camera as CameraUtils.Camera
    if(window.CameraUtils && window.CameraUtils.Camera){
      log("Using CameraUtils.Camera helper.");
      cameraHelper = new window.CameraUtils.Camera(video, { onFrame: async ()=>{ await faceMesh.send({image: video}); }, width:640, height:480 });
      cameraHelper.start();
      return;
    }
  } catch(e){
    log("Camera helper failed:", e);
  }

  // Fallback: manually getUserMedia and feed frames to faceMesh
  log("Falling back to navigator.mediaDevices.getUserMedia()");
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("No getUserMedia available in this browser.");
  localStream = await navigator.mediaDevices.getUserMedia({ video: { width:640, height:480 }, audio: false });
  video.srcObject = localStream;
  await video.play();

  // Use a tiny loop to send frames to faceMesh at ~20 fps
  let stopped = false;
  (function frameLoop(){
    if(!started || !faceMesh) { stopped = true; return; }
    try {
      faceMesh.send({ image: video }).catch(e=>err("faceMesh.send err", e));
    } catch(e){
      err("faceMesh.send top err", e);
    }
    setTimeout(()=>{ if(!stopped) frameLoop(); }, 50); // 20 FPS
  })();
}

// ----- focus calc on Results -----
function onResults(results){
  if(!results || !results.multiFaceLandmarks || results.multiFaceLandmarks.length===0){
    // no face found this frame
    return;
  }
  const lm = results.multiFaceLandmarks[0];

  // eye indices
  const L = [33,160,158,133,153,144];
  const R = [362,385,387,263,373,380];

  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function EAR(eye){
    const A = dist(lm[eye[1]], lm[eye[5]]);
    const B = dist(lm[eye[2]], lm[eye[4]]);
    const C = dist(lm[eye[0]], lm[eye[3]]) + 1e-6;
    return (A + B) / (2.0 * C);
  }

  let ear = (EAR(L) + EAR(R)) / 2;
  let earNorm = Math.max(0, Math.min(1, (ear - 0.12) / (0.35 - 0.12)));
  let focus = earNorm;

  focusValueEl.innerText = `Focus: ${(focus*100).toFixed(1)}%`;
  focusData.push(focus);
  addDataToChart(focus);

  if(ws && ws.readyState === 1){
    ws.send(JSON.stringify({ score: focus, ts: Date.now() }));
  }
}

// ----- init chart on load -----
initChart();
log("script loaded. Waiting for Start Session.");
