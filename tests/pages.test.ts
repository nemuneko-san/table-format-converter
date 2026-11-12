import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main as appMain } from "../src/app/main";
import { main as optionsMain } from "../src/options/main";
import { installChromeMock, loadPageBody } from "./chrome-mock";
import { SAMPLE_BOX } from "./fixtures";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import appHtml from "../src/app/index.html?raw";
import optionsHtml from "../src/options/index.html?raw";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function typeInto(textarea: HTMLTextAreaElement, value: string): void {
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function select(el: HTMLSelectElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("変換タブの初期化", () => {
  beforeEach(() => loadPageBody(appHtml));

  it("main() が例外なくマウントされ、主要要素が存在する", async () => {
    installChromeMock();
    await expect(appMain()).resolves.toBeUndefined();
    for (const id of ["input", "output", "input-format", "output-format", "copy-button", "paste-button", "preview"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(byId<HTMLSelectElement>("input-format").options.length).toBe(8);
    expect(byId<HTMLSelectElement>("output-format").options.length).toBe(7);
    expect(byId<HTMLSelectElement>("output-format").value).toBe("markdown");
  });

  it("保存済みの直近入力と出力形式を復元する（Q15・Q47）", async () => {
    installChromeMock({ sync: { settings: { outputFormat: "tsv" } }, local: { draft: "a,b\n1,2" } });
    await appMain();
    expect(byId<HTMLTextAreaElement>("input").value).toBe("a,b\n1,2");
    expect(byId<HTMLSelectElement>("output-format").value).toBe("tsv");
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a\tb\n1\t2");
  });
});

describe("変換タブの統合動作", () => {
  beforeEach(() => {
    loadPageBody(appHtml);
    // 入力保存の遅延タイマーが次のテストへ漏れないよう、テストごとに偽タイマーで閉じ込める
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("入力欄に値を入れて input イベント → 出力欄に変換結果が出る", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), SAMPLE_BOX);
    const output = byId<HTMLTextAreaElement>("output").value;
    expect(output.split("\n")[0]).toBe("| 四半期 | 売上（百万円） | 前期比 | 担当 |");
    expect(output.split("\n")[1]).toBe("| --- | ---: | ---: | --- |");
    expect(byId("detected").textContent).toContain("罫線文字の表");
    expect(byId("preview").querySelectorAll("tbody tr").length).toBe(4);
  });

  it("出力形式を変えると出力が変わり、選択を sync に保存する", async () => {
    const { sync } = installChromeMock();
    await appMain();
    typeInto(byId("input"), "a\tb\n1\t2");
    select(byId("output-format"), "csv");
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a,b\n1,2");
    await Promise.resolve();
    expect((sync.settings as { outputFormat: string }).outputFormat).toBe("csv");
  });

  it("ヘッダーのチェックボックスで上書きできる（Q28）", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), "a,b\nc,d");
    const toggle = byId<HTMLInputElement>("header-toggle");
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(byId<HTMLTextAreaElement>("output").value.split("\n")[0]).toBe("| | |");
    expect(byId("header-mode").textContent).toBe("（手動）");
  });

  it("判定できない入力では候補を提示し、選ぶと変換する（Q8）", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), "hello world");
    const candidates = byId("candidates");
    expect(candidates.hidden).toBe(false);
    const buttons = Array.from(byId("candidate-buttons").querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    const tsv = buttons.find((b) => b.textContent === "TSV");
    tsv?.click();
    expect(byId<HTMLSelectElement>("input-format").value).toBe("tsv");
    expect(candidates.hidden).toBe(true);
    expect(byId<HTMLTextAreaElement>("output").value).toContain("hello world");
  });

  it("プレビューでのセル編集・列削除・転置が出力に反映される（Q40）", async () => {
    installChromeMock();
    await appMain();
    select(byId("output-format"), "csv");
    typeInto(byId("input"), "a,b,c\n1,2,3");
    const cell = byId("preview").querySelector<HTMLElement>('td[data-row="1"][data-col="0"]');
    if (!cell) throw new Error("cell not found");
    cell.textContent = "9";
    cell.dispatchEvent(new Event("input"));
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a,b,c\n9,2,3");
    const deleteB = byId("preview").querySelector<HTMLButtonElement>('button[aria-label="2 列目を削除"]');
    deleteB?.click();
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a,c\n9,3");
    const right = byId("preview").querySelector<HTMLButtonElement>('button[aria-label="1 列目を右へ移動"]');
    right?.click();
    expect(byId<HTMLTextAreaElement>("output").value).toBe("c,a\n3,9");
    byId<HTMLButtonElement>("transpose-button").click();
    expect(byId<HTMLTextAreaElement>("output").value).toBe("c,3\na,9");
  });

  it("HTML 出力ではリッチコピーとソースコピーの 2 ボタンになる（Q36）", async () => {
    installChromeMock();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText, readText: vi.fn(async () => "x\ty") } });
    await appMain();
    typeInto(byId("input"), "a,b\n1,2");
    select(byId("output-format"), "html");
    expect(byId("copy-button").hidden).toBe(true);
    expect(byId("rich-copy-button").hidden).toBe(false);
    expect(byId("source-copy-button").hidden).toBe(false);
    byId<HTMLButtonElement>("source-copy-button").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(byId<HTMLTextAreaElement>("output").value));
  });

  it("クリップボードから貼り付けボタンで入力欄に読み込む（Q13）", async () => {
    installChromeMock();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { readText: vi.fn(async () => "x\ty\n1\t2") } });
    await appMain();
    byId<HTMLButtonElement>("paste-button").click();
    await vi.waitFor(() => expect(byId<HTMLTextAreaElement>("input").value).toBe("x\ty\n1\t2"));
    expect(byId<HTMLTextAreaElement>("output").value).toBe("| x | y |\n| ---: | ---: |\n| 1 | 2 |");
  });

  it("入力は少し遅れて local に保存される（Q47）", async () => {
    const { local } = installChromeMock();
    await appMain();
    typeInto(byId("input"), "a,b");
    await vi.advanceTimersByTimeAsync(400);
    expect(local.draft).toBe("a,b");
  });
});

