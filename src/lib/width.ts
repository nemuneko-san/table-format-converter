import { AMBIGUOUS_RANGES, WIDE_RANGES } from "./eaw-data";

export type WidthOptions = {
  /** 曖昧幅（East_Asian_Width=A）の文字を幅 2 と数えるか（既定 false = 幅 1） */
  ambiguousWide: boolean;
};

const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]$/u;
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;
const VS16 = "️";

function inRanges(ranges: readonly number[], cp: number): boolean {
  let lo = 0;
  let hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = ranges[mid * 2];
    const end = ranges[mid * 2 + 1];
    if (cp < start) {
      hi = mid - 1;
      continue;
    }
    if (cp > end) {
      lo = mid + 1;
      continue;
    }
    return true;
  }
  return false;
}

/** 1 コードポイントの表示幅（0 / 1 / 2） */
export function codePointWidth(char: string, options: WidthOptions): number {
  if (ZERO_WIDTH.test(char)) return 0;
  const cp = char.codePointAt(0) ?? 0;
  if (inRanges(WIDE_RANGES, cp)) return 2;
  if (inRanges(AMBIGUOUS_RANGES, cp)) return options.ambiguousWide ? 2 : 1;
  return 1;
}

function isEmojiGrapheme(grapheme: string): boolean {
  if (EMOJI_PRESENTATION.test(grapheme)) return true;
  if (REGIONAL_INDICATOR.test(grapheme)) return true;
  return PICTOGRAPHIC.test(grapheme) && grapheme.includes(VS16);
}

/** 1 書記素クラスタの表示幅。絵文字は 2、結合文字・ゼロ幅文字は 0 として数える */
export function graphemeWidth(grapheme: string, options: WidthOptions): number {
  if (isEmojiGrapheme(grapheme)) return 2;
  let width = 0;
  for (const char of grapheme) {
    width = Math.max(width, codePointWidth(char, options));
  }
  return width;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** 文字列の表示幅（等幅フォントでの桁数） */
export function stringWidth(text: string, options: WidthOptions): number {
  let width = 0;
  for (const { segment } of segmenter.segment(text)) {
    width += graphemeWidth(segment, options);
  }
  return width;
}
