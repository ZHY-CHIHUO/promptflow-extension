// =============================================
// PromptFlow 悬浮球 — Content Script
// =============================================

// ---------- 1. 创建悬浮球 ----------
const ball = document.createElement("div");
ball.id = "promptflow-ball";
ball.innerHTML = "PF";
ball.style.cssText = `
  position: fixed;
  bottom: 120px;
  right: 30px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 14px;
  font-weight: bold;
  font-family: sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 99999;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: transform 0.15s, box-shadow 0.15s;
  user-select: none;
`;
ball.addEventListener("mouseenter", () => {
    ball.style.transform = "scale(1.1)";
    ball.style.boxShadow = "0 6px 20px rgba(102, 126, 234, 0.6)";
});
ball.addEventListener("mouseleave", () => {
    ball.style.transform = "scale(1)";
    ball.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
});
document.body.appendChild(ball);

// ---------- 2. 悬浮球可拖动 ----------
let isDragging = false, startX, startY, startLeft, startTop;

ball.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = ball.offsetLeft;
    startTop = ball.offsetTop;
    ball.style.transition = "none";
});

document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    ball.style.left = (startLeft + e.clientX - startX) + "px";
    ball.style.top = (startTop + e.clientY - startY) + "px";
    ball.style.right = "auto";
    ball.style.bottom = "auto";
});

document.addEventListener("mouseup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    ball.style.transition = "transform 0.15s, box-shadow 0.15s";
    // 如果几乎没移动，视为点击
    if (Math.abs(e.clientX - startX) < 3 && Math.abs(e.clientY - startY) < 3) {
        handleBallClick();
    }
});

// ---------- 3. 创建快捷面板 ----------
const panel = document.createElement("div");
panel.id = "promptflow-panel";
panel.style.cssText = `
  position: fixed;
  bottom: 180px;
  right: 30px;
  width: 260px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15);
  z-index: 99998;
  display: none;
  flex-direction: column;
  padding: 8px;
  font-family: sans-serif;
  font-size: 14px;
  color: #333;
`;
document.body.appendChild(panel);

// 面板菜单项
const menuItems = [
    { label: "💾 保存当前 Prompt", action: "save" },
    { label: "📋 查看已保存的 Prompt", action: "list" },
    { label: "📝 模板填入", action: "template" },
    { label: "✨ AI 优化当前 Prompt", action: "optimize" },
];

menuItems.forEach(item => {
    const btn = document.createElement("div");
    btn.textContent = item.label;
    btn.style.cssText = `
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.1s;
  `;
    btn.addEventListener("mouseenter", () => btn.style.background = "#f3f4f6");
    btn.addEventListener("mouseleave", () => btn.style.background = "transparent");
    btn.addEventListener("click", () => handleMenuAction(item.action));
    panel.appendChild(btn);
});

// ---------- 4. 消息监听（供 Popup 调用） ----------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPrompt") {
        const textarea = document.querySelector("textarea");
        sendResponse({ text: textarea?.value || "" });
        return true;
    }
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

// ---------- 5. 核心操作 ----------
function handleBallClick() {
    // 切换面板显示
    panel.style.display = panel.style.display === "flex" ? "none" : "flex";
}

function handleMenuAction(action) {
    panel.style.display = "none";
    switch (action) {
        case "save":
            savePrompt();
            break;
        case "list":
            showToast("📋 请在扩展 Popup 中查看完整列表");
            break;
        case "template":
            showToast("📝 模板功能开发中...");
            break;
        case "optimize":
            optimizePrompt();
            break;
    }
}

function getPromptText() {
    const textarea = document.querySelector("textarea");
    return textarea?.value?.trim() || "";
}

function savePrompt() {
    const text = getPromptText();
    if (!text) {
        showToast("⚠️ 输入框为空，请先输入 Prompt");
        return;
    }
    // 保存到 chrome.storage（临时方案，后面换 IndexedDB）
    chrome.storage.local.get({ prompts: [] }, (data) => {
        const prompts = data.prompts;
        prompts.unshift({
            id: crypto.randomUUID(),
            promptText: text,
            source: "deepseek",
            createdAt: Date.now(),
        });
        chrome.storage.local.set({ prompts }, () => {
            showToast("✅ 已保存！(" + text.slice(0, 15) + "...)");
        });
    });
}

function optimizePrompt() {
    const text = getPromptText();
    if (!text) {
        showToast("⚠️ 输入框为空，请先输入 Prompt");
        return;
    }
    // 拼好 meta-prompt，填入输入框，让用户手动发送
    const metaPrompt = `你是一位世界级的提示词优化专家。请优化以下提示词，使其更加清晰、结构化、可操作。直接输出优化后的版本，不要加任何解释。

原提示词：
${text}`;

    const textarea = document.querySelector("textarea");
    if (textarea) {
        textarea.value = metaPrompt;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        showToast("✨ Meta-prompt 已填入，请手动发送");
    }
}

// ---------- 6. Toast 提示 ----------
function showToast(message) {
    const existing = document.querySelector("#promptflow-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "promptflow-toast";
    toast.textContent = message;
    toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-family: sans-serif;
    z-index: 100000;
    opacity: 0;
    transition: opacity 0.3s;
  `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => { toast.style.opacity = "1"; });
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
