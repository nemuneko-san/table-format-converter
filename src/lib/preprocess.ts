import { detectFormat, isAsciiLine, isBoxLine, looksLikeHtml, looksLikeJson } from "./detect";
import type { Format } from "./model";
import { PARSERS } from "./parsers/index";

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

export type Preprocessed = {
  text: string;
  /** 表部分の抽出で除外した（空行以外の）行数。0 なら除外なし */
  removedLines: number;
};

// ESC [ ... 終端文字（CSI）と ESC ] ... BEL/ST（OSC）、および単独の 2 文字シーケンス
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export function stripCodeFence(text: string): string {
  return text
    .split("\n")
    .filter((line) => !FENCE_LINE.test(line))
    .join("\n");
}

const FENCE_LINE = /^\s*(```|~~~)/;

/** コードフェンスで分けた入力。inside はフェンスごとの内側の行、outside はフェンスの外の行 */
export type Fences = { inside: string[][]; outside: string[] };

/**
 * 入力をコードフェンスの内側と外側に分ける。フェンスが無ければ null。
 * 閉じていないフェンスは入力の終わりまでを内側とみなす。フェンスのあった位置は外側では空行にして、前後の文章を別のブロックに分ける。
 */
export function splitFences(text: string): Fences | null {
  const lines = text.split("\n");
  if (!lines.some((line) => FENCE_LINE.test(line))) return null;
  const inside: string[][] = [];
  const outside: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (!FENCE_LINE.test(line)) {
      (current ?? outside).push(line);
      continue;
    }
    if (current) {
      inside.push(current);
      current = null;
      continue;
    }
    current = [];
    outside.push("");
  }
  if (current) inside.push(current);
  return { inside, outside };
}

function leadingSpaces(line: string): number {
  return (line.match(/^ */) ?? [""])[0].length;
}

/** 空行を除く全行に共通する先頭の半角空白を除去する（タブは TSV の空セルでありうるため対象外） */
export function removeCommonIndent(text: string): string {
  const lines = text.split("\n");
  const common = lines
    .filter((line) => line.trim() !== "")
    .reduce<number | null>((min, line) => {
      const n = leadingSpaces(line);
      return min === null || n < min ? n : min;
    }, null);
  if (!common) return text;
  return lines.map((line) => line.slice(Math.min(common, leadingSpaces(line)))).join("\n");
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function countNonBlank(text: string): number {
  return text.split("\n").filter((line) => !isBlank(line)).length;
}

/** 先頭・末尾の空行だけを除く（行頭のタブは TSV の空セルなので残す） */
function trimBlankLines(text: string): string {
  const lines = text.split("\n");
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start])) start++;
  while (end > start && isBlank(lines[end - 1])) end--;
  return lines.slice(start, end).join("\n");
}

/**
 * 空行でブロックに分ける。ただし引用符（"）の内側の空行では分けない（CSV / TSV のセル内改行を壊さない）。
 */
export function splitBlocks(text: string): string[][] {
  const blocks: string[][] = [[]];
  let inQuote = false;
  for (const line of text.split("\n")) {
    if (isBlank(line) && !inQuote) {
      if (blocks[blocks.length - 1].length > 0) blocks.push([]);
      continue;
    }
    blocks[blocks.length - 1].push(line);
    if ((line.match(/"/g) ?? []).length % 2 === 1) inQuote = !inQuote;
  }
  return blocks.filter((block) => block.length > 0);
}

/** 構造（罫線・区切り行）で表の範囲が確定する形式。前後の説明文は空行が無くても切り落とせる */
const STRUCTURAL: readonly Format[] = ["box", "ascii", "markdown"];
const DELIMITED: readonly Format[] = ["tsv", "csv"];
const PRIORITY: Record<Format, number> = { json: 5, html: 5, box: 4, ascii: 4, markdown: 3, tsv: 2, csv: 1 };

function lineFits(format: Format, line: string): boolean {
  if (format === "box") return isBoxLine(line);
  if (format === "ascii") return isAsciiLine(line);
  return line.includes("|");
}

function trimNonTableLines(format: Format, lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lineFits(format, lines[start])) start++;
  while (end > start && !lineFits(format, lines[end - 1])) end--;
  return lines.slice(start, end);
}

type Candidate = { lines: string[]; format: Format };

/**
 * ブロックから表の候補を作る。
 * - 罫線表・Markdown: 前後の説明文の行を切り落としてから判定する
 * - CSV / TSV: ブロックの行を削らずにそのまま判定する（列数の違う行も表の一部として残す。Q10）
 */
function blockCandidates(block: readonly string[]): Candidate[] {
  const structural = STRUCTURAL.flatMap((format) => {
    const lines = trimNonTableLines(format, block);
    if (lines.length === 0) return [];
    return detectFormat(lines.join("\n")).format === format ? [{ lines, format }] : [];
  });
  const whole = detectFormat(block.join("\n")).format;
  const delimited = whole && DELIMITED.includes(whole) ? [{ lines: [...block], format: whole }] : [];
  return [...structural, ...delimited];
}

function pickBest(candidates: readonly Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (!best || isBetter(c, best)) best = c;
  }
  return best;
}

function isBetter(a: Candidate, b: Candidate): boolean {
  const pa = PRIORITY[a.format];
  const pb = PRIORITY[b.format];
  return pa !== pb ? pa > pb : a.lines.length > b.lines.length;
}

/** <table で始まる行から </table> までを取り出す（説明文中の「<table>」という文字列には反応しない） */
function extractHtmlTable(text: string): string | null {
  const lines = text.split("\n");
  const startLine = lines.findIndex((line) => /^\s*<table[\s>]/i.test(line));
  if (startLine === -1) return null;
  const rest = lines.slice(startLine).join("\n");
  const end = rest.toLowerCase().lastIndexOf("</table");
  const close = end === -1 ? -1 : rest.indexOf(">", end);
  if (close === -1) return null;
  const candidate = rest.slice(0, close + 1).trim();
  return looksLikeHtml(candidate) ? candidate : null;
}

/** [ で始まる行から ] で終わる行までを取り出す（セル内の [1] などには反応しない） */
function extractJson(text: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith("["));
  let end = -1;
  for (let i = lines.length - 1; i >= start && start !== -1; i--) {
    if (lines[i].trim().endsWith("]")) {
      end = i;
      break;
    }
  }
  if (start === -1 || end === -1) return null;
  const candidate = lines.slice(start, end + 1).join("\n").trim();
  return looksLikeJson(candidate) ? candidate : null;
}

type Found = { text: string; found: boolean };

/**
 * 表の前後にある空行・説明文を除き、表部分だけを探す。見つからなければ found=false で先頭・末尾の空行だけを除いて返す。
 * 優先順: 入力全体が JSON / HTML → 罫線表・Markdown（構造で範囲が確定）→ HTML の table → JSON の配列 → CSV / TSV のブロック
 */
function findTable(text: string): Found {
  if (looksLikeJson(text) || looksLikeHtml(text)) return { text: trimBlankLines(text), found: true };
  const candidates = splitBlocks(text).flatMap(blockCandidates);
  const structural = pickBest(candidates.filter((c) => STRUCTURAL.includes(c.format)));
  if (structural) return { text: structural.lines.join("\n"), found: true };
  const html = extractHtmlTable(text);
  if (html) return { text: html, found: true };
  const json = extractJson(text);
  if (json) return { text: json, found: true };
  const delimited = pickBest(candidates);
  return delimited ? { text: delimited.lines.join("\n"), found: true } : { text: trimBlankLines(text), found: false };
}

export function extractTable(text: string): Preprocessed {
  const result = findTable(text).text;
  return { text: result, removedLines: Math.max(0, countNonBlank(text) - countNonBlank(result)) };
}

/**
 * 1 つのフェンスの内側から表の候補を作る。内側の空行ではブロックを分けない（1 フェンス = 1 候補）。
 * strict のときは、CSV / TSV を「2 列以上の行が 2 行以上」に限る（`f(a, b)` のような関数呼び出し 1 行を表とみなさない）。
 */
function fenceCandidates(lines: readonly string[], strict: boolean): Candidate[] {
  const text = lines.join("\n");
  const nonBlank = lines.filter((line) => !isBlank(line));
  if (nonBlank.length === 0) return [];
  if (looksLikeJson(text)) return [{ lines: [...lines], format: "json" }];
  if (looksLikeHtml(text)) return [{ lines: [...lines], format: "html" }];
  const structural = STRUCTURAL.flatMap((format) => {
    const trimmed = trimNonTableLines(format, nonBlank);
    if (trimmed.length === 0) return [];
    return detectFormat(trimmed.join("\n")).format === format ? [{ lines: trimmed, format }] : [];
  });
  const whole = detectFormat(text).format;
  if (!whole || !DELIMITED.includes(whole)) return structural;
  const wideRows = PARSERS[whole](text).rows.filter((row) => row.length >= 2).length;
  return strict && wideRows < 2 ? structural : [...structural, { lines: [...lines], format: whole }];
}

/**
 * コードフェンスがある入力の表部分を選ぶ。
 * 1. いずれかのフェンスの内側に表があれば、その内側だけを使う（外側の文章は表の行にしない）
 * 2. 内側に表が無ければ、フェンス行とフェンスの中身を除いた外側から従来どおり抽出する
 * 3. 外側にも無ければ、緩い判定で内側を使う
 */
function tableFromFences(fences: Fences): Found {
  const strict = pickBest(fences.inside.flatMap((lines) => fenceCandidates(lines, true)));
  if (strict) return { text: strict.lines.join("\n"), found: true };
  const outside = findTable(fences.outside.join("\n"));
  if (outside.found) return outside;
  const loose = pickBest(fences.inside.flatMap((lines) => fenceCandidates(lines, false)));
  return loose ? { text: loose.lines.join("\n"), found: true } : { text: "", found: false };
}

/**
 * 変換前の前処理（Q9）。BOM 除去と改行の統一は常に行い、
 * その後 ANSI → コードフェンス → 表部分の抽出 → 共通インデントの順に、有効なものを適用する。
 * コードフェンスがあり表部分の抽出も有効なときは、tableFromFences で表を選ぶ。
 */
export function preprocess(text: string, options: PreprocessOptions): Preprocessed {
  let out = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  let removedLines = 0;
  if (options.ansi) out = stripAnsi(out);
  const fences = options.fence && options.extract ? splitFences(out) : null;
  if (options.fence) out = stripCodeFence(out);
  const fenced = fences ? tableFromFences(fences) : null;
  if (fenced?.found) {
    removedLines = Math.max(0, countNonBlank(out) - countNonBlank(fenced.text));
    out = fenced.text;
  } else if (options.extract) {
    const extracted = extractTable(out);
    out = extracted.text;
    removedLines = extracted.removedLines;
  }
  if (options.indent) out = removeCommonIndent(out);
  return { text: out, removedLines };
}
