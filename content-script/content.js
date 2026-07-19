// =============================================
// PromptFlow 悬浮球 — 单击打开操作面板 / 查看Prompt回填
// =============================================

// ========== 智能输入框探测 ==========
function detectInputElement() {
  const editables = document.querySelectorAll(
    '[contenteditable="true"], [contenteditable="plaintext-only"]',
  );
  for (const el of editables) {
    if (isVisible(el) && isLikelyInput(el)) return el;
  }
  const textareas = document.querySelectorAll("textarea");
  for (const el of textareas) {
    if (isVisible(el) && isLikelyInput(el)) return el;
  }
  const textboxes = document.querySelectorAll('[role="textbox"]');
  for (const el of textboxes) {
    if (isVisible(el)) return el;
  }
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
        background: #1e1e2e;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45);
        z-index: 99998; display: none; flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px; color: #e0e0e0; overflow: hidden;
        opacity: 0; transform: translateY(6px) scale(0.97);
        transition: opacity 0.18s, transform 0.18s;
      }
      #promptflow-panel.pf-visible { opacity: 1; transform: translateY(0) scale(1); }
      #promptflow-panel .pf-title {
        padding: 12px 14px; font-weight: 600; font-size: 14px;
        border-bottom: 1px solid rgba(255,255,255,0.06); color: #f0f0f0;
      }
      #promptflow-panel .pf-actions {
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 14px;
      }
      #promptflow-panel .pf-btn {
        border: none; border-radius: 10px; padding: 12px 8px; min-height: 60px;
        color: #fff; cursor: pointer; font-size: 13px; font-weight: 600;
        transition: transform 0.12s, opacity 0.12s;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      }
      #promptflow-panel .pf-btn:hover { opacity: 0.9; }
      #promptflow-panel .pf-btn:active { transform: scale(0.95); }
      #promptflow-panel .pf-btn .icon { font-size: 18px; }
      #promptflow-panel .pf-btn-save { background: linear-gradient(135deg, #10b981, #059669); }
      #promptflow-panel .pf-btn-optimize { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
      #promptflow-panel .pf-btn-view { background: linear-gradient(135deg, #3b82f6, #2563eb); }
      #promptflow-panel .pf-btn-manage { background: linear-gradient(135deg, #6b7280, #4b5563); }
      #promptflow-panel .pf-btn-extract { background: linear-gradient(135deg, #f59e0b, #d97706); }
      #promptflow-panel .pf-btn-save-tmpl { background: linear-gradient(135deg, #ec4899, #db2777); }
    `;
    document.head.appendChild(style);
  }

  panel.innerHTML = `
    <div class="pf-title">PromptFlow</div>
    <div class="pf-actions">
      <button class="pf-btn pf-btn-save" id="pf-btn-save"><span class="icon">💾</span><span>保存</span></button>
      <button class="pf-btn pf-btn-optimize" id="pf-btn-optimize"><span class="icon">✨</span><span>优化</span></button>
      <button class="pf-btn pf-btn-view" id="pf-btn-view"><span class="icon">📋</span><span>查看Prompt</span></button>
      <button class="pf-btn pf-btn-manage" id="pf-btn-manage"><span class="icon">⚙️</span><span>管理</span></button>
      <button class="pf-btn pf-btn-extract" id="pf-btn-extract"><span class="icon">📥</span><span>提取回复</span></button>
      <button class="pf-btn pf-btn-save-tmpl" id="pf-btn-save-tmpl"><span class="icon">📝</span><span>存为模板</span></button>
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
const btnSaveTmpl = panel.querySelector("#pf-btn-save-tmpl");

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
  setTimeout(() => {
    panel.style.display = "none";
  }, 180);
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

