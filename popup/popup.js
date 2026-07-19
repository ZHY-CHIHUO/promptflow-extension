// =============================================
// PromptFlow Popup — 列表 + 多选删除 + 模板 + 设置
// =============================================

let allPrompts = [];
let currentKeyword = "";
let selectMode = false;
let selectedIds = new Set();
let editingId = null;

// ============ 设置默认值（新增） ============
const SETTINGS_KEY = "pf_settings";
const DEFAULT_SETTINGS = {
  ballEnabled: true,
  ballDefaultSide: "right",
  shortcutEnabled: true,
  blacklist: "",
};
let pfSettings = { ...DEFAULT_SETTINGS };

// ============ Tab 切换 ============
document.querySelectorAll(".tab-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".tab-item").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
    document.getElementById(item.dataset.tab).classList.add("active");
    if (selectMode) exitSelectMode();
    if (tmplSelectMode) exitTmplSelectMode();
    if (item.dataset.tab === "templates") loadTemplates();
  });
});

// ============ Prompt 搜索 ============
document.getElementById("searchInput").addEventListener("input", (e) => {
  currentKeyword = e.target.value.trim();
  renderList();
});

// ============ Prompt 加载 ============
async function loadPrompts() {
  try {
    const result = await chrome.runtime.sendMessage({ action: "db:getAllPrompts" });
    allPrompts = Array.isArray(result) ? result.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch (err) {
    allPrompts = [];
    setTimeout(() => loadPrompts(), 500);
  }
  renderList();
}

// ============ Prompt 列表渲染 ============
function renderList() {
  const listEl = document.getElementById("promptList");
  const countEl = document.getElementById("promptCount");
  const filtered = currentKeyword
    ? allPrompts.filter(
        (p) =>
          (p.promptText || "").toLowerCase().includes(currentKeyword.toLowerCase()) ||
          (p.title || "").toLowerCase().includes(currentKeyword.toLowerCase()),
      )
    : allPrompts;
  countEl.textContent = `${filtered.length} 条`;
  if (filtered.length === 0) {
    listEl.innerHTML =
      allPrompts.length === 0
        ? `<div class="empty-state"><div class="icon">📋</div><div>还没有保存提示词</div></div>`
        : `<div class="empty-state"><div class="icon">🔍</div><div>没有匹配的提示词</div></div>`;
    updateSelectUI();
    return;
  }
  listEl.innerHTML = filtered
    .map((p) => {
      const title = p.title || p.promptText.slice(0, 10) + (p.promptText.length > 10 ? "..." : "");
      const preview = p.promptText.slice(0, 80) + (p.promptText.length > 80 ? "..." : "");
      const checked = selectedIds.has(p.id) ? "checked" : "";
      return `
      <div class="list-item ${selectMode ? "select-mode" : ""}" data-id="${p.id}">
        <input type="checkbox" class="checkbox" data-id="${p.id}" ${checked} />
        <div class="info">
          <div class="title-line">${escapeHtml(title)}</div>
          <div class="preview-line">${escapeHtml(preview)}</div>
          <div class="meta-line">${formatTime(p.createdAt)} · ${p.source || ""}</div>
        </div>
        ${!selectMode ? `<button class="del-btn" data-id="${p.id}" title="删除">🗑</button>` : ""}
      </div>`;
    })
    .join("");

  listEl.querySelectorAll(".list-item .info").forEach((info) => {
    let clickTimer = null;
    info.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = info.closest(".list-item").dataset.id;
      if (selectMode) {
        toggleSelect(id, info.closest(".list-item").querySelector(".checkbox"));
        return;
      }
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        openEditPanel(id);
        return;
      }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        const p = allPrompts.find((x) => x.id === id);
        if (p) fillToPage(p);
      }, 300);
    });
  });

  listEl.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      showConfirm("确定删除这条提示词？", async () => {
        await chrome.runtime.sendMessage({ action: "db:deletePrompt", payload: id });
        allPrompts = allPrompts.filter((x) => x.id !== id);
        renderList();
        toast("已删除");
      });
    });
  });

  listEl.querySelectorAll(".checkbox").forEach((cb) => {
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelect(cb.dataset.id, cb);
    });
  });
}

