// =============================================
// PromptFlow Service Worker — 数据库中转层 + 云同步
// =============================================

const DB_NAME = "promptflow-db";
const DB_VERSION = 1;

// ============ 云同步配置（新增） ============
// 使用 chrome.storage.sync 实现跨设备同步：
// 每条数据一个 key（sp_{id} / st_{id}），启动时按 updatedAt 双向合并，
// 删除通过墓碑（tombstone）同步，防止已删数据被其他设备复活
const SYNC_PROMPT_PREFIX = "sp_";
const SYNC_TEMPLATE_PREFIX = "st_";
const SYNC_DELETED_KEY = "sync_deleted";
const SYNC_ITEM_LIMIT = 7000; // 单条超过 7KB 跳过同步（云端单条上限 8KB）
let syncPulled = false; // 本生命周期内是否已拉取过云端

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

// ============================================================
// 云同步基础函数（新增）
// ============================================================

// 写入单条数据到云端（超限时跳过）
async function syncSet(key, value) {
  try {
    if (JSON.stringify(value).length > SYNC_ITEM_LIMIT) {
      console.warn("[PromptFlow] 数据过大，跳过云同步:", key);
      return;
    }
    await chrome.storage.sync.set({ [key]: value });
  } catch (err) {
    console.warn("[PromptFlow] 云同步写入失败:", err);
  }
}

// 从云端删除并记录墓碑
async function syncRemove(id) {
  try {
    await chrome.storage.sync.remove([SYNC_PROMPT_PREFIX + id, SYNC_TEMPLATE_PREFIX + id]);
    const data = await chrome.storage.sync.get(SYNC_DELETED_KEY);
    const tombstones = data[SYNC_DELETED_KEY] || {};
    tombstones[id] = Date.now();
    await chrome.storage.sync.set({ [SYNC_DELETED_KEY]: tombstones });
  } catch (err) {
    console.warn("[PromptFlow] 云同步删除失败:", err);
  }
}

// ---------- 本地原始读写（不触发云同步，供合并逻辑使用，避免循环） ----------
async function putPromptRaw(p) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("prompts", "readwrite");
    tx.objectStore("prompts").put(p);
    tx.oncomplete = () => resolve(p);
    tx.onerror = () => reject(tx.error);
  });
}

async function putTemplateRaw(t) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("templates", "readwrite");
    tx.objectStore("templates").put(t);
    tx.oncomplete = () => resolve(t);
    tx.onerror = () => reject(tx.error);
  });
}

