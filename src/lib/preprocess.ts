import {
  detectFormat,
  detectStrong,
  isAsciiLine,
  isBoxLine,
  looksLikeHtml,
} from "./detect";
import type { Format } from "./model";
import { CSV_DELIMITERS, delimiterScore, parseDelimitedRows } from "./parsers/delimited";

export type PreprocessOptions = {
  /** ANSI エスケープ（色コード）を除去する */
  ansi: boolean;
  /** 全行共通の先頭インデントを除去する */
  indent: boolean;
  /** Markdown のコードフェンス行（``` / ~~~）を除去する */
  fence: boolean;
  /** 表の前後にある空行・説明文を除き、表部分だけを抽出する */
  extract: boolean;
};

export const DEFAULT_PREPROCESS: PreprocessOptions = { ansi: true, indent: true, fence: true, extract: true };

// ESC [ ... 終端文字（CSI）と ESC ] ... BEL/ST（OSC）、および単独の 2 文字シーケンス
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export function stripCodeFence(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(```|~~~)/.test(line))
    .join("\n");
}

/** 空行を除く全行に共通する先頭の半角空白を除去する（タブは TSV の空セルでありうるため対象外） */
export function removeCommonIndent(text: string): string {
  const lines = text.split(/\r?\n/);
  const indents = lines.filter((line) => line.trim() !== "").map((line) => (line.match(/^ */) ?? [""])[0].length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  if (common === 0) return text;
  return lines.map((line) => line.slice(Math.min(common, (line.match(/^ */) ?? [""])[0].length))).join("\n");
}

function extractHtmlTable(text: string): string {
  const start = text.search(/<table[\s>]/i);
  const end = text.toLowerCase().lastIndexOf("</table>");
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + "</table>".length);
}

function extractJson(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  return detectStrong(candidate) === "json" ? candidate : null;
}

const PRIORITY: Record<Format, number> = { json: 5, html: 5, box: 4, ascii: 4, markdown: 3, tsv: 2, csv: 1 };

/** 行が形式の表の一部らしいか（表の前後の説明文を切り落とすのに使う） */
function lineFits(format: Format, line: string): boolean {
  if (format === "box") return isBoxLine(line);
  if (format === "ascii") return isAsciiLine(line);
  if (format === "markdown") return line.includes("|");
  if (format === "tsv") return line.includes("\t");
  return true;
}

function trimNonTableLines(format: Format, lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lineFits(format, lines[start])) start++;
  while (end > start && !lineFits(format, lines[end - 1])) end--;
  return lines.slice(start, end);
}

/** CSV ブロックの前後で、最頻のフィールド数と異なる行（説明文）を切り落とす */
function trimCsvLines(lines: readonly string[]): string[] {
  const text = lines.join("\n");
  const delimiter =
    CSV_DELIMITERS.find((d) => delimiterScore(parseDelimitedRows(text, d)) >= 0.5) ?? CSV_DELIMITERS[0];
  const counts = lines.map((line) => parseDelimitedRows(line, delimiter)[0]?.length ?? 0);
  const mode = counts.reduce<number>(
    (best, n) => (counts.filter((c) => c === n).length > counts.filter((c) => c === best).length ? n : best),
    counts[0] ?? 0,
  );
  let start = 0;
  let end = lines.length;
  while (start < end && counts[start] !== mode) start++;
  while (end > start && counts[end - 1] !== mode) end--;
  return lines.slice(start, end);
}

type Block = { lines: string[]; format: Format };

const LINE_FORMATS: readonly Format[] = ["box", "ascii", "markdown", "tsv", "csv"];

/** ブロックの前後から説明文を切り落とし、その形式として判定できるものを候補にする */
function blockCandidates(lines: readonly string[]): Block[] {
  return LINE_FORMATS.flatMap((format) => {
    const trimmed = format === "csv" ? trimCsvLines(lines) : trimNonTableLines(format, lines);
    if (trimmed.length === 0) return [];
    return detectFormat(trimmed.join("\n")).format === format ? [{ lines: trimmed, format }] : [];
  });
}

function splitBlocks(text: string): Block[] {
  return text
    .split(/\r?\n(?:[ \t\u3000]*\r?\n)+/)
    .map((chunk) => chunk.split(/\r?\n/).filter((line) => line.trim() !== ""))
    .filter((lines) => lines.length > 0)
    .flatMap(blockCandidates);
}

function pickBlock(blocks: readonly Block[]): Block | null {
  let best: Block | null = null;
  for (const block of blocks) {
    if (!best || isBetter(block, best)) best = block;
  }
  return best;
}

function isBetter(a: Block, b: Block): boolean {
  const pa = PRIORITY[a.format];
  const pb = PRIORITY[b.format];
  return pa !== pb ? pa > pb : a.lines.length > b.lines.length;
}

/** 先頭・末尾の空行だけを除く（行頭のタブは TSV の空セルなので残す） */
function trimBlankLines(text: string): string {
  return text.replace(/^(?:[ \t\u3000]*\n)+/, "").replace(/(?:\n[ \t\u3000]*)+$/, "");
}

/** 表の前後にある空行・説明文を除き、表部分だけを取り出す */
export function extractTable(text: string): string {
  if (looksLikeHtml(text)) return extractHtmlTable(text);
  const json = extractJson(text);
  if (json) return json;
  const whole = detectFormat(text).format;
  if (whole === "csv" || whole === "tsv") {
    // 引用符内の改行・空行を壊さないよう、全体が区切り形式として揃っていればそのまま使う
    const delimiter = whole === "tsv" ? "\t" : null;
    const score = delimiter
      ? delimiterScore(parseDelimitedRows(text.trim(), delimiter))
      : Math.max(...CSV_DELIMITERS.map((d) => delimiterScore(parseDelimitedRows(text.trim(), d))));
    if (score === 1) return trimBlankLines(text);
  }
  const block = pickBlock(splitBlocks(text));
  return block ? block.lines.join("\n") : trimBlankLines(text);
}

/** 変換前の前処理（Q9）。ANSI → コードフェンス → 表部分の抽出 → 共通インデントの順に適用する */
export function preprocess(text: string, options: PreprocessOptions): string {
  let out = text.replace(/\r\n?/g, "\n");
  if (options.ansi) out = stripAnsi(out);
  if (options.fence) out = stripCodeFence(out);
  if (options.extract) out = extractTable(out);
  if (options.indent) out = removeCommonIndent(out);
  return out;
}
