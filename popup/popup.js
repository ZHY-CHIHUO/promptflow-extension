// =============================================
// PromptFlow Popup 主逻辑
// =============================================

// ---------- Tab 切换 ----------
document.querySelectorAll(".tab-item").forEach(item => {
    item.addEventListener("click", () => {
        // 切换激活样式
        document.querySelectorAll(".tab-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        // 切换页面
        const tabId = item.dataset.tab;
        document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
        document.getElementById(tabId).classList.add("active");
    });
});

// ---------- 加载 Prompt 列表 ----------
function loadPrompts() {
    chrome.storage.local.get({ prompts: [] }, (data) => {
        const prompts = data.prompts;
        document.getElementById("promptCount").textContent = `共 ${prompts.length} 条 Prompt`;

        const listEl = document.getElementById("promptList");
        if (prompts.length === 0) {
            listEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">📋</div>
          <div>还没有保存 Prompt</div>
          <div style="font-size:12px;margin-top:4px;">在 DeepSeek 页面点悬浮球保存</div>
        </div>`;
            return;
        }

        listEl.innerHTML = prompts.map((p, index) => `
      <div class="prompt-item" data-index="${index}">
        <div class="title">${escapeHtml(p.promptText.slice(0, 50))}</div>
        <div class="meta">${formatTime(p.createdAt)} · ${p.source}</div>
      </div>
    `).join("");

        // 点击列表项 → 回填到 DeepSeek
        listEl.querySelectorAll(".prompt-item").forEach(item => {
            item.addEventListener("click", async () => {
                const index = item.dataset.index;
                const prompt = prompts[index];
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const resp = await chrome.tabs.sendMessage(tab.id, {
                    action: "fillPrompt",
                    text: prompt.promptText
                });
                if (resp?.success) {
                    window.close(); // 回填成功，自动关闭 Popup
                }
            });
        });
    });
}

// 每次打开 Popup 重新加载
loadPrompts();

// ---------- 工具函数 ----------
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
    return d.toLocaleDateString("zh-CN");
}
