// =============================================
// PromptFlow 悬浮球 — 全自动适配 + 边缘吸附 + 位置记忆 + 内嵌面板
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

// ========== 4. 内嵌面板（替代旧快捷菜单）==========
function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "promptflow-panel";

    // 插入样式（只插入一次）
    if (!document.querySelector("#promptflow-panel-style")) {
        const style = document.createElement("style");
        style.id = "promptflow-panel-style";
        style.textContent = `
            #promptflow-panel {
                position: fixed;
                width: 300px;
                max-height: 420px;
                background: #1e1e2e;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.45);
                z-index: 99998;
                display: none;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 13px;
                color: #e0e0e0;
                overflow: hidden;
                opacity: 0;
                transform: translateY(6px) scale(0.97);
                transition: opacity 0.18s, transform 0.18s;
            }
            #promptflow-panel.pf-visible {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
            #promptflow-panel .pf-panel-header {
                padding: 12px;
                border-bottom: 1px solid rgba(255,255,255,0.06);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            #promptflow-panel .pf-search {
                flex: 1;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                padding: 7px 10px;
                color: #e0e0e0;
                font-size: 13px;
                outline: none;
                transition: border-color 0.15s;
            }
            #promptflow-panel .pf-search::placeholder { color: #666; }
            #promptflow-panel .pf-search:focus { border-color: #667eea; }
            #promptflow-panel .pf-actions {
                display: flex;
                gap: 4px;
            }
            #promptflow-panel .pf-btn-icon {
                width: 30px; height: 30px;
                border: none; border-radius: 8px;
                background: rgba(255,255,255,0.06);
                color: #e0e0e0;
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                font-size: 14px;
                transition: background 0.12s, color 0.12s;
            }
            #promptflow-panel .pf-btn-icon:hover { background: rgba(255,255,255,0.12); color: #fff; }
            #promptflow-panel .pf-btn-icon.active { background: #667eea; color: #fff; }
            #promptflow-panel .pf-panel-list {
                flex: 1;
                overflow-y: auto;
                max-height: 280px;
                padding: 6px 8px;
            }
            #promptflow-panel .pf-panel-list::-webkit-scrollbar {
                width: 4px;
            }
            #promptflow-panel .pf-panel-list::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.12);
                border-radius: 2px;
            }
            #promptflow-panel .pf-empty {
                text-align: center;
                padding: 28px 16px;
                color: #666;
                font-size: 13px;
            }
            #promptflow-panel .pf-prompt-item {
                display: flex;
                align-items: flex-start;
                padding: 10px;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.1s;
                gap: 8px;
                margin-bottom: 2px;
            }
            #promptflow-panel .pf-prompt-item:hover {
                background: rgba(255,255,255,0.05);
            }
            #promptflow-panel .pf-prompt-body {
                flex: 1;
                min-width: 0;
            }
            #promptflow-panel .pf-prompt-title {
                font-weight: 600;
                font-size: 13px;
                color: #f0f0f0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-bottom: 3px;
            }
            #promptflow-panel .pf-prompt-meta {
                font-size: 11px;
                color: #777;
                display: flex;
                gap: 8px;
            }
            #promptflow-panel .pf-prompt-preview {
                font-size: 12px;
                color: #999;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-top: 2px;
            }
            #promptflow-panel .pf-btn-fill {
                flex-shrink: 0;
                width: 28px; height: 28px;
                border: none; border-radius: 6px;
                background: rgba(102,126,234,0.2);
                color: #667eea;
                cursor: pointer;
                font-size: 12px;
                display: flex; align-items: center; justify-content: center;
                transition: background 0.12s;
                margin-top: 2px;
            }
            #promptflow-panel .pf-btn-fill:hover {
                background: rgba(102,126,234,0.4);
            }
            #promptflow-panel .pf-panel-footer {
                padding: 8px 12px;
                border-top: 1px solid rgba(255,255,255,0.06);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #promptflow-panel .pf-count {
                font-size: 11px;
                color: #666;
            }
            #promptflow-panel .pf-btn-footer {
                background: transparent;
                border: none;
                color: #888;
                font-size: 12px;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 6px;
                transition: background 0.12s, color 0.12s;
            }
            #promptflow-panel .pf-btn-footer:hover { background: rgba(255,255,255,0.06); color: #bbb; }
            #promptflow-panel .pf-btn-footer.primary { color: #667eea; }
            #promptflow-panel .pf-btn-footer.primary:hover { background: rgba(102,126,234,0.15); }
        `;
        document.head.appendChild(style);
    }

    panel.innerHTML = `
        <div class="pf-panel-header">
            <input class="pf-search" placeholder="搜索已保存的 Prompt..." />
            <div class="pf-actions">
                <button class="pf-btn-icon" id="pf-btn-save" title="保存当前输入框内容">💾</button>
                <button class="pf-btn-icon" id="pf-btn-optimize" title="AI 优化当前 Prompt">✨</button>
            </div>
        </div>
        <div class="pf-panel-list" id="pf-list">
            <div class="pf-empty">加载中...</div>
        </div>
        <div class="pf-panel-footer">
            <span class="pf-count" id="pf-count"></span>
            <button class="pf-btn-footer primary" id="pf-btn-manage">打开管理面板 ▸</button>
        </div>
    `;

    return panel;
}

