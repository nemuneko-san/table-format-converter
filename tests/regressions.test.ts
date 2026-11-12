import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";
import { parseInput, type ParseSuccess } from "../src/lib/convert";
import { detectFormat } from "../src/lib/detect";
import { deleteColumn } from "../src/lib/edit";
import { FORMATS, type Format, type Table } from "../src/lib/model";
import { parseHtml } from "../src/lib/parsers/html";
import { parseAscii, parseBox } from "../src/lib/parsers/ruled";
import { DEFAULT_PREPROCESS, preprocess, removeCommonIndent } from "../src/lib/preprocess";
import { inlineMarkdownToHtml, safeHref } from "../src/lib/serializers/html";
import { serialize } from "../src/lib/serializers/index";
import { toMarkdown } from "../src/lib/serializers/markdown";
import { toBox } from "../src/lib/serializers/ruled";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { stringWidth } from "../src/lib/width";
import { SAMPLE_BOX } from "./fixtures";

function ok(text: string, format: Format | "auto" = "auto", pre = DEFAULT_PREPROCESS): ParseSuccess {
  const r = parseInput(text, format, pre);
  if (!r.ok) throw new Error(`${r.reason}: ${r.message}`);
  return r;
}

function table(rows: string[][], header = true): Table {
  return { rows, header, inputAligns: null, inlineMarkdown: false };
}

