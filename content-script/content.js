// =============================================
// PromptFlow 悬浮球 — 单击打开操作面板 / 查看Prompt回填
// =============================================

// ========== 设置（从 chrome.storage 读取并实时监听） ==========
const SETTINGS_KEY = "pf_settings";
const DEFAULT_SETTINGS = {
  ballEnabled: true,
  blacklist: "",
};
let pfSettings = { ...DEFAULT_SETTINGS };

// 判断当前网站是否在黑名单中
function isCurrentSiteBlacklisted() {
  if (!pfSettings.blacklist) return false;
  const host = location.hostname;
  return pfSettings.blacklist
    .split(/[\n,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => host === entry || host.endsWith("." + entry));
}

// ========== 智能输入框探测 ==========
function detectInputElement() {
  // 优先：已知 AI 平台的专用选择器
  const knownSelectors = [
    // Qwen Chat — 精确到 textarea
    "textarea.message-input-textarea",
    '[class*="qwen"] textarea',
    '[class*="qwen"] [contenteditable="true"]',
    '[class*="qwen"] [role="textbox"]',
    // ChatGPT
    "#prompt-textarea",
    '[class*="prose"] [contenteditable="true"]',
    // Claude
    '[class*="ProseMirror"]',
    // 通用 contenteditable
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    // 通用 textarea
    'textarea:not([class*="hidden"]):not([style*="display: none"])',
    // 通用 role="textbox"
    '[role="textbox"]:not([class*="hidden"])',
  ];

  for (const sel of knownSelectors) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      if (isVisible(el) && isLikelyInput(el)) return el;
    }
  }

  // 兜底：评分匹配
  let bestEl = null,
    bestScore = 0;
  document
    .querySelectorAll(
      'textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]',
    )
    .forEach((el) => {
      if (!isVisible(el)) return;
      const s = scoreElement(el);
      if (s > bestScore) {
        bestScore = s;
        bestEl = el;
      }
    });
  return bestEl;
}

// 替换 isVisible — 增加对 opacity 和 tabindex 的检查
function isVisible(el) {
  const s = window.getComputedStyle(el);
  return (
    s.display !== "none" &&
    s.visibility !== "hidden" &&
    s.opacity !== "0" &&
    el.offsetWidth > 0 &&
    el.offsetHeight > 0
  );
}

