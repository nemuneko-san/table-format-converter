import { describe, expect, it } from "vitest";
import { parseInput } from "../src/lib/convert";
import { DEFAULT_PREPROCESS } from "../src/lib/preprocess";
import { serialize } from "../src/lib/serializers/index";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { SAMPLE_BOX, SAMPLE_ROWS } from "./fixtures";

function parseSample() {
  const result = parseInput(SAMPLE_BOX, "auto", DEFAULT_PREPROCESS);
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe("依頼文のサンプル（罫線文字の表）", () => {
  it("罫線文字の表として自動判定し、ヘッダーありの表モデルにする", () => {
    const result = parseSample();
    expect(result.format).toBe("box");
    expect(result.detectedHeader).toBe(true);
    expect(result.table.rows).toEqual(SAMPLE_ROWS);
    expect(result.warnings).toEqual([]);
  });

  it("Markdown（整形なし）に変換すると数値列が右寄せになる", () => {
    const out = serialize(parseSample().table, "markdown", DEFAULT_SETTINGS);
    expect(out).toBe(
      [
        "| 四半期 | 売上（百万円） | 前期比 | 担当 |",
        "| --- | ---: | ---: | --- |",
        "| Q1 | 120 | — | 田中 |",
        "| Q2 | 135 | +12.5% | 佐藤 |",
        "| Q3 | 128 | −5.2% | 鈴木 |",
        "| Q4 | 152 | +18.8% | 高橋 |",
      ].join("\n"),
    );
  });

  it("Markdown（桁揃え）に変換すると表示幅で揃う", () => {
    const out = serialize(parseSample().table, "markdown", { ...DEFAULT_SETTINGS, markdownPad: true });
    expect(out.split("\n").slice(0, 3)).toEqual([
      "| 四半期 | 売上（百万円） | 前期比 | 担当 |",
      "| ------ | -------------: | -----: | ---- |",
      "| Q1     |            120 |      — | 田中 |",
    ]);
  });

  it("TSV に変換する", () => {
    const out = serialize(parseSample().table, "tsv", DEFAULT_SETTINGS);
    expect(out).toBe(SAMPLE_ROWS.map((row) => row.join("\t")).join("\n"));
  });

  it("罫線表 → 表モデル → 罫線表（曖昧幅 1・全行罫線・単線）で元と一致する", () => {
    const out = serialize(parseSample().table, "box", {
      ...DEFAULT_SETTINGS,
      ambiguousWide: false,
      rowSeparators: true,
      boxStyle: "single",
    });
    expect(out).toBe(SAMPLE_BOX);
  });
});
