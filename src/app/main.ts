import { parseInput, type InputFormat, type ParseOutcome } from "../lib/convert";
import { deleteColumn, moveColumn, setCell, transpose } from "../lib/edit";
import { popHistory, pushHistory } from "../lib/history";
import { FORMAT_LABELS, FORMATS, isFormat, type Table } from "../lib/model";
import { CSV_DELIMITERS } from "../lib/parsers/delimited";
import { serialize } from "../lib/serializers/index";
import { HTML_STYLE_LABELS } from "../lib/serializers/html";
import { JSON_STRUCTURE_LABELS } from "../lib/serializers/json";
import { BOX_STYLE_LABELS, BOX_STYLES } from "../lib/serializers/ruled";
import {
  DEFAULT_SETTINGS,
  loadDraft,
  loadSettings,
  normalizeSettings,
  onSettingsChanged,
  saveDraft,
  saveSettings,
  type Settings,
} from "../lib/settings";
import { copyRichHtml, copyText, readClipboardText } from "./clipboard";
import { anchorPopover } from "./popover";
import { renderPreview } from "./preview";
import { showToast } from "./toast";

const DRAFT_SAVE_DELAY_MS = 300;
/**
 * これより長い入力は、入力のたびに再変換せず少し待ってからまとめて変換する（Q11 の即時変換は小さい入力で維持）。
 * 実測（Node 20、解析＋罫線表出力: 200×20・約 3.4 万文字で約 36ms、300×20・約 5.2 万文字で約 55ms、
 * 2,000×20 で約 0.44 秒）から、1 回の変換がおおむね 40ms 以内に収まる 3 万文字をしきい値にする。
 */
export const LARGE_INPUT_CHARS = 30000;
const LARGE_INPUT_DELAY_MS = 250;

type StatusKind = "info" | "warn" | "error";

/** クリアの直前の状態。「クリアを取り消す」で入力・表モデル・編集履歴・見出しの指定をそのまま戻す */
type ClearedState = {
  input: string;
  outcome: ParseOutcome | null;
  table: Table | null;
  history: Table[];
  headerOverride: boolean | null;
  inputFormat: InputFormat;
};

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`要素が見つかりません: ${id}`);
  return el as T;
}

function fillSelect(select: HTMLSelectElement, entries: readonly (readonly [string, string])[]): void {
  select.replaceChildren(
    ...entries.map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
}

function elements() {
  return {
    input: byId<HTMLTextAreaElement>("input"),
    output: byId<HTMLTextAreaElement>("output"),
    inputFormat: byId<HTMLSelectElement>("input-format"),
    outputFormat: byId<HTMLSelectElement>("output-format"),
    detected: byId<HTMLSpanElement>("detected"),
    candidates: byId<HTMLDivElement>("candidates"),
    candidateButtons: byId<HTMLDivElement>("candidate-buttons"),
    headerToggle: byId<HTMLInputElement>("header-toggle"),
    headerMode: byId<HTMLSpanElement>("header-mode"),
    markdownPad: byId<HTMLInputElement>("opt-markdown-pad"),
    boxStyle: byId<HTMLSelectElement>("opt-box-style"),
    rowSeparators: byId<HTMLInputElement>("opt-row-separators"),
    ambiguous: byId<HTMLSelectElement>("opt-ambiguous"),
    csvDelimiter: byId<HTMLSelectElement>("opt-csv-delimiter"),
    htmlStyle: byId<HTMLSelectElement>("opt-html-style"),
    jsonStructure: byId<HTMLSelectElement>("opt-json-structure"),
    jsonNumbers: byId<HTMLInputElement>("opt-json-numbers"),
    copy: byId<HTMLButtonElement>("copy-button"),
    richCopy: byId<HTMLButtonElement>("rich-copy-button"),
    sourceCopy: byId<HTMLButtonElement>("source-copy-button"),
    paste: byId<HTMLButtonElement>("paste-button"),
    clear: byId<HTMLButtonElement>("clear-button"),
    transpose: byId<HTMLButtonElement>("transpose-button"),
    openOptions: byId<HTMLButtonElement>("open-options"),
    advancedButton: byId<HTMLButtonElement>("advanced-button"),
    advancedPanel: byId<HTMLDivElement>("advanced-panel"),
    status: byId<HTMLDivElement>("status"),
    undoClear: byId<HTMLButtonElement>("undo-clear-button"),
    undo: byId<HTMLButtonElement>("undo-button"),
    editState: byId<HTMLSpanElement>("edit-state"),
    preview: byId<HTMLDivElement>("preview"),
  };
}

type Elements = ReturnType<typeof elements>;

function populateSelects(el: Elements): void {
  fillSelect(el.inputFormat, [["auto", "自動判定"], ...FORMATS.map((f) => [f, FORMAT_LABELS[f]] as const)]);
  fillSelect(el.outputFormat, FORMATS.map((f) => [f, FORMAT_LABELS[f]] as const));
  fillSelect(el.boxStyle, BOX_STYLES.map((s) => [s, BOX_STYLE_LABELS[s]] as const));
  fillSelect(el.htmlStyle, Object.entries(HTML_STYLE_LABELS));
  fillSelect(el.jsonStructure, Object.entries(JSON_STRUCTURE_LABELS));
}

/** 他タブ・オプションページで変わった既定値だけをこのタブの現在値に反映する */
function applyChangedDefaults(current: Settings, before: Settings, after: Settings): Settings {
  const next: Settings = { ...current };
  for (const key of Object.keys(after) as (keyof Settings)[]) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    Object.assign(next, { [key]: after[key] });
  }
  return next;
}