// 替换 isLikelyInput — 不再盲目返回 true
function isLikelyInput(el) {
  // 有占位文本且无"hidden"类名 = 极可能是主输入框
  const cls = (el.className || "").toLowerCase();
  if (cls.includes("hidden") || cls.includes("sr-only") || cls.includes("offscreen")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  return true;
}

function isVisible(el) {
  const s = window.getComputedStyle(el);
  return (
    s.display !== "none" && s.visibility !== "hidden" && el.offsetWidth > 0 && el.offsetHeight > 0
  );
}

function isLikelyInput(el) {
  return true;
}

function scoreElement(el) {
  let s = 0;
  const a = el.offsetWidth * el.offsetHeight;
  if (a > 50000) s += 30;
  else if (a > 20000) s += 20;
  else if (a > 5000) s += 10;
  const db = window.innerHeight - el.getBoundingClientRect().bottom;
  if (db < 100) s += 20;
  else if (db < 300) s += 10;
  if (el.getAttribute("placeholder") || el.getAttribute("aria-label")) s += 5;
  if (el.tagName.toLowerCase() === "textarea") s += 5;
  if (el.hasAttribute("contenteditable")) s += 5;
  return s;
}

// ========== 输入框读写 ==========
function getInputElement() {
  return detectInputElement();
}

function getInputText() {
  const el = getInputElement();
  if (!el) return "";
  if (el.hasAttribute("contenteditable")) return (el.innerText || el.textContent || "").trim();
  return el.value || "";
}

function setInputText(text) {
  const el = getInputElement();
  if (!el) return false;

  if (el.hasAttribute("contenteditable") || el.getAttribute("role") === "textbox") {
    el.focus();
    try {
      document.execCommand("selectAll", false, undefined);
      document.execCommand("insertText", false, text);
    } catch (_) {
      el.textContent = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  }

  // textarea / input — 使用更强力的写入方式
  el.focus();

  // React 和某些框架会接管 value setter，需要同时用原生 setter + execCommand 兜底
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype,
    "value",
  )?.set;

  // 方式1：原生 setter + 事件
  if (nativeSetter) {
    nativeSetter.call(el, text);
  } else {
    el.value = text;
  }

  // 显式设置 selection，部分框架用这个判断是"人为输入"
  el.selectionStart = text.length;
  el.selectionEnd = text.length;

  // 触发完整的事件链（input → change → blur→focus 循环）
  el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

  // 方式2（兜底）：如果上述方式被框架拦截，再用 execCommand 尝试一次
  if (el.value !== text) {
    try {
      el.focus();
      el.select();
      document.execCommand("insertText", false, text);
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    } catch (_) {
      // execCommand 在某些 textarea 上不支持，忽略
    }
  }

  return true;
}

function getPlatformLabel() {
  try {
    return new URL(location.href).hostname.replace("www.", "").split(".")[0];
  } catch {
    return location.hostname;
  }
}

// ========== 1. 悬浮球 ==========
const ball = document.createElement("div");
ball.id = "promptflow-ball";
ball.innerHTML = "PF";
ball.style.cssText = `
  position:fixed;top:50%;right:10px;
  width:48px;height:48px;border-radius:50%;
  background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:14px;
  font-weight:bold;font-family:sans-serif;display:flex;align-items:center;justify-content:center;
  cursor:pointer;z-index:99999;box-shadow:0 4px 15px rgba(102,126,234,0.4);
  transition:box-shadow .15s,right .3s ease,left .3s ease;user-select:none;
`;
ball.addEventListener("mouseenter", () => {
  ball.style.boxShadow = "0 6px 20px rgba(102,126,234,0.6)";
});
ball.addEventListener("mouseleave", () => {
  ball.style.boxShadow = "0 4px 15px rgba(102,126,234,0.4)";
});
document.body.appendChild(ball);

function initBallPosition() {
  ball.style.top = window.innerHeight / 2 - ball.offsetHeight / 2 + "px";
}
initBallPosition();

// ========== 2. 拖动 + 单击打开面板 ==========
let dragging = false,
  sx,
  sy,
  sl,
  st;

ball.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  dragging = true;
  sx = e.clientX;
  sy = e.clientY;
  sl = ball.offsetLeft;
  st = ball.offsetTop;
  ball.style.transition = "none";
  ball.style.right = "auto";
  ball.style.left = sl + "px";
  ball.style.top = st + "px";
  ball.style.bottom = "auto";
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
  ball.style.transition = "box-shadow .15s,right .3s ease,left .3s ease";
  snapBall();
  savePosition();
  if (Math.abs(e.clientX - sx) < 3 && Math.abs(e.clientY - sy) < 3) {
    togglePanel();
  }
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

// ========== 4. 操作面板 ==========
function buildPanel() {
  const panel = document.createElement("div");
  panel.id = "promptflow-panel";

  if (!document.querySelector("#promptflow-panel-style")) {
    const style = document.createElement("style");
    style.id = "promptflow-panel-style";
    style.textContent = `
      #promptflow-panel {
        position: fixed; width: 220px;
        background: #ffffff;
        border: 1px solid #e8ecf1;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06);
        z-index: 99998; display: none; flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px; color: #1e1e2e; overflow: hidden;
        opacity: 0; transform: translateY(6px) scale(0.97);
        transition: opacity 0.18s, transform 0.18s;
      }
      #promptflow-panel.pf-visible { opacity: 1; transform: translateY(0) scale(1); }
      #promptflow-panel .pf-title {
        padding: 14px 16px; font-weight: 800; font-size: 14px;
        background: #f8f9fc;
        border-bottom: 1px solid #e8ecf1; color: #1e1e2e;
        letter-spacing: -0.01em;
      }
      #promptflow-panel .pf-actions {
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 14px 16px;
        background: #ffffff;
      }
      #promptflow-panel .pf-btn {
        border: none; border-radius: 10px; padding: 12px 8px; min-height: 60px;
        color: #fff; cursor: pointer; font-size: 13px; font-weight: 600;
        transition: transform 0.12s, box-shadow 0.12s;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      }
      #promptflow-panel .pf-btn:hover { opacity: 0.95; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
      #promptflow-panel .pf-btn:active { transform: scale(0.96); opacity: 0.85; }
      #promptflow-panel .pf-btn .icon { font-size: 18px; }
      #promptflow-panel .pf-btn-save { background: linear-gradient(135deg, #10b981, #059669); }
      #promptflow-panel .pf-btn-optimize { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
      #promptflow-panel .pf-btn-view { background: linear-gradient(135deg, #3b82f6, #2563eb); }
      #promptflow-panel .pf-btn-manage { background: linear-gradient(135deg, #6b7280, #4b5563); }
      #promptflow-panel .pf-btn-extract { background: linear-gradient(135deg, #f59e0b, #d97706); }
    `;
    document.head.appendChild(style);
  }

  // 修改：管理按钮移到最后
  panel.innerHTML = `
    <div class="pf-title">PromptFlow</div>
    <div class="pf-actions">
      <button class="pf-btn pf-btn-save" id="pf-btn-save"><span class="icon">💾</span><span>保存</span></button>
      <button class="pf-btn pf-btn-optimize" id="pf-btn-optimize"><span class="icon">✨</span><span>优化</span></button>
      <button class="pf-btn pf-btn-view" id="pf-btn-view"><span class="icon">📋</span><span>查看</span></button>
      <button class="pf-btn pf-btn-extract" id="pf-btn-extract"><span class="icon">📥</span><span>提取回复</span></button>
      <button class="pf-btn pf-btn-manage" id="pf-btn-manage"><span class="icon">⚙️</span><span>管理</span></button>
    </div>
  `;
  return panel;
}

const oldPanel = document.querySelector("#promptflow-panel");
if (oldPanel) oldPanel.remove();

const panel = buildPanel();
document.body.appendChild(panel);

const btnSave = panel.querySelector("#pf-btn-save");
const btnOptimize = panel.querySelector("#pf-btn-optimize");
const btnView = panel.querySelector("#pf-btn-view");
const btnManage = panel.querySelector("#pf-btn-manage");
const btnExtract = panel.querySelector("#pf-btn-extract");

// ========== 5. 面板定位 ==========
function positionPanel(target, width, height) {
  const ballRect = ball.getBoundingClientRect();
  const gap = 12;
  const panelWidth = width || target.offsetWidth || 220;
  const panelHeight = height || target.offsetHeight || 200;
  let left,
    top = ballRect.top;
  if (ballRect.left - panelWidth - gap >= 8) {
    left = ballRect.left - panelWidth - gap;
  } else if (ballRect.right + gap + panelWidth <= window.innerWidth - 8) {
    left = ballRect.right + gap;
  } else {
    left = window.innerWidth - panelWidth - 8;
  }
  if (top + panelHeight > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - panelHeight - 8);
  }
  if (top < 8) top = 8;
  target.style.left = left + "px";
  target.style.top = top + "px";
  target.style.right = "auto";
  target.style.bottom = "auto";
}

// ========== 6. 面板显隐 ==========
function showPanel() {
  panel.style.display = "flex";
  requestAnimationFrame(() => panel.classList.add("pf-visible"));
  requestAnimationFrame(() => positionPanel(panel, 220, 220));
}

function hidePanel() {
  panel.classList.remove("pf-visible");
  setTimeout(() => (panel.style.display = "none"), 180);
  hideListPanel();
}

function togglePanel() {
  if (panel.style.display === "flex" && panel.classList.contains("pf-visible")) {
    hidePanel();
  } else {
    showPanel();
  }
}

