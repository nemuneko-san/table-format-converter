import { columnCount, FORMATS, type Format } from "./model";
import { CSV_DELIMITERS, parseDelimitedRows } from "./parsers/delimited";
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

/** 先頭が [ / { で JSON として読める入力か（表の構造でなくても JSON とみなし、解析時にその理由を示す） */
export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("[") && !t.startsWith("{")) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** HTML の表か。先頭がタグで、table の開始・終了タグとセルのタグがそろっているときだけ true */
export function looksLikeHtml(text: string): boolean {
  const t = text.trim();
  return t.startsWith("<") && /<table[\s>]/i.test(t) && /<\/table\s*>/i.test(t) && /<t[dh][\s>]/i.test(t);
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

/**
 * 区切り文字 delimiter で読んだとき表らしいか。半数以上の行が 2 列以上なら true。
 * 列数が行ごとに不揃いでも判定する（不揃いは解析後に空セルで補い警告する。Q10）。
 */
export function looksDelimited(text: string, delimiter: string): boolean {
  const rows = parseDelimitedRows(text.trim(), delimiter).filter((row) => !(row.length === 1 && row[0].trim() === ""));
  const wide = rows.filter((row) => row.length >= 2).length;
  return wide > 0 && wide * 2 >= rows.length;
}

export function looksLikeTsv(text: string): boolean {
  return text.includes("\t") && looksDelimited(text, "\t");
}

export function looksLikeCsv(text: string): boolean {
  return CSV_DELIMITERS.some((d) => text.includes(d) && looksDelimited(text, d));
}

/** 解析できる形式を候補として列挙する（2 列以上になる形式を先に並べる） */
export function parseableFormats(text: string): Format[] {
  const results = FORMATS.flatMap((format) => {
    try {
      const raw = PARSERS[format](text);
      const cols = columnCount(raw.rows);
      return cols > 0 ? [{ format, wide: cols >= 2 }] : [];
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
  if (looksLikeTsv(text)) return { format: "tsv", candidates: [] };
  if (looksLikeCsv(text)) return { format: "csv", candidates: [] };
  return { format: null, candidates: parseableFormats(text) };
}
