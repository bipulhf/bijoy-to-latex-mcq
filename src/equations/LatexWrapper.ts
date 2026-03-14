import type { ConvertOptions } from "../types.js";

export function wrapLatex(
  latex: string,
  _isDisplay: boolean,
  _options: ConvertOptions,
): string {
  if (!latex || latex.trim().length === 0) return "";
  return latex.trim();
}
