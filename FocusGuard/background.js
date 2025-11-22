// background.js

let inFlow = false;  // Flow Mode flag

const blockedSites = [
  "youtube.com/shorts",
  "youtube.com/feed/trending",
  "youtube.com/feed/explore",
  "youtube.com/feed/subscriptions",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "netflix.com"
];

function isYoutubeVideo(url) {
  return url.includes("youtube.com/watch?v=");
}

// Load saved flag
chrome.storage.local.get(["inFlow"], (data) => {
  inFlow = data.inFlow || false;
  console.log("[FG] Initial Flow Mode:", inFlow);
});

// Listen to messages (from content.js)
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  if (msg.cmd === "setFlow") {
    inFlow = !!msg.inFlow;
    chrome.storage.local.set({ inFlow });

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: inFlow ? "Flow Mode ON" : "Flow Mode OFF",
      message: inFlow
        ? "Distractions now blocked."
        : "Distractions allowed."
    });

    sendResp && sendResp({ inFlow });
  }
});

// Block distracting URLs only when inFlow = true
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  if (!inFlow) return;

  const url = changeInfo.url;

  // Allow regular YouTube videos
  if (isYoutubeVideo(url)) {
    console.log("[FG] Allowed YouTube video:", url);
    return;
  }

  // Block distracted sections
  for (let site of blockedSites) {
    if (url.includes(site)) {
      console.log("[FG] Blocking:", url);
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL("blocked.html")
      });
      return;
    }
  }
});