// ============ Prompt 多选模式 ============
function toggleSelect(id, cb) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    if (cb) cb.checked = false;
  } else {
    selectedIds.add(id);
    if (cb) cb.checked = true;
  }
  updateSelectUI();
}

function updateSelectUI() {
  const count = selectedIds.size;
  const bar = document.getElementById("batchBar");
  const label = document.getElementById("batchLabel");
  const btn = document.getElementById("batchDelBtn");
  const selectAllCb = document.getElementById("selectAllCb");
  const filtered = currentKeyword
    ? allPrompts.filter(
        (p) =>
          (p.promptText || "").toLowerCase().includes(currentKeyword.toLowerCase()) ||
          (p.title || "").toLowerCase().includes(currentKeyword.toLowerCase()),
      )
    : allPrompts;

  if (selectMode && count > 0) {
    bar.classList.add("show");
    label.textContent = `已选 ${count} 条`;
    btn.disabled = false;
  } else if (selectMode) {
    bar.classList.add("show");
    label.textContent = "请选择要删除的提示词";
    btn.disabled = true;
  } else {
    bar.classList.remove("show");
  }

  if (selectAllCb) {
    if (selectMode && filtered.length > 0) {
      selectAllCb.checked = count === filtered.length;
      selectAllCb.indeterminate = count > 0 && count < filtered.length;
    } else {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    }
  }
}

document.getElementById("selectAllCb").addEventListener("change", (e) => {
  const checked = e.target.checked;
  const filtered = currentKeyword
    ? allPrompts.filter(
        (p) =>
          (p.promptText || "").toLowerCase().includes(currentKeyword.toLowerCase()) ||
          (p.title || "").toLowerCase().includes(currentKeyword.toLowerCase()),
      )
    : allPrompts;
  if (checked) {
    filtered.forEach((p) => selectedIds.add(p.id));
  } else {
    filtered.forEach((p) => selectedIds.delete(p.id));
  }
  document.querySelectorAll("#promptList .checkbox").forEach((cb) => {
    cb.checked = selectedIds.has(cb.dataset.id);
  });
  updateSelectUI();
});

function enterSelectMode() {
  selectMode = true;
  selectedIds.clear();
  document.getElementById("multiSelectBtn").style.display = "none";
  document.getElementById("exitSelectBtn").style.display = "inline-block";
  renderList();
}

function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();
  document.getElementById("multiSelectBtn").style.display = "inline-block";
  document.getElementById("exitSelectBtn").style.display = "none";
  document.getElementById("batchBar").classList.remove("show");
  renderList();
}

document.getElementById("multiSelectBtn").addEventListener("click", enterSelectMode);
document.getElementById("exitSelectBtn").addEventListener("click", exitSelectMode);

