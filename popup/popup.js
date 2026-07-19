// =============================================
// PromptFlow Popup — 列表 + 多选删除 + 模板
// =============================================

let allPrompts = [];
let currentKeyword = "";
let selectMode = false;
let selectedIds = new Set();
let editingId = null;

// ============ Tab 切换 ============
document.querySelectorAll(".tab-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".tab-item").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
    document.getElementById(item.dataset.tab).classList.add("active");
    if (selectMode) exitSelectMode();
    if (item.dataset.tab === "templates") loadTemplates();
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
    allPrompts = [];
    setTimeout(() => loadPrompts(), 500);
  }
  renderList();
}

// ============ 渲染列表 ============
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
        ? `<div class="empty-state"><div class="icon">📋</div><div>还没有保存 Prompt</div></div>`
        : `<div class="empty-state"><div class="icon">🔍</div><div>没有匹配的 Prompt</div></div>`;
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
      showConfirm("确定删除这条 Prompt？", async () => {
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

// ============ 多选模式 ============
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
    label.textContent = "请选择要删除的 Prompt";
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
  document.querySelectorAll(".checkbox").forEach((cb) => {
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
  showConfirm(`确定删除选中的 ${count} 条 Prompt？`, async () => {
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

// ============ 编辑面板 ============
document.getElementById("epBack").addEventListener("click", closeEditPanel);
document.getElementById("epSave").addEventListener("click", async () => {
  if (!editingId) return;
  const title = document.getElementById("epTitle").value.trim();
  const promptText = document.getElementById("epText").value.trim();
  const notes = document.getElementById("epNotes").value.trim();
  if (!promptText) {
    toast("内容不能为空");
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
  showConfirm("确定删除这条 Prompt？", async () => {
    await chrome.runtime.sendMessage({ action: "db:deletePrompt", payload: editingId });
    allPrompts = allPrompts.filter((p) => p.id !== editingId);
    closeEditPanel();
    renderList();
    toast("已删除");
  });
});

function openEditPanel(id) {
  const p = allPrompts.find((x) => x.id === id);
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

// ============================================================
// 模板功能
// ============================================================
let allTemplates = [];
let templateKeyword = "";
let editingTemplateId = null;

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
    return;
  }
  listEl.innerHTML = filtered
    .map((t) => {
      const title =
        t.title || t.templateText.slice(0, 15) + (t.templateText.length > 15 ? "..." : "");
      const preview = t.templateText.slice(0, 60) + (t.templateText.length > 60 ? "..." : "");
      const vars = t.variables?.length > 0 ? `变量: ${t.variables.join(", ")}` : "";
      return `<div class="list-item" data-id="${t.id}">
        <div class="info">
          <div class="title-line">${escapeHtml(title)}</div>
          <div class="preview-line">${escapeHtml(preview)}</div>
          <div class="meta-line">${formatTime(t.createdAt)}${vars ? " · " + vars : ""}</div>
        </div>
        <button class="del-btn" data-id="${t.id}" title="删除">🗑</button>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll(".list-item .info").forEach((info) => {
    let clickTimer = null;
    info.addEventListener("click", () => {
      const id = info.closest(".list-item").dataset.id;
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
}

function useTemplate(template) {
  const vars = extractVariables(template.templateText);
  if (vars.length === 0) {
    fillTemplateToPage(template.templateText);
    return;
  }
  showVariableDialog(template.title || "使用模板", vars, (values) => {
    let result = template.templateText;
    for (const [key, val] of Object.entries(values)) {
      result = result.replace(new RegExp(escapeRegex(`{{${key}}}`), "g"), val);
    }
    fillTemplateToPage(result);
  });
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

function showVariableDialog(title, variables, onSubmit) {
  const container = document.getElementById("confirmContainer");
  const inputs = variables
    .map((v) => {
      const label = v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return `<div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;color:#888;margin-bottom:4px">${label}</label>
        <input id="var-${v}" class="var-input" placeholder="输入 ${label}"
          style="width:100%;padding:8px 10px;border:1px solid #e0e0e5;border-radius:8px;background:#f5f5f8;color:#333;font-size:13px;outline:none;box-sizing:border-box" />
      </div>`;
    })
    .join("");
  container.innerHTML = `
    <div class="confirm-overlay">
      <div class="confirm-box" style="width:320px">
        <p style="font-weight:600;font-size:14px;margin-bottom:12px">${escapeHtml(title)}</p>
        <form id="varForm" onsubmit="return false">
          ${inputs}
          <div class="btns" style="margin-top:14px">
            <button class="btn-cancel" id="varCancel" type="button">取消</button>
            <button class="btn-confirm" id="varOk" type="submit" style="background:#7c3aed">填入</button>
          </div>
        </form>
      </div>
    </div>`;
  document.getElementById("varCancel").addEventListener("click", () => {
    container.innerHTML = "";
  });
  document.getElementById("varOk").addEventListener("click", () => {
    const values = {};
    for (const v of variables) {
      values[v] = document.getElementById(`var-${v}`).value.trim() || `{{${v}}}`;
    }
    container.innerHTML = "";
    onSubmit(values);
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
