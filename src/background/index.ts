const APP_PATH = "src/app/index.html";

/** 開いている変換タブを前面に出す。見つからない・失敗したら false */
async function focusExisting(url: string): Promise<boolean> {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.TAB],
      documentUrls: [url],
    });
    const existing = contexts.find((context) => context.tabId >= 0);
    if (!existing) return false;
    await chrome.tabs.update(existing.tabId, { active: true });
    if (existing.windowId >= 0) await chrome.windows.update(existing.windowId, { focused: true });
    return true;
  } catch {
    // タブが直前に閉じられた等。新しいタブを開いて続行する
    return false;
  }
}

/** ツールバーアイコンのクリックで変換タブを開く。既に開いていればそのタブを前面に出す */
export async function openApp(): Promise<void> {
  const url = chrome.runtime.getURL(APP_PATH);
  if (await focusExisting(url)) return;
  await chrome.tabs.create({ url });
}

chrome.action.onClicked.addListener(() => {
  openApp().catch(() => undefined);
});