/** 変換タブ（Q4 専用タブ）を初期化する */
export async function main(): Promise<void> {
  const el = elements();
  populateSelects(el);

  let stored: Settings = DEFAULT_SETTINGS;
  let current: Settings = DEFAULT_SETTINGS;
  let inputFormat: InputFormat = "auto";
  let outcome: ParseOutcome | null = null;
  let table: Table | null = null;
  let headerOverride: boolean | null = null;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  let parseTimer: ReturnType<typeof setTimeout> | undefined;
  // 保存済み設定を読めたか。読めていないときは既定値を sync に書き戻さない
  let settingsLoaded = false;
  // プレビュー上の編集の履歴（1 手前の表モデルを積む）。入力から作り直すと空にする
  let history: Table[] = [];
  // いま編集中のセル（"行:列"）。同じセルへの連続した入力は 1 手にまとめる
  let editingCell: string | null = null;
  // 「クリア」の直前の状態。次に入力するまで「クリアを取り消す」で復元できる
  let cleared: ClearedState | null = null;
  // 次の解析結果を「読み込みました」として知らせるか（貼り付け・クリアの取り消し・候補の選択のとき）
  let announceNextParse = false;
  /** 警告・エラーの状態行（区画の間）。自動では消さない */
  const setStatus = (message: string, kind: StatusKind = "info", screenReaderOnly = false): void => {
    el.status.textContent = message;
    el.status.dataset.kind = kind;
    // 判定失敗の文は候補パネルにも出るので、画面では 1 回だけ見せ、読み上げ用には状態行に残す
    el.status.classList.toggle("sr-only", screenReaderOnly);
  };

  /** 表があるか・出力が空か・編集があるかで、押せるボタンと編集中の表示を切り替える */
  const renderControls = (): void => {
    const noOutput = el.output.value === "";
    el.copy.disabled = noOutput;
    el.richCopy.disabled = noOutput;
    el.sourceCopy.disabled = noOutput;
    el.transpose.disabled = table === null;
    el.clear.disabled = el.input.value === "";
    el.undo.disabled = history.length === 0;
    el.editState.hidden = history.length === 0;
    el.undoClear.hidden = cleared === null;
  };

  const renderOptions = (): void => {
    el.outputFormat.value = current.outputFormat;
    el.markdownPad.checked = current.markdownPad;
    el.boxStyle.value = current.boxStyle;
    el.rowSeparators.checked = current.rowSeparators;
    el.ambiguous.value = current.ambiguousWide ? "2" : "1";
    el.csvDelimiter.value = current.csvDelimiter;
    el.htmlStyle.value = current.htmlStyle;
    el.jsonStructure.value = current.jsonStructure;
    el.jsonNumbers.checked = current.jsonNumbers;
    document.querySelectorAll<HTMLElement>("[data-formats]").forEach((node) => {
      node.hidden = !(node.dataset.formats ?? "").split(" ").includes(current.outputFormat);
    });
    const isHtml = current.outputFormat === "html";
    el.copy.hidden = isHtml;
    el.richCopy.hidden = !isHtml;
    el.sourceCopy.hidden = !isHtml;
  };

  const showError = (error: unknown): void => {
    const detail = error instanceof Error ? error.message : String(error);
    setStatus(`変換中にエラーが発生しました: ${detail}`, "error");
  };

  // 出力の生成で起きたエラーを表示中か。次に出力できたらパース結果の表示（警告など）に戻す
  let outputErrorShown = false;

  const renderOutput = (): void => {
    try {
      el.output.value = table ? serialize(table, current.outputFormat, current) : "";
    } catch (error) {
      el.output.value = "";
      outputErrorShown = true;
      showError(error);
      return;
    }
    if (!outputErrorShown) return;
    outputErrorShown = false;
    renderParseStatus();
  };

  const renderHeader = (): void => {
    el.headerToggle.disabled = table === null;
    el.headerToggle.checked = table?.header ?? false;
    el.headerMode.textContent = table === null ? "" : headerOverride === null ? "（自動判定）" : "（手動）";
  };

  const refreshPreview = (): void => {
    renderPreview(el.preview, table, {
      onCellInput: (row, col, value) => {
        if (!table) return;
        const key = `${row}:${col}`;
        if (editingCell !== key) history = pushHistory(history, table);
        editingCell = key;
        table = setCell(table, row, col, value);
        renderOutput();
        renderControls();
      },
      onCellBlur: () => {
        editingCell = null;
      },
      onMoveColumn: (col, delta) => updateTable((t) => moveColumn(t, col, delta), true),
      onDeleteColumn: (col) => updateTable((t) => deleteColumn(t, col), true),
    });
  };

  const renderAll = (): void => {
    renderOptions();
    renderHeader();
    renderOutput();
    refreshPreview();
    renderControls();
  };

  /** 表モデルを編集して描き直す。record のときは元に戻せるよう 1 手前を履歴に積む */
  function updateTable(edit: (t: Table) => Table, record: boolean): void {
    if (!table) return;
    const next = edit(table);
    if (record && next !== table) history = pushHistory(history, table);
    editingCell = null;
    table = next;
    renderAll();
  }

  /** 行数・列数と形式。ヘッダー行も 1 行として数える（プレビューの行数と同じ数え方） */
  const tableSummary = (t: Table, format: string): string =>
    `${format}・入力は ${t.rows.length} 行 × ${t.rows[0]?.length ?? 0} 列`;

  const renderParseStatus = (announce = false): void => {
    el.candidates.hidden = true;
    el.detected.textContent = "";
    if (!outcome || (!outcome.ok && outcome.reason === "empty")) {
      setStatus("");
      return;
    }
    if (outcome.ok) {
      const label = FORMAT_LABELS[outcome.format];
      el.detected.textContent = tableSummary(outcome.table, outcome.auto ? `${label}（自動判定）` : label);
      const rows = outcome.table.rows.length;
      const cols = outcome.table.rows[0]?.length ?? 0;
      const loaded = `${rows} 行 × ${cols} 列を読み込みました（${label}）。`;
      if (announce) showToast("success", loaded);
      setStatus(outcome.warnings.join(" / "), outcome.warnings.length > 0 ? "warn" : "info");
      return;
    }
    // 判定できないときは候補パネルの文が同じことを言うので、状態行は読み上げ用にだけ残す
    setStatus(outcome.message, "error", outcome.reason === "undetected");
    if (outcome.reason !== "undetected") return;
    el.candidates.hidden = false;
    el.candidateButtons.replaceChildren(
      ...outcome.candidates.map((format) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = FORMAT_LABELS[format];
        b.addEventListener("click", () => chooseInputFormat(format, true));
        return b;
      }),
    );
  };

  /** 入力から表モデルを作り直す（プレビュー上の編集は破棄される）。入力の解釈が変わるときだけ呼ぶ */
  const reparse = (): void => {
    clearTimeout(parseTimer);
    outputErrorShown = false;
    // 入力から作り直すとプレビュー上の編集は破棄される（Q40）ので、その履歴も消す
    history = [];
    editingCell = null;
    const announce = announceNextParse;
    announceNextParse = false;
    try {
      outcome = parseInput(el.input.value, inputFormat, current.preprocess);
      table = outcome.ok ? { ...outcome.table, header: headerOverride ?? outcome.detectedHeader } : null;
      renderParseStatus(announce);
    } catch (error) {
      outcome = null;
      table = null;
      showError(error);
    }
    renderAll();
  };

  function chooseInputFormat(format: InputFormat, announce = false): void {
    inputFormat = format;
    announceNextParse = announce;
    el.inputFormat.value = format;
    reparse();
  }

  const saveDraftNow = (): void => {
    clearTimeout(draftTimer);
    void saveDraft(el.input.value).catch(() => setStatus("入力内容を保存できませんでした。", "warn"));
  };

  const scheduleDraftSave = (): void => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, DRAFT_SAVE_DELAY_MS);
  };

  const onInputChanged = (): void => {
    headerOverride = null;
    cleared = null;
    scheduleDraftSave();
    if (el.input.value.length <= LARGE_INPUT_CHARS) {
      reparse();
      return;
    }
    clearTimeout(parseTimer);
    parseTimer = setTimeout(reparse, LARGE_INPUT_DELAY_MS);
    renderControls();
  };

  const changeOption = (patch: Partial<Settings>): void => {
    current = { ...current, ...patch };
    renderOptions();
    renderOutput();
  };

  const copyWith = async (action: () => Promise<void>, done: string): Promise<void> => {
    if (el.output.value === "") return;
    try {
      await action();
      showToast("success", done);
    } catch {
      // 失敗はトーストでも知らせ、状態行のエラーは消さずに残す
      setStatus("クリップボードにコピーできませんでした。", "error");
      showToast("error", "クリップボードにコピーできませんでした。");
    }
  };

  el.input.addEventListener("input", onInputChanged);
  el.inputFormat.addEventListener("change", () => {
    const value = el.inputFormat.value;
    chooseInputFormat(isFormat(value) ? value : "auto");
  });
  el.outputFormat.addEventListener("change", () => {
    const value = el.outputFormat.value;
    if (!isFormat(value)) return;
    changeOption({ outputFormat: value });
    if (!settingsLoaded) return;
    stored = { ...stored, outputFormat: value };
    void saveSettings(stored).catch(() => setStatus("出力形式を保存できませんでした。", "warn"));
  });
  el.headerToggle.addEventListener("change", () => {
    headerOverride = el.headerToggle.checked;
    updateTable((t) => ({ ...t, header: el.headerToggle.checked }), false);
  });
  el.markdownPad.addEventListener("change", () => changeOption({ markdownPad: el.markdownPad.checked }));
  el.boxStyle.addEventListener("change", () => {
    const style = BOX_STYLES.find((s) => s === el.boxStyle.value);
    if (style) changeOption({ boxStyle: style });
  });
  el.rowSeparators.addEventListener("change", () => changeOption({ rowSeparators: el.rowSeparators.checked }));
  el.ambiguous.addEventListener("change", () => changeOption({ ambiguousWide: el.ambiguous.value === "2" }));
  el.csvDelimiter.addEventListener("change", () => {
    const delimiter = CSV_DELIMITERS.find((d) => d === el.csvDelimiter.value);
    if (delimiter) changeOption({ csvDelimiter: delimiter });
  });
  el.htmlStyle.addEventListener("change", () =>
    changeOption({ htmlStyle: el.htmlStyle.value === "plain" ? "plain" : "bordered" }),
  );
  el.jsonStructure.addEventListener("change", () =>
    changeOption({ jsonStructure: el.jsonStructure.value === "arrays" ? "arrays" : "objects" }),
  );
  el.jsonNumbers.addEventListener("change", () => changeOption({ jsonNumbers: el.jsonNumbers.checked }));
  el.copy.addEventListener("click", () => void copyWith(() => copyText(el.output.value), "コピーしました。"));
  el.sourceCopy.addEventListener(
    "click",
    () => void copyWith(() => copyText(el.output.value), "HTML のソースをコピーしました。"),
  );
  el.richCopy.addEventListener(
    "click",
    () => void copyWith(() => copyRichHtml(el.output.value), "リッチテキスト（表）としてコピーしました。"),
  );
  // Ctrl+V での貼り付けも「読み込みました」と知らせる（手入力では知らせず、入力欄の見出しの件数だけ更新する）
  el.input.addEventListener("paste", () => {
    announceNextParse = true;
  });
  el.paste.addEventListener("click", () => {
    void readClipboardText()
      .then((text) => {
        el.input.value = text;
        announceNextParse = true;
        onInputChanged();
      })
      .catch(() => {
        const message = "クリップボードを読み取れませんでした。入力欄で Ctrl+V を使ってください。";
        setStatus(message, "error");
        showToast("error", message);
      });
  });
  el.clear.addEventListener("click", () => {
    const before: ClearedState = { input: el.input.value, outcome, table, history, headerOverride, inputFormat };
    el.input.value = "";
    onInputChanged();
    if (before.input !== "") {
      cleared = before;
      showToast("success", "入力をクリアしました。");
      renderControls();
    }
    el.input.focus();
  });
  // 入力から作り直さず、クリアの直前の表モデル・編集履歴・見出しの指定をそのまま戻す（プレビューの編集も残る）
  el.undoClear.addEventListener("click", () => {
    if (cleared === null) return;
    const snapshot = cleared;
    cleared = null;
    clearTimeout(parseTimer);
    el.input.value = snapshot.input;
    outcome = snapshot.outcome;
    table = snapshot.table;
    history = snapshot.history;
    headerOverride = snapshot.headerOverride;
    // クリアのあとで入力形式を変えていても、クリア直前の形式に戻す（表モデルと食い違わないように）
    inputFormat = snapshot.inputFormat;
    el.inputFormat.value = snapshot.inputFormat;
    editingCell = null;
    outputErrorShown = false;
    renderParseStatus();
    renderAll();
    scheduleDraftSave();
    showToast("success", "クリアを取り消しました。");
    el.input.focus();
  });
  el.transpose.addEventListener("click", () => updateTable(transpose, true));
  el.undo.addEventListener("click", () => {
    if (!table) return;
    const { past, item } = popHistory(history);
    if (!item) return;
    history = past;
    editingCell = null;
    // 見出しの指定は編集の履歴に含めない（チェックボックスの状態と食い違わないよう、今の指定を保つ）
    table = { ...item, header: table.header };
    renderAll();
    showToast("success", "1 つ前の状態に戻しました。");
  });
  el.openOptions.addEventListener("click", () => void chrome.runtime.openOptionsPage());

  el.input.ownerDocument.defaultView?.addEventListener("pagehide", saveDraftNow);
  // 詳細設定は操作行の高さを変えない浮く面にする（開いたまま設定を変えると出力がすぐ変わる）
  anchorPopover(el.advancedPanel, el.advancedButton, "start");

  // 出力系の設定変更は再描画だけにしてプレビュー上の編集を保つ。前処理が変わったときだけ入力から作り直す
  onSettingsChanged((next) => {
    const preprocessChanged = JSON.stringify(stored.preprocess) !== JSON.stringify(next.preprocess);
    current = applyChangedDefaults(current, stored, next);
    stored = next;
    settingsLoaded = true;
    if (preprocessChanged) reparse();
    else renderAll();
  });

  renderAll();
  // 設定（sync）と下書き（local）は独立に読み込み、片方の失敗がもう片方を巻き込まないようにする
  const [settingsResult, draftResult] = await Promise.allSettled([loadSettings(), loadDraft()]);
  if (settingsResult.status === "fulfilled") {
    stored = settingsResult.value;
    current = normalizeSettings(settingsResult.value);
    settingsLoaded = true;
  }
  if (draftResult.status === "fulfilled") el.input.value = draftResult.value;
  reparse();
  const loadWarnings = [
    settingsResult.status === "rejected" ? "保存済みの設定を読み込めませんでした。既定値で表示します（設定は保存されません）。" : "",
    draftResult.status === "rejected" ? "前回の入力を読み込めませんでした。" : "",
  ].filter((message) => message !== "");
  if (loadWarnings.length > 0) setStatus(loadWarnings.join(" "), "warn");
  el.input.focus();
}
