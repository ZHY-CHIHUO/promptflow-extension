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
      // prompts 表
      if (!db.objectStoreNames.contains("prompts")) {
        const store = db.createObjectStore("prompts", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("tags", "tags", { multiEntry: true });
      }
      // templates 表
      if (!db.objectStoreNames.contains("templates")) {
        db.createObjectStore("templates", { keyPath: "id" });
      }
      // testResults 表
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

  // 去重
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

// ============ 消息路由 ============
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true; // 保持通道开启，等待异步返回
});

async function handleMessage(request) {
  switch (request.action) {
    // ===== Prompts =====
    case "db:addPrompt":
      return await addPrompt(request.payload);
    case "db:getAllPrompts":
      return await getAllPrompts();
    case "db:getPromptById":
      return await getPromptById(request.payload);
    case "db:updatePrompt":
      return await updateTemplate(request.payload.id, request.payload.updates);
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
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}
