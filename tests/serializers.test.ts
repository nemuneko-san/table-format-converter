import { describe, expect, it } from "vitest";
import type { Table } from "../src/lib/model";
import { toCsv, toTsv } from "../src/lib/serializers/delimited";
import { inlineMarkdownToHtml, toHtml } from "../src/lib/serializers/html";
import { toJson } from "../src/lib/serializers/json";
import { toMarkdown } from "../src/lib/serializers/markdown";
import { toAscii, toBox } from "../src/lib/serializers/ruled";

const W = { ambiguousWide: false };

function table(rows: string[][], header = true, extra: Partial<Table> = {}): Table {
  return { rows, header, inputAligns: null, inlineMarkdown: false, ...extra };
}

describe("Markdown シリアライザ", () => {
  it("整形なし（既定）", () => {
    expect(toMarkdown(table([["a", "b"], ["x", "1"]]), { ...W, pad: false })).toBe("| a | b |\n| --- | ---: |\n| x | 1 |");
  });

  it("ヘッダーなしの表には空のヘッダー行を補う（Q29）", () => {
    expect(toMarkdown(table([["x", "y", "z"]], false), { ...W, pad: false })).toBe("| | | |\n| --- | --- | --- |\n| x | y | z |");
  });

  it("パイプは \\| に、セル内改行は <br> にする（Q30・Q31）", () => {
    expect(toMarkdown(table([["h"], ["a|b\nc"]]), { ...W, pad: false }).split("\n")[2]).toBe("| a\\|b<br>c |");
  });

  it("入力の揃え指定を優先する（Q26）", () => {
    const t = table([["a", "b"], ["1", "x"]], true, { inputAligns: ["center", "left"] });
    expect(toMarkdown(t, { ...W, pad: false }).split("\n")[1]).toBe("| :---: | :--- |");
  });

  it("桁揃えは全角を幅 2 として揃える（Q25）", () => {
    const out = toMarkdown(table([["名前", "n"], ["a", "10"]]), { ...W, pad: true });
    expect(out).toBe("| 名前 | n    |\n| ---- | ---: |\n| a    |   10 |");
  });

  it("空セルは空のまま（Q33）", () => {
    expect(toMarkdown(table([["a", "b"], ["", "x"]]), { ...W, pad: false }).split("\n")[2]).toBe("| | x |");
  });
});

describe("TSV / CSV シリアライザ", () => {
  it("TSV はタブ・改行を半角スペースに置き換え、引用符を使わない（Q34）", () => {
    expect(toTsv(table([["a\tb", "c\nd"]]))).toBe("a b\tc d");
  });

  it("CSV は区切り文字・引用符を含むセルだけ引用符で囲む（Q34）", () => {
    expect(toCsv(table([["a,b", 'q"q', "plain", "x\ny"]]), ",")).toBe('"a,b","q""q",plain,x y');
  });

  it("CSV の区切り文字を切り替えられる（Q35）", () => {
    expect(toCsv(table([["a;b", "c"]]), ";")).toBe('"a;b";c');
    expect(toCsv(table([["a", "b|c"]]), "|")).toBe('a|"b|c"');
  });
});

