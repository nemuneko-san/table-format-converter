import type { RawTable } from "../model";

/**
 * 区切り文字形式（TSV / CSV）を解析する。
 * フィールド先頭の引用符（"）で囲まれた範囲は、区切り文字・改行を含めて 1 セルとして扱う（Q17）。
 * 引用符内の "" は " 1 文字に戻す。
 */
export function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const src = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  // 引用符が無ければ単純な分割と同じ結果になる（大きな表の高速経路）
  if (!src.includes('"')) return src.split("\n").map((line) => line.split(delimiter));
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i <= src.length) {
    const { value, next } = readField(src, i, delimiter);
    row.push(value);
    const ch = src[next];
    i = next + 1;
    if (ch === delimiter) continue;
    rows.push(row);
    row = [];
    if (ch === undefined) break;
  }
  return rows;
}

type FieldResult = { value: string; next: number };

function readField(src: string, start: number, delimiter: string): FieldResult {
  if (src[start] === '"') return readQuoted(src, start + 1, delimiter);
  let end = start;
  while (end < src.length && src[end] !== delimiter && src[end] !== "\n") end++;
  return { value: src.slice(start, end), next: end };
}

function readQuoted(src: string, start: number, delimiter: string): FieldResult {
  let value = "";
  let i = start;
  while (i < src.length) {
    if (src[i] !== '"') {
      value += src[i];
      i++;
      continue;
    }
    if (src[i + 1] === '"') {
      value += '"';
      i += 2;
      continue;
    }
    // 閉じ引用符。後続の区切り・改行までの余分な文字はそのまま連結する
    const rest = readField(src, i + 1, delimiter);
    return { value: value + rest.value, next: rest.next };
  }
  // 閉じ引用符が無い場合は、引用符を文字として扱い 1 行目の終わりまでを値にする
  const lineEnd = src.indexOf("\n", start - 1);
  const end = lineEnd === -1 ? src.length : lineEnd;
  const raw = src.slice(start - 1, end);
  const delimAt = raw.indexOf(delimiter);
  return delimAt === -1
    ? { value: raw, next: end }
    : { value: raw.slice(0, delimAt), next: start - 1 + delimAt };
}

function isBlankRow(row: readonly string[]): boolean {
  return row.length === 1 && row[0].trim() === "";
}

export function parseTsv(text: string): RawTable {
  const rows = parseDelimitedRows(text, "\t").filter((row) => !isBlankRow(row));
  return { rows, header: null, inputAligns: null };
}

export const CSV_DELIMITERS = [",", ";", "|"] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

/** 行ごとのフィールド数が最も揃い、かつ 2 列以上になる区切り文字で解析した結果（入力に無い区切り文字は試さない） */
function bestDelimited(text: string): { delimiter: CsvDelimiter; rows: string[][] } {
  let best: { delimiter: CsvDelimiter; rows: string[][]; score: number } | null = null;
  for (const delimiter of CSV_DELIMITERS) {
    if (!text.includes(delimiter)) continue;
    const rows = parseDelimitedRows(text, delimiter);
    const score = delimiterScore(rows);
    if (!best || score > best.score) best = { delimiter, rows, score };
  }
  return best ?? { delimiter: ",", rows: parseDelimitedRows(text, ",") };
}

export function detectCsvDelimiter(text: string): CsvDelimiter {
  return bestDelimited(text).delimiter;
}

/** 列数 2 以上で揃っている行の割合（0〜1）。列数 1 しかなければ 0 */
export function delimiterScore(rows: readonly string[][]): number {
  const counts = rows.filter((row) => !isBlankRow(row)).map((row) => row.length);
  if (counts.length === 0) return 0;
  const freq = new Map<number, number>();
  for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1);
  let modeCount = 0;
  let mode = 1;
  for (const [n, c] of freq) {
    if (c > modeCount || (c === modeCount && n > mode)) {
      mode = n;
      modeCount = c;
    }
  }
  if (mode < 2) return 0;
  return modeCount / counts.length;
}

export function parseCsv(text: string): RawTable {
  const rows = bestDelimited(text).rows.filter((row) => !isBlankRow(row));
  return { rows, header: null, inputAligns: null };
}