describe("A1 列数不揃いの行を消さない（Q10）", () => {
  it("1 行目だけ列が多い CSV: ヘッダーを残し、空セルで補って警告する", () => {
    const r = ok("a,b,c,d\n1,2,3\n4,5,6");
    expect(r.format).toBe("csv");
    expect(r.table.rows).toEqual([
      ["a", "b", "c", "d"],
      ["1", "2", "3", ""],
      ["4", "5", "6", ""],
    ]);
    expect(r.table.header).toBe(true);
    expect(r.warnings.join()).toContain("2 行目、3 行目");
  });

  it("後ろの行ほど短い CSV", () => {
    const r = ok("a,b,c\n1,2\n3");
    expect(r.table.rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", ""],
      ["3", "", ""],
    ]);
    expect(r.warnings).toHaveLength(1);
  });

  it("最後の行だけ列が多い CSV", () => {
    const r = ok("a,b\n1,2\n3,4,5");
    expect(r.table.rows).toEqual([
      ["a", "b", ""],
      ["1", "2", ""],
      ["3", "4", "5"],
    ]);
  });

  it("最後の行が 1 列の TSV", () => {
    const r = ok("a\tb\tc\n1\t2\t3\n4");
    expect(r.format).toBe("tsv");
    expect(r.table.rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "", ""],
    ]);
  });

  it("セミコロン区切りで 2 行目が 1 列", () => {
    expect(ok("a;b\nc").table.rows).toEqual([
      ["a", "b"],
      ["c", ""],
    ]);
  });

  it("表部分の抽出を OFF にしても判定・解析できる", () => {
    const r = ok("a,b,c\n1,2\n3", "auto", { ...DEFAULT_PREPROCESS, extract: false });
    expect(r.format).toBe("csv");
    expect(r.table.rows).toHaveLength(3);
  });

  it("空行で区切られていない行は説明文として削らず、表の一部として残す", () => {
    const r = ok("売上データ\na,b,c\n1,2,3");
    expect(r.table.rows).toEqual([
      ["売上データ", "", ""],
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
    expect(r.warnings.join()).toContain("1 行目");
  });

  it("空行で区切られた説明文は除外し、除外した行数を通知する", () => {
    const r = ok("CSV です\n\na,b\n1,2\n\n以上");
    expect(r.table.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(r.warnings.join()).toContain("2 行");
    expect(r.warnings.join()).toContain("除外しました");
  });

  it("手動で CSV / TSV を選べば、どんな行でも解析できる", () => {
    expect(ok("x\ny,z", "csv").table.rows).toEqual([
      ["x", ""],
      ["y", "z"],
    ]);
    expect(ok("x", "tsv").table.rows).toEqual([["x"]]);
  });
});

describe("A2 半角カナ＋半角濁点・半濁点の幅（Q24）", () => {
  const N = { ambiguousWide: false };

  it("ｶﾞ は 2、ｶﾞｲﾄﾞ は 5、ﾊﾟ は 2", () => {
    expect(stringWidth("ｶﾞ", N)).toBe(2);
    expect(stringWidth("ｶﾞｲﾄﾞ", N)).toBe(5);
    expect(stringWidth("ﾊﾟ", N)).toBe(2);
  });

  it("罫線表と桁揃え Markdown で桁が揃う", () => {
    const t = table([["名前", "n"], ["ｶﾞｲﾄﾞ", "1"]]);
    expect(toBox(t, { ...N, rowSeparators: false, style: "single" }).split("\n")).toEqual([
      "┌───────┬───┐",
      "│ 名前  │ n │",
      "├───────┼───┤",
      "│ ｶﾞｲﾄﾞ │ 1 │",
      "└───────┴───┘",
    ]);
    expect(toMarkdown(t, { ...N, pad: true }).split("\n")).toEqual([
      "| 名前  | n    |",
      "| ----- | ---: |",
      "| ｶﾞｲﾄﾞ |    1 |",
    ]);
  });
});

describe("A3 manifest の description（Q49: 外部通信の記載は README のみ）", () => {
  it("description に「外部通信なし」を含まない", () => {
    expect(manifest.description).not.toContain("外部通信");
  });
});

describe("A4 U+2212 とキーキャップ絵文字の幅（Q23・Q24）", () => {
  it("U+2212 は曖昧幅の切替に従う", () => {
    expect(stringWidth("−", { ambiguousWide: false })).toBe(1);
    expect(stringWidth("−", { ambiguousWide: true })).toBe(2);
  });

  it("キーキャップ絵文字は 2", () => {
    expect(stringWidth("#️⃣", { ambiguousWide: false })).toBe(2);
    expect(stringWidth("1️⃣", { ambiguousWide: false })).toBe(2);
  });

  it("依頼文のサンプルを曖昧幅 2 で出力すると、罫線文字も幅 2 として揃う", () => {
    const r = ok(SAMPLE_BOX);
    expect(serialize(r.table, "box", { ...DEFAULT_SETTINGS, ambiguousWide: true })).toBe(
      [
        "┌────┬────────┬────┬───┐",
        "│ 四半期 │ 売上（百万円） │ 前期比 │ 担当 │",
        "├────┼────────┼────┼───┤",
        "│ Q1     │            120 │     — │ 田中 │",
        "├────┼────────┼────┼───┤",
        "│ Q2     │            135 │ +12.5% │ 佐藤 │",
        "├────┼────────┼────┼───┤",
        "│ Q3     │            128 │ −5.2% │ 鈴木 │",
        "├────┼────────┼────┼───┤",
        "│ Q4     │            152 │ +18.8% │ 高橋 │",
        "└────┴────────┴────┴───┘",
      ].join("\n"),
    );
  });
});

describe("B1 JSON の誤抽出", () => {
  it("Markdown のセル内の [1] で JSON 扱いにしない", () => {
    const r = ok("| a | b |\n|---|---|\n| x | [1] |");
    expect(r.format).toBe("markdown");
    expect(r.table.rows).toEqual([
      ["a", "b"],
      ["x", "[1]"],
    ]);
  });

  it("CSV のセル内の [1,2] で JSON 扱いにしない", () => {
    const r = ok('id,tags\n1,"[1,2]"\n2,x');
    expect(r.format).toBe("csv");
    expect(r.table.rows).toEqual([
      ["id", "tags"],
      ["1", "[1,2]"],
      ["2", "x"],
    ]);
  });

  it("説明文に挟まれた JSON 配列は取り出す", () => {
    const r = ok('結果:\n[\n  {"a": 1}\n]\n以上');
    expect(r.format).toBe("json");
    expect(r.table.rows).toEqual([["a"], ["1"]]);
  });
});

describe("B2 <table の部分一致で HTML 扱いにしない", () => {
  it("Markdown のセルに `<table>` がある", () => {
    const r = ok("| a | b |\n|---|---|\n| `<table>` | x |");
    expect(r.format).toBe("markdown");
    expect(r.table.rows[1]).toEqual(["`<table>`", "x"]);
  });

  it("CSV のセルにタグ名がある", () => {
    const r = ok("tag,desc\n<table>,表\n<tr>,行");
    expect(r.format).toBe("csv");
    expect(r.table.rows).toEqual([
      ["tag", "desc"],
      ["<table>", "表"],
      ["<tr>", "行"],
    ]);
  });

  it("HTML として解析した結果が 0 列なら失敗にする", () => {
    const r = parseInput("<table></table>", "html", DEFAULT_PREPROCESS);
    expect(r.ok).toBe(false);
    expect(detectFormat("<table></table>").format).toBeNull();
  });
});

describe("B4 href のサニタイズ", () => {
  it("制御文字・空白を挟んだ javascript: を通さない", () => {
    expect(inlineMarkdownToHtml("[a](\u0001javascript:alert(1))")).not.toContain("<a");
    expect(safeHref("\u0000java\u0009script:alert(1)")).toBeNull();
    expect(safeHref(" JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("/\\evil.example")).toBeNull();
  });

  it("許可リストの URL は通す", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
    expect(safeHref("#top")).toBe("#top");
    expect(safeHref("docs/a.html")).toBe("docs/a.html");
  });
});

describe("B5 巨大な入力でも例外にしない", () => {
  it("共通インデント除去は 20 万行でも RangeError にならない", () => {
    const text = "  a\n".repeat(200000);
    expect(() => removeCommonIndent(text)).not.toThrow();
    expect(removeCommonIndent("  a\n    b")).toBe("a\n  b");
  });
});

describe("B8 BOM", () => {
  it("先頭の BOM を除く", () => {
    expect(preprocess("﻿a,b\n1,2", DEFAULT_PREPROCESS).text).toBe("a,b\n1,2");
    expect(ok("﻿a,b\n1,2").table.rows[0]).toEqual(["a", "b"]);
  });
});

describe("B9 行間罫線のある罫線表のヘッダー判定", () => {
  it("数値だけの全行罫線表はヘッダーなし", () => {
    const text = "┌───┐\n│ 1 │\n├───┤\n│ 2 │\n├───┤\n│ 3 │\n└───┘";
    expect(parseBox(text).header).toBeNull();
    expect(ok(text).table.header).toBe(false);
  });

  it("ヘッダー下だけ線種が違えば構造からヘッダーあり", () => {
    const text = "╒═══╕\n│ 1 │\n╞═══╡\n│ 2 │\n├───┤\n│ 3 │\n╘═══╛";
    expect(parseBox(text).header).toBe(true);
    const ascii = "+---+\n| 1 |\n+===+\n| 2 |\n+---+\n| 3 |\n+---+";
    expect(parseAscii(ascii).header).toBe(true);
  });

  it("依頼文のサンプルは引き続きヘッダーあり", () => {
    expect(ok(SAMPLE_BOX).table.header).toBe(true);
  });
});

describe("B10 JSON の構造エラー", () => {
  it("表の構造でない JSON は JSON としてのエラー理由を出す", () => {
    const r = parseInput('[1,{"a":1}]', "auto", DEFAULT_PREPROCESS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("error");
    expect(r.message).toContain("混在");
    const obj = parseInput('{"a":1}', "auto", DEFAULT_PREPROCESS);
    expect(!obj.ok && obj.message).toContain("配列");
  });
});

describe("B11 罫線表のセル内の縦線", () => {
  it("罫線の交点位置で列を切る（セル内の │ を区切りにしない）", () => {
    const text = "┌─────┬───┐\n│ x│y │ z │\n└─────┴───┘";
    expect(ok(text).table.rows).toEqual([["x│y", "z"]]);
  });

  it("ASCII 罫線表のセル内の |", () => {
    const text = "+-----+---+\n| a|b | c |\n+-----+---+";
    expect(ok(text).table.rows).toEqual([["a|b", "c"]]);
  });

  it("全角でずれた罫線表は縦線の文字で分割する", () => {
    const text = "┌────┬────┐\n│ 名前 │ 数 │\n├────┼────┤\n│ 林檎 │ 3 │\n└────┴────┘";
    expect(ok(text).table.rows).toEqual([
      ["名前", "数"],
      ["林檎", "3"],
    ]);
  });
});

describe("B12 性能", () => {
  const csv = Array.from({ length: 2000 }, (_, r) =>
    Array.from({ length: 20 }, (_, c) => (r === 0 ? `列${c}` : c % 3 === 0 ? `${r * c}` : `セル${r}-${c}abc`)).join(","),
  ).join("\n");

  it("2,000×20 の CSV を罫線表・桁揃え Markdown に変換できる（時間の上限は環境差を見込んで緩め）", () => {
    const start = performance.now();
    const r = ok(csv);
    const box = serialize(r.table, "box", DEFAULT_SETTINGS);
    const md = serialize(r.table, "markdown", { ...DEFAULT_SETTINGS, markdownPad: true });
    expect(box.split("\n")).toHaveLength(2000 * 2 + 1);
    expect(md.split("\n")).toHaveLength(2001);
    expect(performance.now() - start).toBeLessThan(5000);
  });

  it("ASCII だけの文字列は length と同じ幅", () => {
    expect(stringWidth("abc 123", { ambiguousWide: false })).toBe(7);
  });
});

describe("B13 軽微な修正", () => {
  it("(a) リンクの走査が線形で、URL 内の括弧を含められる", () => {
    const start = performance.now();
    inlineMarkdownToHtml("[".repeat(20000));
    inlineMarkdownToHtml("[a](".repeat(5000));
    inlineMarkdownToHtml("**a ".repeat(5000));
    expect(performance.now() - start).toBeLessThan(1000);
    expect(inlineMarkdownToHtml("[W](https://en.example.org/wiki/Foo_(bar))")).toBe(
      '<a href="https://en.example.org/wiki/Foo_(bar)">W</a>',
    );
  });

  it("(b) HTML の script / style / template / noscript の中身をセルに入れず、入れ子の table は空白区切り", () => {
    const raw = parseHtml(
      "<table><tr><td>a<script type='text/plain'>x()</script><style>p{}</style><template>t</template><noscript>n</noscript></td>" +
        "<td><table><tr><td>p</td><td>q</td></tr><tr><td>r</td></tr></table></td></tr></table>",
    );
    expect(raw.rows).toEqual([["a", "p q r"]]);
  });

  it("(c) 内容がダッシュだけのデータ行を罫線とみなさない", () => {
    const text = "┌───┬───┐\n│ a │ b │\n├───┼───┤\n│───│───│\n└───┴───┘";
    expect(ok(text).table.rows).toEqual([
      ["a", "b"],
      ["───", "───"],
    ]);
  });

  it("(f) Markdown 出力でセル内タブを半角スペースにする", () => {
    expect(toMarkdown(table([["h"], ["a\tb"]]), { ambiguousWide: false, pad: false }).split("\n")[2]).toBe("| a b |");
  });

  it("(g) 1 列だけの表では列を削除しない", () => {
    const t = table([["a"], ["1"]]);
    expect(deleteColumn(t, 0)).toBe(t);
  });
});

/** 7×7 網羅用の追加ケース（不揃い・特殊文字・ヘッダーなし） */
const RAGGED_INPUTS: Record<Format, string> = {
  markdown: "| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |",
  tsv: "a\tb\tc\n1\t2",
  csv: "a,b,c\n1,2",
  box: "┌───┬───┬───┐\n│ a │ b │ c │\n├───┼───┼───┤\n│ 1 │ 2 │\n└───┴───┴───┘",
  ascii: "+---+---+---+\n| a | b | c |\n+---+---+---+\n| 1 | 2 |\n+---+---+---+",
  html: "<table><tr><th>a</th><th>b</th><th>c</th></tr><tr><td>1</td><td>2</td></tr></table>",
  json: '[["a","b","c"],["1","2"]]',
};

const HEADERLESS_INPUTS: Record<Format, string> = {
  markdown: "| 1 | 2 |\n| 3 | 4 |",
  tsv: "1\t2\n3\t4",
  csv: "1,2\n3,4",
  box: "┌───┬───┐\n│ 1 │ 2 │\n│ 3 │ 4 │\n└───┴───┘",
  ascii: "+---+---+\n| 1 | 2 |\n| 3 | 4 |\n+---+---+",
  html: "<table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>",
  json: "[[1,2],[3,4]]",
};

const SPECIAL = table([
  ["名前", "メモ"],
  ["a|b", "改行\nあり"],
  ['引用"符', "タブ\tあり"],
]);

describe("7×7 網羅（不揃い・ヘッダーなし・特殊文字）", () => {
  const pairs = FORMATS.flatMap((from) => FORMATS.map((to) => [from, to] as const));

  it.each(pairs)("不揃い %s → %s", (from, to) => {
    const r = ok(RAGGED_INPUTS[from]);
    expect(r.format).toBe(from);
    expect(r.table.rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", ""],
    ]);
    expect(r.warnings.length).toBeGreaterThan(0);
    const back = ok(serialize(r.table, to, DEFAULT_SETTINGS), to);
    expect(back.table.rows).toEqual(r.table.rows);
  });

  it.each(pairs)("ヘッダーなし %s → %s", (from, to) => {
    const r = ok(HEADERLESS_INPUTS[from]);
    expect(r.format).toBe(from);
    expect(r.table.header).toBe(false);
    expect(r.table.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    const out = serialize(r.table, to, DEFAULT_SETTINGS);
    const back = ok(out, to);
    // Markdown は空のヘッダー行を補う（Q29）。JSON のオブジェクト配列は「列1, 列2」をキーにする
    const body = to === "markdown" || to === "json" ? back.table.rows.slice(1) : back.table.rows;
    expect(body).toEqual(r.table.rows);
  });

  it.each(pairs)("特殊文字 %s → %s", (from, to) => {
    const source = serialize(SPECIAL, from, DEFAULT_SETTINGS);
    const r = ok(source, from);
    expect(r.table.rows).toHaveLength(3);
    expect(r.table.rows[0]).toHaveLength(2);
    const back = ok(serialize(r.table, to, DEFAULT_SETTINGS), to);
    expect(back.table.rows).toHaveLength(3);
    expect(back.table.rows[0]).toHaveLength(2);
    expect(back.table.rows[1][0]).toBe("a|b");
  });
});

describe("B6 CSP", () => {
  it("extension_pages の CSP で外部への接続・画像読み込みを禁止する", () => {
    const csp = manifest.content_security_policy.extension_pages;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("img-src 'self' data:");
  });
});

describe("C3 コードフェンスの外の文章", () => {
  it("フェンスの内側だけを表にし、外側の文章は行にしない", () => {
    const r = ok("結果\n```csv\na,b\n1,2\n```\n終わり");
    expect(r.format).toBe("csv");
    expect(r.table.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(r.warnings.join()).toContain("2 行");
  });

  it("フェンスが複数あれば候補選択の優先度（罫線表・Markdown が CSV より先）で選ぶ", () => {
    const text = "```\nx,y\n1,2\n```\n説明\n```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```";
    const r = ok(text);
    expect(r.format).toBe("markdown");
    expect(r.table.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("フェンスなし・空行なしの説明文つき CSV は従来どおり表の行にする", () => {
    expect(ok("結果\na,b\n1,2").table.rows).toHaveLength(3);
  });

  it("閉じていないフェンスは入力の終わりまでを内側とみなす", () => {
    expect(ok("前置き\n```\na\tb\n1\t2").table.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
