import { vi } from "vitest";

type Store = Record<string, unknown>;
type ChangeListener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => void;

function area(name: string, data: Store, listeners: ChangeListener[]) {
  return {
    get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
    set: vi.fn(async (items: Store) => {
      const changes = Object.fromEntries(
        Object.entries(items).map(([k, v]) => [k, { oldValue: data[k], newValue: v }]),
      );
      Object.assign(data, items);
      listeners.forEach((listener) => listener(changes, name));
    }),
  };
}

/** chrome.* の最小モックを globalThis に設置する */
export function installChromeMock(initial: { sync?: Store; local?: Store } = {}) {
  const listeners: ChangeListener[] = [];
  const sync = { ...(initial.sync ?? {}) };
  const local = { ...(initial.local ?? {}) };
  const chromeMock = {
    storage: {
      sync: area("sync", sync, listeners),
      local: area("local", local, listeners),
      onChanged: { addListener: vi.fn((listener: ChangeListener) => listeners.push(listener)) },
    },
    runtime: { openOptionsPage: vi.fn(async () => undefined) },
  };
  vi.stubGlobal("chrome", chromeMock);
  return { chrome: chromeMock, sync, local };
}

/** ページの HTML（body 部分）を happy-dom の document に読み込む */
export function loadPageBody(html: string): void {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? "";
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, "");
}
