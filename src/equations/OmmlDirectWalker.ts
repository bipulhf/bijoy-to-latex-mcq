import type { XmlNode, ConversionWarning } from "../types.js";
import {
  getChild,
  getChildren,
  getTextContent,
  getAllChildTags,
} from "../reader/XmlParser.js";
import {
  getOmmlChildE,
  getOmmlChildSub,
  getOmmlChildSup,
  getOmmlChildNum,
  getOmmlChildDen,
  getOmmlChildDeg,
  getOmmlChildFName,
  getOmmlPropVal,
  isOmmlPropOn,
} from "./OmmlExtractor.js";
import {
  NARY_MAP,
  ACCENT_MAP,
  GROUP_CHR_MAP,
  DELIMITER_MAP,
} from "./AccentMap.js";
import { OPERATOR_MAP } from "./OperatorMap.js";
import { GREEK_MAP } from "./GreekMap.js";
import { ARROW_MAP } from "./ArrowMap.js";
import { BLACKBOARD_MAP } from "./FontStyleMap.js";

const MAX_RECURSION_DEPTH = 50;

interface WalkerContext {
  warnings: ConversionWarning[];
  paragraphIndex: number;
}

export function ommlToLatex(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number = 0,
): string {
  if (depth > MAX_RECURSION_DEPTH) {
    ctx.warnings.push({
      type: "recursion_limit",
      message: `OMML recursion depth exceeded at depth ${depth}`,
      paragraphIndex: ctx.paragraphIndex,
    });
    return "\\ldots";
  }

  const tags = getAllChildTags(node);
  const parts: string[] = [];

  for (const tag of tags) {
    const children = getChildren(node, tag);
    for (const child of children) {
      const result = processOmmlTag(tag, child, ctx, depth);
      if (result) parts.push(result);
    }
  }

  const textContent = getTextContent(node);
  if (textContent) {
    parts.unshift(mapSymbol(textContent));
  }

  return parts.join("");
}

