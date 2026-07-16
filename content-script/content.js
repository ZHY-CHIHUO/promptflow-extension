// =============================================
// PromptFlow 悬浮球 — 全自动适配所有 AI 网站
// =============================================

// ========== 智能输入框探测 ==========
function detectInputElement() {
    // 优先级从高到低尝试

    // 1. contenteditable 元素（ChatGPT、Claude、Gemini 等）
    const editables = document.querySelectorAll('[contenteditable="true"], [contenteditable="plaintext-only"]');
    for (const el of editables) {
        if (isVisible(el) && isLikelyInput(el)) return el;
    }

    // 2. textarea（DeepSeek、通义千问等）
    const textareas = document.querySelectorAll("textarea");
    for (const el of textareas) {
        if (isVisible(el) && isLikelyInput(el)) return el;
    }

    // 3. role="textbox"
    const textboxes = document.querySelectorAll('[role="textbox"]');
    for (const el of textboxes) {
        if (isVisible(el)) return el;
    }

    // 4. 兜底：页面上最大的可见 textarea 或 contenteditable
    let bestEl = null;
    let bestScore = 0;
    const allCandidates = document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]');
    for (const el of allCandidates) {
        if (!isVisible(el)) continue;
        const score = scoreElement(el);
        if (score > bestScore) { bestScore = score; bestEl = el; }
    }
    return bestEl;
}

// 元素是否可见
function isVisible(el) {
    const style = window.getComputedStyle(el);
    return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        el.offsetWidth > 0 &&
        el.offsetHeight > 0
    );
}

// 判断是否"像 AI 输入框"
function isLikelyInput(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return true;
    if (el.hasAttribute("contenteditable")) return true;
    if (el.getAttribute("role") === "textbox") return true;
    return false;
}

// 给候选元素打分：越大、越靠下、越像输入框的分数越高
function scoreElement(el) {
    let score = 0;

    // 面积越大越好（AI 输入框通常比较宽）
    const area = el.offsetWidth * el.offsetHeight;
    if (area > 50000) score += 30;
    else if (area > 20000) score += 20;
    else if (area > 5000) score += 10;

    // 位置越靠下越好（输入框通常在页面底部）
    const rect = el.getBoundingClientRect();
    const viewportBottom = window.innerHeight;
    const distFromBottom = viewportBottom - rect.bottom;
    if (distFromBottom < 100) score += 20;
    else if (distFromBottom < 300) score += 10;

    // 有 placeholder 加分
    if (el.getAttribute("placeholder") || el.getAttribute("aria-label")) score += 5;

    // 是 textarea 加分
    if (el.tagName.toLowerCase() === "textarea") score += 5;

    // 有 contenteditable 加分
    if (el.hasAttribute("contenteditable")) score += 5;

    return score;
}

// ========== 统一读写 ==========
function getInputElement() {
    return detectInputElement();
}

function getInputText() {
    const el = getInputElement();
    if (!el) return "";
    if (el.hasAttribute("contenteditable")) {
        return (el.innerText || el.textContent || "").trim();
    }
    return el.value || "";
}

function setInputText(text) {
    const el = getInputElement();
    if (!el) return false;

    if (el.hasAttribute("contenteditable")) {
        el.focus();
        el.innerText = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
}

// ========== 平台名 ==========
function getPlatformLabel() {
    try { return new URL(location.href).hostname.replace("www.", "").split(".")[0]; }
    catch { return location.hostname; }
}

// ========== 1. 悬浮球 ==========
const ball = document.createElement("div");
ball.id = "promptflow-ball";
ball.innerHTML = "PF";
ball.style.cssText = `
  position:fixed;bottom:120px;right:30px;width:48px;height:48px;border-radius:50%;
  background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:14px;
  font-weight:bold;font-family:sans-serif;display:flex;align-items:center;justify-content:center;
  cursor:pointer;z-index:99999;box-shadow:0 4px 15px rgba(102,126,234,0.4);
  transition:transform .15s,box-shadow .15s;user-select:none;
`;
ball.onmouseenter = () => { ball.style.transform = "scale(1.1)"; ball.style.boxShadow = "0 6px 20px rgba(102,126,234,0.6)"; };
ball.onmouseleave = () => { ball.style.transform = "scale(1)"; ball.style.boxShadow = "0 4px 15px rgba(102,126,234,0.4)"; };
document.body.appendChild(ball);

// ========== 2. 拖动 ==========
let dragging = false, sx, sy, sl, st;
ball.onmousedown = (e) => {
    if (e.button !== 0) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    sl = ball.offsetLeft; st = ball.offsetTop;
    ball.style.transition = "none";
};
document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    ball.style.left = (sl + e.clientX - sx) + "px";
    ball.style.top = (st + e.clientY - sy) + "px";
    ball.style.right = "auto"; ball.style.bottom = "auto";
});
document.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    dragging = false;
    ball.style.transition = "transform .15s,box-shadow .15s";
    if (Math.abs(e.clientX - sx) < 3 && Math.abs(e.clientY - sy) < 3) togglePanel();
});