document.addEventListener("click", (e) => {
  if (
    panel.style.display === "flex" &&
    panel.classList.contains("pf-visible") &&
    !panel.contains(e.target) &&
    e.target !== ball &&
    !(listPanel && listPanel.contains(e.target))
  ) {
    hidePanel();
  }
});
panel.addEventListener("click", (e) => e.stopPropagation());

// ========== 7. 统一列表面板 ==========
function buildListPanel() {
  const listPanel = document.createElement("div");
  listPanel.id = "promptflow-list-panel";

  if (!document.querySelector("#promptflow-list-panel-style")) {
    const style = document.createElement("style");
    style.id = "promptflow-list-panel-style";
    style.textContent = `
      #promptflow-list-panel {
        position: fixed; width: 280px; max-height: 420px;
        background: #ffffff;
        border: 1px solid #e8ecf1;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06);
        z-index: 99999; display: none; flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px; color: #1e1e2e; overflow: hidden;
        opacity: 0; transform: translateY(6px) scale(0.97);
        transition: opacity 0.18s, transform 0.18s;
      }
      #promptflow-list-panel.pf-visible { opacity: 1; transform: translateY(0) scale(1); }
      #promptflow-list-panel .pf-list-header {
        padding: 14px 16px; background: #f8f9fc;
        border-bottom: 1px solid #e8ecf1;
        display: flex; align-items: center; justify-content: space-between;
        cursor: move; user-select: none;
      }
      #promptflow-list-panel .pf-list-header:hover { background: #f0f2f6; }
      #promptflow-list-panel .pf-list-title { font-weight: 800; font-size: 14px; color: #1e1e2e; }
      #promptflow-list-panel .pf-list-close {
        background: transparent; border: none; color: #8e8ea8; cursor: pointer;
        font-size: 16px; padding: 2px 6px; border-radius: 6px;
      }
      #promptflow-list-panel .pf-list-close:hover { background: #f0f2f6; color: #5a5a72; }
      #promptflow-list-panel .pf-list-tabs { display: flex; background: #f8f9fc; border-bottom: 1px solid #e8ecf1; }
      #promptflow-list-panel .pf-list-tab {
        flex: 1; padding: 8px 0; text-align: center; cursor: pointer;
        color: #8e8ea8; font-size: 12px; transition: all .15s;
        border-bottom: 2px solid transparent;
      }
      #promptflow-list-panel .pf-list-tab:hover { color: #5a5a72; }
      #promptflow-list-panel .pf-list-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 600; }
      #promptflow-list-panel .pf-list-tab.tmpl-active { color: #14b8a6; border-bottom-color: #14b8a6; font-weight: 600; }
      #promptflow-list-panel .pf-list-search { padding: 10px 16px; background: #ffffff; border-bottom: 1px solid #f0f2f6; }
      #promptflow-list-panel .pf-list-search input {
        width: 100%; padding: 8px 12px; border: 1px solid #e8ecf1;
        border-radius: 8px; background: #f8f9fc; color: #1e1e2e;
        font-size: 13px; outline: none; box-sizing: border-box;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      #promptflow-list-panel .pf-list-search input:focus { border-color: #6d4aff; box-shadow: 0 0 0 3px rgba(109,74,255,0.1); background: #ffffff; }
      #promptflow-list-panel .pf-list-search input::placeholder { color: #b0b0c4; }
      #promptflow-list-panel .pf-list-body { flex: 1; overflow-y: auto; max-height: 300px; padding: 8px 10px; background: #ffffff; }
      #promptflow-list-panel .pf-list-body::-webkit-scrollbar { width: 4px; }
      #promptflow-list-panel .pf-list-body::-webkit-scrollbar-thumb { background: #e8ecf1; border-radius: 2px; }
      #promptflow-list-panel .pf-empty { text-align: center; padding: 30px 20px; color: #8e8ea8; font-size: 13px; }
      #promptflow-list-panel .pf-prompt-item {
        padding: 10px 12px; border-radius: 10px; cursor: pointer;
        transition: background 0.1s, box-shadow 0.1s, transform 0.1s;
        margin-bottom: 6px; border-left: 3px solid transparent;
      }
      #promptflow-list-panel .pf-prompt-item:hover { background: #f8f9fc; box-shadow: 0 1px 2px rgba(0,0,0,0.04); transform: translateY(-1px); border-left-color: #6d4aff; }
      #promptflow-list-panel .pf-prompt-title {
        font-weight: 600; font-size: 13px; color: #1e1e2e;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;
      }
      #promptflow-list-panel .pf-prompt-preview {
        font-size: 12px; color: #8e8ea8;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #promptflow-list-panel .pf-tmpl-item-vars { font-size: 11px; color: #14b8a6; margin-top: 2px; }
      #promptflow-list-panel .pf-list-footer {
        padding: 10px 16px; border-top: 1px solid #f0f2f6; background: #f8f9fc;
        display: flex; justify-content: space-between; align-items: center;
        color: #8e8ea8; font-size: 11px;
      }
    `;
    document.head.appendChild(style);
  }

  listPanel.innerHTML = `
    <div class="pf-list-header" id="pf-list-header">
      <span class="pf-list-title">选择</span>
      <button class="pf-list-close" id="pf-list-close">✕</button>
    </div>
    <div class="pf-list-tabs">
      <div class="pf-list-tab active" data-tab="prompts">📋 Prompt</div>
      <div class="pf-list-tab" data-tab="templates">📝 模板</div>
    </div>
    <div class="pf-list-search">
      <input type="text" id="pf-list-search-input" placeholder="搜索..." />
    </div>
    <div class="pf-list-body" id="pf-list-body"><div class="pf-empty">加载中...</div></div>
    <div class="pf-list-footer"><span id="pf-list-count">0 条</span></div>
  `;
  return listPanel;
}

const oldListPanel = document.querySelector("#promptflow-list-panel");
if (oldListPanel) oldListPanel.remove();