document.getElementById("batchDelBtn").addEventListener("click", () => {
  if (selectedIds.size === 0) return;
  const count = selectedIds.size;
  showConfirm(`确定删除选中的 ${count} 条提示词？`, async () => {
    for (const id of selectedIds) {
      await chrome.runtime.sendMessage({ action: "db:deletePrompt", payload: id });
    }
    allPrompts = allPrompts.filter((p) => !selectedIds.has(p.id));
    exitSelectMode();
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

// ============ Prompt 编辑面板 ============
document.getElementById("epBack").addEventListener("click", closeEditPanel);
document.getElementById("epSave").addEventListener("click", async () => {
  const title = document.getElementById("epTitle").value.trim();
  const promptText = document.getElementById("epText").value.trim();
  const notes = document.getElementById("epNotes").value.trim();
  if (!promptText) {
    toast("内容不能为空");
    return;
  }
  if (!editingId) {
    const result = await chrome.runtime.sendMessage({
      action: "db:addPrompt",
      payload: { promptText, title, notes, source: "popup", platform: "manual" },
    });
    if (result && !result.error) allPrompts.unshift(result);
    closeEditPanel();
    renderList();
    toast("已保存");
    return;
  }
  await chrome.runtime.sendMessage({
    action: "db:updatePrompt",
    payload: { id: editingId, updates: { title, promptText, notes } },
  });
  const p = allPrompts.find((x) => x.id === editingId);
  if (p) {
    p.title = title;
    p.promptText = promptText;
    p.notes = notes;
  }
  closeEditPanel();
  renderList();
  toast("已保存");
});
document.getElementById("epDelete").addEventListener("click", () => {
  if (!editingId) return;
  showConfirm("确定删除这条提示词？", async () => {
    await chrome.runtime.sendMessage({ action: "db:deletePrompt", payload: editingId });
    allPrompts = allPrompts.filter((p) => p.id !== editingId);
    closeEditPanel();
    renderList();
    toast("已删除");
  });
});

document.getElementById("promptAddBtn").addEventListener("click", () => {
  openEditPanel(null);
});

function openEditPanel(id) {
  if (id === null) {
    editingId = null;
    document.getElementById("epTitle").value = "";
    document.getElementById("epText").value = "";
    document.getElementById("epNotes").value = "";
    document.querySelector("#editPanel .ep-title").textContent = "新建提示词";
    document.getElementById("epDelete").style.display = "none";
    document.getElementById("editPanel").classList.add("show");
    return;
  }
  const p = allPrompts.find((x) => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById("epTitle").value = p.title || "";
  document.getElementById("epText").value = p.promptText || "";
  document.getElementById("epNotes").value = p.notes || "";
  document.querySelector("#editPanel .ep-title").textContent = "编辑提示词";
  document.getElementById("epDelete").style.display = "inline-block";
  document.getElementById("editPanel").classList.add("show");
}
function closeEditPanel() {
  editingId = null;
  document.getElementById("editPanel").classList.remove("show");
}

// ============================================================
// 模板功能
// ============================================================
let allTemplates = [];
let templateKeyword = "";
let editingTemplateId = null;
let tmplSelectMode = false;
let tmplSelectedIds = new Set();

document.getElementById("tmplSearchInput").addEventListener("input", (e) => {
  templateKeyword = e.target.value.trim();
  renderTemplateList();
});

async function loadTemplates() {
  try {
    const result = await chrome.runtime.sendMessage({ action: "db:getAllTemplates" });
    allTemplates = Array.isArray(result) ? result.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch (err) {
    allTemplates = [];
    setTimeout(() => loadTemplates(), 500);
  }
  renderTemplateList();
}

function renderTemplateList() {
  const listEl = document.getElementById("tmplList");
  const countEl = document.getElementById("tmplCount");
  const filtered = templateKeyword
    ? allTemplates.filter(
        (t) =>
          (t.templateText || "").toLowerCase().includes(templateKeyword.toLowerCase()) ||
          (t.title || "").toLowerCase().includes(templateKeyword.toLowerCase()),
      )
    : allTemplates;
  countEl.textContent = `${filtered.length} 条`;
  if (filtered.length === 0) {
    listEl.innerHTML =
      allTemplates.length === 0
        ? `<div class="empty-state"><div class="icon">📝</div><div>还没有模板，点击右下角新建</div></div>`
        : `<div class="empty-state"><div class="icon">🔍</div><div>没有匹配的模板</div></div>`;
    updateTmplSelectUI();
    return;
  }
  listEl.innerHTML = filtered
    .map((t) => {
      const title =
        t.title || t.templateText.slice(0, 15) + (t.templateText.length > 15 ? "..." : "");
      const preview = t.templateText.slice(0, 60) + (t.templateText.length > 60 ? "..." : "");
      const vars = t.variables?.length > 0 ? `变量: ${t.variables.join(", ")}` : "";
      const checked = tmplSelectedIds.has(t.id) ? "checked" : "";
      return `<div class="list-item ${tmplSelectMode ? "select-mode" : ""}" data-id="${t.id}">
        <input type="checkbox" class="checkbox" data-id="${t.id}" ${checked} />
        <div class="info">
          <div class="title-line">${escapeHtml(title)}</div>
          <div class="preview-line">${escapeHtml(preview)}</div>
          <div class="meta-line">${formatTime(t.createdAt)}${vars ? " · " + vars : ""}</div>
        </div>
        ${!tmplSelectMode ? `<button class="del-btn" data-id="${t.id}" title="删除">🗑</button>` : ""}
      </div>`;
    })
    .join("");

  listEl.querySelectorAll(".list-item .info").forEach((info) => {
    let clickTimer = null;
    info.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = info.closest(".list-item").dataset.id;
      if (tmplSelectMode) {
        toggleTmplSelect(id, info.closest(".list-item").querySelector(".checkbox"));
        return;
      }
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        openTemplateEditPanel(id);
        return;
      }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        const t = allTemplates.find((x) => x.id === id);
        if (t) useTemplate(t);
      }, 300);
    });
  });

  listEl.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      showConfirm("确定删除此模板？", async () => {
        await chrome.runtime.sendMessage({ action: "db:deleteTemplate", payload: id });
        allTemplates = allTemplates.filter((t) => t.id !== id);
        renderTemplateList();
        toast("已删除");
      });
    });
  });

  listEl.querySelectorAll(".checkbox").forEach((cb) => {
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTmplSelect(cb.dataset.id, cb);
    });
  });
}

