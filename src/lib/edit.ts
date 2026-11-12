import type { Table } from "./model";

/** 行列を入れ替える（Q40）。入力由来の揃え指定は意味を失うため破棄して自動検出に戻す */
export function transpose(table: Table): Table {
  const cols = table.rows[0]?.length ?? 0;
  const rows = Array.from({ length: cols }, (_, c) => table.rows.map((row) => row[c] ?? ""));
  return { ...table, rows, inputAligns: null };
}

/** 列を削除する（Q40）。最後の 1 列は削除しない（列の無い表を作らない） */
export function deleteColumn(table: Table, col: number): Table {
  const cols = table.rows[0]?.length ?? 0;
  if (cols <= 1 || col < 0 || col >= cols) return table;
  return {
    ...table,
    rows: table.rows.map((row) => row.filter((_, c) => c !== col)),
    inputAligns: table.inputAligns ? table.inputAligns.filter((_, c) => c !== col) : null,
  };
}

function swap<T>(items: readonly T[], a: number, b: number): T[] {
  const out = [...items];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

/** 列を左（-1）または右（+1）へ 1 つ移動する（Q40 列の並べ替え）。範囲外なら変更しない */
export function moveColumn(table: Table, col: number, delta: -1 | 1): Table {
  const target = col + delta;
  const cols = table.rows[0]?.length ?? 0;
  if (col < 0 || col >= cols || target < 0 || target >= cols) return table;
  return {
    ...table,
    rows: table.rows.map((row) => swap(row, col, target)),
    inputAligns: table.inputAligns ? swap(table.inputAligns, col, target) : null,
  };
}

/** セルの値を書き換える（Q40 プレビュー上の直接編集） */
export function setCell(table: Table, row: number, col: number, value: string): Table {
  if (!table.rows[row] || col < 0 || col >= table.rows[row].length) return table;
  return {
    ...table,
    rows: table.rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? value : cell)) : cells)),
  };
}
