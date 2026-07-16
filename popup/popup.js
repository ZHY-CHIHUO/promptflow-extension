document.getElementById("saveBtn").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await chrome.tabs.sendMessage(tab.id, { action: "getPrompt" });

    if (response?.text) {
        document.getElementById("saveBtn").textContent = "已捕获： " + response.text.slice(0, 20) + "...";
        console.log("完整 Prompt:", response.text);
    } else {
        document.getElementById("saveBtn").textContent = "未检测到内容";
    }
});

document.getElementById("listBtn").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 测试回填功能：往 DeepSeek 输入框填一段文字
    await chrome.tabs.sendMessage(tab.id, {
        action: "fillPrompt",
        text: "这是从 PromptFlow 回填的测试文字"
    });

    document.getElementById("listBtn").textContent = "已回填！";
});