function toggleTmplSelect(id, cb) {
  if (tmplSelectedIds.has(id)) {
    tmplSelectedIds.delete(id);
    if (cb) cb.checked = false;
  } else {
    tmplSelectedIds.add(id);
    if (cb) cb.checked = true;
  }
  updateTmplSelectUI();
}

function updateTmplSelectUI() {
  const count = tmplSelectedIds.size;
  const bar = document.getElementById("tmplBatchBar");
  const label = document.getElementById("tmplBatchLabel");
  const btn = document.getElementById("tmplBatchDelBtn");
  const selectAllCb = document.getElementById("tmplSelectAllCb");
  const filtered = templateKeyword
    ? allTemplates.filter(
        (t) =>
          (t.templateText || "").toLowerCase().includes(templateKeyword.toLowerCase()) ||
          (t.title || "").toLowerCase().includes(templateKeyword.toLowerCase()),
      )
    : allTemplates;

  if (tmplSelectMode && count > 0) {
    bar.classList.add("show");
    label.textContent = `已选 ${count} 条`;
    btn.disabled = false;
  } else if (tmplSelectMode) {
    bar.classList.add("show");
    label.textContent = "请选择要删除的模板";
    btn.disabled = true;
  } else {
    bar.classList.remove("show");
  }

  if (selectAllCb) {
    if (tmplSelectMode && filtered.length > 0) {
      selectAllCb.checked = count === filtered.length;
      selectAllCb.indeterminate = count > 0 && count < filtered.length;
    } else {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    }
  }
}

document.getElementById("tmplSelectAllCb").addEventListener("change", (e) => {
  const checked = e.target.checked;
  const filtered = templateKeyword
    ? allTemplates.filter(
        (t) =>
          (t.templateText || "").toLowerCase().includes(templateKeyword.toLowerCase()) ||
          (t.title || "").toLowerCase().includes(templateKeyword.toLowerCase()),
      )
    : allTemplates;
  if (checked) {
    filtered.forEach((t) => tmplSelectedIds.add(t.id));
  } else {
    filtered.forEach((t) => tmplSelectedIds.delete(t.id));
  }
  document.querySelectorAll("#tmplList .checkbox").forEach((cb) => {
    cb.checked = tmplSelectedIds.has(cb.dataset.id);
  });
  updateTmplSelectUI();
});

function enterTmplSelectMode() {
  tmplSelectMode = true;
  tmplSelectedIds.clear();
  document.getElementById("tmplMultiSelectBtn").style.display = "none";
  document.getElementById("tmplExitSelectBtn").style.display = "inline-block";
  renderTemplateList();
}

function exitTmplSelectMode() {
  tmplSelectMode = false;
  tmplSelectedIds.clear();
  document.getElementById("tmplMultiSelectBtn").style.display = "inline-block";
  document.getElementById("tmplExitSelectBtn").style.display = "none";
  document.getElementById("tmplBatchBar").classList.remove("show");
  renderTemplateList();
}

