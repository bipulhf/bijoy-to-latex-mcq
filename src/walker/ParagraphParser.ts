import type {
  XmlNode,
  DocNode,
  RunNode,
  EquationNode,
  ImageNode,
  ParsedParagraph,
  ConversionWarning,
  ConvertOptions,
} from "../types.js";
import {
  getChild,
  getChildren,
  getTextContent,
  getAttrVal,
  hasChild,
  getAllChildTags,
  getAttr,
  oGetChildByRef,
  type ChildRef,
  type OrderedEntry,
} from "../reader/XmlParser.js";
import { isBijoyFont, hasBijoyMarkers } from "../bijoy/BijoyDetector.js";
import {
  convertBijoyToUnicode,
  isBanglaConsonant,
  isBanglaPreKar,
  BANGLA_HALANT,
} from "../bijoy/BijoyConverter.js";
import { ommlToLatex } from "../equations/OmmlDirectWalker.js";
import { wrapLatex } from "../equations/LatexWrapper.js";
import { extractOmmlNodes } from "../equations/OmmlExtractor.js";

interface ParserContext {
  warnings: ConversionWarning[];
  paragraphIndex: number;
  options: ConvertOptions;
  stats: {
    bijoyRunsConverted: number;
    totalEquations: number;
    imagesSkipped: number;
  };
  childOrder?: ChildRef[];
  orderedEntries?: OrderedEntry[];
}

export function parseParagraph(
  pNode: XmlNode,
  ctx: ParserContext,
): ParsedParagraph {
  const nodes: DocNode[] = [];

  const pPr = getChild(pNode, "w:pPr");
  const styleId = pPr ? getAttrVal(pPr, "w:pStyle", "w:val") ?? null : null;
  const numPr = pPr ? getChild(pPr, "w:numPr") : undefined;
  const numId = numPr
    ? parseIntOrNull(getAttrVal(numPr, "w:numId", "w:val"))
    : null;
  const ilvl = numPr
    ? parseIntOrNull(getAttrVal(numPr, "w:ilvl", "w:val"))
    : null;

  if (ctx.childOrder) {
    processInOrder(pNode, ctx.childOrder, nodes, ctx);
  } else {
    processGrouped(pNode, nodes, ctx);
  }

  fixBijoyCrossRunIssues(nodes);

  return { nodes, styleId, numId, ilvl };
}

function processInOrder(
  pNode: XmlNode,
  childOrder: ChildRef[],
  nodes: DocNode[],
  ctx: ParserContext,
): void {
  for (const { tag, index } of childOrder) {
    if (tag === "w:pPr") continue;

    const children = getChildren(pNode, tag);
    const child = children[index];
    if (!child) continue;

    const childOrdered = ctx.orderedEntries
      ? oGetChildByRef(ctx.orderedEntries, tag, index)
      : undefined;

    processTagChild(tag, child, pNode, nodes, ctx, childOrdered);
  }
}

function processGrouped(
  pNode: XmlNode,
  nodes: DocNode[],
  ctx: ParserContext,
): void {
  const childTags = getAllChildTags(pNode);
  for (const tag of childTags) {
    if (tag === "w:pPr") continue;
    const children = getChildren(pNode, tag);
    for (const child of children) {
      processTagChild(tag, child, pNode, nodes, ctx);
    }
  }
}

function processTagChild(
  tag: string,
  child: XmlNode,
  pNode: XmlNode,
  nodes: DocNode[],
  ctx: ParserContext,
  childOrdered?: OrderedEntry[],
): void {
  switch (tag) {
    case "w:r":
      processRun(child, nodes, ctx);
      break;
    case "m:oMath":
      processEquation(child, pNode, nodes, ctx, childOrdered);
      break;
    case "m:oMathPara":
      processOmathPara(child, nodes, ctx, childOrdered);
      break;
    case "w:ins":
      processInsert(child, nodes, ctx);
      break;
    case "w:del":
      break;
    case "w:drawing":
    case "w:pict":
      processImage(child, nodes, ctx);
      break;
    case "w:sdt": {
      const sdtContent = getChild(child, "w:sdtContent");
      if (sdtContent) {
        const innerPara = parseParagraph(sdtContent, ctx);
        nodes.push(...innerPara.nodes);
      }
      break;
    }
  }
}

