// Unicode の EastAsianWidth.txt から src/lib/eaw-data.ts を生成する。
// 使い方: node scripts/gen-eaw.mjs <EastAsianWidth.txt のパス>
// 取得元: https://www.unicode.org/Public/UCD/latest/ucd/EastAsianWidth.txt
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  process.stderr.write("usage: node scripts/gen-eaw.mjs <EastAsianWidth.txt>\n");
  process.exit(1);
}

const text = readFileSync(src, "utf8");
const version = (text.match(/^# (EastAsianWidth-[\d.]+\.txt)/m) ?? [])[1] ?? "unknown";
const wide = [];
const ambiguous = [];

for (const line of text.split("\n")) {
  const m = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(\w+)/);
  if (!m) continue;
  const start = parseInt(m[1], 16);
  const end = m[2] ? parseInt(m[2], 16) : start;
  if (m[3] === "W" || m[3] === "F") wide.push([start, end]);
  if (m[3] === "A") ambiguous.push([start, end]);
}

function merge(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], r[1]);
      continue;
    }
    out.push([...r]);
  }
  return out;
}

function flat(ranges) {
  return merge(ranges)
    .map(([s, e]) => `0x${s.toString(16)},0x${e.toString(16)}`)
    .join(",");
}

const out = `// 自動生成ファイル（scripts/gen-eaw.mjs）。手で編集しない。
// 出典: Unicode ${version}
// [開始, 終了, 開始, 終了, ...] の昇順フラット配列。

/** East_Asian_Width が W（Wide）または F（Fullwidth）の範囲 */
export const WIDE_RANGES: readonly number[] = [${flat(wide)}];

/** East_Asian_Width が A（Ambiguous）の範囲 */
export const AMBIGUOUS_RANGES: readonly number[] = [${flat(ambiguous)}];
`;

writeFileSync(new URL("../src/lib/eaw-data.ts", import.meta.url), out);
