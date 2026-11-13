import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { main as appMain } from "../src/app/main";
import { TOAST_DURATION_MS } from "../src/app/toast";
import { HISTORY_LIMIT, popHistory, pushHistory } from "../src/lib/history";
import appHtml from "../src/app/index.html?raw";
import { installChromeMock, loadPageBody } from "./chrome-mock";
import { SAMPLE_BOX } from "./fixtures";

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

const output = (): string => byId<HTMLTextAreaElement>("output").value;
const status = (): HTMLElement => byId("status");
/** 画面に出ているトースト（1 つだけ） */
const toasts = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(".toast"));
const toastText = (): string | null | undefined => toasts()[0]?.lastElementChild?.textContent;

function editCell(row: number, col: number, value: string): void {
  const cell = byId("preview").querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
  if (!cell) throw new Error(`cell ${row}:${col} not found`);
  cell.textContent = value;
  cell.dispatchEvent(new Event("input"));
}

function blurCell(row: number, col: number): void {
  byId("preview").querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)?.dispatchEvent(new Event("blur"));
}

function columnButton(label: string): HTMLButtonElement {
  const b = byId("preview").querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!b) throw new Error(`button ${label} not found`);
  return b;
}

/** document.execCommand("copy") を copy イベントを出すだけの代役にし、clipboardData に書かれた値を返す */
function stubCopyCommand(): Record<string, string> {
  const data: Record<string, string> = {};
  const original = document.execCommand;
  document.execCommand = ((command: string) => {
    if (command !== "copy") return false;
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { setData: (type: string, value: string) => void (data[type] = value) },
    });
    document.dispatchEvent(event);
    return true;
  }) as typeof document.execCommand;
  onTestFinished(() => {
    document.execCommand = original;
  });
  return data;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("編集履歴の純粋関数", () => {
  it("push は末尾に積み、上限を超えたら古い方から捨てる", () => {
    let past: number[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) past = pushHistory(past, i);
    expect(past.length).toBe(HISTORY_LIMIT);
    expect(past[0]).toBe(5);
    expect(past[past.length - 1]).toBe(HISTORY_LIMIT + 4);
  });

  it("pop は末尾の 1 手を返し、空なら undefined", () => {
    expect(popHistory([1, 2, 3])).toEqual({ past: [1, 2], item: 3 });
    expect(popHistory([])).toEqual({ past: [], item: undefined });
  });
});

