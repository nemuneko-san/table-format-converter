import { describe, expect, it } from "vitest";
import { effectiveAligns, isNumericColumn, isNumericLike } from "../src/lib/align";
import { parseInput } from "../src/lib/convert";
import { detectFormat } from "../src/lib/detect";
import { deleteColumn, moveColumn, setCell, transpose } from "../src/lib/edit";
import { FORMATS, type Table } from "../src/lib/model";
import { guessHeader } from "../src/lib/normalize";
import {
  DEFAULT_PREPROCESS,
  extractTable,
  preprocess,
  removeCommonIndent,
  stripAnsi,
  stripCodeFence,
} from "../src/lib/preprocess";
import { serialize } from "../src/lib/serializers/index";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/lib/settings";
import { stringWidth } from "../src/lib/width";
import { SAMPLE_BOX, SMALL_INPUTS, SMALL_ROWS } from "./fixtures";

const N = { ambiguousWide: false };
const A2 = { ambiguousWide: true };

describe("形式の自動判定", () => {
  it.each(FORMATS.map((f) => [f]))("%s を判定する", (format) => {
    expect(detectFormat(SMALL_INPUTS[format]).format).toBe(format);
  });

  it("依頼文のサンプルは罫線文字の表", () => {
    expect(detectFormat(SAMPLE_BOX).format).toBe("box");
  });

  it("ヘッダー区切りの無い Markdown（全行が | で始まり | で終わる）", () => {
    expect(detectFormat("| a | b |\n| 1 | 2 |").format).toBe("markdown");
  });

  it("セミコロン区切りの CSV", () => {
    expect(detectFormat("a;b;c\n1;2;3").format).toBe("csv");
  });

  it("どれにも当たらない入力は null と候補を返す（Q8）", () => {
    const d = detectFormat("hello world");
    expect(d.format).toBeNull();
    expect(d.candidates.length).toBeGreaterThan(0);
    expect(d.candidates).not.toContain("json");
    expect(d.candidates).not.toContain("html");
  });

  it("空入力は null で候補なし", () => {
    expect(detectFormat("  \n ")).toEqual({ format: null, candidates: [] });
  });
});

describe("前処理（Q9）", () => {
  it("ANSI エスケープを除去する", () => {
    expect(stripAnsi("\u001b[31ma\u001b[0m\tb\u001b]0;title\u0007")).toBe("a\tb");
  });

  it("コードフェンス行を除去する", () => {
    expect(stripCodeFence("```text\n| a |\n```")).toBe("| a |");
    expect(stripCodeFence("~~~\nx\n~~~")).toBe("x");
  });

  it("全行共通の先頭インデント（半角空白）を除去し、タブは残す", () => {
    expect(removeCommonIndent("    | a |\n      | b |\n\n    | c |")).toBe("| a |\n  | b |\n\n| c |");
    expect(removeCommonIndent("\ta\tb")).toBe("\ta\tb");
  });

  it("表の前後の説明文・空行を除いて表部分を抽出する", () => {
    const text = "以下が結果です。\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n以上、よろしくお願いします。";
    expect(extractTable(text)).toBe("| a | b |\n| --- | --- |\n| 1 | 2 |");
  });

  it("空行を挟まない直前の説明文も切り落とす", () => {
    expect(extractTable("表です:\n" + SMALL_INPUTS.box + "\n注: 単位は個")).toBe(SMALL_INPUTS.box);
  });

  it("HTML の前後のテキストを除く", () => {
    expect(extractTable("<p>x</p><table><tr><td>1</td></tr></table><p>y</p>")).toBe(
      "<table><tr><td>1</td></tr></table>",
    );
  });

  it("CSV の前後の説明文を除く", () => {
    expect(extractTable("売上データ\na,b,c\n1,2,3\n4,5,6\n出典: 社内")).toBe("a,b,c\n1,2,3\n4,5,6");
  });

  it("引用符内に空行がある CSV は壊さない", () => {
    const csv = 'a,b\n"x\n\ny",2';
    expect(extractTable(csv)).toBe(csv);
  });

  it("全部まとめて: ANSI 色・コードフェンス・インデント・説明文を含む入力から表を取り出す", () => {
    const text = "結果:\n```\n  \u001b[1m| a | b |\u001b[0m\n  | --- | --- |\n  | 1 | 2 |\n```\n";
    expect(preprocess(text, DEFAULT_PREPROCESS)).toBe("| a | b |\n| --- | --- |\n| 1 | 2 |");
  });

  it("前処理を個別に無効化できる", () => {
    const text = "```\n| a |\n```";
    expect(preprocess(text, { ...DEFAULT_PREPROCESS, fence: false, extract: false })).toBe(text);
  });
});

describe("数値列の右寄せ判定（Q26・Q27）", () => {
  it("厳密な数値判定", () => {
    for (const ok of ["120", "+12.5%", "−5.2%", "-3", "1,234", "1,234.5", "0.5", ".5", "50%"]) {
      expect(isNumericLike(ok), ok).toBe(true);
    }
    for (const ng of ["¥100", "10kg", "1,23", "abc", "", "+", "%", "1.2.3"]) {
      expect(isNumericLike(ng), ng).toBe(false);
    }
  });

  it("— や空を無視して列を判定する", () => {
    expect(isNumericColumn(["120", "—", "", "+1%"])).toBe(true);
    expect(isNumericColumn(["120", "N/A"])).toBe(false);
    expect(isNumericColumn(["—", ""])).toBe(false);
  });

  it("ヘッダー行は判定から除く", () => {
    const t: Table = { rows: [["数"], ["1"]], header: true, inputAligns: null, inlineMarkdown: false };
    expect(effectiveAligns(t)).toEqual(["right"]);
    expect(effectiveAligns({ ...t, header: false })).toEqual(["none"]);
  });
});