// 如果旧面板存在则移除，防止冲突
const oldPanel = document.querySelector("#promptflow-panel");
if (oldPanel) oldPanel.remove();

const panel = buildPanel();
document.body.appendChild(panel);

// 面板引用缓存
const listEl = panel.querySelector("#pf-list");
const searchEl = panel.querySelector(".pf-search");
const countEl = panel.querySelector("#pf-count");
const btnSave = panel.querySelector("#pf-btn-save");
const btnOptimize = panel.querySelector("#pf-btn-optimize");
const btnManage = panel.querySelector("#pf-btn-manage");

// ========== 5. 面板定位 ==========
function positionPanel() {
    const ballRect = ball.getBoundingClientRect();
    const ballCenter = ballRect.left + ballRect.width / 2;
    const screenCenter = window.innerWidth / 2;
    const gap = 12;

    let left, top = ballRect.top;

    if (ballCenter < screenCenter) {
        left = ballRect.right + gap;
    } else {
        left = ballRect.left - panel.offsetWidth - gap;
    }

    // 右侧超界
    if (left + panel.offsetWidth > window.innerWidth - 8) {
        left = window.innerWidth - panel.offsetWidth - 8;
    }
    // 左侧超界
    if (left < 8) left = 8;
    // 底部超界
    if (top + panel.offsetHeight > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
    }
    // 顶部超界
    if (top < 8) top = 8;

    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
}

// ========== 6. 面板显隐 ==========
function showPanel() {
    positionPanel();
    panel.style.display = "flex";
    requestAnimationFrame(() => {
        requestAnimationFrame(() => panel.classList.add("pf-visible"));
    });
    loadPrompts();
    searchEl.focus();
}

function hidePanel() {
    panel.classList.remove("pf-visible");
    setTimeout(() => { panel.style.display = "none"; }, 180);
}

function togglePanel() {
    if (panel.style.display === "flex" && panel.classList.contains("pf-visible")) {
        hidePanel();
    } else {
        showPanel();
    }
}

// 点击面板外部关闭
document.addEventListener("click", (e) => {
    if (
        panel.style.display === "flex" &&
        panel.classList.contains("pf-visible") &&
        !panel.contains(e.target) &&
        e.target !== ball
    ) {
        hidePanel();
    }
});

// 禁止面板内部点击冒泡导致关闭
panel.addEventListener("click", (e) => e.stopPropagation());

// ========== 7. 数据加载与渲染 ==========
async function loadPrompts(searchText = "") {
    listEl.innerHTML = '<div class="pf-empty">加载中...</div>';

    let prompts;
    try {
        const res = await chrome.runtime.sendMessage({
            action: searchText ? "db:searchPrompts" : "db:getAllPrompts",
            query: searchText || undefined
        });
        prompts = res?.prompts || res || [];
        // 兼容不同返回格式
        if (!Array.isArray(prompts)) prompts = [];
    } catch (err) {
        prompts = [];
    }

    if (prompts.length === 0) {
        listEl.innerHTML = '<div class="pf-empty">还没有保存的 Prompt<br>在输入框写好内容后点击 💾 保存</div>';
        countEl.textContent = "共 0 条";
    } else {
        listEl.innerHTML = prompts.map(p => {
            const title = p.title || p.promptText?.slice(0, 40) || "无标题";
            const content = p.content || p.promptText || "";
            const preview = content.slice(0, 60).replace(/\n/g, " ");
            const source = p.source || p.platform || "";
            const platform = p.platform || "";
            const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString("zh-CN") : "";
            return `
                <div class="pf-prompt-item" data-id="${p.id}">
                    <div class="pf-prompt-body">
                        <div class="pf-prompt-title">${escapeHtml(title)}</div>
                        <div class="pf-prompt-meta">
                            ${source ? `<span>📌 ${escapeHtml(source)}</span>` : ""}
                            ${date ? `<span>${date}</span>` : ""}
                        </div>
                        <div class="pf-prompt-preview">${escapeHtml(preview)}</div>
                    </div>
                    <button class="pf-btn-fill" title="填入输入框">▶</button>
                </div>
            `;
        }).join("");
        countEl.textContent = `共 ${prompts.length} 条`;
    }

    // 绑定点击事件
    listEl.querySelectorAll(".pf-prompt-item").forEach(item => {
        item.addEventListener("click", async (e) => {
            // 如果点击的是填充按钮，不触发整行点击
            if (e.target.closest(".pf-btn-fill")) return;
            // 整行点击也执行填充
            await fillPromptById(item.dataset.id);
        });
    });

    listEl.querySelectorAll(".pf-btn-fill").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await fillPromptById(btn.closest(".pf-prompt-item").dataset.id);
        });
    });
}

