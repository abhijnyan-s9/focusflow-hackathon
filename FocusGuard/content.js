// content.js

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.from !== "focus-app") return;

  if (data.type === "FLOW_MODE") {
    chrome.runtime.sendMessage(
      { cmd: "setFlow", inFlow: !!data.enabled },
      (resp) => {
        console.log("[FG content] Flow mode set to:", resp && resp.inFlow);
      }
    );
  }
});