describe("ヘッダーの自動判定（Q28）", () => {
  it("1 行目が全て非数値・非空ならヘッダー", () => {
    expect(guessHeader([["a", "b"], ["1", "2"]])).toBe(true);
    expect(guessHeader([["1", "2"], ["3", "4"]])).toBe(false);
    expect(guessHeader([["a", ""], ["1", "2"]])).toBe(false);
    expect(guessHeader([["a", "b"]])).toBe(false);
  });

  it("形式の構造（区切り行・th・罫線）を優先する", () => {
    const md = parseInput("| 1 | 2 |\n| --- | --- |\n| 3 | 4 |", "auto", DEFAULT_PREPROCESS);
    expect(md.ok && md.detectedHeader).toBe(true);
    const tsv = parseInput("1\t2\n3\t4", "auto", DEFAULT_PREPROCESS);
    expect(tsv.ok && tsv.detectedHeader).toBe(false);
  });
});

describe("文字幅（Q23・Q24）", () => {
  it("半角 1・全角 2・半角カナ 1", () => {
    expect(stringWidth("abc", N)).toBe(3);
    expect(stringWidth("四半期", N)).toBe(6);
    expect(stringWidth("ｱｲｳ", N)).toBe(3);
    expect(stringWidth("（）", N)).toBe(4);
  });

  it("曖昧幅は設定で 1 / 2 を切り替える", () => {
    for (const ch of ["—", "×", "○", "※", "→", "─"]) {
      expect(stringWidth(ch, N), ch).toBe(1);
      expect(stringWidth(ch, A2), ch).toBe(2);
    }
    expect(stringWidth("−", A2)).toBe(1);
  });

  it("絵文字は 2（ZWJ 連結・肌色・国旗・VS16 を含む）", () => {
    for (const e of ["😀", "👨‍👩‍👧", "👍🏽", "🇯🇵", "❤️"]) {
      expect(stringWidth(e, N), e).toBe(2);
    }
  });

  it("結合文字・ゼロ幅文字は 0", () => {
    expect(stringWidth("é", N)).toBe(1);
    expect(stringWidth("が", N)).toBe(2);
    expect(stringWidth("a​b", N)).toBe(2);
    expect(stringWidth("﻿", N)).toBe(0);
  });
});

describe("編集操作（Q40）", () => {
  const t: Table = {
    rows: [["a", "b", "c"], ["1", "2", "3"]],
    header: true,
    inputAligns: ["left", "center", "right"],
    inlineMarkdown: false,
  };

  it("転置", () => {
    expect(transpose(t).rows).toEqual([["a", "1"], ["b", "2"], ["c", "3"]]);
    expect(transpose(t).inputAligns).toBeNull();
  });

  it("列の削除は揃え指定も一緒に消す", () => {
    const d = deleteColumn(t, 1);
    expect(d.rows).toEqual([["a", "c"], ["1", "3"]]);
    expect(d.inputAligns).toEqual(["left", "right"]);
  });

  it("列の移動（範囲外は変更なし）", () => {
    expect(moveColumn(t, 0, 1).rows[0]).toEqual(["b", "a", "c"]);
    expect(moveColumn(t, 0, 1).inputAligns).toEqual(["center", "left", "right"]);
    expect(moveColumn(t, 0, -1)).toBe(t);
    expect(moveColumn(t, 2, 1)).toBe(t);
  });

  it("セルの編集", () => {
    expect(setCell(t, 1, 2, "x").rows[1]).toEqual(["1", "2", "x"]);
    expect(setCell(t, 5, 0, "x")).toBe(t);
  });
});

describe("7×7 全組み合わせの変換", () => {
  const cases = FORMATS.flatMap((from) => FORMATS.map((to) => [from, to] as const));

  it.each(cases)("%s → %s", (from, to) => {
    const parsed = parseInput(SMALL_INPUTS[from], "auto", DEFAULT_PREPROCESS);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.format).toBe(from);
    expect(parsed.table.rows).toEqual(SMALL_ROWS);
    expect(parsed.table.header).toBe(true);
    const output = serialize(parsed.table, to, DEFAULT_SETTINGS);
    expect(output.length).toBeGreaterThan(0);
    // 出力を再度読み込んで行列数が保たれていること
    const reparsed = parseInput(output, to, DEFAULT_PREPROCESS);
    if (!reparsed.ok) throw new Error(reparsed.message);
    const rows = reparsed.table.rows;
    expect(rows.length).toBe(3);
    expect(rows[0].length).toBe(2);
    expect(rows).toEqual(SMALL_ROWS);
  });
});

describe("設定の正規化", () => {
  it("不正値は既定値に戻す", () => {
    expect(normalizeSettings({ outputFormat: "xx", boxStyle: 1, csvDelimiter: "#" })).toEqual(DEFAULT_SETTINGS);
  });

  it("既定値は Q15/Q21/Q22/Q23/Q25/Q35/Q37/Q38/Q39 の回答どおり", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      rowSeparators: true,
      boxStyle: "single",
      ambiguousWide: false,
      markdownPad: false,
      csvDelimiter: ",",
      htmlStyle: "bordered",
      jsonStructure: "objects",
      jsonNumbers: false,
    });
  });
});
