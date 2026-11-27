import type { Align, Table } from "./model";

/** 「数値らしい」セルか（Q27 厳密: 整数・小数・符号 + − -・桁区切りカンマ・% のみ） */
export function isNumericLike(cell: string): boolean {
  return /^[+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?%?$/.test(cell) && /\d/.test(cell);
}

/** 数値判定で無視するセル（空・ダッシュ類のみ） */
function isIgnorable(cell: string): boolean {
  return cell === "" || /^[—–―−‐-]+$/.test(cell);
}

/** 列が数値列か（無視対象を除く全セルが数値らしく、1 つ以上ある） */
export function isNumericColumn(cells: readonly string[]): boolean {
  const targets = cells.filter((cell) => !isIgnorable(cell));
  return targets.length > 0 && targets.every(isNumericLike);
}

/** 表の実効的な列揃え。入力の揃え指定を優先し、無ければ数値列を右寄せにする */
export function effectiveAligns(table: Table): Align[] {
  const cols = table.rows[0]?.length ?? 0;
  if (table.inputAligns) {
    return Array.from({ length: cols }, (_, i) => table.inputAligns?.[i] ?? "none");
  }
  const body = table.header ? table.rows.slice(1) : table.rows;
  return Array.from({ length: cols }, (_, i) =>
    isNumericColumn(body.map((row) => row[i] ?? "")) ? "right" : "none",
  );
}