const listPanel = buildListPanel();
document.body.appendChild(listPanel);

const listHeader = listPanel.querySelector("#pf-list-header");
const listBody = listPanel.querySelector("#pf-list-body");
const listCount = listPanel.querySelector("#pf-list-count");
const listSearchInput = listPanel.querySelector("#pf-list-search-input");
const listCloseBtn = listPanel.querySelector("#pf-list-close");
const listTabs = listPanel.querySelectorAll(".pf-list-tab");

let currentListTab = "prompts";

let listDragging = false,
  listStartX = 0,
  listStartY = 0,
  listStartLeft = 0,
  listStartTop = 0;

listHeader.addEventListener("mousedown", (e) => {
  if (e.target.closest("#pf-list-close")) return;
  listDragging = true;
  listStartX = e.clientX;
  listStartY = e.clientY;
  listStartLeft = listPanel.offsetLeft;
  listStartTop = listPanel.offsetTop;
  listPanel.style.transition = "none";
});

document.addEventListener("mousemove", (e) => {
  if (!listDragging) return;
  e.preventDefault();
  let newLeft = listStartLeft + e.clientX - listStartX;
  newLeft = Math.max(0, Math.min(window.innerWidth - listPanel.offsetWidth, newLeft));
  let newTop = listStartTop + e.clientY - listStartY;
  newTop = Math.max(0, Math.min(window.innerHeight - listPanel.offsetHeight, newTop));
  listPanel.style.left = newLeft + "px";
  listPanel.style.top = newTop + "px";
});

document.addEventListener("mouseup", () => {
  if (!listDragging) return;
  listDragging = false;
  listPanel.style.transition = "opacity 0.18s, transform 0.18s";
});

// ========== 8. 列表面板显隐 ==========
function showListPanel(tab) {
  tab = tab || "prompts";
  currentListTab = tab;
  listTabs.forEach((t) => {
    t.classList.remove("active", "tmpl-active");
    if (t.dataset.tab === tab) {
      t.classList.add(tab === "templates" ? "tmpl-active" : "active");
    }
  });
  listPanel.style.display = "flex";
  requestAnimationFrame(() => listPanel.classList.add("pf-visible"));
  requestAnimationFrame(() => positionPanel(listPanel, 280, 420));
  if (tab === "templates") {
    listSearchInput.placeholder = "搜索模板...";
    loadTemplateList();
  } else {
    listSearchInput.placeholder = "搜索 Prompt...";
    loadPromptList();
  }
}

function hideListPanel() {
  listPanel.classList.remove("pf-visible");
  setTimeout(() => (listPanel.style.display = "none"), 180);
}

listCloseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  hideListPanel();
});

document.addEventListener("click", (e) => {
  if (
    listPanel.style.display === "flex" &&
    listPanel.classList.contains("pf-visible") &&
    !listPanel.contains(e.target) &&
    e.target !== ball &&
    !panel.contains(e.target)
  ) {
    hideListPanel();
  }
});
listPanel.addEventListener("click", (e) => e.stopPropagation());

listTabs.forEach((tab) => {
  tab.addEventListener("click", (e) => {
    e.stopPropagation();
    const targetTab = tab.dataset.tab;
    if (targetTab === currentListTab) return;
    currentListTab = targetTab;
    listTabs.forEach((t) => {
      t.classList.remove("active", "tmpl-active");
      if (t.dataset.tab === targetTab) {
        t.classList.add(targetTab === "templates" ? "tmpl-active" : "active");
      }
    });
    listSearchInput.value = "";
    if (targetTab === "templates") {
      listSearchInput.placeholder = "搜索模板...";
      loadTemplateList();
    } else {
      listSearchInput.placeholder = "搜索 Prompt...";
      loadPromptList();
    }
  });
});

let listSearchTimer;
listSearchInput.addEventListener("input", () => {
  clearTimeout(listSearchTimer);
  listSearchTimer = setTimeout(() => {
    const keyword = listSearchInput.value.trim();
    if (currentListTab === "templates") {
      loadTemplateList(keyword);
    } else {
      loadPromptList(keyword);
    }
  }, 250);
});