document.getElementById("tmplMultiSelectBtn").addEventListener("click", enterTmplSelectMode);
document.getElementById("tmplExitSelectBtn").addEventListener("click", exitTmplSelectMode);

document.getElementById("tmplBatchDelBtn").addEventListener("click", () => {
  if (tmplSelectedIds.size === 0) return;
  const count = tmplSelectedIds.size;
  showConfirm(`确定删除选中的 ${count} 条模板？`, async () => {
    for (const id of tmplSelectedIds) {
      await chrome.runtime.sendMessage({ action: "db:deleteTemplate", payload: id });
    }
    allTemplates = allTemplates.filter((t) => !tmplSelectedIds.has(t.id));
    exitTmplSelectMode();
    toast(`已删除 ${count} 条`);
  });
});

function useTemplate(template) {
  const vars = extractVariables(template.templateText);
  if (vars.length === 0) {
    fillTemplateToPage(template.templateText);
    return;
  }
  showVariableDialog(template.title || "使用模板", vars, template.templateText);
}

function extractVariables(text) {
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fillTemplateToPage(text) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "fillPrompt", text });
    toast("已填入模板");
    window.close();
  } catch (err) {
    toast("请刷新当前页面后重试");
  }
}

function showVariableDialog(title, variables, templateText) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) {
      toast("⚠️ 未找到活动标签页");
      return;
    }
    chrome.tabs
      .sendMessage(tab.id, {
        action: "showTemplateDialog",
        title: title,
        variables: variables,
        templateText: templateText,
      })
      .catch(() => {});
    window.close();
  });
}

document.getElementById("tmplAddBtn").addEventListener("click", () => {
  openTemplateEditPanel(null);
});

function openTemplateEditPanel(id) {
  const t = id ? allTemplates.find((x) => x.id === id) : null;
  editingTemplateId = id;
  document.getElementById("tmplEditTitle").value = t?.title || "";
  document.getElementById("tmplEditText").value = t?.templateText || "";
  document.getElementById("tmplEditNotes").value = t?.notes || "";
  document.getElementById("tmplEditPanel").classList.add("show");
}

document.getElementById("tmplEpBack").addEventListener("click", () => {
  editingTemplateId = null;
  document.getElementById("tmplEditPanel").classList.remove("show");
});

document.getElementById("tmplEpSave").addEventListener("click", async () => {
  const title = document.getElementById("tmplEditTitle").value.trim();
  const templateText = document.getElementById("tmplEditText").value.trim();
  const notes = document.getElementById("tmplEditNotes").value.trim();
  if (!templateText) {
    toast("模板内容不能为空");
    return;
  }
  const variables = extractVariables(templateText);
  if (editingTemplateId) {
    await chrome.runtime.sendMessage({
      action: "db:updateTemplate",
      payload: { id: editingTemplateId, updates: { title, templateText, notes, variables } },
    });
    const t = allTemplates.find((x) => x.id === editingTemplateId);
    if (t) {
      t.title = title;
      t.templateText = templateText;
      t.notes = notes;
      t.variables = variables;
    }
  } else {
    const result = await chrome.runtime.sendMessage({
      action: "db:addTemplate",
      payload: { title, templateText, notes, variables },
    });
    if (result && !result.error) allTemplates.unshift(result);
  }
  editingTemplateId = null;
  document.getElementById("tmplEditPanel").classList.remove("show");
  renderTemplateList();
  toast("模板已保存");
});

document.getElementById("tmplEpDelete").addEventListener("click", () => {
  if (!editingTemplateId) return;
  showConfirm("确定删除此模板？", async () => {
    await chrome.runtime.sendMessage({ action: "db:deleteTemplate", payload: editingTemplateId });
    allTemplates = allTemplates.filter((t) => t.id !== editingTemplateId);
    editingTemplateId = null;
    document.getElementById("tmplEditPanel").classList.remove("show");
    renderTemplateList();
    toast("已删除");
  });
});

// ============================================================
// 设置页（新增）
// ============================================================

