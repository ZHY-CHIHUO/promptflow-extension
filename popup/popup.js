// =============================================
// PromptFlow Popup — 紧凑列表 + 编辑面板 + 批量删除
// =============================================

let allPrompts = [];
let currentKeyword = "";
let selectMode = false;          // 是否在批量选择模式
let selectedIds = new Set();     // 选中的 ID
let editingId = null;            // 当前编辑的 Prompt ID

// ============ Tab 切换 ============
document.querySelectorAll(".tab-item").forEach(item => {
    item.addEventListener("click", () => {
        document.querySelectorAll(".tab-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
        document.getElementById(item.dataset.tab).classList.add("active");
    });
});

// ============ 搜索 ============
document.getElementById("searchInput").addEventListener("input", (e) => {
    currentKeyword = e.target.value.trim();
    renderList();
});

// ============ 加载 ============
async function loadPrompts() {
    try {
        const result = await chrome.runtime.sendMessage({ action: "db:getAllPrompts" });
        allPrompts = Array.isArray(result) ? result.sort((a, b) => b.createdAt - a.createdAt) : [];
    } catch (err) {
        // Service Worker 还没准备好，等 500ms 再试一次
        allPrompts = [];
        setTimeout(() => loadPrompts(), 500);
    }
    renderList();
}

// ============ 渲染列表 ============
function renderList() {
    const listEl = document.getElementById("promptList");
    const countEl = document.getElementById("promptCount");
    selectedIds.clear();
    updateSelectUI();

    const filtered = currentKeyword
        ? allPrompts.filter(p =>
            (p.promptText || "").toLowerCase().includes(currentKeyword.toLowerCase()) ||
            (p.title || "").toLowerCase().includes(currentKeyword.toLowerCase())
        )
        : allPrompts;

    countEl.textContent = `${filtered.length} 条`;

    if (filtered.length === 0) {
        listEl.innerHTML = allPrompts.length === 0
            ? `<div class="empty-state"><div class="icon">📋</div><div>还没有保存 Prompt</div><div style="font-size:12px;margin-top:4px;">在 DeepSeek 页面点悬浮球保存</div></div>`
            : `<div class="empty-state"><div class="icon">🔍</div><div>没有匹配的 Prompt</div></div>`;
        return;
    }

    listEl.innerHTML = filtered.map(p => {
        const title = p.title || p.promptText.slice(0, 40) + (p.promptText.length > 40 ? "..." : "");
        const preview = p.promptText.slice(0, 80) + (p.promptText.length > 80 ? "..." : "");
        return `
      <div class="list-item ${selectMode ? 'select-mode' : ''}" data-id="${p.id}">
        <input type="checkbox" class="checkbox" data-id="${p.id}" />
        <div class="info">
          <div class="title-line">${escapeHtml(title)}</div>
          <div class="preview-line">${escapeHtml(preview)}</div>
          <div class="meta-line">${formatTime(p.createdAt)} · ${p.source}</div>
        </div>
      </div>
    `;
    }).join("");

    // ===== 点击列表项（区分单击/双击） =====
    listEl.querySelectorAll(".list-item").forEach(item => {
        let clickTimer = null;

        item.addEventListener("click", (e) => {
            if (e.target.tagName === "INPUT") return;
            const id = item.dataset.id;

            if (selectMode) {
                toggleSelect(id, item.querySelector(".checkbox"));
                return;
            }

            // 如果已经有计时器在跑，说明这是第二次点击 → 双击
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
                openEditPanel(id);
                return;
            }

            // 第一次点击 → 等 300ms，没有第二次点击才算单击回填
            clickTimer = setTimeout(() => {
                clickTimer = null;
                const p = allPrompts.find(x => x.id === id);
                if (p) fillToPage(p);
            }, 300);
        });
    });

    // ===== Checkbox =====
    listEl.querySelectorAll(".checkbox").forEach(cb => {
        cb.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = cb.dataset.id;
            toggleSelect(id, cb);
        });
    });
}

// ============ 选择模式 ============
function toggleSelect(id, cb) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
        if (cb) cb.checked = false;
    } else {
        selectedIds.add(id);
        if (cb) cb.checked = true;
    }
    updateSelectUI();

    // 高亮/取消高亮
    document.querySelectorAll(`.list-item[data-id="${id}"]`).forEach(el => {
        el.classList.toggle("selected", selectedIds.has(id));
    });
}

