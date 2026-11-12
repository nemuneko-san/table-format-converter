import { isFormat, type Format } from "./model";
import { CSV_DELIMITERS, type CsvDelimiter } from "./parsers/delimited";
import { DEFAULT_PREPROCESS, type PreprocessOptions } from "./preprocess";
import type { OutputOptions } from "./serializers/index";
import { BOX_STYLES, type BoxStyle } from "./serializers/ruled";

/** 保存する設定（chrome.storage.sync） */
export type Settings = OutputOptions & {
  /** 前回選んだ出力形式（Q15） */
  outputFormat: Format;
  preprocess: PreprocessOptions;
};

export const DEFAULT_SETTINGS: Settings = {
  outputFormat: "markdown",
  ambiguousWide: false,
  markdownPad: false,
  boxStyle: "single",
  rowSeparators: true,
  csvDelimiter: ",",
  htmlStyle: "bordered",
  jsonStructure: "objects",
  jsonNumbers: false,
  preprocess: DEFAULT_PREPROCESS,
};

const SETTINGS_KEY = "settings";
const DRAFT_KEY = "draft";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && (choices as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeSettings(raw: unknown): Settings {
  const src = asRecord(raw);
  const pre = asRecord(src.preprocess);
  const d = DEFAULT_SETTINGS;
  return {
    outputFormat: typeof src.outputFormat === "string" && isFormat(src.outputFormat) ? src.outputFormat : d.outputFormat,
    ambiguousWide: bool(src.ambiguousWide, d.ambiguousWide),
    markdownPad: bool(src.markdownPad, d.markdownPad),
    boxStyle: oneOf<BoxStyle>(src.boxStyle, BOX_STYLES, d.boxStyle),
    rowSeparators: bool(src.rowSeparators, d.rowSeparators),
    csvDelimiter: oneOf<CsvDelimiter>(src.csvDelimiter, CSV_DELIMITERS, d.csvDelimiter),
    htmlStyle: oneOf(src.htmlStyle, ["bordered", "plain"] as const, d.htmlStyle),
    jsonStructure: oneOf(src.jsonStructure, ["objects", "arrays"] as const, d.jsonStructure),
    jsonNumbers: bool(src.jsonNumbers, d.jsonNumbers),
    preprocess: {
      ansi: bool(pre.ansi, d.preprocess.ansi),
      indent: bool(pre.indent, d.preprocess.indent),
      fence: bool(pre.fence, d.preprocess.fence),
      extract: bool(pre.extract, d.preprocess.extract),
    },
  };
}

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  return normalizeSettings(result[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

export function onSettingsChanged(callback: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[SETTINGS_KEY]) return;
    callback(normalizeSettings(changes[SETTINGS_KEY].newValue));
  });
}

/** 直近の入力（Q47）。表データは sync の容量上限を超えうるため local に保存する */
export async function loadDraft(): Promise<string> {
  const result = await chrome.storage.local.get(DRAFT_KEY);
  const value: unknown = result[DRAFT_KEY];
  return typeof value === "string" ? value : "";
}

export async function saveDraft(text: string): Promise<void> {
  await chrome.storage.local.set({ [DRAFT_KEY]: text });
}
