// 最简单的演示：在 DeepSeek 网页右上角加一个绿色小标
const badge = document.createElement("div");
badge.textContent = "PromptFlow 已就绪";
badge.style.cssText = `
  position: fixed; top: 10px; right: 10px;
  background: #10b981; color: white; padding: 6px 12px;
  border-radius: 8px; font-size: 13px; z-index: 99999;
`;
document.body.appendChild(badge);

// 监听来自 Popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
        sendResponse({ status: "ok" });
    }
});