describe("プレビューの編集を元に戻す", () => {
  beforeEach(() => {
    loadPageBody(appHtml);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  async function setup(): Promise<void> {
    installChromeMock();
    await appMain();
    select(byId("output-format"), "csv");
    typeInto(byId("input"), "a,b,c\n1,2,3");
  }

  it("セル編集・列削除・列移動・行列入れ替えを 1 手ずつ逆順に戻せる", async () => {
    await setup();
    const undo = byId<HTMLButtonElement>("undo-button");
    expect(undo.disabled).toBe(true);
    editCell(1, 0, "9");
    blurCell(1, 0);
    columnButton("列を削除（2 列目）").click();
    columnButton("右へ移動（1 列目）").click();
    byId<HTMLButtonElement>("transpose-button").click();
    expect(output()).toBe("c,3\na,9");
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(output()).toBe("c,a\n3,9");
    expect(toastText()).toBe("1 つ前の状態に戻しました。");
    undo.click();
    expect(output()).toBe("a,c\n9,3");
    undo.click();
    expect(output()).toBe("a,b,c\n9,2,3");
    undo.click();
    expect(output()).toBe("a,b,c\n1,2,3");
    expect(undo.disabled).toBe(true);
  });

  it("同じセルへの連続した入力は 1 手にまとめ、別のセルに移ると別の手になる", async () => {
    await setup();
    editCell(1, 0, "9");
    editCell(1, 0, "98");
    editCell(1, 0, "987");
    blurCell(1, 0);
    editCell(1, 1, "x");
    const undo = byId<HTMLButtonElement>("undo-button");
    undo.click();
    expect(output()).toBe("a,b,c\n987,2,3");
    undo.click();
    expect(output()).toBe("a,b,c\n1,2,3");
  });

  it("編集があると「編集中の内容があります」を出し、入力し直すと履歴ごと消える", async () => {
    await setup();
    const state = byId("edit-state");
    expect(state.hidden).toBe(true);
    columnButton("列を削除（1 列目）").click();
    expect(state.hidden).toBe(false);
    expect(state.textContent).toContain("編集中の内容があります");
    typeInto(byId("input"), "a,b,c\n4,5,6");
    expect(state.hidden).toBe(true);
    expect(byId<HTMLButtonElement>("undo-button").disabled).toBe(true);
    expect(output()).toBe("a,b,c\n4,5,6");
  });

  it("元に戻しても、見出しのチェックボックスの指定は変えない", async () => {
    await setup();
    columnButton("列を削除（1 列目）").click();
    const toggle = byId<HTMLInputElement>("header-toggle");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    byId<HTMLButtonElement>("undo-button").click();
    expect(toggle.checked).toBe(false);
    expect(byId("preview").querySelector("thead tr")).toBeNull();
  });
});

describe("列の操作メニュー", () => {
  beforeEach(() => loadPageBody(appHtml));

  it("1 行目の各セルに「列の操作」ボタンが 1 つあり、文字ラベル付きの 3 項目のメニュー（popover）を開く", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), "a,b\n1,2");
    const firstRow = byId("preview").querySelector("tr");
    const cells = firstRow ? Array.from(firstRow.children) : [];
    expect(cells.length).toBe(2);
    cells.forEach((cell, c) => {
      const trigger = cell.querySelector<HTMLButtonElement>(".col-menu-button");
      expect(trigger?.getAttribute("aria-label")).toBe(`列の操作（${c + 1} 列目）`);
      expect(trigger?.title).toBe(trigger?.getAttribute("aria-label"));
      const menu = cell.querySelector<HTMLElement>(".col-menu-list");
      expect(menu?.getAttribute("popover")).toBe("auto");
      expect(trigger?.getAttribute("popovertarget")).toBe(menu?.id);
      const items = Array.from(menu?.querySelectorAll("button") ?? []);
      expect(items.map((b) => b.textContent)).toEqual(["左へ移動", "右へ移動", "列を削除"]);
      expect(items.map((b) => b.getAttribute("aria-label"))).toEqual([
        `左へ移動（${c + 1} 列目）`,
        `右へ移動（${c + 1} 列目）`,
        `列を削除（${c + 1} 列目）`,
      ]);
      for (const b of items) expect(b.title).toBe(b.getAttribute("aria-label"));
    });
    // 端の列では動かせない方向を押せない
    expect(byId<HTMLButtonElement>("col-menu-0").querySelector("button")?.disabled).toBe(true);
    expect(byId("preview").querySelector("tr.col-controls")).toBeNull();
  });

  it("列を動かすと、移動先の列の「列の操作」ボタンにフォーカスが戻る", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), "a,b,c\n1,2,3");
    columnButton("右へ移動（1 列目）").click();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("列の操作（2 列目）");
  });
});

