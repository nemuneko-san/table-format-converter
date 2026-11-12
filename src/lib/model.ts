/** 対応する表記法（入力・出力共通） */
export type Format = "markdown" | "tsv" | "csv" | "box" | "ascii" | "html" | "json";

export const FORMATS: readonly Format[] = ["markdown", "tsv", "csv", "box", "ascii", "html", "json"];

export const FORMAT_LABELS: Record<Format, string> = {
  markdown: "Markdown",
  tsv: "TSV",
  csv: "CSV",
  box: "罫線文字の表",
  ascii: "ASCII 罫線の表",
  html: "HTML table",
  json: "JSON",
};

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}

/** 列の揃え。none は「指定なし」（Markdown の --- に相当） */
export type Align = "none" | "left" | "center" | "right";

/** 共通の表モデル */
export type Table = {
  /** セル文字列の 2 次元配列。全行の列数は揃っている。セル内改行は "\n" */
  rows: string[][];
  /** 1 行目をヘッダーとして扱うか */
  header: boolean;
  /** 入力に揃え指定があった場合の列ごとの揃え。null なら数値列の自動検出を使う */
  inputAligns: Align[] | null;
  /** セルが Markdown のインライン記法を含みうるか（入力が Markdown のとき true） */
  inlineMarkdown: boolean;
};

/** パーサの戻り値（正規化前） */
export type RawTable = {
  rows: string[][];
  /** 形式から判定したヘッダー有無。null なら内容からの推定に任せる */
  header: boolean | null;
  inputAligns: Align[] | null;
};

export function columnCount(rows: readonly (readonly string[])[]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}
