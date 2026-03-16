import { describe, it, expect } from "vitest";
import {
  isOptionParagraph,
  stripOptionMarker,
  tryExtractEmbeddedOptions,
  getTextBeforeEmbeddedOptions,
} from "../../src/assembler/OptionDetector.js";
import type { ParsedParagraph } from "../../src/types.js";

function textPara(text: string): ParsedParagraph {
  return {
    nodes: [
      {
        type: "text",
        text,
        isBijoy: false,
        fontName: null,
        bold: false,
        italic: false,
      },
    ],
    styleId: null,
    numId: null,
    ilvl: null,
  };
}

describe("OptionDetector", () => {
  describe("isOptionParagraph", () => {
    it("detects (A) style markers", () => {
      expect(isOptionParagraph(textPara("(A) 5"))).toBe(true);
      expect(isOptionParagraph(textPara("(B) 10"))).toBe(true);
      expect(isOptionParagraph(textPara("(C) 15"))).toBe(true);
      expect(isOptionParagraph(textPara("(D) 20"))).toBe(true);
    });

    it("detects A. style markers", () => {
      expect(isOptionParagraph(textPara("A. Five"))).toBe(true);
      expect(isOptionParagraph(textPara("B. Ten"))).toBe(true);
    });

    it("detects A) style markers", () => {
      expect(isOptionParagraph(textPara("A) Five"))).toBe(true);
      expect(isOptionParagraph(textPara("B) Ten"))).toBe(true);
    });

    it("detects lowercase markers", () => {
      expect(isOptionParagraph(textPara("a. five"))).toBe(true);
      expect(isOptionParagraph(textPara("b) ten"))).toBe(true);
    });

    it("detects Bangla option markers", () => {
      expect(isOptionParagraph(textPara("(ক) পাঁচ"))).toBe(true);
      expect(isOptionParagraph(textPara("(খ) দশ"))).toBe(true);
      expect(isOptionParagraph(textPara("গ) পনের"))).toBe(true);
      expect(isOptionParagraph(textPara("ঘ. বিশ"))).toBe(true);
    });

    it("rejects Roman numeral markers (treated as sub-parts)", () => {
      expect(isOptionParagraph(textPara("i. first"))).toBe(false);
      expect(isOptionParagraph(textPara("ii) second"))).toBe(false);
      expect(isOptionParagraph(textPara("iii. third"))).toBe(false);
      expect(isOptionParagraph(textPara("iv) fourth"))).toBe(false);
    });

    it("rejects non-option text", () => {
      expect(isOptionParagraph(textPara("1. Question"))).toBe(false);
      expect(isOptionParagraph(textPara("Hello world"))).toBe(false);
      expect(isOptionParagraph(textPara(""))).toBe(false);
    });
  });

  describe("stripOptionMarker", () => {
    it("strips (A) prefix", () => {
      expect(stripOptionMarker("(A) Five")).toBe("Five");
    });

    it("strips A. prefix", () => {
      expect(stripOptionMarker("A. Five")).toBe("Five");
    });

    it("strips Bangla markers", () => {
      expect(stripOptionMarker("(ক) পাঁচ")).toBe("পাঁচ");
    });

    it("does not strip Roman numeral markers", () => {
      expect(stripOptionMarker("i. first")).toBe("i. first");
      expect(stripOptionMarker("ii) second")).toBe("ii) second");
    });

    it("returns text unchanged if no marker", () => {
      expect(stripOptionMarker("no marker")).toBe("no marker");
    });
  });

  describe("tryExtractEmbeddedOptions", () => {
    it("extracts options from a single line with 4 markers", () => {
      const text = "(A) i  (B) -i  (C) ±i  (D) 0";
      const result = tryExtractEmbeddedOptions(text);
      expect(result).not.toBeNull();
      expect(result).toHaveLength(4);
      expect(result![0]).toBe("i");
      expect(result![1]).toBe("-i");
      expect(result![2]).toBe("±i");
      expect(result![3]).toBe("0");
    });

    it("extracts Bangla option markers", () => {
      const text = "(ক) ৫  (খ) ১০  (গ) ১৫  (ঘ) ২০";
      const result = tryExtractEmbeddedOptions(text);
      expect(result).not.toBeNull();
      expect(result).toHaveLength(4);
    });

    it("returns null for text without enough markers", () => {
      expect(tryExtractEmbeddedOptions("just some text")).toBeNull();
      expect(tryExtractEmbeddedOptions("(A) only one")).toBeNull();
      expect(tryExtractEmbeddedOptions("(A) one (B) two")).toBeNull();
    });
  });

  describe("getTextBeforeEmbeddedOptions", () => {
    it("returns question text before embedded options", () => {
      const text = "x = ? (A) 1 (B) 2 (C) 3 (D) 4";
      const result = getTextBeforeEmbeddedOptions(text);
      expect(result).toBe("x = ?");
    });

    it("returns null when no embedded options", () => {
      expect(getTextBeforeEmbeddedOptions("no options here")).toBeNull();
    });
  });
});