describe("オプションページの初期化", () => {
  beforeEach(() => loadPageBody(optionsHtml));

  it("main() が例外なくマウントされ、保存値を表示する", async () => {
    installChromeMock({ sync: { settings: { boxStyle: "double", rowSeparators: false } } });
    await expect(optionsMain()).resolves.toBeUndefined();
    expect(byId<HTMLSelectElement>("outputFormat").options.length).toBe(7);
    expect(byId<HTMLSelectElement>("boxStyle").value).toBe("double");
    expect(byId<HTMLInputElement>("rowSeparators").checked).toBe(false);
    expect(byId<HTMLInputElement>("pre-extract").checked).toBe(true);
  });

  it("変更すると sync に保存する", async () => {
    const { sync } = installChromeMock();
    await optionsMain();
    const pad = byId<HTMLInputElement>("markdownPad");
    pad.checked = true;
    pad.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect((sync.settings as { markdownPad: boolean }).markdownPad).toBe(true));
  });
});

describe("大きい表のプレビュー省略（Q50）", () => {
  // 3 万文字を超える入力は短い遅延のあとで変換する（B12）
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));

  it("5,000 セルを超えるとプレビューだけ省略し、出力は行う", async () => {
    loadPageBody(appHtml);
    installChromeMock();
    await appMain();
    const big = Array.from({ length: 1001 }, (_, r) => Array.from({ length: 5 }, (_, c) => `r${r}c${c}`).join("\t")).join("\n");
    typeInto(byId("input"), big);
    vi.advanceTimersByTime(300);
    expect(byId("preview").querySelector("table")).toBeNull();
    expect(byId("preview").textContent).toContain("プレビューを省略しました");
    expect(byId<HTMLTextAreaElement>("output").value.split("\n").length).toBe(1002);
  });

  it("5,000 セル以下ならプレビューを表示する", async () => {
    loadPageBody(appHtml);
    installChromeMock();
    await appMain();
    const rows = Array.from({ length: 1000 }, (_, r) => Array.from({ length: 5 }, (_, c) => `r${r}c${c}`).join("\t"));
    typeInto(byId("input"), rows.join("\n"));
    vi.advanceTimersByTime(300);
    expect(byId("preview").querySelector("table")).not.toBeNull();
  });
});

