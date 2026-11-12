import type { Format, Table } from "../model";
import type { CsvDelimiter } from "../parsers/delimited";
import { toCsv, toTsv } from "./delimited";
import { toHtml, type HtmlStyle } from "./html";
import { toJson, type JsonStructure } from "./json";
import { toMarkdown } from "./markdown";
import { toAscii, toBox, type BoxStyle } from "./ruled";

/** 出力に関わる設定値 */
export type OutputOptions = {
  ambiguousWide: boolean;
  markdownPad: boolean;
  boxStyle: BoxStyle;
  rowSeparators: boolean;
  csvDelimiter: CsvDelimiter;
  htmlStyle: HtmlStyle;
  jsonStructure: JsonStructure;
  jsonNumbers: boolean;
};

export function serialize(table: Table, format: Format, o: OutputOptions): string {
  const width = { ambiguousWide: o.ambiguousWide };
  switch (format) {
    case "markdown":
      return toMarkdown(table, { ...width, pad: o.markdownPad });
    case "tsv":
      return toTsv(table);
    case "csv":
      return toCsv(table, o.csvDelimiter);
    case "box":
      return toBox(table, { ...width, rowSeparators: o.rowSeparators, style: o.boxStyle });
    case "ascii":
      return toAscii(table, { ...width, rowSeparators: o.rowSeparators });
    case "html":
      return toHtml(table, { style: o.htmlStyle });
    case "json":
      return toJson(table, { structure: o.jsonStructure, numbers: o.jsonNumbers });
  }
}
