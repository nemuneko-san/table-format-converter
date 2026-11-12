import { FORMAT_LABELS, FORMATS } from "../lib/model";
import { HTML_STYLE_LABELS } from "../lib/serializers/html";
import { JSON_STRUCTURE_LABELS } from "../lib/serializers/json";
import { BOX_STYLE_LABELS, BOX_STYLES } from "../lib/serializers/ruled";
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, onSettingsChanged, saveSettings, type Settings } from "../lib/settings";

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
    form: byId<HTMLFormElement>("settings-form"),
    outputFormat: byId<HTMLSelectElement>("outputFormat"),
    ambiguousWide: byId<HTMLSelectElement>("ambiguousWide"),
    markdownPad: byId<HTMLInputElement>("markdownPad"),
    boxStyle: byId<HTMLSelectElement>("boxStyle"),
    rowSeparators: byId<HTMLInputElement>("rowSeparators"),
    csvDelimiter: byId<HTMLSelectElement>("csvDelimiter"),
    htmlStyle: byId<HTMLSelectElement>("htmlStyle"),
    jsonStructure: byId<HTMLSelectElement>("jsonStructure"),
    jsonNumbers: byId<HTMLInputElement>("jsonNumbers"),
    preAnsi: byId<HTMLInputElement>("pre-ansi"),
    preIndent: byId<HTMLInputElement>("pre-indent"),
    preFence: byId<HTMLInputElement>("pre-fence"),
    preExtract: byId<HTMLInputElement>("pre-extract"),
    message: byId<HTMLParagraphElement>("persist-message"),
    reset: byId<HTMLButtonElement>("reset-button"),
  };
}

type Elements = ReturnType<typeof elements>;

function render(el: Elements, s: Settings): void {
  el.outputFormat.value = s.outputFormat;
  el.ambiguousWide.value = String(s.ambiguousWide);
  el.markdownPad.checked = s.markdownPad;
  el.boxStyle.value = s.boxStyle;
  el.rowSeparators.checked = s.rowSeparators;
  el.csvDelimiter.value = s.csvDelimiter;
  el.htmlStyle.value = s.htmlStyle;
  el.jsonStructure.value = s.jsonStructure;
  el.jsonNumbers.checked = s.jsonNumbers;
  el.preAnsi.checked = s.preprocess.ansi;
  el.preIndent.checked = s.preprocess.indent;
  el.preFence.checked = s.preprocess.fence;
  el.preExtract.checked = s.preprocess.extract;
}

/** フォームの値を設定値に読み取る（不正値は normalizeSettings が既定値に戻す） */
function readForm(el: Elements): Settings {
  return normalizeSettings({
    outputFormat: el.outputFormat.value,
    ambiguousWide: el.ambiguousWide.value === "true",
    markdownPad: el.markdownPad.checked,
    boxStyle: el.boxStyle.value,
    rowSeparators: el.rowSeparators.checked,
    csvDelimiter: el.csvDelimiter.value,
    htmlStyle: el.htmlStyle.value,
    jsonStructure: el.jsonStructure.value,
    jsonNumbers: el.jsonNumbers.checked,
    preprocess: {
      ansi: el.preAnsi.checked,
      indent: el.preIndent.checked,
      fence: el.preFence.checked,
      extract: el.preExtract.checked,
    },
  });
}

async function persist(el: Elements, settings: Settings): Promise<void> {
  try {
    await saveSettings(settings);
    el.message.textContent = "保存しました。";
  } catch {
    el.message.textContent = "設定を保存できませんでした。時間をおいて再度お試しください。";
  }
}

/** オプションページ（Q51: 全設定の既定値）を初期化する */
export async function main(): Promise<void> {
  const el = elements();
  fillSelect(el.outputFormat, FORMATS.map((f) => [f, FORMAT_LABELS[f]] as const));
  fillSelect(el.boxStyle, BOX_STYLES.map((s) => [s, BOX_STYLE_LABELS[s]] as const));
  fillSelect(el.htmlStyle, Object.entries(HTML_STYLE_LABELS));
  fillSelect(el.jsonStructure, Object.entries(JSON_STRUCTURE_LABELS));
  render(el, DEFAULT_SETTINGS);

  el.form.addEventListener("change", () => void persist(el, readForm(el)));
  el.form.addEventListener("submit", (event) => event.preventDefault());
  el.reset.addEventListener("click", () => {
    render(el, DEFAULT_SETTINGS);
    void persist(el, DEFAULT_SETTINGS);
  });
  onSettingsChanged((settings) => render(el, settings));

  try {
    render(el, await loadSettings());
  } catch {
    el.message.textContent = "設定を読み込めませんでした。既定値を表示しています。";
  }
}