// ========== 3. 面板 ==========
const panel = document.createElement("div");
panel.id = "promptflow-panel";
Object.assign(panel.style, {
    position: "fixed", bottom: "180px", right: "30px", width: "260px", background: "#fff",
    borderRadius: "12px", boxShadow: "0 8px 30px rgba(0,0,0,.15)", zIndex: "99998",
    display: "none", flexDirection: "column", padding: "8px", fontFamily: "sans-serif", fontSize: "14px", color: "#333"
});
document.body.appendChild(panel);

const items = [
    { label: "平台: " + getPlatformLabel(), disabled: true },
    { label: "💾 保存当前 Prompt", action: "save" },
    { label: "📋 查看已保存的 Prompt", action: "list" },
    { label: "✨ AI 优化", action: "optimize" },
];
items.forEach(item => {
    const d = document.createElement("div");
    d.textContent = item.label;
    Object.assign(d.style, {
        padding: "10px 12px", borderRadius: "8px",
        cursor: item.disabled ? "default" : "pointer", transition: "background .1s",
        color: item.disabled ? "#9ca3af" : "", fontSize: item.disabled ? "12px" : ""
    });
    if (!item.disabled) {
        d.onmouseenter = () => d.style.background = "#f3f4f6";
        d.onmouseleave = () => d.style.background = "transparent";
        d.onclick = () => { panel.style.display = "none"; handleAction(item.action); };
    }
    panel.appendChild(d);
});

// ========== 4. 消息 ==========
chrome.runtime.onMessage.addListener((req, sender, res) => {
    if (req.action === "getPrompt") { res({ text: getInputText() }); return true; }
    if (req.action === "fillPrompt") { res({ success: setInputText(req.text) }); return true; }
});

// ========== 5. 操作 ==========
function togglePanel() {
    panel.querySelector("div").textContent = "平台: " + getPlatformLabel();
    panel.style.display = panel.style.display === "flex" ? "none" : "flex";
}
function handleAction(act) {
    if (act === "save") savePrompt();
    else if (act === "optimize") optimizePrompt();
    else toast("📋 请在扩展 Popup 中查看");
}
async function savePrompt() {
    const text = getInputText();
    if (!text) return toast("⚠️ 输入框为空");
    const r = await chrome.runtime.sendMessage({
        action: "db:addPrompt",
        payload: { promptText: text, source: getPlatformLabel(), platform: location.hostname }
    });
    if (r.error === "DUPLICATE") toast("⚠️ 已保存过");
    else if (r && !r.error) toast("✅ 已保存！");
    else toast("❌ " + (r?.error || "失败"));
}
function optimizePrompt() {
    const text = getInputText();
    if (!text) return toast("⚠️ 输入框为空");
    setInputText("你是一位世界级的提示词优化专家。请优化以下提示词，使其更加清晰、结构化、可操作。直接输出优化后的版本，不要加任何解释。\n\n原提示词：\n" + text);
    toast("✨ Meta-prompt 已填入，请手动发送");
}

// ========== 6. Toast ==========
function toast(msg) {
    const old = document.querySelector("#promptflow-toast"); if (old) old.remove();
    const t = document.createElement("div"); t.id = "promptflow-toast"; t.textContent = msg;
    Object.assign(t.style, {
        position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)",
        background: "#1f2937", color: "#fff", padding: "10px 20px", borderRadius: "8px",
        fontSize: "14px", fontFamily: "sans-serif", zIndex: "100000", opacity: "0", transition: "opacity .3s"
    });
    document.body.appendChild(t);
    requestAnimationFrame(() => t.style.opacity = "1");
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 2000);
}