describe("B3 プレビュー上の編集と設定変更", () => {
  beforeEach(() => {
    loadPageBody(appHtml);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  function editFirstCell(value: string): void {
    const cell = byId("preview").querySelector<HTMLElement>('td[data-row="1"][data-col="0"]');
    if (!cell) throw new Error("cell not found");
    cell.textContent = value;
    cell.dispatchEvent(new Event("input"));
  }

  it("セル編集 → 出力系設定の変更（タブ内・出力形式・オプションページ）→ 編集が残る", async () => {
    const { chrome } = installChromeMock();
    await appMain();
    typeInto(byId("input"), "a,b,c\n1,2,3");
    editFirstCell("9");
    byId<HTMLButtonElement>("transpose-button").click();
    select(byId("output-format"), "csv");
    await Promise.resolve();
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a,9\nb,2\nc,3");
    select(byId("opt-csv-delimiter"), ";");
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a;9\nb;2\nc;3");
    await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, outputFormat: "csv", csvDelimiter: "|", boxStyle: "double" } });
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a|9\nb|2\nc|3");
  });

  it("入力形式の手動変更・前処理設定の変更では入力から作り直す", async () => {
    const { chrome } = installChromeMock();
    await appMain();
    select(byId("output-format"), "csv");
    typeInto(byId("input"), "a,b\n1,2");
    editFirstCell("9");
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a,b\n9,2");
    select(byId("input-format"), "csv");
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a,b\n1,2");
    editFirstCell("9");
    await chrome.storage.sync.set({
      settings: { ...DEFAULT_SETTINGS, outputFormat: "csv", preprocess: { ...DEFAULT_SETTINGS.preprocess, ansi: false } },
    });
    expect(byId<HTMLTextAreaElement>("output").value).toBe("a,b\n1,2");
  });
});

describe("B5〜B7・B13 の UI 修正", () => {
  beforeEach(() => {
    loadPageBody(appHtml);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("B6 プレビューのセルは plaintext-only で編集する", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), "a,b\n1,2");
    const cell = byId("preview").querySelector("td");
    expect(cell?.getAttribute("contenteditable")).toBe("plaintext-only");
  });

  it("B7 設定の読み込みに失敗したら、出力形式を変えても既定値を sync に書き戻さない", async () => {
    const { chrome } = installChromeMock();
    chrome.storage.sync.get.mockRejectedValueOnce(new Error("quota"));
    await appMain();
    expect(byId("status").textContent).toContain("読み込めませんでした");
    select(byId("output-format"), "csv");
    await Promise.resolve();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it("B13(d) pagehide で下書きを即時保存する", async () => {
    const { local } = installChromeMock();
    await appMain();
    typeInto(byId("input"), "x,y");
    expect(local.draft).toBeUndefined();
    window.dispatchEvent(new Event("pagehide"));
    expect(local.draft).toBe("x,y");
  });

  it("B13(g) 1 列だけの表では列の削除ボタンを押せない", async () => {
    installChromeMock();
    await appMain();
    select(byId("input-format"), "csv");
    typeInto(byId("input"), "a\n1");
    const del = byId("preview").querySelector<HTMLButtonElement>('button[aria-label="1 列目を削除"]');
    expect(del?.disabled).toBe(true);
  });

  it("B12 3 万文字以下の入力は即時に変換する（Q11）", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), "a,b\n1,2");
    expect(byId<HTMLTextAreaElement>("output").value).not.toBe("");
  });
});

describe("C4 設定と下書きの読み込みを独立に扱う", () => {
  beforeEach(() => {
    loadPageBody(appHtml);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("local.get だけが失敗しても sync の設定は使い、出力形式の変更は保存する", async () => {
    const { chrome, sync } = installChromeMock({ sync: { settings: { outputFormat: "tsv", csvDelimiter: ";" } } });
    chrome.storage.local.get.mockRejectedValueOnce(new Error("local broken"));
    await appMain();
    expect(byId<HTMLSelectElement>("output-format").value).toBe("tsv");
    expect(byId("status").textContent).toContain("前回の入力を読み込めませんでした");
    expect(byId("status").textContent).not.toContain("設定を読み込めませんでした");
    select(byId("output-format"), "csv");
    await Promise.resolve();
    expect(sync.settings).toMatchObject({ outputFormat: "csv", csvDelimiter: ";" });
  });

  it("sync.get だけが失敗しても下書きは復元し、設定は書き戻さない（B7 維持）", async () => {
    const { chrome } = installChromeMock({ local: { draft: "a,b\n1,2" } });
    chrome.storage.sync.get.mockRejectedValueOnce(new Error("sync broken"));
    await appMain();
    expect(byId<HTMLTextAreaElement>("input").value).toBe("a,b\n1,2");
    expect(byId("status").textContent).toContain("設定を読み込めませんでした");
    select(byId("output-format"), "csv");
    await Promise.resolve();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});
