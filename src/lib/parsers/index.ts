import type { Format, RawTable } from "../model";
import { parseCsv, parseTsv } from "./delimited";
import { parseHtml } from "./html";
import { parseJson } from "./json";
import { parseMarkdown } from "./markdown";
import { parseAscii, parseBox } from "./ruled";

export const PARSERS: Record<Format, (text: string) => RawTable> = {
  markdown: parseMarkdown,
  tsv: parseTsv,
  csv: parseCsv,
  box: parseBox,
  ascii: parseAscii,
  html: parseHtml,
  json: parseJson,
};