function fixBijoyCrossRunIssues(nodes: DocNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) {
    const curr = nodes[i]!;
    const next = nodes[i + 1]!;
    if (curr.type !== "text" || next.type !== "text") continue;
    if (!curr.text || !next.text) continue;

    const lastIdx = curr.text.length - 1;
    const lastChar = curr.text[lastIdx]!;

    if (!isBanglaPreKar(lastChar)) {
      fixEKarAaKarBoundary(curr, next);
      continue;
    }

    const nextFirst = next.text[0]!;
    const nextStartsWithHalant = nextFirst === BANGLA_HALANT;
    const prevIsConsonant =
      lastIdx > 0 && isBanglaConsonant(curr.text[lastIdx - 1]!);

    if (nextStartsWithHalant || !prevIsConsonant) {
      curr.text = curr.text.slice(0, -1);
      next.text = insertPreKar(lastChar, next.text);
    }
  }
}

function fixEKarAaKarBoundary(
  curr: RunNode,
  next: RunNode,
): void {
  if (curr.text.length < 2) return;
  const last = curr.text[curr.text.length - 1]!;
  const secondLast = curr.text[curr.text.length - 2]!;

  if (last !== "\u09C7" || !isBanglaConsonant(secondLast)) return;

  const nextFirst = next.text[0];
  if (nextFirst === "\u09BE") {
    curr.text = curr.text.slice(0, -1) + "\u09CB";
    next.text = next.text.slice(1);
  } else if (nextFirst === "\u09D7") {
    curr.text = curr.text.slice(0, -1) + "\u09CC";
    next.text = next.text.slice(1);
  }
}

function insertPreKar(preKar: string, text: string): string {
  let j = 0;

  if (text[0] === BANGLA_HALANT) {
    while (
      j < text.length - 1 &&
      text[j] === BANGLA_HALANT &&
      isBanglaConsonant(text[j + 1]!)
    ) {
      j += 2;
    }
  } else {
    while (j < text.length && isBanglaConsonant(text[j]!)) {
      if (j + 1 < text.length && text[j + 1] === BANGLA_HALANT) {
        j += 2;
      } else {
        j += 1;
        break;
      }
    }
  }

  if (j === 0) return preKar + text;

  if (preKar === "\u09C7" && j < text.length && text[j] === "\u09BE") {
    return text.substring(0, j) + "\u09CB" + text.substring(j + 1);
  }
  if (preKar === "\u09C7" && j < text.length && text[j] === "\u09D7") {
    return text.substring(0, j) + "\u09CC" + text.substring(j + 1);
  }

  return text.substring(0, j) + preKar + text.substring(j);
}

function processRun(
  runNode: XmlNode,
  nodes: DocNode[],
  ctx: ParserContext,
): void {
  const rPr = getChild(runNode, "w:rPr");

  if (rPr && hasChild(rPr, "w:vanish")) return;

  const fontName = resolveFontName(rPr);
  const bold = rPr ? hasChild(rPr, "w:b") : false;
  const italic = rPr ? hasChild(rPr, "w:i") : false;

  const drawings = getChildren(runNode, "w:drawing");
  for (const drawing of drawings) {
    processImage(drawing, nodes, ctx);
  }
  const picts = getChildren(runNode, "w:pict");
  for (const pict of picts) {
    processImage(pict, nodes, ctx);
  }

  const tNodes = getChildren(runNode, "w:t");
  for (const tNode of tNodes) {
    let text = getTextContent(tNode);
    if (!text) continue;

    const bijoy = !ctx.options.skipBijoy && (isBijoyFont(fontName) || (!fontName && hasBijoyMarkers(text)));

    if (bijoy) {
      text = convertBijoyToUnicode(text);
      ctx.stats.bijoyRunsConverted++;
    }

    if (ctx.options.preserveFormatting) {
      if (bold && italic) text = `**_${text}_**`;
      else if (bold) text = `**${text}**`;
      else if (italic) text = `_${text}_`;
    }

    const node: RunNode = {
      type: "text",
      text,
      isBijoy: bijoy,
      fontName,
      bold,
      italic,
    };
    nodes.push(node);
  }
}