describe("罫線表シリアライザ", () => {
  const t = table([["名前", "数"], ["りんご", "3"], ["みかん", "10"]]);

  it("全行罫線（既定 Q21 B）", () => {
    expect(toBox(t, { ...W, rowSeparators: true, style: "single" })).toBe(
      [
        "┌────────┬────┐",
        "│ 名前   │ 数 │",
        "├────────┼────┤",
        "│ りんご │  3 │",
        "├────────┼────┤",
        "│ みかん │ 10 │",
        "└────────┴────┘",
      ].join("\n"),
    );
  });

  it("ヘッダー下のみ罫線・線種の切り替え（Q21・Q22）", () => {
    const out = toBox(t, { ...W, rowSeparators: false, style: "double" });
    expect(out.split("\n")).toEqual([
      "╔════════╦════╗",
      "║ 名前   ║ 数 ║",
      "╠════════╬════╣",
      "║ りんご ║  3 ║",
      "║ みかん ║ 10 ║",
      "╚════════╩════╝",
    ]);
    expect(toBox(t, { ...W, rowSeparators: false, style: "heavy" }).split("\n")[0]).toBe("┏━━━━━━━━┳━━━━┓");
    expect(toBox(t, { ...W, rowSeparators: false, style: "rounded" }).split("\n")[0]).toBe("╭────────┬────╮");
  });

  it("曖昧幅 2 では罫線文字も幅 2 として桁を揃える（Q23）", () => {
    const out = toBox(table([["—", "a"]], false), { ambiguousWide: true, rowSeparators: true, style: "single" });
    // 列 1: 内容 2 + 余白 2 = 4 → 罫線 2 文字、列 2: 内容 1 + 余白 2 = 3 → 4 に切り上げ → 罫線 2 文字
    expect(out.split("\n")).toEqual(["┌──┬──┐", "│ — │ a  │", "└──┴──┘"]);
  });

  it("ヘッダーなしで行間罫線なしなら内側の罫線は無い", () => {
    expect(toAscii(table([["a"], ["b"]], false), { ...W, rowSeparators: false })).toBe("+---+\n| a |\n| b |\n+---+");
  });

  it("ASCII 罫線の表", () => {
    expect(toAscii(t, { ...W, rowSeparators: false })).toBe(
      ["+--------+----+", "| 名前   | 数 |", "+--------+----+", "| りんご |  3 |", "| みかん | 10 |", "+--------+----+"].join("\n"),
    );
  });

  it("セル内改行は半角スペースにする（Q30）", () => {
    expect(toAscii(table([["a\nb"]], false), { ...W, rowSeparators: false })).toBe("+-----+\n| a b |\n+-----+");
  });
});

describe("HTML シリアライザ", () => {
  it("枠線スタイルあり（既定 Q37 B）", () => {
    const out = toHtml(table([["a", "n"], ["x<y", "1"]]), { style: "bordered" });
    expect(out).toContain('<table style="border-collapse:collapse">');
    expect(out).toContain('<th style="border:1px solid #999;padding:4px 8px">a</th>');
    expect(out).toContain('<td style="border:1px solid #999;padding:4px 8px;text-align:right">1</td>');
    expect(out).toContain("x&lt;y");
  });

  it("スタイルなし（Q37 A）・セル内改行は <br>", () => {
    expect(toHtml(table([["a\nb"]], false), { style: "plain" })).toBe(
      "<table>\n  <tbody>\n    <tr><td>a<br>b</td></tr>\n  </tbody>\n</table>",
    );
  });

  it("入力が Markdown のときだけインライン記法を HTML タグにする（Q18）", () => {
    const md = table([["h"], ["**b** *i* `x|y` [L](https://e.com)"]], true, { inlineMarkdown: true });
    expect(toHtml(md, { style: "plain" })).toContain(
      '<td><strong>b</strong> <em>i</em> <code>x|y</code> <a href="https://e.com">L</a></td>',
    );
    const plain = table([["h"], ["**b**"]]);
    expect(toHtml(plain, { style: "plain" })).toContain("<td>**b**</td>");
  });

  it("javascript: のリンクは変換しない", () => {
    expect(inlineMarkdownToHtml("[x](javascript:alert(1))")).not.toContain("<a");
  });
});

describe("JSON シリアライザ", () => {
  const t = table([["名前", "数"], ["a", "10"], ["b", "+1.5%"]]);

  it("オブジェクト配列・文字列（既定 Q38・Q39）", () => {
    expect(JSON.parse(toJson(t, { structure: "objects", numbers: false }))).toEqual([
      { 名前: "a", 数: "10" },
      { 名前: "b", 数: "+1.5%" },
    ]);
  });

  it("2 次元配列・数値変換", () => {
    expect(JSON.parse(toJson(t, { structure: "arrays", numbers: true }))).toEqual([
      ["名前", "数"],
      ["a", 10],
      ["b", "+1.5%"],
    ]);
  });

  it("ヘッダーなしは 列1, 列2 をキーにし、重複キーは _2 を付ける", () => {
    expect(JSON.parse(toJson(table([["x", "y"]], false), { structure: "objects", numbers: false }))).toEqual([
      { 列1: "x", 列2: "y" },
    ]);
    expect(JSON.parse(toJson(table([["k", "k"], ["1", "2"]]), { structure: "objects", numbers: false }))).toEqual([
      { k: "1", k_2: "2" },
    ]);
  });

  it("先頭ゼロの数字は文字列のまま", () => {
    expect(JSON.parse(toJson(table([["v"], ["007"]]), { structure: "arrays", numbers: true }))[1]).toEqual(["007"]);
  });
});
