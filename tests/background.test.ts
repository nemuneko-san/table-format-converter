import { afterEach, describe, expect, it, vi } from "vitest";

function stubChrome(getContexts: () => Promise<unknown>) {
  const create = vi.fn(async () => ({}));
  const update = vi.fn(async () => ({}));
  vi.stubGlobal("chrome", {
    runtime: { getURL: (p: string) => `chrome-extension://id/${p}`, getContexts: vi.fn(getContexts), ContextType: { TAB: "TAB" } },
    tabs: { create, update },
    windows: { update: vi.fn(async () => ({})) },
    action: { onClicked: { addListener: vi.fn() } },
  });
  return { create, update };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("B13(e) service worker", () => {
  it("getContexts が失敗したら新しいタブを開く", async () => {
    const { create } = stubChrome(async () => {
      throw new Error("boom");
    });
    const { openApp } = await import("../src/background/index");
    await expect(openApp()).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith({ url: "chrome-extension://id/src/app/index.html" });
  });

  it("tabs.update が失敗したら新しいタブを開く", async () => {
    const { create, update } = stubChrome(async () => [{ tabId: 3, windowId: 1 }]);
    update.mockRejectedValueOnce(new Error("No tab with id"));
    const { openApp } = await import("../src/background/index");
    await openApp();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("開いているタブがあれば前面に出す", async () => {
    const { create, update } = stubChrome(async () => [{ tabId: 3, windowId: 1 }]);
    const { openApp } = await import("../src/background/index");
    await openApp();
    expect(update).toHaveBeenCalledWith(3, { active: true });
    expect(create).not.toHaveBeenCalled();
  });
});