async function deletePromptRaw(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("prompts", "readwrite");
    tx.objectStore("prompts").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteTemplateRaw(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("templates", "readwrite");
    tx.objectStore("templates").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// 启动时双向合并：云端 ↔ 本地（新增）
// ============================================================
async function pullFromSync() {
  if (syncPulled) return;
  syncPulled = true;
  try {
    const cloud = await chrome.storage.sync.get(null);
    const tombstones = cloud[SYNC_DELETED_KEY] || {};

    const localPrompts = await getAllPrompts();
    const localTemplates = await getAllTemplates();
    const localP = new Map(localPrompts.map((p) => [p.id, p]));
    const localT = new Map(localTemplates.map((t) => [t.id, t]));

    // 1. 应用墓碑：云端已删除的，本地也删除
    for (const [id, delTime] of Object.entries(tombstones)) {
      const lp = localP.get(id);
      if (lp && (lp.updatedAt || 0) <= delTime) {
        await deletePromptRaw(id);
        localP.delete(id);
      }
      const lt = localT.get(id);
      if (lt && (lt.updatedAt || 0) <= delTime) {
        await deleteTemplateRaw(id);
        localT.delete(id);
      }
    }

    // 2. 云端 → 本地：本地没有或云端更新时写入
    for (const [key, val] of Object.entries(cloud)) {
      if (key === SYNC_DELETED_KEY) continue;
      const isPrompt = key.startsWith(SYNC_PROMPT_PREFIX);
      const isTemplate = key.startsWith(SYNC_TEMPLATE_PREFIX);
      if (!isPrompt && !isTemplate) continue;
      const id = key.slice(3);
      if (tombstones[id]) continue;

      if (isPrompt) {
        const local = localP.get(id);
        if (!local || (val.updatedAt || 0) > (local.updatedAt || 0)) {
          await putPromptRaw(val);
          localP.set(id, val);
        }
      } else {
        const local = localT.get(id);
        if (!local || (val.updatedAt || 0) > (local.updatedAt || 0)) {
          await putTemplateRaw(val);
          localT.set(id, val);
        }
      }
    }

    // 3. 本地 → 云端：推送云端缺失的数据（首次使用或本机独有）
    const pushPayload = {};
    for (const p of localP.values()) {
      const key = SYNC_PROMPT_PREFIX + p.id;
      if (!(key in cloud) && !tombstones[p.id] && JSON.stringify(p).length <= SYNC_ITEM_LIMIT) {
        pushPayload[key] = p;
      }
    }
    for (const t of localT.values()) {
      const key = SYNC_TEMPLATE_PREFIX + t.id;
      if (!(key in cloud) && !tombstones[t.id] && JSON.stringify(t).length <= SYNC_ITEM_LIMIT) {
        pushPayload[key] = t;
      }
    }
    if (Object.keys(pushPayload).length > 0) {
      await chrome.storage.sync.set(pushPayload);
    }
  } catch (err) {
    console.warn("[PromptFlow] 云端拉取失败:", err);
  }
}

// 浏览器启动 / 扩展安装更新时拉取云端
chrome.runtime.onStartup.addListener(() => pullFromSync());
chrome.runtime.onInstalled.addListener(() => pullFromSync());

// ---------- Prompts CRUD（修改：写入后同步云端） ----------
async function addPrompt(prompt) {
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
  await putPromptRaw(p);
  await syncSet(SYNC_PROMPT_PREFIX + p.id, p); // 新增：同步云端
  return p;
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
  const old = await getPromptById(id);
  if (!old) throw new Error("Prompt not found");
  const updated = { ...old, ...updates, updatedAt: Date.now() };
  await putPromptRaw(updated);
  await syncSet(SYNC_PROMPT_PREFIX + id, updated); // 新增：同步云端
  return updated;
}

async function deletePrompt(id) {
  await deletePromptRaw(id);
  await syncRemove(id); // 新增：云端删除 + 墓碑
}

async function searchPrompts(keyword) {
  const all = await getAllPrompts();
  const kw = keyword.toLowerCase();
  return all.filter((p) => p.promptText.toLowerCase().includes(kw));
}

// ---------- Templates CRUD（修改：写入后同步云端） ----------
async function addTemplate(template) {
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
  await putTemplateRaw(t);
  await syncSet(SYNC_TEMPLATE_PREFIX + t.id, t); // 新增：同步云端
  return t;
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
  const old = await getTemplateById(id);
  if (!old) throw new Error("Template not found");
  const updated = { ...old, ...updates, updatedAt: Date.now() };
  await putTemplateRaw(updated);
  await syncSet(SYNC_TEMPLATE_PREFIX + id, updated); // 新增：同步云端
  return updated;
}

async function deleteTemplate(id) {
  await deleteTemplateRaw(id);
  await syncRemove(id); // 新增：云端删除 + 墓碑
}

// ============================================================
// 数据导入 / 导出 / 清空
// ============================================================
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

async function importAll(data) {
  let imported = 0;
  let skipped = 0;

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
  // 新增：同时清空云端，防止已清空的数据被同步复活
  try {
    await chrome.storage.sync.clear();
  } catch (err) {
    console.warn("[PromptFlow] 云端清空失败:", err);
  }
  return { success: true };
}

// ============ 消息路由 ============
// 修改：Service Worker 唤醒后，首次消息前先执行一次云端拉取
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  pullFromSync()
    .catch(() => {})
    .finally(() => {
      handleMessage(request)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
    });
  return true;
});

async function handleMessage(request) {
  switch (request.action) {
    // ===== 打开扩展 popup =====
    case "openPopup":
      try {
        await chrome.action.openPopup();
        return { success: true };
      } catch (err) {
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
