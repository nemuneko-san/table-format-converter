import type { Table } from "../model";
import { flattenNewlines } from "./layout";

export type JsonStructure = "objects" | "arrays";

export const JSON_STRUCTURE_LABELS: Record<JsonStructure, string> = {
  objects: "オブジェクト配列",
  arrays: "2 次元配列",
};

export type JsonOptions = {
  /** Q38: objects = ヘッダーをキーとするオブジェクト配列（既定）、arrays = 2 次元配列 */
  structure: JsonStructure;
  /** Q39: 整数・小数と判定できるセルを number にする（既定 false = 全て文字列） */
  numbers: boolean;
};

/** number に変換してよいセルか（整数・小数のみ。先頭ゼロ・桁区切り・% は文字列のまま） */
export function isPlainNumber(cell: string): boolean {
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cell) && Number.isFinite(Number(cell));
}

function toValue(cell: string, numbers: boolean): string | number {
  const flat = flattenNewlines(cell);
  return numbers && isPlainNumber(flat) ? Number(flat) : flat;
}

/** オブジェクトのキー。空・重複は「列N」・「名前_2」で補う */
export function objectKeys(header: readonly string[]): string[] {
  const used = new Set<string>();
  return header.map((name, index) => {
    const base = flattenNewlines(name) || `列${index + 1}`;
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
    used.add(key);
    return key;
  });
}

/** JSON を出力する。ヘッダーなしの表をオブジェクト配列にするときは「列1, 列2, …」をキーにする */
export function toJson(table: Table, options: JsonOptions): string {
  const cols = table.rows[0]?.length ?? 0;
  const body = table.header ? table.rows.slice(1) : table.rows;
  if (options.structure === "arrays") {
    return JSON.stringify(table.rows.map((row) => row.map((cell) => toValue(cell, options.numbers))), null, 2);
  }
  const keys = objectKeys(table.header && table.rows.length > 0 ? table.rows[0] : Array.from({ length: cols }, () => ""));
  const items = body.map((row) => Object.fromEntries(keys.map((key, c) => [key, toValue(row[c] ?? "", options.numbers)])));
  return JSON.stringify(items, null, 2);
}
