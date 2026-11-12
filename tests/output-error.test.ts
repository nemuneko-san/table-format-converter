import { afterEach, describe, expect, it, vi } from "vitest";
import appHtml from "../src/app/index.html?raw";
import { installChromeMock, loadPageBody } from "./chrome-mock";

// HTML 出力だけが失敗する状況を作る（C2）
vi.mock("../src/lib/serializers/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/serializers/index")>();
  return {
    ...actual,
    serialize: (...args: Parameters<typeof actual.serialize>) => {
      if (args[1] === "html") throw new Error("出力に失敗");
      return actual.serialize(...args);
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function select(el: HTMLSelectElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("C2 出力エラー表示の解除", () => {
  it("出力でエラー → 出力形式を変えて成功 → エラー表示が消え、パース時の警告に戻る", async () => {
    loadPageBody(appHtml);
    installChromeMock();
    const { main } = await import("../src/app/main");
    await main();
    const input = document.getElementById("input") as HTMLTextAreaElement;
    const status = document.getElementById("status") as HTMLDivElement;
    const format = document.getElementById("output-format") as HTMLSelectElement;
    input.value = "a,b,c\n1,2";
    input.dispatchEvent(new Event("input"));
    expect(status.textContent).toContain("空セルで補いました");
    select(format, "html");
    expect(status.textContent).toContain("変換中にエラーが発生しました: 出力に失敗");
    select(format, "csv");
    expect(status.textContent).not.toContain("変換中にエラー");
    expect(status.textContent).toContain("空セルで補いました");
    expect(status.dataset.kind).toBe("warn");
    expect((document.getElementById("output") as HTMLTextAreaElement).value).toBe("a,b,c\n1,2,");
  });
});
