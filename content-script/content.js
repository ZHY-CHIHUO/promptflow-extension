// =============================================
// PromptFlow 悬浮球 — 全自动适配 + 边缘吸附 + 位置记忆
// =============================================

// ========== 智能输入框探测 ==========
function detectInputElement() {
    const editables = document.querySelectorAll('[contenteditable="true"], [contenteditable="plaintext-only"]');
    for (const el of editables) { if (isVisible(el) && isLikelyInput(el)) return el; }
    const textareas = document.querySelectorAll("textarea");
    for (const el of textareas) { if (isVisible(el) && isLikelyInput(el)) return el; }
    const textboxes = document.querySelectorAll('[role="textbox"]');
    for (const el of textboxes) { if (isVisible(el)) return el; }
    let bestEl = null, bestScore = 0;
    document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]').forEach(el => {
        if (!isVisible(el)) return;
        const s = scoreElement(el);
        if (s > bestScore) { bestScore = s; bestEl = el; }
    });
    return bestEl;
}

function isVisible(el) {
    const s = window.getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.offsetWidth > 0 && el.offsetHeight > 0;
}

function isLikelyInput(el) { return true; }

function scoreElement(el) {
    let s = 0;
    const a = el.offsetWidth * el.offsetHeight;
    if (a > 50000) s += 30; else if (a > 20000) s += 20; else if (a > 5000) s += 10;
    const db = window.innerHeight - el.getBoundingClientRect().bottom;
    if (db < 100) s += 20; else if (db < 300) s += 10;
    if (el.getAttribute("placeholder") || el.getAttribute("aria-label")) s += 5;
    if (el.tagName.toLowerCase() === "textarea") s += 5;
    if (el.hasAttribute("contenteditable")) s += 5;
    return s;
}

// ========== 输入框读写 ==========
function getInputElement() { return detectInputElement(); }

function getInputText() {
    const el = getInputElement();
    if (!el) return "";
    if (el.hasAttribute("contenteditable")) return (el.innerText || el.textContent || "").trim();
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

function getPlatformLabel() {
    try { return new URL(location.href).hostname.replace("www.", "").split(".")[0]; }
    catch { return location.hostname; }
}

// ========== 1. 悬浮球 ==========
const ball = document.createElement("div");
ball.id = "promptflow-ball";
ball.innerHTML = "PF";
ball.style.cssText = `
  position:fixed;top:50%;right:10px;transform:translateY(-50%);
  width:48px;height:48px;border-radius:50%;
  background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:14px;
  font-weight:bold;font-family:sans-serif;display:flex;align-items:center;justify-content:center;
  cursor:pointer;z-index:99999;box-shadow:0 4px 15px rgba(102,126,234,0.4);
  transition:transform .15s,box-shadow .15s,right .3s ease,left .3s ease;user-select:none;
`;
ball.addEventListener("mouseenter", () => {
    ball.style.transform = "translateY(-50%) scale(1.1)";
    ball.style.boxShadow = "0 6px 20px rgba(102,126,234,0.6)";
});
ball.addEventListener("mouseleave", () => {
    ball.style.transform = "translateY(-50%) scale(1)";
    ball.style.boxShadow = "0 4px 15px rgba(102,126,234,0.4)";
});
document.body.appendChild(ball);

// ========== 2. 拖动 ==========
let dragging = false, sx, sy, sl, st;

ball.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    sl = ball.offsetLeft; st = ball.offsetTop;
    ball.style.transition = "none";
    ball.style.right = "auto";
    ball.style.left = sl + "px";
    ball.style.top = st + "px";
    ball.style.bottom = "auto";
    ball.style.transform = "none";
});

document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    let newLeft = sl + e.clientX - sx;
    newLeft = Math.max(0, Math.min(window.innerWidth - ball.offsetWidth, newLeft));
    let newTop = st + e.clientY - sy;
    newTop = Math.max(0, Math.min(window.innerHeight - ball.offsetHeight, newTop));
    ball.style.left = newLeft + "px";
    ball.style.top = newTop + "px";
});

document.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    dragging = false;
    ball.style.transition = "transform .15s,box-shadow .15s,right .3s ease,left .3s ease";
    snapBall();
    savePosition();
    ball.style.transform = "translateY(-50%)";
    if (Math.abs(e.clientX - sx) < 3 && Math.abs(e.clientY - sy) < 3) togglePanel();
});

// ========== 3. 吸附 ==========
function snapBall() {
    const rect = ball.getBoundingClientRect();
    const ballCenter = rect.left + rect.width / 2;
    const screenCenter = window.innerWidth / 2;
    ball.style.bottom = "auto";
    ball.style.top = rect.top + "px";
    if (ballCenter < screenCenter) {
        ball.style.left = "10px";
        ball.style.right = "auto";
    } else {
        ball.style.right = "10px";
        ball.style.left = "auto";
    }
}