describe("クリアを元に戻す", () => {
  beforeEach(() => {
    loadPageBody(appHtml);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("クリア直後に「クリアを取り消す」が出て、押すと入力と出力が戻る", async () => {
    installChromeMock();
    await appMain();
    select(byId("output-format"), "csv");
    typeInto(byId("input"), "a\tb\n1\t2");
    const undoClear = byId<HTMLButtonElement>("undo-clear-button");
    expect(undoClear.hidden).toBe(true);
    byId<HTMLButtonElement>("clear-button").click();
    expect(byId<HTMLTextAreaElement>("input").value).toBe("");
    expect(output()).toBe("");
    expect(toastText()).toBe("入力をクリアしました。");
    expect(undoClear.hidden).toBe(false);
    expect(undoClear.textContent).toBe("クリアを取り消す");
    undoClear.click();
    expect(byId<HTMLTextAreaElement>("input").value).toBe("a\tb\n1\t2");
    expect(output()).toBe("a,b\n1,2");
    expect(undoClear.hidden).toBe(true);
    expect(toastText()).toBe("クリアを取り消しました。");
  });

  it("クリアを取り消すと、プレビューの編集・編集の履歴・見出しの指定までクリア前と同じに戻る", async () => {
    installChromeMock();
    await appMain();
    select(byId("output-format"), "csv");
    typeInto(byId("input"), "a,b\n1,2");
    editCell(1, 0, "555");
    blurCell(1, 0);
    const toggle = byId<HTMLInputElement>("header-toggle");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    const before = {
      output: output(),
      preview: byId("preview").innerHTML,
      editState: byId("edit-state").hidden,
      undo: byId<HTMLButtonElement>("undo-button").disabled,
      header: toggle.checked,
      mode: byId("header-mode").textContent,
    };
    expect(before.output).toBe("a,b\n555,2");
    byId<HTMLButtonElement>("clear-button").click();
    byId<HTMLButtonElement>("undo-clear-button").click();
    expect({
      output: output(),
      preview: byId("preview").innerHTML,
      editState: byId("edit-state").hidden,
      undo: byId<HTMLButtonElement>("undo-button").disabled,
      header: toggle.checked,
      mode: byId("header-mode").textContent,
    }).toEqual(before);
    // 履歴も戻っているので、編集を元に戻せる
    byId<HTMLButtonElement>("undo-button").click();
    expect(output()).toBe("a,b\n1,2");
  });

  it("クリアのあとに入力すると「クリアを取り消す」は消える", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), "a,b\n1,2");
    byId<HTMLButtonElement>("clear-button").click();
    typeInto(byId("input"), "x,y\n3,4");
    expect(byId<HTMLButtonElement>("undo-clear-button").hidden).toBe(true);
  });
});

describe("操作結果のメッセージ", () => {
  beforeEach(() => {
    loadPageBody(appHtml);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("貼り付けると行数・列数・形式を知らせ、しばらくすると消える", async () => {
    installChromeMock();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { readText: vi.fn(async () => SAMPLE_BOX) } });
    await appMain();
    byId<HTMLButtonElement>("paste-button").click();
    await vi.waitFor(() => expect(byId<HTMLTextAreaElement>("input").value).toBe(SAMPLE_BOX));
    expect(toastText()).toBe("5 行 × 4 列を読み込みました（罫線文字の表）。");
    // 成功のトーストは role="status"（読み上げられる）
    expect(toasts()[0]?.getAttribute("role")).toBe("status");
    expect(toasts()[0]?.classList.contains("success")).toBe(true);
    // 入力区画の件数は入力の件数と分かる文言で、プレビューの行数（見出し行を含む）と同じ数え方
    expect(byId("detected").textContent).toBe("罫線文字の表（自動判定）・入力は 5 行 × 4 列");
    expect(byId("preview").querySelectorAll("tr").length).toBe(5);
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(toasts().length).toBe(0);
  });

  it("Ctrl+V の貼り付けでも知らせ、手入力では知らせない", async () => {
    installChromeMock();
    await appMain();
    const input = byId<HTMLTextAreaElement>("input");
    typeInto(input, "a,b\n1,2");
    expect(toasts().length).toBe(0);
    input.dispatchEvent(new Event("paste"));
    typeInto(input, "a,b\n1,2\n3,4");
    expect(toastText()).toContain("3 行 × 2 列を読み込みました（CSV");
  });

  it("コピー・ソースコピー・リッチコピーの成功を区別して知らせる", async () => {
    installChromeMock();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const copied = stubCopyCommand();
    await appMain();
    typeInto(byId("input"), "a,b\n1,2");
    byId<HTMLButtonElement>("copy-button").click();
    await vi.waitFor(() => expect(toastText()).toBe("コピーしました。"));
    select(byId("output-format"), "html");
    byId<HTMLButtonElement>("source-copy-button").click();
    await vi.waitFor(() => expect(toastText()).toBe("HTML のソースをコピーしました。"));
    byId<HTMLButtonElement>("rich-copy-button").click();
    await vi.waitFor(() => expect(toastText()).toBe("リッチテキスト（表）としてコピーしました。"));
    // text/html は inline style つきのまま、text/plain には同じソースを書く（Q36・Q37）
    expect(copied["text/html"]).toBe(output());
    expect(copied["text/html"]).toContain('style="');
    expect(copied["text/plain"]).toBe(output());
    // 続けて出しても重ねず、最新の 1 つだけを出す
    expect(toasts().length).toBe(1);
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(toasts().length).toBe(0);
  });

  it("リッチコピーで copy イベントが起きなければ失敗として知らせる", async () => {
    installChromeMock();
    const original = document.execCommand;
    document.execCommand = (() => false) as typeof document.execCommand;
    onTestFinished(() => {
      document.execCommand = original;
    });
    await appMain();
    typeInto(byId("input"), "a,b\n1,2");
    select(byId("output-format"), "html");
    byId<HTMLButtonElement>("rich-copy-button").click();
    await vi.waitFor(() => expect(status().dataset.kind).toBe("error"));
    expect(toasts()[0]?.classList.contains("error")).toBe(true);
  });

  it("コピーに失敗したらエラーを出し、時間がたっても消さない", async () => {
    installChromeMock();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("x"))) } });
    await appMain();
    typeInto(byId("input"), "a,b\n1,2");
    byId<HTMLButtonElement>("copy-button").click();
    await vi.waitFor(() => expect(status().dataset.kind).toBe("error"));
    // 失敗はエラーのトースト（role="alert"）でも知らせる
    expect(toasts()[0]?.classList.contains("error")).toBe(true);
    expect(toasts()[0]?.getAttribute("role")).toBe("alert");
    vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
    expect(toasts().length).toBe(0);
    expect(status().textContent).toBe("クリップボードにコピーできませんでした。");
  });

  it("警告が出ている間にコピーしても、警告は状態行に残り（トーストに置き換えない）、成功はトーストで出る", async () => {
    installChromeMock();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => undefined) } });
    await appMain();
    typeInto(byId("input"), "a,b,c\n1,2\n3,4,5");
    expect(status().dataset.kind).toBe("warn");
    const warning = status().textContent;
    byId<HTMLButtonElement>("copy-button").click();
    await vi.waitFor(() => expect(toastText()).toBe("コピーしました。"));
    expect(status().textContent).toBe(warning);
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(toasts().length).toBe(0);
    expect(status().textContent).toBe(warning);
    expect(status().dataset.kind).toBe("warn");
  });
});

