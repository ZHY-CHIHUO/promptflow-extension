document.getElementById("saveBtn").addEventListener("click", async () => {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 向 Content Script 发消息，让它读取输入框
    const response = await chrome.tabs.sendMessage(tab.id, { action: "getPrompt" });
    console.log("捕获的 Prompt:", response?.text);
});

document.getElementById("listBtn").addEventListener("click", () => {
    // 后续接 Vue 做的版本列表
    console.log("打开版本列表");
});
