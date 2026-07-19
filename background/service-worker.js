// =============================================
// PromptFlow Service Worker — 数据库中转层
// =============================================

const DB_NAME = "promptflow-db";
const DB_VERSION = 1;

// ---------- 打开数据库 ----------
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("prompts")) {
        const store = db.createObjectStore("prompts", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("tags", "tags", { multiEntry: true });
      }
      if (!db.objectStoreNames.contains("templates")) {
        db.createObjectStore("templates", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("testResults")) {
        const store = db.createObjectStore("testResults", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------- Prompts CRUD ----------
async function addPrompt(prompt) {
  const db = await openDB();
  const text = (prompt.promptText || "").trim();

  const all = await getAllPrompts();
  const duplicate = all.find((p) => p.promptText.trim() === text);
  if (duplicate) {
    return { error: "DUPLICATE", message: "已存在相同内容的 Prompt", existingId: duplicate.id };
  }

  const p = {
    ...prompt,
    id: prompt.id || crypto.randomUUID(),
    promptText: text,
    title: prompt.title || "",
    tags: prompt.tags || [],
    notes: prompt.notes || "",
    isFavorite: false,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("prompts", "readwrite");
    tx.objectStore("prompts").add(p);
    tx.oncomplete = () => resolve(p);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPrompts() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("prompts", "readonly");
    const request = tx.objectStore("prompts").index("createdAt").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function getPromptById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction("prompts", "readonly").objectStore("prompts").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updatePrompt(id, updates) {
  const db = await openDB();
  const old = await getPromptById(id);
  if (!old) throw new Error("Prompt not found");
  const updated = { ...old, ...updates, updatedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("prompts", "readwrite");
    tx.objectStore("prompts").put(updated);
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error);
  });
}

async function deletePrompt(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("prompts", "readwrite");
    tx.objectStore("prompts").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function searchPrompts(keyword) {
  const all = await getAllPrompts();
  const kw = keyword.toLowerCase();
  return all.filter((p) => p.promptText.toLowerCase().includes(kw));
}

// ---------- Templates CRUD ----------
async function addTemplate(template) {
  const db = await openDB();
  const text = (template.templateText || "").trim();
  if (!text) return { error: "EMPTY", message: "模板内容不能为空" };

  const t = {
    ...template,
    id: template.id || crypto.randomUUID(),
    templateText: text,
    title: template.title || "",
    variables: template.variables || [],
    notes: template.notes || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("templates", "readwrite");
    tx.objectStore("templates").add(t);
    tx.oncomplete = () => resolve(t);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllTemplates() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("templates", "readonly");
    const request = tx.objectStore("templates").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function getTemplateById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction("templates", "readonly").objectStore("templates").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateTemplate(id, updates) {
  const db = await openDB();
  const old = await getTemplateById(id);
  if (!old) throw new Error("Template not found");
  const updated = { ...old, ...updates, updatedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("templates", "readwrite");
    tx.objectStore("templates").put(updated);
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteTemplate(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("templates", "readwrite");
    tx.objectStore("templates").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// 数据导入 / 导出 / 清空（新增）
// ============================================================

// 导出所有数据
async function exportAll() {
  const prompts = await getAllPrompts();
  const templates = await getAllTemplates();
  return {
    app: "PromptFlow",
    version: 2,
    exportedAt: Date.now(),
    prompts,
    templates,
  };
}

// 导入数据（提示词按内容去重跳过，模板直接插入新副本）
async function importAll(data) {
  let imported = 0;
  let skipped = 0;

  // 提示词：跳过与现有内容重复的
  if (Array.isArray(data.prompts)) {
    const existing = await getAllPrompts();
    const existingTexts = new Set(existing.map((p) => (p.promptText || "").trim()));
    for (const p of data.prompts) {
      const text = (p.promptText || "").trim();
      if (!text || existingTexts.has(text)) {
        skipped++;
        continue;
      }
      const r = await addPrompt({
        promptText: text,
        title: p.title || "",
        notes: p.notes || "",
        tags: p.tags || [],
        source: p.source || "导入",
        platform: p.platform || "",
      });
      if (r && !r.error) {
        imported++;
        existingTexts.add(text);
      } else {
        skipped++;
      }
    }
  }

  // 模板：非空即导入
  if (Array.isArray(data.templates)) {
    for (const t of data.templates) {
      const text = (t.templateText || "").trim();
      if (!text) {
        skipped++;
        continue;
      }
      const r = await addTemplate({
        templateText: text,
        title: t.title || "",
        notes: t.notes || "",
        variables: t.variables || [],
      });
      if (r && !r.error) {
        imported++;
      } else {
        skipped++;
      }
    }
  }

  return { imported, skipped };
}

// 清空所有数据
async function clearAll() {
  const db = await openDB();
  const stores = ["prompts", "templates"];
  await Promise.all(
    stores.map(
      (name) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(name, "readwrite");
          tx.objectStore(name).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    ),
  );
  return { success: true };
}

// ============ 消息路由 ============
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(request) {
  switch (request.action) {
    // ===== 新增：打开扩展 popup 面板 =====
    case "openPopup":
      try {
        await chrome.action.openPopup();
        return { success: true };
      } catch (err) {
        // Chrome 127 以下不支持 openPopup，返回错误让 content.js 回退提示
        return { error: err.message };
      }

    // ===== Prompts =====
    case "db:addPrompt":
      return await addPrompt(request.payload);
    case "db:getAllPrompts":
      return await getAllPrompts();
    case "db:getPromptById":
      return await getPromptById(request.payload);
    case "db:updatePrompt":
      return await updatePrompt(request.payload.id, request.payload.updates);
    case "db:deletePrompt":
      await deletePrompt(request.payload);
      return { success: true };
    case "db:searchPrompts":
      return await searchPrompts(request.payload);
    // ===== Templates =====
    case "db:addTemplate":
      return await addTemplate(request.payload);
    case "db:getAllTemplates":
      return await getAllTemplates();
    case "db:getTemplateById":
      return await getTemplateById(request.payload);
    case "db:updateTemplate":
      return await updateTemplate(request.payload.id, request.payload.updates);
    case "db:deleteTemplate":
      await deleteTemplate(request.payload);
      return { success: true };
    // ===== 数据管理 =====
    case "db:exportAll":
      return await exportAll();
    case "db:importAll":
      return await importAll(request.payload);
    case "db:clearAll":
      return await clearAll();
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}