// 加载设置到 UI
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    pfSettings = { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  } catch (err) {
    pfSettings = { ...DEFAULT_SETTINGS };
  }
  applySettingsToUI();
}

function applySettingsToUI() {
  document.getElementById("setBallEnabled").checked = pfSettings.ballEnabled;
  document.getElementById("setBallSide").value = pfSettings.ballDefaultSide;
  document.getElementById("setShortcutEnabled").checked = pfSettings.shortcutEnabled;
  document.getElementById("setBlacklist").value = pfSettings.blacklist;
}

// 保存设置（合并写入，content.js 通过 onChanged 实时生效）
function saveSettings(patch) {
  pfSettings = { ...pfSettings, ...patch };
  chrome.storage.local.set({ [SETTINGS_KEY]: pfSettings });
}

document.getElementById("setBallEnabled").addEventListener("change", (e) => {
  saveSettings({ ballEnabled: e.target.checked });
  toast(e.target.checked ? "悬浮球已启用" : "悬浮球已禁用");
});

document.getElementById("setBallSide").addEventListener("change", (e) => {
  saveSettings({ ballDefaultSide: e.target.value });
  toast("已保存");
});

document.getElementById("setShortcutEnabled").addEventListener("change", (e) => {
  saveSettings({ shortcutEnabled: e.target.checked });
  toast(e.target.checked ? "快捷键已启用" : "快捷键已禁用");
});

// 黑名单防抖保存
let blacklistTimer;
document.getElementById("setBlacklist").addEventListener("input", (e) => {
  clearTimeout(blacklistTimer);
  blacklistTimer = setTimeout(() => {
    saveSettings({ blacklist: e.target.value.trim() });
    toast("黑名单已保存");
  }, 600);
});

// 导出数据
document.getElementById("exportBtn").addEventListener("click", async () => {
  try {
    const res = await chrome.runtime.sendMessage({ action: "db:exportAll" });
    if (!res || res.error) {
      toast("❌ 导出失败");
      return;
    }
    const json = JSON.stringify(res, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `promptflow-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`✅ 已导出 ${res.prompts.length + res.templates.length} 条数据`);
  } catch (err) {
    toast("❌ 导出失败");
  }
});

// 导入数据
document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFileInput").click();
});

document.getElementById("importFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || (!Array.isArray(data.prompts) && !Array.isArray(data.templates))) {
      toast("⚠️ 文件格式不正确");
      return;
    }
    const res = await chrome.runtime.sendMessage({ action: "db:importAll", payload: data });
    if (res && !res.error) {
      toast(`✅ 导入 ${res.imported} 条，跳过重复 ${res.skipped} 条`);
      loadPrompts();
      loadTemplates();
    } else {
      toast("❌ 导入失败");
    }
  } catch (err) {
    toast("⚠️ 无法解析文件");
  }
});

// 清空数据
document.getElementById("clearBtn").addEventListener("click", () => {
  showConfirm("确定清空所有提示词和模板？此操作不可恢复，建议先导出备份。", async () => {
    try {
      const res = await chrome.runtime.sendMessage({ action: "db:clearAll" });
      if (res && !res.error) {
        allPrompts = [];
        allTemplates = [];
        renderList();
        renderTemplateList();
        toast("已清空所有数据");
      } else {
        toast("❌ 清空失败");
      }
    } catch (err) {
      toast("❌ 清空失败");
    }
  });
});

// ============ 工具函数 ============
function showConfirm(msg, onConfirm) {
  const container = document.getElementById("confirmContainer");
  container.innerHTML = `
    <div class="confirm-overlay">
      <div class="confirm-box">
        <p>${msg}</p>
        <div class="btns">
          <button class="btn-cancel" id="confirmCancel">取消</button>
          <button class="btn-confirm" id="confirmOk">确定</button>
        </div>
      </div>
    </div>`;
  document.getElementById("confirmCancel").addEventListener("click", () => {
    container.innerHTML = "";
  });
  document.getElementById("confirmOk").addEventListener("click", () => {
    container.innerHTML = "";
    onConfirm();
  });
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    el.style.opacity = "0";
  }, 1800);
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

loadPrompts();
loadTemplates();
loadSettings();
