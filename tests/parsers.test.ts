import { describe, expect, it } from "vitest";
import { parseCsv, parseDelimitedRows, parseTsv, detectCsvDelimiter } from "../src/lib/parsers/delimited";
import { parseHtml } from "../src/lib/parsers/html";
import { parseJson } from "../src/lib/parsers/json";
import { parseMarkdown, splitPipeRow } from "../src/lib/parsers/markdown";
import { parseAscii, parseBox } from "../src/lib/parsers/ruled";
import { normalize } from "../src/lib/normalize";
import { SMALL_INPUTS, SMALL_ROWS } from "./fixtures";

const trimRows = (rows: string[][]) => rows.map((row) => row.map((c) => c.trim()));

describe("Markdown パーサ", () => {
  it("ヘッダー・区切り行・揃え指定を読む", () => {
    const raw = parseMarkdown("| a | b | c |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |");
    expect(trimRows(raw.rows)).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(raw.header).toBe(true);
    expect(raw.inputAligns).toEqual(["left", "center", "right"]);
  });

  it("揃え指定（コロン）が無ければ inputAligns は null", () => {
    expect(parseMarkdown(SMALL_INPUTS.markdown).inputAligns).toBeNull();
  });

  it("区切り行が無ければヘッダーなし", () => {
    const raw = parseMarkdown("| a | b |\n| 1 | 2 |");
    expect(raw.header).toBe(false);
    expect(trimRows(raw.rows)).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("先頭・末尾のパイプが無い表と \\| のエスケープ、<br> を扱う", () => {
    const raw = parseMarkdown("a | b\n--- | ---\nx \\| y | p<br>q");
    expect(trimRows(raw.rows)).toEqual([["a", "b"], ["x | y", "p\nq"]]);
  });

  it("インライン記法はそのまま保持する（Q18）", () => {
    const raw = parseMarkdown("| a |\n| --- |\n| **太字** [L](https://e.com) `c` |");
    expect(raw.rows[1][0].trim()).toBe("**太字** [L](https://e.com) `c`");
  });

  it("splitPipeRow は空セルを保持する", () => {
    expect(splitPipeRow("| a |  | c |")).toEqual([" a ", "  ", " c "]);
  });
});

describe("TSV / CSV パーサ", () => {
  it("TSV の基本形", () => {
    expect(parseTsv(SMALL_INPUTS.tsv).rows).toEqual(SMALL_ROWS);
  });

  it("TSV で引用符内のタブ・改行を 1 セルとして扱う（Q17）", () => {
    expect(parseTsv('a\t"b\tc"\n"x\ny"\t"say ""hi"""').rows).toEqual([
      ["a", "b\tc"],
      ["x\ny", 'say "hi"'],
    ]);
  });

  it("TSV の行頭タブは空セル", () => {
    expect(parseTsv("\ta\n1\t2").rows).toEqual([["", "a"], ["1", "2"]]);
  });

  it("CSV の引用符・二重引用符・セル内改行", () => {
    expect(parseCsv('a,"b,c"\n"line1\nline2","q""q"').rows).toEqual([
      ["a", "b,c"],
      ["line1\nline2", 'q"q'],
    ]);
  });

  it("CSV の区切り文字を自動判定する", () => {
    expect(detectCsvDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectCsvDelimiter("a,b\n1,2")).toBe(",");
    expect(parseCsv("a;b\n1;2").rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("閉じ引用符が無い場合も例外にならない", () => {
    expect(parseDelimitedRows('"abc,d\n1,2', ",")).toEqual([['"abc', "d"], ["1", "2"]]);
  });

  it("CRLF を扱い、空行は除く", () => {
    expect(parseCsv("a,b\r\n\r\n1,2\r\n").rows).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("罫線表パーサ", () => {
  it("罫線文字の表（ヘッダー下のみ罫線）", () => {
    const raw = parseBox(SMALL_INPUTS.box);
    expect(trimRows(raw.rows)).toEqual(SMALL_ROWS);
    expect(raw.header).toBe(true);
  });

  it("ASCII 罫線の表", () => {
    const raw = parseAscii(SMALL_INPUTS.ascii);
    expect(trimRows(raw.rows)).toEqual(SMALL_ROWS);
    expect(raw.header).toBe(true);
  });

  it("太線・二重線・角丸も読める", () => {
    const heavy = "┏━━━┳━━━┓\n┃ a ┃ b ┃\n┣━━━╋━━━┫\n┃ 1 ┃ 2 ┃\n┗━━━┻━━━┛";
    const double = "╔═══╦═══╗\n║ a ║ b ║\n╠═══╬═══╣\n║ 1 ║ 2 ║\n╚═══╩═══╝";
    const rounded = "╭───┬───╮\n│ a │ b │\n├───┼───┤\n│ 1 │ 2 │\n╰───┴───╯";
    for (const text of [heavy, double, rounded]) {
      expect(trimRows(parseBox(text).rows)).toEqual([["a", "b"], ["1", "2"]]);
    }
  });

  it("行間罫線がある表は、罫線で区切られた範囲の折り返しを改行で 1 セルに結合する（Q19 A）", () => {
    const text = [
      "┌──────┬────────────┐",
      "│ 項目 │ 説明       │",
      "├──────┼────────────┤",
      "│ A    │ 長い説明文が │",
      "│      │ 折り返された │",
      "├──────┼────────────┤",
      "│ B    │ 短い       │",
      "└──────┴────────────┘",
    ].join("\n");
    expect(parseBox(text).rows).toEqual([
      ["項目", "説明"],
      ["A", "長い説明文が\n折り返された"],
      ["B", "短い"],
    ]);
  });

  it("ヘッダー下にだけ罫線がある表は 1 物理行 = 1 データ行（Q19 C）", () => {
    const text = "+---+---+\n| a | b |\n+---+---+\n| 1 | 2 |\n|   | 3 |\n+---+---+";
    expect(trimRows(parseAscii(text).rows)).toEqual([["a", "b"], ["1", "2"], ["", "3"]]);
  });

  it("ヘッダー部分の折り返しは 1 つのヘッダーセルに結合する", () => {
    const text = "+------+---+\n| 売上 | b |\n| (円) |   |\n+------+---+\n| 1    | 2 |\n+------+---+";
    expect(trimRows(parseAscii(text).rows)).toEqual([["売上\n(円)", "b"], ["1", "2"]]);
  });

  it("内側の罫線が無い表はヘッダー判定を内容に任せる", () => {
    const raw = parseBox("┌───┬───┐\n│ 1 │ 2 │\n│ 3 │ 4 │\n└───┴───┘");
    expect(raw.header).toBeNull();
    expect(trimRows(raw.rows)).toEqual([["1", "2"], ["3", "4"]]);
  });
});

describe("HTML パーサ", () => {
  it("thead/tbody の基本形", () => {
    const raw = parseHtml(SMALL_INPUTS.html);
    expect(raw.rows).toEqual(SMALL_ROWS);
    expect(raw.header).toBe(true);
  });

  it("colspan / rowspan は先頭セルに値を入れ、残りは空セル（Q20）", () => {
    const raw = parseHtml(
      '<table><tr><th colspan="2">H</th><th>X</th></tr><tr><td rowspan="2">r</td><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>',
    );
    expect(raw.rows).toEqual([
      ["H", "", "X"],
      ["r", "1", "2"],
      ["", "3", "4"],
    ]);
  });

  it("<br> とブロック要素をセル内改行にし、余分な空白を詰める", () => {
    const raw = parseHtml("<table><tr><td>a<br>b<p>c</p>  d\n e</td></tr></table>");
    expect(raw.rows[0][0]).toBe("a\nb\nc\nd e");
  });

  it("th が無い 1 行目は内容からヘッダーを推定する（null）", () => {
    expect(parseHtml("<table><tr><td>a</td></tr><tr><td>1</td></tr></table>").header).toBeNull();
  });

  it("align / text-align を揃え指定として読む", () => {
    const raw = parseHtml('<table><tr><td>a</td><td style="text-align: right">1</td></tr></table>');
    expect(raw.inputAligns).toEqual(["none", "right"]);
  });

  it("table が無ければ例外", () => {
    expect(() => parseHtml("<p>x</p>")).toThrow();
  });
});

describe("JSON パーサ", () => {
  it("オブジェクト配列（キーの和集合をヘッダーにする）", () => {
    const raw = parseJson('[{"a":1,"b":"x"},{"a":2,"c":null,"b":true}]');
    expect(raw.rows).toEqual([
      ["a", "b", "c"],
      ["1", "x", ""],
      ["2", "true", ""],
    ]);
    expect(raw.header).toBe(true);
  });

  it("2 次元配列", () => {
    const raw = parseJson('[["a","b"],[1,{"k":2}]]');
    expect(raw.rows).toEqual([["a", "b"], ["1", '{"k":2}']]);
    expect(raw.header).toBeNull();
  });

  it("配列でない JSON・空配列は例外", () => {
    expect(() => parseJson('{"a":1}')).toThrow();
    expect(() => parseJson("[]")).toThrow();
  });
});

describe("正規化", () => {
  it("列数不揃いを空セルで補い、警告を出す（Q10）", () => {
    const n = normalize({ rows: [["a", "b", "c"], ["1"], ["2", "3"]], header: null, inputAligns: null }, false);
    expect(n.table.rows).toEqual([["a", "b", "c"], ["1", "", ""], ["2", "3", ""]]);
    expect(n.warnings).toHaveLength(1);
    expect(n.warnings[0]).toContain("2 行目");
    expect(n.warnings[0]).toContain("3 行目");
  });

  it("前後の半角・全角空白を除き、内部の連続空白は保持する（Q32）", () => {
    const n = normalize({ rows: [["　 a  b 　"]], header: false, inputAligns: null }, false);
    expect(n.table.rows[0][0]).toBe("a  b");
  });
});