// ========== 9. Prompt 列表加载与回填 ==========
async function loadPromptList(keyword) {
  keyword = keyword || "";
  listBody.innerHTML = '<div class="pf-empty">加载中...</div>';
  let prompts;
  try {
    const res = await chrome.runtime.sendMessage({ action: "db:getAllPrompts" });
    prompts = res?.prompts || res || [];
    if (!Array.isArray(prompts)) prompts = [];
  } catch (err) {
    prompts = [];
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    prompts = prompts.filter(
      (p) =>
        (p.title || "").toLowerCase().includes(kw) ||
        (p.promptText || "").toLowerCase().includes(kw),
    );
  }
  if (prompts.length === 0) {
    listBody.innerHTML = '<div class="pf-empty">还没有保存的 Prompt</div>';
    listCount.textContent = "0 条";
  } else {
    listBody.innerHTML = prompts
      .map((p) => {
        const title = p.title || p.promptText?.slice(0, 30) || "无标题";
        const content = p.content || p.promptText || "";
        const preview = content.slice(0, 50).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<div class="pf-prompt-item" data-id="${p.id}">
          <div class="pf-prompt-title">${escapeHtml(title)}</div>
          <div class="pf-prompt-preview">${escapeHtml(preview)}</div>
        </div>`;
      })
      .join("");
    listCount.textContent = `${prompts.length} 条`;
  }
  listBody.querySelectorAll(".pf-prompt-item").forEach((item) => {
    item.addEventListener("click", async () => {
      await fillPromptById(item.dataset.id);
    });
  });
}

async function fillPromptById(promptId) {
  let content;
  try {
    const res = await chrome.runtime.sendMessage({ action: "db:getPromptById", payload: promptId });
    content = res?.promptText || "";
  } catch (err) {
    console.error("[PromptFlow] getPrompt failed:", err);
    return toast("❌ 获取失败");
  }
  if (!content) return toast("⚠️ 内容为空");
  const success = setInputText(content);
  if (success) {
    toast("✅ 已填入输入框");
  } else {
    toast("⚠️ 未找到输入框");
  }
  hideListPanel();
  hidePanel();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ========== 模板列表加载与回填 ==========
async function loadTemplateList(keyword) {
  keyword = keyword || "";
  listBody.innerHTML = '<div class="pf-empty">加载中...</div>';
  let templates;
  try {
    const res = await chrome.runtime.sendMessage({ action: "db:getAllTemplates" });
    templates = Array.isArray(res) ? res : [];
  } catch (err) {
    templates = [];
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    templates = templates.filter(
      (t) =>
        (t.title || "").toLowerCase().includes(kw) ||
        (t.templateText || "").toLowerCase().includes(kw),
    );
  }
  if (templates.length === 0) {
    listBody.innerHTML = '<div class="pf-empty">还没有保存的模板</div>';
    listCount.textContent = "0 条";
  } else {
    listBody.innerHTML = templates
      .map((t) => {
        const title = t.title || t.templateText?.slice(0, 30) || "无标题";
        const preview = (t.templateText || "")
          .slice(0, 50)
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const vars = t.variables?.length > 0 ? `📝 ${t.variables.length} 个变量` : "";
        return `<div class="pf-prompt-item" data-id="${t.id}">
          <div class="pf-prompt-title">${escapeHtml(title)}</div>
          <div class="pf-prompt-preview">${escapeHtml(preview)}</div>
          ${vars ? `<div class="pf-tmpl-item-vars">${vars}</div>` : ""}
        </div>`;
      })
      .join("");
    listCount.textContent = `${templates.length} 条`;
  }
  listBody.querySelectorAll(".pf-prompt-item").forEach((item) => {
    item.addEventListener("click", async () => {
      await fillTemplateById(item.dataset.id);
    });
  });
}

async function fillTemplateById(templateId) {
  let template;
  try {
    const res = await chrome.runtime.sendMessage({ action: "db:getAllTemplates" });
    const templates = Array.isArray(res) ? res : [];
    template = templates.find((t) => t.id === templateId);
  } catch (err) {
    console.error("[PromptFlow] getTemplate failed:", err);
    return toast("❌ 获取失败");
  }
  if (!template) return toast("⚠️ 模板不存在");

  const templateText = template.templateText || "";
  if (!templateText) return toast("⚠️ 模板内容为空");

  const vars = extractTemplateVariables(templateText);
  if (vars.length === 0) {
    const success = setInputText(templateText);
    if (success) {
      toast("✅ 已填入模板");
    } else {
      toast("⚠️ 未找到输入框");
    }
    hideListPanel();
    hidePanel();
  } else {
    hideListPanel();
    hidePanel();

    showVariableDialog(
      template.title || "使用模板",
      vars,
      templateText,
      (values) => {
        let result = templateText;
        for (const [key, val] of Object.entries(values)) {
          result = result.replace(new RegExp(escapeRegex(`{{${key}}}`), "g"), val);
        }
        const success = setInputText(result);
        if (success) {
          toast("✅ 已填入模板");
        } else {
          toast("⚠️ 未找到输入框");
        }
      },
      () => {
        showListPanel("templates");
      },
    );
  }
}

function extractTemplateVariables(text) {
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
}

// ========== 10. 按钮事件 ==========
btnSave.addEventListener("click", (e) => {
  e.stopPropagation();
  savePrompt();
});
btnOptimize.addEventListener("click", (e) => {
  e.stopPropagation();
  optimizePrompt();
});
btnView.addEventListener("click", (e) => {
  e.stopPropagation();
  showListPanel("prompts");
});
// 修改：管理按钮点击直接弹出扩展操作面板（Chrome 127+ 支持）
btnManage.addEventListener("click", async (e) => {
  e.stopPropagation();
  hidePanel();
  try {
    const res = await chrome.runtime.sendMessage({ action: "openPopup" });
    if (res?.error) {
      toast("📋 请点击浏览器工具栏的扩展图标打开管理面板");
    }
  } catch (_) {
    toast("📋 请点击浏览器工具栏的扩展图标打开管理面板");
  }
});
btnExtract.addEventListener("click", (e) => {
  e.stopPropagation();
  extractAndSaveResponse();
});

// ========== 11. 消息通信 ==========
chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (req.action === "getPrompt") {
    res({ text: getInputText() });
    return true;
  }
  if (req.action === "fillPrompt") {
    res({ success: setInputText(req.text) });
    return true;
  }
  if (req.action === "refreshPanel") {
    return true;
  }
  if (req.action === "showTemplateDialog") {
    showVariableDialog(req.title, req.variables, req.templateText, (values) => {
      let result = req.templateText;
      for (const [key, val] of Object.entries(values)) {
        result = result.replace(new RegExp(escapeRegex(`{{${key}}}`), "g"), val);
      }
      setInputText(result);
      toast("✅ 已填入模板");
    });
    return true;
  }
});

// ========== 12. 核心操作 ==========
async function savePrompt() {
  const text = getInputText();
  if (!text) return toast("⚠️ 输入框为空");
  let r = null;
  let retries = 2;
  while (retries > 0) {
    try {
      r = await chrome.runtime.sendMessage({
        action: "db:addPrompt",
        payload: { promptText: text, source: getPlatformLabel(), platform: location.hostname },
      });
      break;
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error("[PromptFlow] savePrompt failed:", err);
        return toast("❌ 保存失败，请刷新页面后重试");
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (r?.error === "DUPLICATE") toast("⚠️ 已保存过");
  else if (r && !r.error) toast("✅ 已保存！");
  else toast("❌ " + (r?.error || "失败"));
}

function optimizePrompt() {
  const text = getInputText();
  if (!text) return toast("⚠️ 输入框为空");
  setInputText(
    "你是一位世界级的提示词优化专家。请对以下提示词做两件事，注意：两段之间必须用单独一行 --- 分隔，不得遗漏。" +
      "【优化版】" +
      "优化以下提示词，使其更加清晰、结构化、可操作。" +
      "---" +
      "【模板版】" +
      "分析原提示词，将其改写为一个可复用的模板。核心规则：变量必须使用中文命名，例如 {{项目名称}}、{{目标语言}}、{{角色}}、" +
      "{{输出格式}}、{{核心要求}} 等，禁止使用英文变量名如 {{projectName}}、{{language}} 等。" +
      "直接输出上述两个版本，不要加任何额外解释。" +
      "原提示词：" +
      text,
  );
  toast("✨ 已填入优化+模板请求，请手动发送");
}

// ============================================================
// 提取AI回复并保存
// ============================================================
function findLastAIResponse() {
  const selectors = [
    '[class*="message"]:not([class*="user"]):not([class*="you"])',
    '[class*="assistant"]',
    '[class*="ai-"]',
    '[class*="bot"]',
    '[class*="response"]',
    '[data-message-author-role="assistant"]',
    '[class*="content"]',
  ];
  for (const sel of selectors) {
    const elements = document.querySelectorAll(sel);
    if (elements.length > 0) {
      for (let i = elements.length - 1; i >= 0; i--) {
        const text = elements[i].textContent || elements[i].innerText || "";
        if (text.trim().length > 50) return { element: elements[i], text: text.trim() };
      }
    }
  }
  return null;
}

function extractAndSaveResponse() {
  const result = findLastAIResponse();
  if (!result) return toast("⚠️ 未找到AI回复内容");
  const text = result.text;
  const parts = parseOptimizedResponse(text);
  if (parts.optimized || parts.template) {
    showExtractDialog(parts, (choice) => {
      if (choice === "optimized" && parts.optimized) saveTextAsPrompt(parts.optimized);
      else if (choice === "template" && parts.template) saveTextAsTemplate(parts.template);
      else saveTextAsPrompt(text);
    });
  } else {
    saveTextAsPrompt(text);
  }
}

function extractAndSaveAsTemplate() {
  const result = findLastAIResponse();
  if (!result) return toast("⚠️ 未找到AI回复内容");
  const text = result.text;
  const parts = parseOptimizedResponse(text);
  const templateText = parts.template || parts.optimized || text;
  saveTextAsTemplate(templateText);
}

function parseOptimizedResponse(text) {
  const result = { optimized: null, template: null };
  const optTag = "【优化版】";
  const tplTag = "【模板版】";
  const optIdx = text.indexOf(optTag);
  const tplIdx = text.indexOf(tplTag);

  if (optIdx !== -1 && tplIdx !== -1 && tplIdx > optIdx) {
    result.optimized = text.slice(optIdx + optTag.length, tplIdx).trim();
    result.template = text.slice(tplIdx + tplTag.length).trim();
    return cleanResult(result);
  }

  const sections = text
    .split(/---+|———+|___+|===+|——+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const section of sections) {
    if (section.includes(optTag) || /^1\.?\s*优化版/.test(section)) {
      result.optimized = section.replace(/^1\.?\s*【?优化版】?[\s:：]*/, "").trim();
    } else if (section.includes(tplTag) || /^2\.?\s*模板版/.test(section)) {
      result.template = section.replace(/^2\.?\s*【?模板版】?[\s:：]*/, "").trim();
    }
  }

  if (!result.optimized) {
    const m = text.match(/【?优化版】?[\s:：]*([\s\S]*?)(?=(?:---|———|___|===|【?模板版】?))/);
    if (m) result.optimized = m[1].trim();
  }
  if (!result.template) {
    const m = text.match(/【?模板版】?[\s:：]*([\s\S]*?)$/);
    if (m) result.template = m[1].trim();
  }

  if (!result.optimized) {
    const m = text.match(/1\.?\s*【?优化版】?[\s:：]*([\s\S]*?)(?=(?:2\.?\s*【?模板版】?)|$)/);
    if (m) result.optimized = m[1].trim();
  }
  if (!result.template) {
    const m = text.match(/2\.?\s*【?模板版】?[\s:：]*([\s\S]*?)$/);
    if (m) result.template = m[1].trim();
  }

  return cleanResult(result);
}

function cleanResult(result) {
  for (const key of ["optimized", "template"]) {
    if (result[key]) {
      result[key] = result[key]
        .replace(/^[\s\-—=]+/, "")
        .replace(/[\s\-—=]+$/, "")
        .trim();
    }
  }
  return result;
}

async function saveTextAsPrompt(text) {
  try {
    const r = await chrome.runtime.sendMessage({
      action: "db:addPrompt",
      payload: {
        promptText: text,
        source: getPlatformLabel() + "-提取",
        platform: location.hostname,
        title: "AI优化版 " + new Date().toLocaleTimeString("zh-CN"),
        tags: ["AI优化"],
      },
    });
    if (r?.error === "DUPLICATE") toast("⚠️ 已保存过");
    else if (r && !r.error) toast("✅ 已保存到Prompt列表");
  } catch (err) {
    toast("❌ 保存失败");
  }
}

async function saveTextAsTemplate(text) {
  const variables = extractTemplateVariables(text);
  try {
    const r = await chrome.runtime.sendMessage({
      action: "db:addTemplate",
      payload: {
        templateText: text,
        title: "AI模板 " + new Date().toLocaleTimeString("zh-CN"),
        variables: variables,
        notes: "由AI回复自动提取",
      },
    });
    if (r && !r.error) toast("✅ 已保存到模板列表");
  } catch (err) {
    toast("❌ 保存失败");
  }
}

function showExtractDialog(parts, onSelect) {
  const old = document.querySelector("#pf-extract-dialog");
  if (old) old.remove();
  const dialog = document.createElement("div");
  dialog.id = "pf-extract-dialog";
  dialog.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#ffffff;border:1px solid #e8ecf1;
    border-radius:12px;padding:20px;z-index:100001;
    width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.12);
    font-family:sans-serif;color:#1e1e2e;font-size:13px;
  `;
  const hasOpt = !!parts.optimized;
  const hasTmpl = !!parts.template;
  dialog.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:12px;color:#1e1e2e">选择要保存的内容</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${hasOpt ? '<button id="pf-save-opt" style="padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;cursor:pointer;font-weight:600">保存优化版</button>' : ""}
      ${hasTmpl ? '<button id="pf-save-tmpl" style="padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#ec4899,#db2777);color:#fff;cursor:pointer;font-weight:600">保存模板版</button>' : ""}
      <button id="pf-save-all" style="padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#6b7280,#4b5563);color:#fff;cursor:pointer;font-weight:600">保存全部原文</button>
      <button id="pf-cancel-extract" style="padding:8px;border:none;border-radius:8px;background:#f0f2f6;color:#5a5a72;cursor:pointer;font-weight:500">取消</button>
    </div>`;
  document.body.appendChild(dialog);
  if (hasOpt)
    document.getElementById("pf-save-opt").onclick = () => {
      dialog.remove();
      onSelect("optimized");
    };
  if (hasTmpl)
    document.getElementById("pf-save-tmpl").onclick = () => {
      dialog.remove();
      onSelect("template");
    };
  document.getElementById("pf-save-all").onclick = () => {
    dialog.remove();
    onSelect("all");
  };
  document.getElementById("pf-cancel-extract").onclick = () => {
    dialog.remove();
  };
}

// ========== 13. Toast ==========
function toast(msg) {
  const old = document.querySelector("#promptflow-toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.id = "promptflow-toast";
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed",
    bottom: "80px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1f2937",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily: "sans-serif",
    zIndex: "100000",
    opacity: "0",
    transition: "opacity .3s",
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => (t.style.opacity = "1"));
  setTimeout(() => {
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 300);
  }, 2000);
}

// ========== 14. 位置记忆 ==========
function savePosition() {
  const rect = ball.getBoundingClientRect();
  const ballCenter = rect.left + rect.width / 2;
  const screenCenter = window.innerWidth / 2;
  chrome.storage.local.set({
    pf_ball_position: {
      side: ballCenter < screenCenter ? "left" : "right",
      topPercent: rect.top / window.innerHeight,
    },
  });
}

function restorePosition() {
  chrome.storage.local.get("pf_ball_position", (data) => {
    const pos = data.pf_ball_position;
    if (!pos) return;
    ball.style.transition = "none";
    ball.style.bottom = "auto";
    ball.style.top = pos.topPercent * window.innerHeight + "px";
    if (pos.side === "left") {
      ball.style.left = "10px";
      ball.style.right = "auto";
    } else {
      ball.style.right = "10px";
      ball.style.left = "auto";
    }
    requestAnimationFrame(() => {
      ball.style.transition = "box-shadow .15s,right .3s ease,left .3s ease";
    });
  });
}

// ==================================================================
// 16. 模板填充弹窗
// ==================================================================
function injectModalStyles() {
  if (document.querySelector("#pf-modal-styles")) return;

  const style = document.createElement("style");
  style.id = "pf-modal-styles";
  style.textContent = `
    .pf-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: none; align-items: center; justify-content: center;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    }
    .pf-modal-overlay.pf-modal-show { display: flex; }
    .pf-modal-dialog {
      width: 90%; max-width: 680px; max-height: 80vh;
      background: #ffffff; border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.25);
      display: flex; flex-direction: column; overflow: hidden;
      animation: pf-modal-enter 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes pf-modal-enter {
      from { opacity: 0; transform: scale(0.92) translateY(12px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .pf-modal-header {
      padding: 18px 20px 14px; border-bottom: 1px solid #f0f0f2;
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0; background: #fafafb;
    }
    .pf-modal-header-title { font-weight: 700; font-size: 15px; color: #1e1e2e; letter-spacing: -0.01em; }
    .pf-modal-header-badge {
      font-size: 11px; color: #8e8ea8; background: #f0f2f6;
      padding: 3px 10px; border-radius: 20px; font-weight: 500;
    }
    .pf-modal-body { flex: 1; display: flex; flex-direction: row; overflow: hidden; min-height: 0; }
    .pf-modal-left { flex: 1; display: flex; flex-direction: column; padding: 16px; overflow: hidden; min-width: 0; }
    .pf-modal-right { flex: 1; display: flex; flex-direction: column; padding: 16px; overflow: hidden; min-width: 0; border-left: 1px solid #f0f0f2; background: #fafafb; }
    .pf-modal-section-title { font-size: 11px; color: #8e8ea8; margin-bottom: 10px; flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
    .pf-modal-preview {
      flex: 1; overflow-y: auto; padding: 12px 14px;
      background: #ffffff; border: 1px solid #f0f0f2; border-radius: 10px;
      font-size: 12.5px; line-height: 1.7; color: #1e1e2e;
      white-space: pre-wrap; word-break: break-word;
    }
    .pf-modal-preview::-webkit-scrollbar { width: 4px; }
    .pf-modal-preview::-webkit-scrollbar-thumb { background: #e8ecf1; border-radius: 2px; }
    .pf-modal-preview .pf-var-placeholder { color: #6d4aff; font-weight: 600; background: rgba(109,74,255,0.08); padding: 1px 5px; border-radius: 4px; }
    .pf-modal-preview .pf-var-filled { color: #059669; font-weight: 600; background: rgba(5,150,105,0.1); padding: 1px 5px; border-radius: 4px; }
    .pf-modal-inputs { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px; }
    .pf-modal-inputs::-webkit-scrollbar { width: 4px; }
    .pf-modal-inputs::-webkit-scrollbar-thumb { background: #e8ecf1; border-radius: 2px; }
    .pf-modal-input-group { background: #ffffff; border: 1px solid #f0f0f2; border-radius: 10px; padding: 8px 10px 10px; transition: border-color 0.15s, box-shadow 0.15s; }
    .pf-modal-input-group:focus-within { border-color: #6d4aff; box-shadow: 0 0 0 3px rgba(109,74,255,0.1); }
    .pf-modal-input-group label { display: block; font-size: 11px; color: #8e8ea8; margin-bottom: 4px; font-family: "SF Mono", "Fira Code", monospace; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
    .pf-modal-input-group textarea { width: 100%; padding: 0; border: none; background: transparent; color: #1e1e2e; font-size: 13px; outline: none; resize: none; font-family: inherit; box-sizing: border-box; min-height: 24px; line-height: 1.5; }
    .pf-modal-input-group textarea::placeholder { color: #b0b0c4; }
    .pf-modal-footer { padding: 12px 20px 14px; border-top: 1px solid #f0f0f2; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0; background: #fafafb; }
    .pf-modal-footer button { padding: 8px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }
    .pf-modal-footer .pf-btn-cancel { background: #f0f2f6; color: #5a5a72; }
    .pf-modal-footer .pf-btn-cancel:hover { background: #e5e8ef; color: #1e1e2e; }
    .pf-modal-footer .pf-btn-cancel:active { transform: scale(0.96); }
    .pf-modal-footer .pf-btn-confirm { background: linear-gradient(135deg, #6d4aff, #5a3dcc); color: #fff; box-shadow: 0 2px 8px rgba(109,74,255,0.3); }
    .pf-modal-footer .pf-btn-confirm:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(109,74,255,0.4); }
    .pf-modal-footer .pf-btn-confirm:active { transform: scale(0.96); }
  `;
  document.head.appendChild(style);
}

function injectModalHTML() {
  if (document.querySelector("#pf-modal-overlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "pf-modal-overlay";
  overlay.id = "pf-modal-overlay";
  overlay.innerHTML = `
    <div class="pf-modal-dialog">
      <div class="pf-modal-header">
        <span class="pf-modal-header-title">使用模板</span>
        <span class="pf-modal-header-badge" id="pf-modal-count">0 个变量</span>
      </div>
      <div class="pf-modal-body">
        <div class="pf-modal-left">
          <div class="pf-modal-section-title">预览</div>
          <div class="pf-modal-preview" id="pf-modal-preview"></div>
        </div>
        <div class="pf-modal-right">
          <div class="pf-modal-section-title">变量填写</div>
          <div class="pf-modal-inputs" id="pf-modal-inputs"></div>
        </div>
      </div>
      <div class="pf-modal-footer">
        <button class="pf-btn-cancel" id="pf-modal-cancel">取消</button>
        <button class="pf-btn-confirm" id="pf-modal-confirm">填入模板</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function showVariableDialog(title, variables, templateText, onSubmit, onCancel) {
  injectModalStyles();
  injectModalHTML();

  const overlay = document.getElementById("pf-modal-overlay");
  const titleEl = overlay.querySelector(".pf-modal-header-title");
  const countEl = document.getElementById("pf-modal-count");
  const inputsEl = document.getElementById("pf-modal-inputs");
  const previewEl = document.getElementById("pf-modal-preview");
  const cancelBtn = document.getElementById("pf-modal-cancel");
  const confirmBtn = document.getElementById("pf-modal-confirm");

  titleEl.textContent = title || "使用模板";
  countEl.textContent = `${variables.length} 个变量`;

  inputsEl.innerHTML = variables
    .map((v) => {
      return `<div class="pf-modal-input-group">
        <label>{{${escapeHtml(v)}}}</label>
        <textarea data-var="${escapeHtml(v)}" placeholder="输入 ${escapeHtml(v)}..." rows="1"></textarea>
      </div>`;
    })
    .join("");

  function updatePreview() {
    const values = {};
    inputsEl.querySelectorAll("textarea").forEach((ta) => {
      values[ta.dataset.var] = ta.value;
    });
    const previewHtml = templateText.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const trimmed = varName.trim();
      const val = values[trimmed];
      if (val && val.trim()) {
        return `<span class="pf-var-filled">${escapeHtml(val)}</span>`;
      } else {
        return `<span class="pf-var-placeholder">{{${escapeHtml(trimmed)}}}</span>`;
      }
    });
    previewEl.innerHTML = previewHtml;
    inputsEl.querySelectorAll("textarea").forEach((ta) => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 150) + "px";
    });
  }

  updatePreview();
  inputsEl.querySelectorAll("textarea").forEach((ta) => {
    ta.addEventListener("input", updatePreview);
  });

  const firstInput = inputsEl.querySelector("textarea");
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 150);
  }

  overlay.classList.add("pf-modal-show");

  const newCancelBtn = cancelBtn.cloneNode(true);
  const newConfirmBtn = confirmBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newCancelBtn.addEventListener("click", () => {
    overlay.classList.remove("pf-modal-show");
    if (onCancel) onCancel();
  });

  newConfirmBtn.addEventListener("click", () => {
    const values = {};
    inputsEl.querySelectorAll("textarea").forEach((ta) => {
      values[ta.dataset.var] = ta.value.trim() || `{{${ta.dataset.var}}}`;
    });
    overlay.classList.remove("pf-modal-show");
    onSubmit(values);
  });

  const keyHandler = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      newConfirmBtn.click();
    }
  };
  inputsEl.addEventListener("keydown", keyHandler);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("pf-modal-show");
      if (onCancel) onCancel();
    }
  });
}

// ==================================================================
// 17. 设置应用与监听
// ==================================================================
function applyBallVisibility() {
  const hidden = !pfSettings.ballEnabled || isCurrentSiteBlacklisted();
  ball.style.display = hidden ? "none" : "flex";
  if (hidden) {
    hidePanel();
    hideListPanel();
  }
}

// 启动时读取设置
chrome.storage.local.get(SETTINGS_KEY, (data) => {
  pfSettings = { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  applyBallVisibility();
  restorePosition();
});

// 设置变化时实时生效
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_KEY]) {
    pfSettings = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    applyBallVisibility();
  }
});
