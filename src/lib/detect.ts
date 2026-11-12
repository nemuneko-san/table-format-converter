import { FORMATS, type Format } from "./model";
import { CSV_DELIMITERS, delimiterScore, parseDelimitedRows } from "./parsers/delimited";
import { PARSERS } from "./parsers/index";
import { isSeparatorLine } from "./parsers/markdown";
import { isAsciiBorderLine, isBoxBorderLine } from "./parsers/ruled";

export type Detection = {
  /** 判定できた形式。どれにも当てはまらなければ null */
  format: Format | null;
  /** 判定できなかったときにユーザーへ提示する候補（解析できた形式） */
  candidates: Format[];
};

const BOX_VERTICAL_START = /^[│┃║╎╏┆┇┊┋]/;

function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("[")) return false;
  try {
    PARSERS.json(t);
    return true;
  } catch {
    return false;
  }
}

export function looksLikeHtml(text: string): boolean {
  return /<table[\s>]/i.test(text);
}

/** 罫線文字の表の行か（横罫線、または縦罫線で始まる行） */
export function isBoxLine(line: string): boolean {
  const t = line.trim();
  return isBoxBorderLine(t) || BOX_VERTICAL_START.test(t);
}

/** ASCII 罫線の表の行か（+---+ の行、または | で始まる行） */
export function isAsciiLine(line: string): boolean {
  const t = line.trim();
  return isAsciiBorderLine(t) || t.startsWith("|");
}

export function looksLikeBox(lines: readonly string[]): boolean {
  return lines.length > 0 && lines.every(isBoxLine) && lines.some((line) => BOX_VERTICAL_START.test(line.trim()));
}

export function looksLikeAscii(lines: readonly string[]): boolean {
  return lines.length > 0 && lines.every(isAsciiLine) && lines.some(isAsciiBorderLine);
}

export function looksLikeMarkdown(lines: readonly string[]): boolean {
  if (lines.length === 0) return false;
  if (lines.length >= 2 && lines[0].includes("|") && isSeparatorLine(lines[1])) return true;
  return lines.every((line) => line.startsWith("|") && line.endsWith("|") && line.length >= 2);
}

export function looksLikeTsv(text: string, lines: readonly string[]): boolean {
  if (!lines.some((line) => line.includes("\t"))) return false;
  return delimiterScore(parseDelimitedRows(text.trim(), "\t")) >= 0.5;
}

export function looksLikeCsv(text: string): boolean {
  return CSV_DELIMITERS.some((d) => delimiterScore(parseDelimitedRows(text.trim(), d)) >= 0.8);
}

/** 解析できる形式を候補として列挙する（2 列以上になる形式を先に並べる） */
export function parseableFormats(text: string): Format[] {
  const results = FORMATS.flatMap((format) => {
    try {
      const raw = PARSERS[format](text);
      return raw.rows.length > 0 ? [{ format, wide: raw.rows.some((row) => row.length >= 2) }] : [];
    } catch {
      return [];
    }
  });
  return [...results.filter((r) => r.wide), ...results.filter((r) => !r.wide)].map((r) => r.format);
}

/** 構造から確実に判定できる形式（罫線・タグ・区切り行など） */
export function detectStrong(text: string): Format | null {
  if (looksLikeJson(text)) return "json";
  if (looksLikeHtml(text)) return "html";
  const lines = nonEmptyLines(text);
  if (looksLikeBox(lines)) return "box";
  if (looksLikeAscii(lines)) return "ascii";
  if (looksLikeMarkdown(lines)) return "markdown";
  return null;
}

/** 入力の形式を自動判定する（Q7）。判定できなければ候補を返す（Q8） */
export function detectFormat(text: string): Detection {
  if (text.trim() === "") return { format: null, candidates: [] };
  const strong = detectStrong(text);
  if (strong) return { format: strong, candidates: [] };
  const lines = nonEmptyLines(text);
  if (looksLikeTsv(text, lines)) return { format: "tsv", candidates: [] };
  if (looksLikeCsv(text)) return { format: "csv", candidates: [] };
  return { format: null, candidates: parseableFormats(text) };
}