function updateSelectUI() {
    const count = selectedIds.size;
    document.getElementById("btnBatchDel").classList.toggle("show", selectMode && count > 0);
    document.getElementById("btnBatchDel").textContent = count > 0 ? `删除选中(${count})` : "删除选中";
}

document.getElementById("btnSelect").addEventListener("click", () => {
    selectMode = true;
    selectedIds.clear();
    document.getElementById("btnSelect").style.display = "none";
    document.getElementById("btnCancel").classList.add("show");
    renderList();
});

document.getElementById("btnCancel").addEventListener("click", () => {
    selectMode = false;
    selectedIds.clear();
    document.getElementById("btnSelect").style.display = "";
    document.getElementById("btnCancel").classList.remove("show");
    updateSelectUI();
    renderList();
});

document.getElementById("btnBatchDel").addEventListener("click", () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    showConfirm(`确定删除选中的 ${count} 条 Prompt？`, async () => {
        for (const id of selectedIds) {
            await chrome.runtime.sendMessage({ action: "db:deletePrompt", payload: id });
        }
        allPrompts = allPrompts.filter(p => !selectedIds.has(p.id));
        selectMode = false;
        selectedIds.clear();
        document.getElementById("btnSelect").style.display = "";
        document.getElementById("btnCancel").classList.remove("show");
        updateSelectUI();
        renderList();
        toast(`已删除 ${count} 条`);
    });
});

// ============ 回填 ============
async function fillToPage(p) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        await chrome.tabs.sendMessage(tab.id, { action: "fillPrompt", text: p.promptText });
        toast("已填入");
        window.close();
    } catch (err) {
        toast("请刷新当前页面后重试");
    }
}

// ============ 编辑面板 ============
document.getElementById("epBack").addEventListener("click", closeEditPanel);

document.getElementById("epSave").addEventListener("click", async () => {
    if (!editingId) return;
    const title = document.getElementById("epTitle").value.trim();
    const promptText = document.getElementById("epText").value.trim();
    const notes = document.getElementById("epNotes").value.trim();
    if (!promptText) { toast("内容不能为空"); return; }

    await chrome.runtime.sendMessage({
        action: "db:updatePrompt",
        payload: { id: editingId, updates: { title, promptText, notes } }
    });
    // 更新本地缓存
    const p = allPrompts.find(x => x.id === editingId);
    if (p) { p.title = title; p.promptText = promptText; p.notes = notes; }

    closeEditPanel();
    renderList();
    toast("已保存");
});

document.getElementById("epDelete").addEventListener("click", () => {
    if (!editingId) return;
    showConfirm("确定删除这条 Prompt？", async () => {
        await chrome.runtime.sendMessage({ action: "db:deletePrompt", payload: editingId });
        allPrompts = allPrompts.filter(p => p.id !== editingId);
        closeEditPanel();
        renderList();
        toast("已删除");
    });
});

function openEditPanel(id) {
    const p = allPrompts.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    document.getElementById("epTitle").value = p.title || "";
    document.getElementById("epText").value = p.promptText || "";
    document.getElementById("epNotes").value = p.notes || "";
    document.getElementById("editPanel").classList.add("show");
}

function closeEditPanel() {
    editingId = null;
    document.getElementById("editPanel").classList.remove("show");
}

// ============ 工具函数 ============
function showConfirm(msg, onConfirm) {
    const container = document.getElementById("confirmContainer");
    container.innerHTML = `
    <div class="confirm-overlay">
      <div class="confirm-box">
        <p>${msg}</p>
        <div class="btns">
          <button id="confirmCancel">取消</button>
          <button class="btn-confirm" id="confirmOk">确定</button>
        </div>
      </div>
    </div>
  `;
    document.getElementById("confirmCancel").addEventListener("click", () => container.innerHTML = "");
    document.getElementById("confirmOk").addEventListener("click", () => { container.innerHTML = ""; onConfirm(); });
}

function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => { el.style.opacity = "0"; }, 1800);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
    return new Date(ts).toLocaleDateString("zh-CN");
}

// ============ 启动 ============
loadPrompts();
