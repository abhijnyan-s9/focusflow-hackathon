const statusEl = document.getElementById("status");
const btn = document.getElementById("toggleBtn");

// Show current mode on popup open
chrome.storage.local.get(["inFlow"], (data) => {
  const mode = data.inFlow || false;
  statusEl.textContent = mode
    ? "Flow Mode is ON"
    : "Flow Mode is OFF";
});

// Handle toggle
btn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ cmd: "toggleFlow" }, (resp) => {
    const mode = resp.inFlow;
    statusEl.textContent = mode
      ? "Flow Mode is ON"
      : "Flow Mode is OFF";
  });
});