function processOmmlTag(
  tag: string,
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string {
  switch (tag) {
    case "m:f":
      return handleFrac(node, ctx, depth);
    case "m:nary":
      return handleNary(node, ctx, depth);
    case "m:rad":
      return handleRad(node, ctx, depth);
    case "m:acc":
      return handleAcc(node, ctx, depth);
    case "m:bar":
      return handleBar(node, ctx, depth);
    case "m:func":
      return handleFunc(node, ctx, depth);
    case "m:eqArr":
      return handleEqArr(node, ctx, depth);
    case "m:groupChr":
      return handleGroupChr(node, ctx, depth);
    case "m:limLow":
      return handleLimLow(node, ctx, depth);
    case "m:limUpp":
      return handleLimUpp(node, ctx, depth);
    case "m:sPre":
      return handleSPre(node, ctx, depth);
    case "m:sSub":
      return handleSSub(node, ctx, depth);
    case "m:sSup":
      return handleSSup(node, ctx, depth);
    case "m:sSubSup":
      return handleSSubSup(node, ctx, depth);
    case "m:m":
      return handleMatrix(node, ctx, depth);
    case "m:d":
      return handleDelimiter(node, ctx, depth);
    case "m:borderBox":
      return handleBorderBox(node, ctx, depth);
    case "m:phant":
      return handlePhantom(node, ctx, depth);
    case "m:r":
      return handleRun(node);
    case "m:t":
      return mapSymbol(getTextContent(node));
    case "m:e":
      return ommlToLatex(node, ctx, depth + 1);
    case "m:oMath":
      return ommlToLatex(node, ctx, depth + 1);
    default:
      return "";
  }
}

function handleFrac(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const fracType = getOmmlPropVal(node, "m:fPr", "m:type", "m:val");
  const num = getOmmlChildNum(node);
  const den = getOmmlChildDen(node);
  const numLatex = num ? ommlToLatex(num, ctx, depth + 1) : "";
  const denLatex = den ? ommlToLatex(den, ctx, depth + 1) : "";

  switch (fracType) {
    case "noBar":
      return `\\binom{${numLatex}}{${denLatex}}`;
    case "lin":
      return `${numLatex}/${denLatex}`;
    case "skw":
      return `{}^{${numLatex}}/{}_{${denLatex}}`;
    default:
      return `\\frac{${numLatex}}{${denLatex}}`;
  }
}

function handleNary(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const chr = getOmmlPropVal(node, "m:naryPr", "m:chr", "m:val") ?? "\u222B";
  const subHide = isOmmlPropOn(node, "m:naryPr", "m:subHide");
  const supHide = isOmmlPropOn(node, "m:naryPr", "m:supHide");

  const cmd = NARY_MAP[chr] ?? `\\int`;
  const sub = getOmmlChildSub(node);
  const sup = getOmmlChildSup(node);
  const e = getOmmlChildE(node);

  let result = cmd;
  if (!subHide && sub) {
    const subLatex = ommlToLatex(sub, ctx, depth + 1);
    if (subLatex) result += `_{${subLatex}}`;
  }
  if (!supHide && sup) {
    const supLatex = ommlToLatex(sup, ctx, depth + 1);
    if (supLatex) result += `^{${supLatex}}`;
  }
  if (e) {
    result += ` ${ommlToLatex(e, ctx, depth + 1)}`;
  }
  return result;
}

function handleRad(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const degHide = isOmmlPropOn(node, "m:radPr", "m:degHide");
  const deg = getOmmlChildDeg(node);
  const e = getOmmlChildE(node);
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";

  if (degHide || !deg) {
    return `\\sqrt{${base}}`;
  }
  const degLatex = ommlToLatex(deg, ctx, depth + 1);
  if (!degLatex) return `\\sqrt{${base}}`;
  return `\\sqrt[${degLatex}]{${base}}`;
}

function handleAcc(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const chr = getOmmlPropVal(node, "m:accPr", "m:chr", "m:val") ?? "\u0302";
  const e = getOmmlChildE(node);
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";
  const cmd = ACCENT_MAP[chr] ?? "\\hat";
  return `${cmd}{${base}}`;
}

function handleBar(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const pos = getOmmlPropVal(node, "m:barPr", "m:pos", "m:val") ?? "top";
  const e = getOmmlChildE(node);
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";
  return pos === "bot" ? `\\underline{${base}}` : `\\overline{${base}}`;
}

function handleFunc(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const fName = getOmmlChildFName(node);
  const e = getOmmlChildE(node);
  const nameLatex = fName ? ommlToLatex(fName, ctx, depth + 1) : "";
  const argLatex = e ? ommlToLatex(e, ctx, depth + 1) : "";
  const knownFunc = OPERATOR_MAP[nameLatex.trim()];
  const funcCmd = knownFunc ?? nameLatex;
  return `${funcCmd}{${argLatex}}`;
}

function handleEqArr(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const rows = getChildren(node, "m:e");
  if (rows.length === 0) return "";
  const rowLatex = rows.map((r) => ommlToLatex(r, ctx, depth + 1));
  return `\\begin{aligned}${rowLatex.join(" \\\\")}\\end{aligned}`;
}

function handleGroupChr(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string {
  const chr =
    getOmmlPropVal(node, "m:groupChrPr", "m:chr", "m:val") ?? "\u23DF";
  const pos = getOmmlPropVal(node, "m:groupChrPr", "m:pos", "m:val") ?? "bot";
  const e = getOmmlChildE(node);
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";

  const mapping = GROUP_CHR_MAP[chr];
  if (mapping) {
    const cmd = pos === "top" ? mapping.top : mapping.bot;
    return `${cmd}{${base}}`;
  }
  return pos === "top" ? `\\overbrace{${base}}` : `\\underbrace{${base}}`;
}

function handleLimLow(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string {
  const e = getOmmlChildE(node);
  const lim = getChild(node, "m:lim");
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";
  const limLatex = lim ? ommlToLatex(lim, ctx, depth + 1) : "";
  if (isOperatorLike(base)) {
    return `${base}_{${limLatex}}`;
  }
  return `\\underset{${limLatex}}{${base}}`;
}

function handleLimUpp(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string {
  const e = getOmmlChildE(node);
  const lim = getChild(node, "m:lim");
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";
  const limLatex = lim ? ommlToLatex(lim, ctx, depth + 1) : "";
  if (isOperatorLike(base)) {
    return `${base}^{${limLatex}}`;
  }
  return `\\overset{${limLatex}}{${base}}`;
}

function handleSPre(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const sub = getOmmlChildSub(node);
  const sup = getOmmlChildSup(node);
  const e = getOmmlChildE(node);
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";
  const subLatex = sub ? ommlToLatex(sub, ctx, depth + 1) : "";
  const supLatex = sup ? ommlToLatex(sup, ctx, depth + 1) : "";
  let pre = "{}";
  if (subLatex) pre += `_{${subLatex}}`;
  if (supLatex) pre += `^{${supLatex}}`;
  return `${pre}${base}`;
}

function handleSSub(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const e = getOmmlChildE(node);
  const sub = getOmmlChildSub(node);
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";
  const subLatex = sub ? ommlToLatex(sub, ctx, depth + 1) : "";
  return `${base}_{${subLatex}}`;
}

function handleSSup(node: XmlNode, ctx: WalkerContext, depth: number): string {
  const e = getOmmlChildE(node);
  const sup = getOmmlChildSup(node);
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";
  const supLatex = sup ? ommlToLatex(sup, ctx, depth + 1) : "";
  return `${base}^{${supLatex}}`;
}

function handleSSubSup(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string {
  const e = getOmmlChildE(node);
  const sub = getOmmlChildSub(node);
  const sup = getOmmlChildSup(node);
  const base = e ? ommlToLatex(e, ctx, depth + 1) : "";
  const subLatex = sub ? ommlToLatex(sub, ctx, depth + 1) : "";
  const supLatex = sup ? ommlToLatex(sup, ctx, depth + 1) : "";
  return `${base}_{${subLatex}}^{${supLatex}}`;
}

function handleMatrix(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string {
  const rows = getChildren(node, "m:mr");
  if (rows.length === 0) return "";

  const rowsLatex: string[] = [];
  let maxCols = 0;

  for (const row of rows) {
    const cells = getChildren(row, "m:e");
    maxCols = Math.max(maxCols, cells.length);
    const cellsLatex = cells.map((cell) => ommlToLatex(cell, ctx, depth + 1));
    rowsLatex.push(cellsLatex.join(" & "));
  }

  if (rows.length > 50 || maxCols > 50) {
    ctx.warnings.push({
      type: "recursion_limit",
      message: `Large matrix ${rows.length}x${maxCols} truncated`,
      paragraphIndex: ctx.paragraphIndex,
    });
  }

  return `\\begin{matrix}${rowsLatex.join(" \\\\")}\\end{matrix}`;
}

function handleDelimiter(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string {
  const begChr = getOmmlPropVal(node, "m:dPr", "m:begChr", "m:val") ?? "(";
  const endChr = getOmmlPropVal(node, "m:dPr", "m:endChr", "m:val") ?? ")";

  const elements = getChildren(node, "m:e");
  const innerParts = elements.map((e) => ommlToLatex(e, ctx, depth + 1));

  const hasMatrix = elements.length === 1 && containsMatrix(elements[0]!);

  if (hasMatrix) {
    const matrixContent = getMatrixContent(elements[0]!, ctx, depth);
    const env = getMatrixEnv(begChr, endChr);
    return matrixContent
      ? matrixContent
          .replace("\\begin{matrix}", `\\begin{${env}}`)
          .replace("\\end{matrix}", `\\end{${env}}`)
      : innerParts.join(", ");
  }

  const sepChr = getOmmlPropVal(node, "m:dPr", "m:sepChr", "m:val") ?? "|";
  const inner = innerParts.join(sepChr === "|" ? " \\mid " : `, `);

  const leftDel = mapDelimiter(begChr, "left");
  const rightDel = mapDelimiter(endChr, "right");
  return `\\left${leftDel} ${inner} \\right${rightDel}`;
}

function handleBorderBox(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string {
  const e = getOmmlChildE(node);
  const inner = e ? ommlToLatex(e, ctx, depth + 1) : "";
  return `\\boxed{${inner}}`;
}

function handlePhantom(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string {
  const e = getOmmlChildE(node);
  const inner = e ? ommlToLatex(e, ctx, depth + 1) : "";
  return `\\phantom{${inner}}`;
}

function handleRun(node: XmlNode): string {
  const text = getOmmlRunText(node);
  return mapSymbol(text);
}

function mapSymbol(text: string): string {
  if (!text) return "";

  const bb = BLACKBOARD_MAP[text];
  if (bb) return bb;

  let result = "";
  for (const char of text) {
    const op = OPERATOR_MAP[char];
    if (op) {
      result += op;
      continue;
    }
    const greek = GREEK_MAP[char];
    if (greek) {
      result += greek;
      continue;
    }
    const arrow = ARROW_MAP[char];
    if (arrow) {
      result += arrow;
      continue;
    }
    const bbChar = BLACKBOARD_MAP[char];
    if (bbChar) {
      result += bbChar;
      continue;
    }
    result += char;
  }
  return result;
}

function mapDelimiter(chr: string, side: "left" | "right"): string {
  if (!chr || chr === "") return ".";

  const mapped = DELIMITER_MAP[chr];
  if (mapped) return mapped;

  if (chr === "|") {
    return side === "left" ? "\\lvert" : "\\rvert";
  }
  if (chr === "\u2016") {
    return side === "left" ? "\\lVert" : "\\rVert";
  }

  return chr;
}

function isOperatorLike(latex: string): boolean {
  return /^\\(?:lim|sum|prod|int|iint|iiint|oint|max|min|sup|inf|bigcap|bigcup|bigwedge|bigvee)/.test(
    latex,
  );
}

function containsMatrix(node: XmlNode): boolean {
  if (getChildren(node, "m:m").length > 0) return true;
  for (const tag of getAllChildTags(node)) {
    const children = getChildren(node, tag);
    for (const child of children) {
      if (containsMatrix(child)) return true;
    }
  }
  return false;
}

function getMatrixContent(
  node: XmlNode,
  ctx: WalkerContext,
  depth: number,
): string | null {
  const matrices = getChildren(node, "m:m");
  if (matrices.length > 0 && matrices[0]) {
    return handleMatrix(matrices[0], ctx, depth + 1);
  }
  for (const tag of getAllChildTags(node)) {
    const children = getChildren(node, tag);
    for (const child of children) {
      const result = getMatrixContent(child, ctx, depth);
      if (result) return result;
    }
  }
  return null;
}

function getMatrixEnv(begChr: string, endChr: string): string {
  if (begChr === "(" && endChr === ")") return "pmatrix";
  if (begChr === "[" && endChr === "]") return "bmatrix";
  if (begChr === "{" && endChr === "}") return "Bmatrix";
  if (begChr === "|" && endChr === "|") return "vmatrix";
  if (begChr === "\u2016" && endChr === "\u2016") return "Vmatrix";
  return "pmatrix";
}

function getOmmlRunText(node: XmlNode): string {
  const tNodes = getChildren(node, "m:t");
  return tNodes.map((t) => getTextContent(t)).join("");
}
