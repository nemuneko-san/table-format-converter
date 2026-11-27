import { AMBIGUOUS_RANGES, WIDE_RANGES } from "./eaw-data";

export type WidthOptions = {
  /** 曖昧幅（East_Asian_Width=A）の文字を幅 2 と数えるか（設定の既定は true = 幅 2。ここでは明示して渡す） */
  ambiguousWide: boolean;
};

const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]$/u;
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;
const VS16 = "️";
const KEYCAP = "⃣";

/**
 * Unicode データ上は N（中立）だが曖昧幅として扱う文字。
 * U+2212 MINUS SIGN は質問書 Q23 の注記が曖昧幅の例（— − × ○ ※ →）に挙げているため、注記に合わせた例外とする。
 * 生成ファイル eaw-data.ts とは別に持つので、gen-eaw.mjs を再実行しても消えない。
 */
const EXTRA_AMBIGUOUS: ReadonlySet<number> = new Set([0x2212]);

/** ハングル字母の中声・終声（先行する初声と 1 文字に合成されるため幅 0） */
function isHangulJamoTail(cp: number): boolean {
  return (cp >= 0x1160 && cp <= 0x11ff) || (cp >= 0xd7b0 && cp <= 0xd7ff);
}

function inRanges(ranges: readonly number[], cp: number): boolean {
  let lo = 0;
  let hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 2]) {
      hi = mid - 1;
      continue;
    }
    if (cp > ranges[mid * 2 + 1]) {
      lo = mid + 1;
      continue;
    }
    return true;
  }
  return false;
}

function computeWidth(char: string, cp: number, ambiguousWide: boolean): number {
  if (ZERO_WIDTH.test(char) || isHangulJamoTail(cp)) return 0;
  if (inRanges(WIDE_RANGES, cp)) return 2;
  if (inRanges(AMBIGUOUS_RANGES, cp) || EXTRA_AMBIGUOUS.has(cp)) return ambiguousWide ? 2 : 1;
  return 1;
}

// BMP の幅のキャッシュ（-1 = 未計算）。曖昧幅の設定ごとに持つ
const BMP_CACHE = { narrow: new Int8Array(0x10000).fill(-1), wide: new Int8Array(0x10000).fill(-1) };

/** 1 コードポイントの表示幅（0 / 1 / 2） */
export function codePointWidth(char: string, options: WidthOptions): number {
  const cp = char.codePointAt(0) ?? 0;
  if (cp >= 0x20 && cp < 0x7f) return 1;
  if (cp > 0xffff) return computeWidth(char, cp, options.ambiguousWide);
  const cache = options.ambiguousWide ? BMP_CACHE.wide : BMP_CACHE.narrow;
  const cached = cache[cp];
  if (cached >= 0) return cached;
  const width = computeWidth(char, cp, options.ambiguousWide);
  cache[cp] = width;
  return width;
}

function isEmojiGrapheme(grapheme: string): boolean {
  if (EMOJI_PRESENTATION.test(grapheme)) return true;
  if (REGIONAL_INDICATOR.test(grapheme)) return true;
  if (grapheme.includes(KEYCAP)) return true;
  return PICTOGRAPHIC.test(grapheme) && grapheme.includes(VS16);
}

/**
 * 1 書記素クラスタの表示幅。絵文字（キーキャップ・国旗・ZWJ 連結を含む）は 2。
 * それ以外は構成コードポイントの幅の和（結合文字・ゼロ幅文字は 0）。
 * 半角カナ＋半角濁点（ｶﾞ）は 1 クラスタだが、端末・等幅フォントでは 2 桁を占めるため和で数える。
 */
export function graphemeWidth(grapheme: string, options: WidthOptions): number {
  if (isEmojiGrapheme(grapheme)) return 2;
  let width = 0;
  for (const char of grapheme) width += codePointWidth(char, options);
  return width;
}

// 書記素クラスタを作りうる文字（結合文字・ゼロ幅・異体字セレクタ・サロゲート・ハングル字母・キーキャップ）
// 結合文字・ZWJ 等を文字クラスに並べて「幅 0 / 書記素連結」を判定するのが意図。
// eslint-disable-next-line no-misleading-character-class
const CLUSTERING = /[\p{M}\p{Cf}ᅠ-ᇿힰ-퟿\uD800-\uDFFF⃣]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/u;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// BMP の各文字がクラスタを作りうるかのキャッシュ（-1 = 未計算、0 / 1）
const CLUSTER_CACHE = new Int8Array(0x10000).fill(-1);

function mayCluster(codeUnit: number): boolean {
  if (codeUnit >= 0xd800 && codeUnit <= 0xdfff) return true;
  const cached = CLUSTER_CACHE[codeUnit];
  if (cached >= 0) return cached === 1;
  const flag = CLUSTERING.test(String.fromCharCode(codeUnit));
  CLUSTER_CACHE[codeUnit] = flag ? 1 : 0;
  return flag;
}

function segmentedWidth(text: string, options: WidthOptions): number {
  let width = 0;
  for (const { segment } of segmenter.segment(text)) width += graphemeWidth(segment, options);
  return width;
}

/** 文字列の表示幅（等幅フォントでの桁数） */
export function stringWidth(text: string, options: WidthOptions): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const cu = text.charCodeAt(i);
    if (cu >= 0x20 && cu < 0x7f) {
      width += 1;
      continue;
    }
    // クラスタを作る文字（結合文字・絵文字・サロゲート等）を含むときだけ書記素分割する
    if (mayCluster(cu)) return segmentedWidth(text, options);
    width += codePointWidth(text[i], options);
  }
  return width;
}