// ========== 7. Prompt 列表面板 ==========
function buildListPanel() {
  const listPanel = document.createElement("div");
  listPanel.id = "promptflow-list-panel";

  if (!document.querySelector("#promptflow-list-panel-style")) {
    const style = document.createElement("style");
    style.id = "promptflow-list-panel-style";
    style.textContent = `
      #promptflow-list-panel {
        position: fixed; width: 280px; max-height: 420px;
        background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.45);
        z-index: 99999; display: none; flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px; color: #e0e0e0; overflow: hidden;
        opacity: 0; transform: translateY(6px) scale(0.97);
        transition: opacity 0.18s, transform 0.18s;
      }
      #promptflow-list-panel.pf-visible { opacity: 1; transform: translateY(0) scale(1); }
      #promptflow-list-panel .pf-list-header {
        padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex; align-items: center; justify-content: space-between;
        cursor: move; user-select: none;
      }
      #promptflow-list-panel .pf-list-header:hover { background: rgba(255,255,255,0.03); }
      #promptflow-list-panel .pf-list-title { font-weight: 600; font-size: 14px; color: #f0f0f0; }
      #promptflow-list-panel .pf-list-close {
        background: transparent; border: none; color: #888; cursor: pointer;
        font-size: 16px; padding: 2px 6px; border-radius: 6px;
      }
      #promptflow-list-panel .pf-list-close:hover { background: rgba(255,255,255,0.06); color: #fff; }
      #promptflow-list-panel .pf-list-search { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
      #promptflow-list-panel .pf-list-search input {
        width: 100%; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px; background: rgba(255,255,255,0.06); color: #e0e0e0;
        font-size: 13px; outline: none;
      }
      #promptflow-list-panel .pf-list-search input::placeholder { color: #666; }
      #promptflow-list-panel .pf-list-body {
        flex: 1; overflow-y: auto; max-height: 300px; padding: 6px 8px;
      }
      #promptflow-list-panel .pf-list-body::-webkit-scrollbar { width: 4px; }
      #promptflow-list-panel .pf-list-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
      #promptflow-list-panel .pf-empty { text-align: center; padding: 30px 20px; color: #666; font-size: 13px; }
      #promptflow-list-panel .pf-prompt-item {
        padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.1s; margin-bottom: 2px;
      }
      #promptflow-list-panel .pf-prompt-item:hover { background: rgba(255,255,255,0.05); }
      #promptflow-list-panel .pf-prompt-title {
        font-weight: 600; font-size: 13px; color: #f0f0f0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px;
      }
      #promptflow-list-panel .pf-prompt-preview {
        font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #promptflow-list-panel .pf-list-footer {
        padding: 10px 14px; border-top: 1px solid rgba(255,255,255,0.06);
        display: flex; justify-content: space-between; align-items: center; color: #888; font-size: 11px;
      }
    `;
    document.head.appendChild(style);
  }

  listPanel.innerHTML = `
    <div class="pf-list-header" id="pf-list-header">
      <span class="pf-list-title">选择 Prompt</span>
      <button class="pf-list-close" id="pf-list-close">✕</button>
    </div>
    <div class="pf-list-search">
      <input type="text" id="pf-list-search-input" placeholder="搜索 Prompt..." />
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

// 列表面板拖动
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
function showListPanel() {
  listPanel.style.display = "flex";
  requestAnimationFrame(() => listPanel.classList.add("pf-visible"));
  requestAnimationFrame(() => positionPanel(listPanel, 280, 420));
  loadPromptList();
}

function hideListPanel() {
  listPanel.classList.remove("pf-visible");
  setTimeout(() => {
    listPanel.style.display = "none";
  }, 180);
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
        const preview = content.slice(0, 50).replace(/\n/g, " ");
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

let searchTimer;
listSearchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadPromptList(listSearchInput.value.trim());
  }, 250);
});

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
  showListPanel();
});
btnManage.addEventListener("click", (e) => {
  e.stopPropagation();
  try {
    chrome.runtime.sendMessage({ action: "openPopup" });
  } catch (_) {
    /* ignore */
  }
  toast("📋 请点击浏览器工具栏的扩展图标打开管理面板");
});
btnExtract.addEventListener("click", (e) => {
  e.stopPropagation();
  extractAndSaveResponse();
});
btnSaveTmpl.addEventListener("click", (e) => {
  e.stopPropagation();
  extractAndSaveAsTemplate();
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
  if (r?.error === "DUPLICATE") {
    toast("⚠️ 已保存过");
  } else if (r && !r.error) {
    toast("✅ 已保存！");
  } else {
    toast("❌ " + (r?.error || "失败"));
  }
}

function optimizePrompt() {
  const text = getInputText();
  if (!text) return toast("⚠️ 输入框为空");
  setInputText(
    "你是一位世界级的提示词优化专家。请对以下提示词做两件事，注意：两段之间必须用单独一行 --- 分隔，不得遗漏。\n\n" +
      "【优化版】\n" +
      "优化以下提示词，使其更加清晰、结构化、可操作。\n\n" +
      "---\n\n" +
      "【模板版】\n" +
      "分析原提示词，将其改写为一个可复用的模板。核心规则：变量必须使用中文命名，例如 {{项目名称}}、{{目标语言}}、{{角色}}、" +
      "{{输出格式}}、{{核心要求}} 等，禁止使用英文变量名如 {{projectName}}、{{language}} 等。\n\n" +
      "直接输出上述两个版本，不要加任何额外解释。\n\n" +
      "原提示词：\n" +
      text,
  );
  toast("✨ 已填入优化+模板请求，请手动发送");
}

// ============================================================
// 提取AI回复并保存（增强版解析）
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

// ★ 解析函数 — 优化版：直接用 indexOf 定位标记切分
function parseOptimizedResponse(text) {
  const result = { optimized: null, template: null };

  const optTag = "【优化版】";
  const tplTag = "【模板版】";
  const optIdx = text.indexOf(optTag);
  const tplIdx = text.indexOf(tplTag);

  // 策略0：直接按标记索引切分（最可靠，优先使用）
  if (optIdx !== -1 && tplIdx !== -1 && tplIdx > optIdx) {
    result.optimized = text.slice(optIdx + optTag.length, tplIdx).trim();
    result.template = text.slice(tplIdx + tplTag.length).trim();
    // 清理头尾残留的分隔线和空白
    return cleanResult(result);
  }

  // 策略1：按分隔线分割（兜底）
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

  // 策略2：正则提取（最终兜底）
  if (!result.optimized) {
    const m = text.match(/【?优化版】?[\s:：]*([\s\S]*?)(?=(?:---|———|___|===|【?模板版】?))/);
    if (m) result.optimized = m[1].trim();
  }
  if (!result.template) {
    const m = text.match(/【?模板版】?[\s:：]*([\s\S]*?)$/);
    if (m) result.template = m[1].trim();
  }

  // 策略3：按编号
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
        .replace(/^[\s\n\-—=]+/, "")
        .replace(/[\s\n\-—=]+$/, "")
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
    if (r?.error === "DUPLICATE") {
      toast("⚠️ 已保存过");
    } else if (r && !r.error) {
      toast("✅ 已保存到Prompt列表");
    }
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
    if (r && !r.error) {
      toast("✅ 已保存到模板列表");
    }
  } catch (err) {
    toast("❌ 保存失败");
  }
}

function extractTemplateVariables(text) {
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
}

function showExtractDialog(parts, onSelect) {
  const old = document.querySelector("#pf-extract-dialog");
  if (old) old.remove();
  const dialog = document.createElement("div");
  dialog.id = "pf-extract-dialog";
  dialog.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#1e1e2e;border:1px solid rgba(255,255,255,0.08);
    border-radius:12px;padding:20px;z-index:100001;
    width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.45);
    font-family:sans-serif;color:#e0e0e0;font-size:13px;
  `;
  const hasOpt = !!parts.optimized;
  const hasTmpl = !!parts.template;
  dialog.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:12px;color:#f0f0f0">选择要保存的内容</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${hasOpt ? '<button id="pf-save-opt" style="padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;cursor:pointer;font-weight:600">保存优化版</button>' : ""}
      ${hasTmpl ? '<button id="pf-save-tmpl" style="padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#ec4899,#db2777);color:#fff;cursor:pointer;font-weight:600">保存模板版</button>' : ""}
      <button id="pf-save-all" style="padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#6b7280,#4b5563);color:#fff;cursor:pointer;font-weight:600">保存全部原文</button>
      <button id="pf-cancel-extract" style="padding:8px;border:none;border-radius:8px;background:transparent;color:#888;cursor:pointer">取消</button>
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
  const pos = {
    side: ballCenter < screenCenter ? "left" : "right",
    topPercent: rect.top / window.innerHeight,
  };
  chrome.storage.local.set({ pf_ball_position: pos });
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

// ========== 15. 键盘快捷键 ==========
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === "P") {
    e.preventDefault();
    togglePanel();
  }
  if (e.key === "Escape") {
    if (listPanel.style.display === "flex" && listPanel.classList.contains("pf-visible")) {
      hideListPanel();
    } else if (panel.style.display === "flex" && panel.classList.contains("pf-visible")) {
      hidePanel();
    }
  }
});

restorePosition();
