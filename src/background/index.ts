const APP_PATH = "src/app/index.html";

/** ツールバーアイコンのクリックで変換タブを開く。既に開いていればそのタブを前面に出す */
async function openApp(): Promise<void> {
  const url = chrome.runtime.getURL(APP_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.TAB],
    documentUrls: [url],
  });
  const existing = contexts.find((context) => context.tabId >= 0);
  if (!existing) {
    await chrome.tabs.create({ url });
    return;
  }
  await chrome.tabs.update(existing.tabId, { active: true });
  if (existing.windowId >= 0) await chrome.windows.update(existing.windowId, { focused: true });
}

chrome.action.onClicked.addListener(() => {
  void openApp();
});
