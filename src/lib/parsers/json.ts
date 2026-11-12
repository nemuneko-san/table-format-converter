import type { RawTable } from "../model";

function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fromObjects(items: readonly Record<string, unknown>[]): RawTable {
  const keys: string[] = [];
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  const body = items.map((item) => keys.map((key) => toCell(item[key])));
  return { rows: [keys, ...body], header: true, inputAligns: null };
}

/**
 * JSON を解析する。対応する構造:
 * - オブジェクト配列（キーの和集合を出現順に並べてヘッダーにする）
 * - 2 次元配列
 * - プリミティブの配列（1 列の表）
 */
export function parseJson(text: string): RawTable {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("JSON は配列である必要があります");
  if (data.length === 0) throw new Error("JSON の配列が空です");
  if (data.every(isPlainObject)) return fromObjects(data);
  if (data.every(Array.isArray)) {
    return { rows: data.map((row: unknown[]) => row.map(toCell)), header: null, inputAligns: null };
  }
  if (data.some((item) => isPlainObject(item) || Array.isArray(item))) {
    throw new Error("JSON の配列に、オブジェクト・配列・値が混在しています");
  }
  return { rows: data.map((item) => [toCell(item)]), header: null, inputAligns: null };
}
