import { parseInput, type InputFormat, type ParseOutcome } from "../lib/convert";
import { deleteColumn, moveColumn, setCell, transpose } from "../lib/edit";
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
import { renderPreview } from "./preview";

const DRAFT_SAVE_DELAY_MS = 300;

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
    status: byId<HTMLDivElement>("status"),
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

  const setStatus = (message: string, kind: "info" | "warn" | "error" = "info"): void => {
    el.status.textContent = message;
    el.status.dataset.kind = kind;
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

  const renderOutput = (): void => {
    el.output.value = table ? serialize(table, current.outputFormat, current) : "";
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
        table = setCell(table, row, col, value);
        renderOutput();
      },
      onMoveColumn: (col, delta) => updateTable((t) => moveColumn(t, col, delta)),
      onDeleteColumn: (col) => updateTable((t) => deleteColumn(t, col)),
    });
  };

  const renderAll = (): void => {
    renderOptions();
    renderHeader();
    renderOutput();
    refreshPreview();
  };

  function updateTable(edit: (t: Table) => Table): void {
    if (!table) return;
    table = edit(table);
    renderAll();
  }

  const renderParseStatus = (): void => {
    el.candidates.hidden = true;
    el.detected.textContent = "";
    if (!outcome || (!outcome.ok && outcome.reason === "empty")) {
      setStatus("");
      return;
    }
    if (outcome.ok) {
      el.detected.textContent = outcome.auto ? `判定: ${FORMAT_LABELS[outcome.format]}` : "";
      setStatus(outcome.warnings.join(" / "), outcome.warnings.length > 0 ? "warn" : "info");
      return;
    }
    setStatus(outcome.message, "error");
    if (outcome.reason !== "undetected") return;
    el.candidates.hidden = false;
    el.candidateButtons.replaceChildren(
      ...outcome.candidates.map((format) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = FORMAT_LABELS[format];
        b.addEventListener("click", () => chooseInputFormat(format));
        return b;
      }),
    );
  };

  const reparse = (): void => {
    outcome = parseInput(el.input.value, inputFormat, current.preprocess);
    table = outcome.ok ? { ...outcome.table, header: headerOverride ?? outcome.detectedHeader } : null;
    renderParseStatus();
    renderAll();
  };

  function chooseInputFormat(format: InputFormat): void {
    inputFormat = format;
    el.inputFormat.value = format;
    reparse();
  }

  const scheduleDraftSave = (): void => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      void saveDraft(el.input.value).catch(() => setStatus("入力内容を保存できませんでした。", "warn"));
    }, DRAFT_SAVE_DELAY_MS);
  };

  const onInputChanged = (): void => {
    headerOverride = null;
    scheduleDraftSave();
    reparse();
  };

  const changeOption = (patch: Partial<Settings>): void => {
    current = { ...current, ...patch };
    renderOptions();
    renderOutput();
  };

  const copyWith = async (action: () => Promise<void>): Promise<void> => {
    if (el.output.value === "") return;
    try {
      await action();
      setStatus("コピーしました。");
    } catch {
      setStatus("クリップボードにコピーできませんでした。", "error");
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
    stored = { ...stored, outputFormat: value };
    void saveSettings(stored).catch(() => setStatus("出力形式を保存できませんでした。", "warn"));
  });
  el.headerToggle.addEventListener("change", () => {
    headerOverride = el.headerToggle.checked;
    updateTable((t) => ({ ...t, header: el.headerToggle.checked }));
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
  el.copy.addEventListener("click", () => void copyWith(() => copyText(el.output.value)));
  el.sourceCopy.addEventListener("click", () => void copyWith(() => copyText(el.output.value)));
  el.richCopy.addEventListener("click", () => void copyWith(() => copyRichHtml(el.output.value)));
  el.paste.addEventListener("click", () => {
    void readClipboardText()
      .then((text) => {
        el.input.value = text;
        onInputChanged();
      })
      .catch(() => setStatus("クリップボードを読み取れませんでした。入力欄で Ctrl+V を使ってください。", "error"));
  });
  el.clear.addEventListener("click", () => {
    el.input.value = "";
    onInputChanged();
    el.input.focus();
  });
  el.transpose.addEventListener("click", () => updateTable(transpose));
  el.openOptions.addEventListener("click", () => void chrome.runtime.openOptionsPage());

  onSettingsChanged((next) => {
    current = applyChangedDefaults(current, stored, next);
    stored = next;
    reparse();
  });

  renderAll();
  try {
    const [settings, draft] = await Promise.all([loadSettings(), loadDraft()]);
    stored = settings;
    current = normalizeSettings(settings);
    el.input.value = draft;
  } catch {
    setStatus("保存済みの設定・入力を読み込めませんでした。既定値で表示します。", "warn");
  }
  reparse();
  el.input.focus();
}