async function fillPromptById(promptId) {
    let content;
    try {
        const res = await chrome.runtime.sendMessage({
            action: "db:getPrompt",
            id: promptId
        });
        content = res?.content || res?.promptText || "";
    } catch (err) {
        return toast("❌ 获取失败");
    }

    if (!content) return toast("⚠️ 内容为空");

    const success = setInputText(content);
    if (success) {
        toast("✅ 已填入输入框");
    } else {
        toast("⚠️ 未找到输入框");
    }
    hidePanel();
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ========== 8. 搜索过滤 ==========
let searchTimer;
searchEl.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        loadPrompts(searchEl.value.trim());
    }, 250);
});

// ========== 9. 按钮事件 ==========
btnSave.addEventListener("click", (e) => {
    e.stopPropagation();
    savePrompt();
});

btnOptimize.addEventListener("click", (e) => {
    e.stopPropagation();
    optimizePrompt();
});

btnManage.addEventListener("click", (e) => {
    e.stopPropagation();
    // 尝试打开 Popup（Manifest V3 限制，只能通过 chrome.action 触发）
    // 降级方案：提示用户点击扩展图标
    try {
        chrome.runtime.sendMessage({ action: "openPopup" });
    } catch (_) { /* ignore */ }
    toast("📋 请点击浏览器工具栏的扩展图标打开管理面板");
});

// ========== 10. 消息通信 ==========
chrome.runtime.onMessage.addListener((req, sender, res) => {
    if (req.action === "getPrompt") { res({ text: getInputText() }); return true; }
    if (req.action === "fillPrompt") { res({ success: setInputText(req.text) }); return true; }
    if (req.action === "refreshPanel") { loadPrompts(searchEl.value.trim()); return true; }
});

// ========== 11. 核心操作（保留原有逻辑）==========
async function savePrompt() {
    const text = getInputText();
    if (!text) return toast("⚠️ 输入框为空");
    const r = await chrome.runtime.sendMessage({
        action: "db:addPrompt",
        payload: { promptText: text, source: getPlatformLabel(), platform: location.hostname }
    });
    if (r?.error === "DUPLICATE") toast("⚠️ 已保存过");
    else if (r && !r.error) {
        toast("✅ 已保存！");
        // 如果面板开着，刷新列表
        if (panel.style.display === "flex") loadPrompts(searchEl.value.trim());
    }
    else toast("❌ " + (r?.error || "失败"));
}

function optimizePrompt() {
    const text = getInputText();
    if (!text) return toast("⚠️ 输入框为空");
    setInputText("你是一位世界级的提示词优化专家。请优化以下提示词，使其更加清晰、结构化、可操作。直接输出优化后的版本，不要加任何解释。\n\n原提示词：\n" + text);
    toast("✨ Meta-prompt 已填入，请手动发送");
}

// ========== 12. Toast 提示 ==========
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

// ========== 13. 位置记忆 ==========
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

// ========== 14. 键盘快捷键 ==========
document.addEventListener("keydown", (e) => {
    // Ctrl+Shift+P 打开面板
    if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        togglePanel();
    }
    // Esc 关闭面板
    if (e.key === "Escape" && panel.style.display === "flex" && panel.classList.contains("pf-visible")) {
        hidePanel();
    }
});

// 启动时恢复位置
restorePosition();
