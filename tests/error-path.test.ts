import { afterEach, describe, expect, it, vi } from "vitest";
import appHtml from "../src/app/index.html?raw";
import { installChromeMock, loadPageBody } from "./chrome-mock";

// 変換経路で想定外の例外が起きた場合を再現する（B5）
vi.mock("../src/lib/convert", () => ({
  parseInput: () => {
    throw new RangeError("Maximum call stack size exceeded");
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("B5 変換経路の例外", () => {
  it("下書き復元で例外が出てもページはマウントされ、ステータスにエラーを表示する", async () => {
    loadPageBody(appHtml);
    installChromeMock({ local: { draft: "a,b" } });
    const { main } = await import("../src/app/main");
    await expect(main()).resolves.toBeUndefined();
    expect(document.getElementById("status")?.textContent).toContain("変換中にエラーが発生しました");
    expect(document.getElementById("status")?.textContent).toContain("Maximum call stack");
    expect((document.getElementById("output") as HTMLTextAreaElement).value).toBe("");
  });
});
