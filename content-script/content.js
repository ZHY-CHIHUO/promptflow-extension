// 在 DeepSeek 网页右上角加一个绿色小标（知道扩展已加载）
const badge = document.createElement("div");
badge.textContent = "PromptFlow 已就绪";
badge.style.cssText = `
  position: fixed; top: 10px; right: 10px;
  background: #10b981; color: white; padding: 6px 12px;
  border-radius: 8px; font-size: 13px; z-index: 99999;
`;
document.body.appendChild(badge);

// 接收来自 Popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // 功能1: 读取输入框内容
    if (request.action === "getPrompt") {
        const textarea = document.querySelector("textarea");
        sendResponse({ text: textarea?.value || "" });
        return true;
    }

    // 功能2: 往输入框填文字
    if (request.action === "fillPrompt") {
        const textarea = document.querySelector("textarea");
        if (textarea) {
            textarea.value = request.text;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: "未找到输入框" });
        }
        return true;
    }
});