// ========== 4. 快捷面板 ==========
const panel = document.createElement("div");
panel.id = "promptflow-panel";
Object.assign(panel.style, {
    position: "fixed", width: "260px", background: "#fff",
    borderRadius: "12px", boxShadow: "0 8px 30px rgba(0,0,0,.15)", zIndex: "99998",
    display: "none", flexDirection: "column", padding: "8px",
    fontFamily: "sans-serif", fontSize: "14px", color: "#333"
});
document.body.appendChild(panel);

function positionPanel() {
    const ballRect = ball.getBoundingClientRect();
    const ballCenter = ballRect.left + ballRect.width / 2;
    const screenCenter = window.innerWidth / 2;
    if (ballCenter < screenCenter) {
        panel.style.left = (ballRect.right + 10) + "px";
        panel.style.right = "auto";
    } else {
        panel.style.right = (window.innerWidth - ballRect.left + 10) + "px";
        panel.style.left = "auto";
    }
    panel.style.top = Math.min(ballRect.top, window.innerHeight - 360) + "px";
    panel.style.bottom = "auto";
}

const menuItems = [
    { label: "平台: " + getPlatformLabel(), disabled: true },
    { label: "💾 保存当前 Prompt", action: "save" },
    { label: "📋 查看已保存的 Prompt", action: "list" },
    { label: "✨ AI 优化", action: "optimize" },
];

menuItems.forEach(item => {
    const d = document.createElement("div");
    d.textContent = item.label;
    Object.assign(d.style, {
        padding: "10px 12px", borderRadius: "8px",
        cursor: item.disabled ? "default" : "pointer", transition: "background .1s",
        color: item.disabled ? "#9ca3af" : "", fontSize: item.disabled ? "12px" : ""
    });
    if (!item.disabled) {
        d.addEventListener("mouseenter", () => d.style.background = "#f3f4f6");
        d.addEventListener("mouseleave", () => d.style.background = "transparent");
        d.addEventListener("click", () => { panel.style.display = "none"; handleAction(item.action); });
    }
    panel.appendChild(d);
});

// ========== 5. 消息通信 ==========
chrome.runtime.onMessage.addListener((req, sender, res) => {
    if (req.action === "getPrompt") { res({ text: getInputText() }); return true; }
    if (req.action === "fillPrompt") { res({ success: setInputText(req.text) }); return true; }
});

// ========== 6. 核心操作 ==========
function togglePanel() {
    panel.querySelector("div").textContent = "平台: " + getPlatformLabel();
    positionPanel();
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

// ========== 7. Toast 提示 ==========
function toast(msg) {
    const old = document.querySelector("#promptflow-toast");
    if (old) old.remove();

    const t = document.createElement("div");
    t.id = "promptflow-toast";
    t.textContent = msg;
    Object.assign(t.style, {
        position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)",
        background: "#1f2937", color: "#fff", padding: "10px 20px", borderRadius: "8px",
        fontSize: "14px", fontFamily: "sans-serif", zIndex: "100000",
        opacity: "0", transition: "opacity .3s"
    });
    document.body.appendChild(t);

    requestAnimationFrame(() => t.style.opacity = "1");
    setTimeout(() => {
        t.style.opacity = "0";
        setTimeout(() => t.remove(), 300);
    }, 2000);
}

// ========== 8. 位置记忆 ==========
function savePosition() {
    const rect = ball.getBoundingClientRect();
    const ballCenter = rect.left + rect.width / 2;
    const screenCenter = window.innerWidth / 2;

    const pos = {
        side: ballCenter < screenCenter ? "left" : "right",
        topPercent: rect.top / window.innerHeight
    };
    chrome.storage.local.set({ "pf_ball_position": pos });
}

function restorePosition() {
    chrome.storage.local.get("pf_ball_position", (data) => {
        const pos = data.pf_ball_position;
        if (!pos) return;

        ball.style.transition = "none";
        ball.style.bottom = "auto";
        ball.style.top = (pos.topPercent * window.innerHeight) + "px";

        if (pos.side === "left") {
            ball.style.left = "10px";
            ball.style.right = "auto";
        } else {
            ball.style.right = "10px";
            ball.style.left = "auto";
        }

        requestAnimationFrame(() => {
            ball.style.transition = "transform .15s,box-shadow .15s,right .3s ease,left .3s ease";
        });
    });
}

// 启动时恢复位置
restorePosition();
