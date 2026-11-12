import { detectFormat } from "./detect";
import type { Format, Table } from "./model";
import { normalize } from "./normalize";
import { PARSERS } from "./parsers/index";
import { preprocess, type PreprocessOptions } from "./preprocess";

export type InputFormat = Format | "auto";

export type ParseSuccess = {
  ok: true;
  table: Table;
  /** 実際に使った入力形式 */
  format: Format;
  /** 自動判定で決まったか */
  auto: boolean;
  detectedHeader: boolean;
  warnings: string[];
};

export type ParseFailure = {
  ok: false;
  reason: "empty" | "undetected" | "error";
  message: string;
  /** reason=undetected のときに提示する候補（Q8） */
  candidates: Format[];
};

export type ParseOutcome = ParseSuccess | ParseFailure;

/** 入力テキストを前処理 → 形式判定 → 解析 → 正規化して表モデルにする */
export function parseInput(text: string, inputFormat: InputFormat, pre: PreprocessOptions): ParseOutcome {
  const source = preprocess(text, pre);
  if (source.trim() === "") return { ok: false, reason: "empty", message: "", candidates: [] };
  const detection = inputFormat === "auto" ? detectFormat(source) : { format: inputFormat, candidates: [] };
  if (!detection.format) {
    return {
      ok: false,
      reason: "undetected",
      message: "入力の形式を判定できませんでした。形式を選んでください。",
      candidates: detection.candidates,
    };
  }
  const format = detection.format;
  try {
    const raw = PARSERS[format](source);
    if (raw.rows.length === 0) throw new Error("表の行が見つかりません");
    const normalized = normalize(raw, format === "markdown");
    return { ok: true, format, auto: inputFormat === "auto", ...normalized };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "error", message: `入力を解析できませんでした: ${detail}`, candidates: [] };
  }
}