function processEquation(
  ommlNode: XmlNode,
  _parentPNode: XmlNode,
  nodes: DocNode[],
  ctx: ParserContext,
  orderedEntries?: OrderedEntry[],
): void {
  if (ctx.options.skipEquations) return;

  ctx.stats.totalEquations++;

  try {
    const latex = ommlToLatex(
      ommlNode,
      { warnings: ctx.warnings, paragraphIndex: ctx.paragraphIndex },
      0,
      orderedEntries,
    );

    if (!latex || latex.trim().length === 0) return;

    const wrapped = wrapLatex(latex, false, ctx.options);
    if (wrapped) {
      const eqNode: EquationNode = {
        type: "equation",
        ommlXml: wrapped,
        isDisplay: false,
      };
      nodes.push(eqNode);
    }
  } catch {
    ctx.warnings.push({
      type: "equation_parse_error",
      message: "Failed to convert OMML equation",
      paragraphIndex: ctx.paragraphIndex,
    });
    const fallback: EquationNode = {
      type: "equation",
      ommlXml: "[equation]",
      isDisplay: false,
    };
    nodes.push(fallback);
  }
}

function processOmathPara(
  omathParaNode: XmlNode,
  nodes: DocNode[],
  ctx: ParserContext,
  parentOrdered?: OrderedEntry[],
): void {
  if (ctx.options.skipEquations) return;

  const oMaths = extractOmmlNodes(omathParaNode);
  for (let mi = 0; mi < oMaths.length; mi++) {
    const oMath = oMaths[mi]!;
    ctx.stats.totalEquations++;

    const oMathOrdered = parentOrdered
      ? oGetChildByRef(parentOrdered, "m:oMath", mi)
      : undefined;

    try {
      const latex = ommlToLatex(
        oMath,
        { warnings: ctx.warnings, paragraphIndex: ctx.paragraphIndex },
        0,
        oMathOrdered,
      );

      if (!latex || latex.trim().length === 0) continue;

      const wrapped = wrapLatex(latex, true, ctx.options);
      if (wrapped) {
        const eqNode: EquationNode = {
          type: "equation",
          ommlXml: wrapped,
          isDisplay: true,
        };
        nodes.push(eqNode);
      }
    } catch {
      ctx.warnings.push({
        type: "equation_parse_error",
        message: "Failed to convert display OMML equation",
        paragraphIndex: ctx.paragraphIndex,
      });
      const fallback: EquationNode = {
        type: "equation",
        ommlXml: "[equation]",
        isDisplay: true,
      };
      nodes.push(fallback);
    }
  }
}

function processInsert(
  insNode: XmlNode,
  nodes: DocNode[],
  ctx: ParserContext,
): void {
  const runs = getChildren(insNode, "w:r");
  for (const run of runs) {
    processRun(run, nodes, ctx);
  }
}

function processImage(
  _imgNode: XmlNode,
  nodes: DocNode[],
  ctx: ParserContext,
): void {
  ctx.stats.imagesSkipped++;
  ctx.warnings.push({
    type: "image_skipped",
    message: "Image node encountered — skipped",
    paragraphIndex: ctx.paragraphIndex,
  });
  const imageNode: ImageNode = {
    type: "image",
    relationshipId: null,
  };
  nodes.push(imageNode);
}

function resolveFontName(rPr: XmlNode | undefined): string | null {
  if (!rPr) return null;
  const rFonts = getChild(rPr, "w:rFonts");
  if (!rFonts) return null;
  return (
    (getAttr(rFonts, "w:ascii") as string | undefined) ??
    (getAttr(rFonts, "w:hAnsi") as string | undefined) ??
    (getAttr(rFonts, "w:cs") as string | undefined) ??
    null
  );
}

function parseIntOrNull(val: string | undefined): number | null {
  if (val === undefined) return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}
