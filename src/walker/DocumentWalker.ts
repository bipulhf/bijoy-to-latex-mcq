import type {
  XmlNode,
  BodyElement,
  ConversionWarning,
  ConvertOptions,
  ConversionStats,
} from "../types.js";
import {
  getChild,
  getChildren,
  oFindChild,
  oGetChildSequence,
  oGetChildByRef,
  type OrderedEntry,
  type ChildRef,
} from "../reader/XmlParser.js";
import { parseParagraph } from "./ParagraphParser.js";
import { parseTable } from "./TableParser.js";

interface WalkerContext {
  warnings: ConversionWarning[];
  options: ConvertOptions;
  stats: {
    bijoyRunsConverted: number;
    totalEquations: number;
    imagesSkipped: number;
    tablesProcessed: number;
  };
}

export function walkDocument(
  documentXml: XmlNode,
  options: ConvertOptions,
  documentXmlOrdered?: OrderedEntry[],
): { elements: BodyElement[]; stats: Omit<ConversionStats, "totalQuestions"> } {
  const ctx: WalkerContext = {
    warnings: [],
    options,
    stats: {
      bijoyRunsConverted: 0,
      totalEquations: 0,
      imagesSkipped: 0,
      tablesProcessed: 0,
    },
  };

  const doc = getChild(documentXml, "w:document") ?? documentXml;
  const body = getChild(doc, "w:body") ?? doc;

  let orderedBody: OrderedEntry[] | undefined;
  if (documentXmlOrdered) {
    const oDoc = oFindChild(documentXmlOrdered, "w:document");
    orderedBody = oDoc ? oFindChild(oDoc, "w:body") : undefined;
  }

  const elements = walkBody(body, orderedBody, ctx, 0);

  return {
    elements,
    stats: {
      ...ctx.stats,
      warnings: ctx.warnings,
    },
  };
}

function walkBody(
  bodyNode: XmlNode,
  orderedBody: OrderedEntry[] | undefined,
  ctx: WalkerContext,
  depth: number,
): BodyElement[] {
  const maxDepth = ctx.options.maxRecursionDepth ?? 50;
  if (depth > maxDepth) {
    ctx.warnings.push({
      type: "recursion_limit",
      message: `Document walker recursion depth exceeded at ${depth}`,
      paragraphIndex: -1,
    });
    return [];
  }

  const elements: BodyElement[] = [];
  let paragraphIndex = 0;

  const childSequence = orderedBody
    ? oGetChildSequence(orderedBody)
    : fallbackChildSequence(bodyNode);

  for (const { tag, index } of childSequence) {
    const child = getChildren(bodyNode, tag)[index];
    if (!child) continue;

    const orderedChild = orderedBody
      ? oGetChildByRef(orderedBody, tag, index)
      : undefined;

    switch (tag) {
      case "w:p": {
        const childOrder = orderedChild
          ? oGetChildSequence(orderedChild)
          : undefined;
        const para = parseParagraph(child, {
          warnings: ctx.warnings,
          paragraphIndex,
          options: ctx.options,
          stats: ctx.stats,
          childOrder,
          orderedEntries: orderedChild,
        });
        elements.push({ type: "paragraph", paragraph: para });
        paragraphIndex++;
        break;
      }
      case "w:tbl": {
        const table = parseTable(child, {
          warnings: ctx.warnings,
          paragraphIndex,
          options: ctx.options,
          stats: ctx.stats,
        });
        elements.push({ type: "table", table });
        break;
      }
      case "w:sdt": {
        const sdtContent = getChild(child, "w:sdtContent");
        const orderedSdtContent = orderedChild
          ? oFindChild(orderedChild, "w:sdtContent")
          : undefined;
        if (sdtContent) {
          const innerElements = walkBody(
            sdtContent,
            orderedSdtContent,
            ctx,
            depth + 1,
          );
          elements.push(...innerElements);
        }
        break;
      }
      case "w:txbxContent": {
        const innerElements = walkBody(child, orderedChild, ctx, depth + 1);
        elements.push(...innerElements);
        break;
      }
    }
  }

  return elements;
}

function fallbackChildSequence(node: XmlNode): ChildRef[] {
  const seq: ChildRef[] = [];
  const tags = Object.keys(node).filter(
    (k) => !k.startsWith("@_") && k !== "#text",
  );
  for (const tag of tags) {
    const children = getChildren(node, tag);
    for (let i = 0; i < children.length; i++) {
      seq.push({ tag, index: i });
    }
  }
  return seq;
}

