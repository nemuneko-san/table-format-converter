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

function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^(https?:|mailto:|#|\/|\.{0,2}\/)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  return null;
}

/**
 * Markdown のインライン記法（**太字** / *斜体* / `code` / [リンク](url)）を HTML タグにする（Q18）。
 * 入力はエスケープ前の文字列。code の中身は他の記法として解釈しない。
 */
export function inlineMarkdownToHtml(text: string): string {
  const parts = text.split(/(`[^`]+`)/);
  return parts
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      return convertEmphasisAndLinks(escapeHtml(part));
    })
    .join("");
}

function convertEmphasisAndLinks(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole: string, label: string, url: string) => {
      const href = safeHref(url);
      return href === null ? whole : `<a href="${href}">${label}</a>`;
    })
    .replace(/\*\*(?=\S)(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?=\S)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
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