describe("押せない状態と判定失敗の表示", () => {
  beforeEach(() => loadPageBody(appHtml));

  it("空の間はコピー・行列を入れ替え・クリア・元に戻すを押せず、表ができると押せる", async () => {
    installChromeMock();
    await appMain();
    const ids = ["copy-button", "rich-copy-button", "source-copy-button", "transpose-button", "clear-button", "undo-button"];
    for (const id of ids) expect(byId<HTMLButtonElement>(id).disabled).toBe(true);
    typeInto(byId("input"), "a,b\n1,2");
    for (const id of ids.filter((id) => id !== "undo-button")) expect(byId<HTMLButtonElement>(id).disabled).toBe(false);
    expect(byId<HTMLButtonElement>("undo-button").disabled).toBe(true);
  });

  it("判定できない入力では、判定失敗の文を画面に 1 回だけ見せる（状態行は読み上げ用に視覚的に隠す）", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), "hello world");
    expect(byId("candidates").hidden).toBe(false);
    expect(status().textContent).toContain("判定できませんでした");
    expect(status().classList.contains("sr-only")).toBe(true);
    const visible = Array.from(document.querySelectorAll("p, .status")).filter(
      (node) => node.textContent?.includes("判定できませんでした") && !node.classList.contains("sr-only"),
    );
    expect(visible.length).toBe(1);
    // ほかのエラーは隠さない
    typeInto(byId("input"), "");
    expect(status().classList.contains("sr-only")).toBe(false);
  });
});

