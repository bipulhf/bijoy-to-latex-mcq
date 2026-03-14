import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type { XmlNode } from "../types.js";

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: false,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (tagName: string) => {
    const arrayTags = new Set([
      "w:p",
      "w:r",
      "w:t",
      "w:tbl",
      "w:tr",
      "w:tc",
      "w:drawing",
      "w:pict",
      "w:ins",
      "w:del",
      "w:sdt",
      "w:sdtContent",
      "m:oMath",
      "m:oMathPara",
      "m:r",
      "m:t",
      "m:e",
      "m:mr",
      "m:d",
      "m:f",
      "m:nary",
      "m:rad",
      "m:acc",
      "m:bar",
      "m:func",
      "m:eqArr",
      "m:groupChr",
      "m:limLow",
      "m:limUpp",
      "m:sPre",
      "m:sSub",
      "m:sSup",
      "m:sSubSup",
      "m:m",
      "m:borderBox",
      "m:phant",
    ]);
    return arrayTags.has(tagName);
  },
};

const parser = new XMLParser(parserOptions);

const orderedParser = new XMLParser({
  ignoreAttributes: true,
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: false,
  format: false,
});

export function parseXml(xml: string): XmlNode {
  return parser.parse(xml) as XmlNode;
}

export function parseXmlOrdered(xml: string): OrderedEntry[] {
  return orderedParser.parse(xml) as OrderedEntry[];
}

export function buildXml(node: XmlNode): string {
  return builder.build(node) as string;
}

// --- Normal (unordered) tree helpers ---

export function getChild(node: XmlNode, tagName: string): XmlNode | undefined {
  const val = node[tagName];
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) return val[0] as XmlNode | undefined;
  if (typeof val === "object") return val as XmlNode;
  return undefined;
}

export function getChildren(node: XmlNode, tagName: string): XmlNode[] {
  const val = node[tagName];
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val as XmlNode[];
  if (typeof val === "object") return [val as XmlNode];
  return [];
}

export function getAttr(node: XmlNode, attrName: string): string | undefined {
  const val = node[`@_${attrName}`];
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return undefined;
}

export function getTextContent(node: XmlNode): string {
  const raw = node as unknown;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return String(raw);
  const text = node["#text"];
  if (typeof text === "string") return text;
  if (typeof text === "number") return String(text);
  return "";
}

export function getAttrVal(
  parentNode: XmlNode,
  childTag: string,
  attrName: string,
): string | undefined {
  const child = getChild(parentNode, childTag);
  if (!child) return undefined;
  return getAttr(child, attrName);
}

export function hasChild(node: XmlNode, tagName: string): boolean {
  const val = node[tagName];
  return val !== undefined && val !== null;
}

export function getAllChildTags(node: XmlNode): string[] {
  return Object.keys(node).filter(
    (k) => !k.startsWith("@_") && k !== "#text",
  );
}

// --- Ordered tree types and helpers ---

export type OrderedEntry = Record<string, unknown>;

export function oFindChild(
  entries: OrderedEntry[],
  tag: string,
): OrderedEntry[] | undefined {
  for (const entry of entries) {
    if (tag in entry) {
      return entry[tag] as OrderedEntry[];
    }
  }
  return undefined;
}

export function oIterateChildren(
  entries: OrderedEntry[],
): Array<{ tag: string; children: OrderedEntry[] }> {
  const result: Array<{ tag: string; children: OrderedEntry[] }> = [];
  for (const entry of entries) {
    for (const key of Object.keys(entry)) {
      if (key === ":@" || key === "#text") continue;
      result.push({ tag: key, children: entry[key] as OrderedEntry[] });
    }
  }
  return result;
}

export interface ChildRef {
  tag: string;
  index: number;
}

export function oGetChildSequence(entries: OrderedEntry[]): ChildRef[] {
  const counts = new Map<string, number>();
  const seq: ChildRef[] = [];
  for (const entry of entries) {
    for (const key of Object.keys(entry)) {
      if (key === ":@" || key === "#text") continue;
      const idx = counts.get(key) ?? 0;
      seq.push({ tag: key, index: idx });
      counts.set(key, idx + 1);
    }
  }
  return seq;
}

export function oGetChildByRef(
  orderedEntries: OrderedEntry[],
  tag: string,
  index: number,
): OrderedEntry[] | undefined {
  let count = 0;
  for (const entry of orderedEntries) {
    if (tag in entry) {
      if (count === index) {
        return entry[tag] as OrderedEntry[];
      }
      count++;
    }
  }
  return undefined;
}
