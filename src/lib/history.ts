/** プレビュー上の編集を戻すための履歴の上限（これより古い手は捨てる） */
export const HISTORY_LIMIT = 50;

/** 履歴の末尾に 1 手追加する。上限を超えた分は古い方から捨てる */
export function pushHistory<T>(past: readonly T[], item: T, limit: number = HISTORY_LIMIT): T[] {
  const next = [...past, item];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** 履歴の末尾の 1 手を取り出す。空なら item は undefined */
export function popHistory<T>(past: readonly T[]): { past: T[]; item: T | undefined } {
  if (past.length === 0) return { past: [], item: undefined };
  return { past: past.slice(0, -1), item: past[past.length - 1] };
}
