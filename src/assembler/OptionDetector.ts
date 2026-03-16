import type { ParsedParagraph, DocNode } from "../types.js";
import { getFirstTextContent } from "./QuestionDetector.js";

const OPTION_MARKER = /^[\s]*[\(\[]?(?:[ABCDabcdকখগঘ])[\)\].)।\s]+/u;

const STRIP_PATTERN = /^[\s]*[\(\[]?(?:[ABCDabcdকখগঘ])[\)\].)।\s]+/u;

const EMBEDDED_OPTIONS_PATTERN = /[\(\[]?(?:[ABCDকখগঘ])[\)\].)।]\s*/gu;

const SINGLE_MARKER = /^[\s]*[\(\[]?(?:[ABCDabcdকখগঘ])[\)\].)।]\s*$/u;

export function isOptionParagraph(p: ParsedParagraph): boolean {
  const text = getFirstTextContent(p).trim();
  return OPTION_MARKER.test(text);
}

export function hasMultipleOptionMarkers(p: ParsedParagraph): boolean {
  let count = 0;
  for (const node of p.nodes) {
    if (node.type === "text" && SINGLE_MARKER.test(node.text.trim())) {
      count++;
    }
  }
  if (count >= 2) return true;

  const fullText = nodesAsText(p.nodes);
  const markers = [...fullText.matchAll(EMBEDDED_OPTIONS_PATTERN)];
  return markers.length >= 2;
}

export function stripOptionMarker(text: string): string {
  return text.replace(STRIP_PATTERN, "").trim();
}

export function getOptionText(p: ParsedParagraph, imageToken: string): string {
  let text = "";
  for (const node of p.nodes) {
    if (node.type === "text") {
      text += node.text;
    } else if (node.type === "equation") {
      text += node.ommlXml;
    } else if (node.type === "image") {
      text += imageToken;
    }
  }
  return stripOptionMarker(text);
}

export function parseMultiOptionNodes(
  nodes: DocNode[],
  imageToken: string,
): string[] {
  const markerIndices: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.type === "text" && SINGLE_MARKER.test(node.text.trim())) {
      markerIndices.push(i);
    }
  }

  if (markerIndices.length < 2) {
    const fullText = nodeToString(nodes, imageToken);
    return splitEmbeddedText(fullText);
  }

  // Strategy 1: content immediately after each marker until next marker
  const afterMarker: string[] = [];
  for (let m = 0; m < markerIndices.length; m++) {
    const start = markerIndices[m]! + 1;
    const end =
      m + 1 < markerIndices.length ? markerIndices[m + 1]! : nodes.length;
    afterMarker.push(nodeToString(nodes.slice(start, end), imageToken).trim());
  }

  const filledCount = afterMarker.filter((v) => v.length > 0).length;
  if (filledCount === markerIndices.length) {
    return afterMarker;
  }

  // Strategy 2: collect all non-marker content and pair by position
  const allValues: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (markerIndices.includes(i)) continue;
    const s = singleNodeToString(nodes[i]!, imageToken).trim();
    if (s) allValues.push(s);
  }

  if (allValues.length === markerIndices.length) {
    return allValues;
  }

  // Strategy 3: if more values than markers, group adjacent values
  if (allValues.length > markerIndices.length) {
    const perMarker = Math.ceil(allValues.length / markerIndices.length);
    const grouped: string[] = [];
    for (let m = 0; m < markerIndices.length; m++) {
      const start = m * perMarker;
      const end = Math.min(start + perMarker, allValues.length);
      grouped.push(allValues.slice(start, end).join(""));
    }
    return grouped;
  }

  // Fewer values than markers — pad with empty
  const result: string[] = [];
  const offset = markerIndices.length - allValues.length;
  for (let m = 0; m < markerIndices.length; m++) {
    const valIdx = m - offset;
    result.push(
      valIdx >= 0 && valIdx < allValues.length ? allValues[valIdx]! : "",
    );
  }
  return result;
}

function splitEmbeddedText(fullText: string): string[] {
  const markers = [...fullText.matchAll(EMBEDDED_OPTIONS_PATTERN)];
  if (markers.length < 2) {
    return [stripOptionMarker(fullText)];
  }

  const options: string[] = [];
  for (let i = 0; i < markers.length; i++) {
    const match = markers[i]!;
    const start = match.index! + match[0].length;
    const end =
      i + 1 < markers.length ? markers[i + 1]!.index! : fullText.length;
    options.push(fullText.slice(start, end).trim());
  }
  return options;
}

function nodeToString(nodes: DocNode[], imageToken: string): string {
  return nodes.map((n) => singleNodeToString(n, imageToken)).join("");
}

function singleNodeToString(n: DocNode, imageToken: string): string {
  if (n.type === "text") return n.text;
  if (n.type === "equation") return n.ommlXml;
  return imageToken;
}

function nodesAsText(nodes: DocNode[]): string {
  return nodes.map((n) => (n.type === "text" ? n.text : "")).join("");
}

export function tryExtractEmbeddedOptions(text: string): string[] | null {
  const markers = [...text.matchAll(EMBEDDED_OPTIONS_PATTERN)];
  if (markers.length < 3) return null;

  const options: string[] = [];
  for (let i = 0; i < markers.length; i++) {
    const match = markers[i]!;
    const start = match.index! + match[0].length;
    const end = i + 1 < markers.length ? markers[i + 1]!.index! : text.length;
    const optionText = text.slice(start, end).trim();
    options.push(optionText);
  }

  const nonEmpty = options.filter((o) => o.length > 0);
  return nonEmpty.length >= 3 ? nonEmpty : null;
}

export function getTextBeforeEmbeddedOptions(text: string): string | null {
  const markers = [...text.matchAll(EMBEDDED_OPTIONS_PATTERN)];
  if (markers.length < 3) return null;
  const firstIdx = markers[0]!.index!;
  return text.slice(0, firstIdx).trim();
}