describe("作業画面の設定の補足", () => {
  beforeEach(() => loadPageBody(appHtml));

  it("桁を揃える（Markdown）とスタイル（HTML）の補足を、その形式のときだけ画面に出す", async () => {
    installChromeMock();
    await appMain();
    const pad = byId("hint-markdown-pad");
    const html = byId("hint-html-style");
    expect(pad.hidden).toBe(false);
    expect(html.hidden).toBe(true);
    expect(byId("opt-markdown-pad").getAttribute("aria-describedby")).toBe("hint-markdown-pad");
    select(byId("output-format"), "html");
    expect(pad.hidden).toBe(true);
    expect(html.hidden).toBe(false);
    expect(byId("opt-html-style").getAttribute("aria-describedby")).toBe("hint-html-style");
    select(byId("output-format"), "csv");
    expect(pad.hidden && html.hidden).toBe(true);
  });
});

describe("再検証の指摘（フェーズ 1）", () => {
  beforeEach(() => {
    loadPageBody(appHtml);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  /** happy-dom は popover を開けないので、開いている状態を差し替えて閉じる処理を確かめる */
  function fakeOpen(panel: HTMLElement): ReturnType<typeof vi.fn> {
    const hide = vi.fn();
    const original = panel.matches.bind(panel);
    panel.matches = (selector: string) => selector === ":popover-open" || original(selector);
    Object.assign(panel, { hidePopover: hide });
    return hide;
  }

  it("ウィンドウの幅を変えると、開いている列の操作メニューと詳細設定の面を閉じる", async () => {
    installChromeMock();
    await appMain();
    typeInto(byId("input"), "a,b\n1,2");
    const menuHide = fakeOpen(byId("col-menu-0"));
    const advancedHide = fakeOpen(byId("advanced-panel"));
    window.dispatchEvent(new Event("resize"));
    expect(menuHide).toHaveBeenCalled();
    expect(advancedHide).toHaveBeenCalled();
  });

  it("詳細設定は popover の面で、開いたまま設定を変えると出力がすぐ変わる", async () => {
    installChromeMock();
    await appMain();
    select(byId("output-format"), "box");
    typeInto(byId("input"), "a,b\n1,2\n3,4");
    const button = byId("advanced-button");
    const panel = byId("advanced-panel");
    expect(button.getAttribute("popovertarget")).toBe("advanced-panel");
    expect(panel.getAttribute("popover")).toBe("auto");
    expect(panel.contains(byId("opt-row-separators"))).toBe(true);
    const before = output();
    const rows = byId<HTMLInputElement>("opt-row-separators");
    rows.checked = !rows.checked;
    rows.dispatchEvent(new Event("change", { bubbles: true }));
    expect(output()).not.toBe(before);
    expect(document.querySelector("details.advanced")).toBeNull();
  });

  it("クリア → 入力形式を変える → クリアを取り消す で、入力形式もクリア直前に戻る", async () => {
    installChromeMock();
    await appMain();
    select(byId("output-format"), "csv");
    typeInto(byId("input"), "a\tb\n1\t2");
    expect(byId<HTMLSelectElement>("input-format").value).toBe("auto");
    byId<HTMLButtonElement>("clear-button").click();
    select(byId("input-format"), "csv");
    byId<HTMLButtonElement>("undo-clear-button").click();
    expect(byId<HTMLSelectElement>("input-format").value).toBe("auto");
    expect(output()).toBe("a,b\n1,2");
    expect(byId("detected").textContent).toContain("TSV（自動判定）");
  });

  it("列が 1 つだけの表では「列の操作」ボタン自体を押せない", async () => {
    installChromeMock();
    await appMain();
    select(byId("input-format"), "csv");
    typeInto(byId("input"), "a\n1");
    expect(byId("preview").querySelector<HTMLButtonElement>(".col-menu-button")?.disabled).toBe(true);
    typeInto(byId("input"), "a,b\n1,2");
    expect(byId("preview").querySelector<HTMLButtonElement>(".col-menu-button")?.disabled).toBe(false);
  });
});

describe("トースト通知への置き換え", () => {
  beforeEach(() => loadPageBody(appHtml));

  it("区画内の成功メッセージ用の場所は無い", async () => {
    installChromeMock();
    await appMain();
    for (const id of ["input-status", "copy-status", "preview-status"]) expect(document.getElementById(id)).toBeNull();
    expect(document.querySelector(".local-status")).toBeNull();
  });
});
