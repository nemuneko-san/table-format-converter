import { effectiveAligns } from "../align";
import type { Align, Table } from "../model";

export type HtmlStyle = "bordered" | "plain";

export const HTML_STYLE_LABELS: Record<HtmlStyle, string> = {
  bordered: "枠線と余白あり（inline style）",
  plain: "スタイルなし",
};

export type HtmlOptions = {
  /** Q37: bordered = 枠線と最小限の余白を inline style で付ける（既定）、plain = 素の table */
  style: HtmlStyle;
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * リンク先として出力してよい URL を返す（許可リスト方式）。
 * 判定前に C0/C1 制御文字と空白を除く（ブラウザは href からそれらを除いてから解釈するため）。
 * 許可: http: / https: / mailto: / # で始まる / スキームの無い相対パス（// や \ を含むものは除く）
 */
export function safeHref(url: string): string | null {
  const cleaned = url.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (cleaned === "") return null;
  if (/^(https?|mailto):/i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("#")) return cleaned;
  if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned) || cleaned.startsWith("//") || cleaned.includes("\\")) return null;
  return cleaned;
}

const MAX_URL_LENGTH = 2048;

/** start から URL を走査し、対応の取れた閉じ括弧の位置を返す（空白・上限超過なら -1）。走査した文字数も返す */
function scanUrlEnd(text: string, start: number, budget: number): { end: number; scanned: number } {
  let depth = 0;
  const limit = Math.min(text.length, start + MAX_URL_LENGTH, start + budget);
  for (let j = start; j < limit; j++) {
    const ch = text[j];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f") return { end: -1, scanned: j - start + 1 };
    if (ch === "(") depth++;
    if (ch !== ")") continue;
    if (depth === 0) return { end: j, scanned: j - start + 1 };
    depth--;
  }
  return { end: -1, scanned: limit - start };
}

type Inline = { kind: "text"; value: string } | { kind: "link"; label: string; href: string };

/**
 * [ラベル](URL) を 1 回の走査で切り出す。URL 内の対応の取れた括弧（Foo_(bar)）を含められる。
 * URL の走査量の合計を入力長の数倍に制限し、閉じ括弧の無い候補が並ぶ入力でも線形時間で終える。
 */
export function tokenizeLinks(text: string): Inline[] {
  const out: Inline[] = [];
  let budget = text.length * 4 + MAX_URL_LENGTH;
  let last = 0;
  let open = -1;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "[") open = i;
    if (ch === "]" && open >= 0 && text[i + 1] === "(" && budget > 0) {
      const scan = scanUrlEnd(text, i + 2, budget);
      budget -= scan.scanned;
      const href = scan.end === -1 ? null : safeHref(text.slice(i + 2, scan.end));
      if (href !== null && i > open + 1) {
        if (open > last) out.push({ kind: "text", value: text.slice(last, open) });
        out.push({ kind: "link", label: text.slice(open + 1, i), href });
        last = scan.end + 1;
        i = scan.end + 1;
        open = -1;
        continue;
      }
      open = -1;
    }
    i++;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

/** **太字** と *斜体*（中に * を含まない範囲に限定し、走査が線形で済むようにする） */
function emphasis(escaped: string): string {
  return escaped
    .replace(/\*\*(?=[^\s*])([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?=[^\s*])([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
}

/**
 * Markdown のインライン記法（**太字** / *斜体* / `code` / [リンク](url)）を HTML タグにする（Q18）。
 * 入力はエスケープ前の文字列。code の中身は他の記法として解釈しない。
 */
export function inlineMarkdownToHtml(text: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      return tokenizeLinks(part)
        .map((t) =>
          t.kind === "text"
            ? emphasis(escapeHtml(t.value))
            : `<a href="${escapeHtml(t.href)}">${emphasis(escapeHtml(t.label))}</a>`,
        )
        .join("");
    })
    .join("");
}

const CELL_STYLE = "border:1px solid #999;padding:4px 8px";

function cellAttrs(align: Align, options: HtmlOptions): string {
  if (options.style === "plain") return "";
  const alignStyle = align === "right" || align === "center" ? `;text-align:${align}` : "";
  return ` style="${CELL_STYLE}${alignStyle}"`;
}

function renderCell(cell: string, inlineMarkdown: boolean): string {
  const html = inlineMarkdown ? inlineMarkdownToHtml(cell) : escapeHtml(cell);
  return html.replace(/\n/g, "<br>");
}

/** HTML の table を出力する。セル内改行は <br>（Q30） */
export function toHtml(table: Table, options: HtmlOptions): string {
  const aligns = effectiveAligns(table);
  const row = (cells: readonly string[], tag: "th" | "td"): string =>
    `    <tr>${cells
      .map((cell, c) => `<${tag}${cellAttrs(aligns[c], options)}>${renderCell(cell, table.inlineMarkdown)}</${tag}>`)
      .join("")}</tr>`;
  const tableAttr = options.style === "plain" ? "" : ' style="border-collapse:collapse"';
  const lines = [`<table${tableAttr}>`];
  if (table.header && table.rows.length > 0) lines.push("  <thead>", row(table.rows[0], "th"), "  </thead>");
  const body = table.header ? table.rows.slice(1) : table.rows;
  if (body.length > 0) lines.push("  <tbody>", ...body.map((cells) => row(cells, "td")), "  </tbody>");
  lines.push("</table>");
  return lines.join("\n");
}
