# PLAN.md

**Project:** `bijoy-to-latex` — Bijoy Bangla + Word Equation → Structured Question JSON with LaTeX
**Language:** TypeScript (Node.js 24 LTS)
**Goal:** Parse `.docx` MCQ documents written in Bijoy Bangla with embedded Word equations and produce a structured JSON array of `{ question: string; options: string[] }` where Bangla text is Unicode and all math equations are replaced with inline or display LaTeX.

---

## 1. Problem Statement

Mathematics question banks in Bangladesh are predominantly written in Microsoft Word using:

- **Bijoy encoding** — ASCII characters rendered as Bangla via `SutonnyMJ` font
- **English text / variables** — stored in `Times New Roman` or similar Unicode fonts
- **Word equations** — embedded as OMML (Office Math Markup Language) XML nodes
- **Multi-column layouts** — options are frequently arranged in 2- or 3-column Word tables

The output of the tool is **not a LaTeX document** — it is a structured JSON where:

- The `question` field is Unicode Bangla text with equation segments replaced by LaTeX (`$...$` or `\[...\]`)
- The `options` array holds each option's text, similarly with embedded LaTeX where applicable

**Input document (internal Word structure):**

```
[Paragraph]  "1. A = g¨vwUª‡·i AbyeÜx (conjugate) g¨vwUª· †KvbwU?"
             + [OMath node: 3×3 determinant]

[Table]  ┌─────────────────┬──────────────────┐
         │ (A) 5           │ (B) 10           │
         ├─────────────────┼──────────────────┤
         │ (C) 15          │ (D) 20           │
         └─────────────────┴──────────────────┘
```

**Output JSON:**

```json
[
  {
    "question": "A = ম্যাট্রিক্সের অনুবন্ধী (conjugate) ম্যাট্রিক্স কোনটি?\n\\[\n\\begin{vmatrix}\n4 & 0 & -2 \\\\\n0 & 5 & m \\\\\n-2 & 4 & 5\n\\end{vmatrix}\n\\]",
    "options": ["5", "10", "15", "20"]
  }
]
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│               Input: .docx File                 │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│          DocxReader (jszip)                     │
│  Unzips .docx → loads word/document.xml         │
│  + word/styles.xml + word/numbering.xml         │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│          DocumentWalker                         │
│  Walks <w:body> children in order:              │
│  • <w:p>  → paragraph                          │
│  • <w:tbl> → table (multi-column options,       │
│              or whole-paper 2-col layout)        │
│  • <w:sdt> → structured document tag           │
└──────────┬───────────────────┬──────────────────┘
           │                   │
           ▼                   ▼
┌────────────────┐   ┌──────────────────────────┐
│ ParagraphParser│   │      TableParser          │
│                │   │  Classifies table:        │
│ For each child │   │  • option table → flatten │
│ in document    │   │  • layout table → recurse │
│ order:         │   │    into cells as body     │
│  • w:r → run   │   └──────────┬───────────────┘
│  • m:oMath     │              │
│    → equation  │              │
│  • w:drawing   │              │
│    → image     │              │
└────────┬───────┘              │
         │                      │
         ▼                      │
┌────────────────────────────┐  │
│       RunProcessor         │  │
│                            │  │
│  if font == Bijoy font:    │  │
│    → BijoyConverter        │  │
│  else:                     │  │
│    → keep text as-is       │  │
│  bold/italic → preserve    │  │
└────────────────────────────┘  │
         │                      │
         ▼                      │
┌────────────────────────────┐  │
│     EquationProcessor      │  │
│                            │  │
│  Path A (preferred):       │  │
│    OMML → MathML (XSLT)    │  │
│    MathML → LaTeX (walker) │  │
│                            │  │
│  Path B (XSLT fallback):   │  │
│    Direct OMML walker      │  │
│    (covers m:nary, m:acc,  │  │
│     m:eqArr, m:groupChr,   │  │
│     m:sPre, m:borderBox,   │  │
│     m:func, m:limLow, etc.)│  │
│                            │  │
│  Path C (total fallback):  │  │
│    emit [equation] + warn  │  │
└────────────────────────────┘  │
         │                      │
         └─────────┬────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│             QuestionAssembler                   │
│  State machine: groups paragraphs/tables into   │
│  Question objects { question, options }         │
│  Handles: single-col, multi-col, sub-parts,     │
│  layout tables, images, page-break continuity   │
└──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│         Output: Question[] (JSON)               │
└─────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Runtime & Language

| Item | Choice | Reason |
|---|---|---|
| Runtime | **Node.js 24 LTS** | Active LTS, native ESM, good stream support |
| Language | **TypeScript 5.x** | Strict types, better IDE support, safer refactoring |
| Module system | **ESM** (`"type": "module"`) | Modern standard |

### Core Dependencies

| Package | Version | Purpose |
|---|---|---|
| `jszip` | `^3.10` | Unzip `.docx` (which is a ZIP archive) |
| `fast-xml-parser` | `^4.4` | Parse `word/document.xml` into a typed JS tree |
| `xslt-processor` | `^2.2` | Apply Microsoft's `OMML2MML.XSL` in Node.js |
| `commander` | `^12` | CLI argument parsing |

### Dev Dependencies

| Package | Purpose |
|---|---|
| `vitest` | Unit + integration testing |
| `@vitest/coverage-v8` | Code coverage |
| `tsx` | Run TypeScript directly (dev/scripts) |
| `tsup` | Bundle for distribution |
| `typescript` | Compiler |
| `@types/node` | Node.js type definitions |
| `eslint` + `@typescript-eslint/*` | Linting |
| `prettier` | Formatting |
| `husky` + `lint-staged` | Pre-commit hooks |

### Bundled Assets

| File | Source | Purpose |
|---|---|---|
| `src/assets/OMML2MML.XSL` | Microsoft Office (redistributable) | Transforms OMML to W3C MathML |
| `src/assets/bijoy_charmap.json` | Custom | Full 256-entry Bijoy → Unicode map |

---

## 4. Project Structure

```
bijoy-to-latex/
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── types.ts
│   │
│   ├── reader/
│   │   ├── DocxReader.ts
│   │   └── XmlParser.ts
│   │
│   ├── walker/
│   │   ├── DocumentWalker.ts
│   │   ├── ParagraphParser.ts
│   │   └── TableParser.ts
│   │
│   ├── bijoy/
│   │   ├── BijoyDetector.ts
│   │   ├── BijoyConverter.ts
│   │   └── charmap.ts
│   │
│   ├── equations/
│   │   ├── OmmlExtractor.ts
│   │   ├── OmmlToMathml.ts          # XSLT path (Path A)
│   │   ├── OmmlDirectWalker.ts      # Direct OMML path (Path B)
│   │   ├── MathmlToLatex.ts         # MathML walker
│   │   ├── OperatorMap.ts
│   │   ├── GreekMap.ts
│   │   ├── ArrowMap.ts              # NEW
│   │   ├── FontStyleMap.ts          # NEW: \mathbb, \mathbf, etc.
│   │   ├── AccentMap.ts             # NEW: accent commands
│   │   └── LatexWrapper.ts
│   │
│   ├── assembler/
│   │   ├── QuestionAssembler.ts
│   │   ├── QuestionDetector.ts
│   │   └── OptionDetector.ts
│   │
│   └── assets/
│       ├── OMML2MML.XSL
│       └── bijoy_charmap.json
│
├── tests/
│   ├── unit/
│   │   ├── BijoyDetector.test.ts
│   │   ├── BijoyConverter.test.ts
│   │   ├── OmmlToMathml.test.ts
│   │   ├── OmmlDirectWalker.test.ts
│   │   ├── MathmlToLatex.test.ts
│   │   ├── TableParser.test.ts
│   │   ├── QuestionDetector.test.ts
│   │   └── OptionDetector.test.ts
│   ├── integration/
│   │   ├── pipeline.test.ts
│   │   └── fixtures/
│   │       ├── *.docx
│   │       └── expected/*.json
│   └── setup.ts
│
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── .eslintrc.json
├── .prettierrc
└── LICENSE
```

---

## 5. TypeScript Types

```typescript
// src/types.ts

export interface Question {
  question: string;   // Unicode Bangla + embedded LaTeX
  options: string[];  // One per option, same rules
}

export interface ConversionResult {
  questions: Question[];
  stats: ConversionStats;
}

export interface ConversionStats {
  totalQuestions: number;
  totalEquations: number;
  bijoyRunsConverted: number;
  tablesProcessed: number;
  imagesSkipped: number;
  warnings: ConversionWarning[];
}

export type WarningType =
  | "unknown_char"
  | "unsupported_equation"
  | "ambiguous_option"
  | "ole_equation"
  | "image_skipped"
  | "xslt_fallback"
  | "equation_parse_error"
  | "recursion_limit";

export interface ConversionWarning {
  type: WarningType;
  message: string;
  paragraphIndex: number;
}

export interface RunNode {
  type: "text";
  text: string;
  isBijoy: boolean;
  fontName: string | null;
  bold: boolean;
  italic: boolean;
}

export interface EquationNode {
  type: "equation";
  ommlXml: string;
  isDisplay: boolean;
}

export interface ImageNode {
  type: "image";
  relationshipId: string | null;
}

export type DocNode = RunNode | EquationNode | ImageNode;

export interface ParsedParagraph {
  nodes: DocNode[];
  styleId: string | null;
  numId: number | null;
  ilvl: number | null;
}

export interface ParsedTable {
  rows: ParsedParagraph[][];
}

export type BodyElement = ParsedParagraph | ParsedTable;

export interface ConvertOptions {
  skipBijoy?: boolean;
  skipEquations?: boolean;
  forceDisplay?: boolean;
  forceInline?: boolean;
  maxRecursionDepth?: number;  // default: 50
  imageToken?: string;          // default: "[image]"
}
```

---

## 6. Multi-Column Layout Detection

### Option Table Layouts

| Layout | Word structure | Detection |
|---|---|---|
| Single column | Consecutive `<w:p>` starting with option marker | Option marker regex |
| Two-column | `<w:tbl>` 2×2 | `isOptionTable()` |
| Three-column | `<w:tbl>` 2×3 | `isOptionTable()` |
| Four-column | `<w:tbl>` 1×4 | `isOptionTable()` |

### Paper-Level Layout Tables

Some documents place the **entire question paper** inside a 2-column table (left = question number, right = content, or left column = all questions, right column = something else). These must not be confused with option tables.

**Classification rules:**

```typescript
function classifyTable(table: ParsedTable): "option" | "layout" | "data" {
  // Option table: first non-empty cell starts with an option marker
  if (isOptionTable(table)) return "option";

  // Layout table: cells contain full paragraphs with question markers
  // → recurse into cells as if they were body elements
  if (isLayoutTable(table)) return "layout";

  // Data table: render as \begin{tabular}...\end{tabular}
  return "data";
}

function isLayoutTable(table: ParsedTable): boolean {
  // A layout table typically has ≤ 3 columns and cells contain
  // multiple paragraphs, at least one of which is a question paragraph
  if (table.rows[0].length > 3) return false;
  const firstCellParagraphs = table.rows[0][0];
  return hasQuestionParagraph(firstCellParagraphs);
}
```

### Option Marker Stripping

Supported option marker styles:

| Style | Examples |
|---|---|
| Latin letters | `(A)`, `A.`, `A)`, `a.` |
| Bangla letters | `(ক)`, `ক.`, `ক)` |
| Roman numerals | `i.`, `ii.`, `iii.`, `iv.` |
| Circle/box variants | `Ⓐ`, `①` (rare) |

```typescript
const STRIP_PATTERN =
  /^[\s]*[\(\[]?(?:[ABCDabcdকখগঘ]|i{1,3}v?|vi{0,3})[\)\].)।\s]+/u;
```

---

## 7. Question Detection & Grouping

### Question Paragraph Detection

```typescript
// Bangla numerals ০–৯, English numerals 0–9
const QUESTION_START = /^[০-৯0-9]+[.)।\s]/u;

function isQuestionParagraph(p: ParsedParagraph): boolean {
  if (p.numId !== null) return true;           // Word numbered list
  const text = getFirstTextContent(p);
  return QUESTION_START.test(text);
}
```

### Sub-Part Detection

Many university/HSC papers have sub-parts (a, b, c) or (i, ii, iii) nested under a question:

```typescript
const SUBPART_START = /^[\s]*[\(\[]?(?:[a-z]|i{1,3}v?|vi{0,3})[\)\].]\s/u;

function isSubPartParagraph(p: ParsedParagraph): boolean {
  return SUBPART_START.test(getFirstTextContent(p));
}
```

Sub-parts are appended to the `question` string with a newline, not treated as new questions.

### Grouping State Machine

```
States: IDLE | QUESTION | OPTIONS

IDLE
  → question paragraph           : push question text, emit EquationNodes → QUESTION
  → anything else                : skip

QUESTION
  → option paragraph             : collect as first option → OPTIONS
  → option table                 : set options from cells, finalize → IDLE
  → layout table                 : recurse — each nested question starts fresh
  → data table                   : append rendered table to question text
  → equation-only paragraph      : append display LaTeX to question text
  → plain paragraph (not blank)  : append to question text (multi-line question)
  → sub-part paragraph           : append to question text with newline
  → image node                   : append imageToken, emit image_skipped warning
  → blank paragraph              : stay in QUESTION (ignore blank lines)
  → new question paragraph       : finalize current → start new → QUESTION

OPTIONS
  → option paragraph             : add to options list
  → option table                 : replace options with table cells, finalize → IDLE
  → new question paragraph       : finalize current → start new → QUESTION
  → blank paragraph              : finalize current → IDLE
  → any other paragraph          : append to last option (continuation)
```

### Options Embedded in Question Paragraph

Some papers write all options on a single line:

```
2. x² + 1 = 0 হলে x = ? (A) i  (B) -i  (C) ±i  (D) 0
```

Detection: after the question text, scan for 4 consecutive option markers. Split if found.

---

## 8. Bijoy Detection

### Primary: Font Name

The full known set of Bijoy-family font names encountered in real documents:

```typescript
const BIJOY_EXACT = new Set([
  "SutonnyMJ",       "SutonnyOMJ",
  "SutonnyMJBold",   "SutonnyOMJBold",
  "BijoyBaijayanta", "BijoyBaijayantaMJ",
  "Bijoy",           "BijoyMJ",
  "BanglaBijoy",     "AdorshoLipi",
  "Adorsho Lipi",    "MuktinarrowBT",
  "Rupali",          "Charukola",
  "Siyam Rupali",    "Nikosh",   // sometimes used with Bijoy charmap
]);

// Substring matches cover bold/italic variants like "SutonnyMJ Bold Italic"
const BIJOY_SUBSTRINGS = ["sutonny", "bijoy", "adorsho", "charukola"];

export function isBijoyFont(fontName: string | null): boolean {
  if (!fontName) return false;
  if (BIJOY_EXACT.has(fontName)) return true;
  const lower = fontName.toLowerCase();
  return BIJOY_SUBSTRINGS.some(s => lower.includes(s));
}
```

### Secondary: Heuristic Character Analysis

Applied when font metadata is absent or the document uses an unlisted font:

```typescript
// These codepoints only appear in Bijoy-encoded text, not in Unicode Bangla or English
const BIJOY_HEURISTIC = /[\u0097\u009C\u009D\u009E\u009F\u00A0-\u00AF\u00B0-\u00BF]/;

// Also look for classic Bijoy visual markers
const BIJOY_VISUAL = /[‡†ƒœ™]/;

export function hasBijoyMarkers(text: string): boolean {
  return BIJOY_HEURISTIC.test(text) || BIJOY_VISUAL.test(text);
}
```

---

## 9. Bijoy → Unicode Conversion

### Four-Stage Pipeline

#### Stage 1: Longest-Match Multi-Character Sequences

Before single-character mapping, apply a longest-match pass for multi-character Bijoy sequences that map to single Unicode clusters. Sorted by descending length to ensure longest match wins:

```typescript
// Example multi-char sequences (partial list — full list in charmap.json)
const MULTI_CHAR_SEQ: [RegExp, string][] = [
  [/¨vwUª/g, "্যাট্রি"],   // "matrix" fragment
  // ... full list covers all known conjunct sequences
];
```

#### Stage 2: Single Character Mapping

Full 256-entry lookup `Record<string, string>` from `bijoy_charmap.json`. Covers:

| Category | Characters |
|---|---|
| Vowels | অ আ ই ঈ উ ঊ ঋ এ ঐ ও ঔ |
| Vowel signs | া ি ী ু ূ ৃ ে ৈ ো ৌ |
| Consonants | ক–হ |
| Special consonants | ড় ঢ় য় ৎ |
| Hasanta | ্ |
| Anusvara | ং |
| Chandrabindu | ঁ |
| Visarga | ঃ |
| Daari | । ॥ |
| Taka sign | ৳ |
| Bangla digits | ০–৯ |
| Conjunct triggers | র-ফলা `্র`, য-ফলা `্য`, ব-ফলা `্ব`, ম-ফলা `্ম` |
| Nukta | ় (for ড় and ঢ়) |

#### Stage 3: Vowel Sign Reordering

Bijoy places `ে`, `ৈ`, `ো` **before** their base consonant; Unicode requires them **after**.

The reorder regex handles:
- Simple case: `[েৈো] + consonant`
- With hasanta: `[েৈো] + consonant + ্ + consonant` (conjunct)
- With ya-phala: `[েৈো] + consonant + ্য`
- With reph: `র্` + `[েৈো]` + consonant → `র্` + consonant + `[েৈো]`

```typescript
// Primary reorder: vowel sign before consonant (including conjunct)
const REORDER_MAIN =
  /([েৈো])([\u09A6-\u09B9\u09DC-\u09DF\u09CE]্?[\u09A6-\u09B9\u09DC-\u09DF]?্?[\u09A6-\u09B9\u09DC-\u09DF]?)/gu;

// Reph reorder: রে + consonant → র্ + consonant + ে
const REORDER_REPH = /(র্)([েৈো])([\u09A6-\u09B9])/gu;

export function reorderVowelSigns(text: string): string {
  let result = text.replace(REORDER_REPH, "$1$3$2");
  result = result.replace(REORDER_MAIN, "$2$1");
  return result;
}
```

#### Stage 4: NFC Normalization + Cleanup

```typescript
export function normalize(text: string): string {
  // Remove orphan hasanta at word boundaries
  let result = text.replace(/্(?=\s|$)/gu, "");
  // Remove zero-width non-joiner artifacts
  result = result.replace(/\u200C{2,}/g, "\u200C");
  return result.normalize("NFC");
}
```

---

## 10. Equation Processing: Two-Path Strategy

Word equations in `.docx` are stored as OMML XML. The conversion uses two paths with automatic fallback.

### Path A — XSLT (Primary)

```
m:oMath (OMML XML)
    ↓
OMML2MML.XSL (Microsoft's stylesheet)
    ↓
W3C MathML XML
    ↓
MathML tree walker → LaTeX string
```

XSLT processor is instantiated **once at module load**, reused for all equations.

### Path B — Direct OMML Walker (Fallback)

Triggered when the XSLT output is empty, malformed, or contains unsupported MathML. The direct OMML walker handles elements the XSLT may not fully cover:

```typescript
// src/equations/OmmlDirectWalker.ts
export function ommlToLatex(node: OmmlNode, depth = 0): string {
  if (depth > MAX_RECURSION_DEPTH) {
    emitWarning("recursion_limit");
    return "...";
  }
  switch (node.tag) {
    case "m:f":         return handleOmmlFrac(node, depth);
    case "m:nary":      return handleOmmlNary(node, depth);
    case "m:rad":       return handleOmmlRad(node, depth);
    case "m:acc":       return handleOmmlAcc(node, depth);
    case "m:bar":       return handleOmmlBar(node, depth);
    case "m:func":      return handleOmmlFunc(node, depth);
    case "m:eqArr":     return handleOmmlEqArr(node, depth);
    case "m:groupChr":  return handleOmmlGroupChr(node, depth);
    case "m:limLow":    return handleOmmlLimLow(node, depth);
    case "m:limUpp":    return handleOmmlLimUpp(node, depth);
    case "m:sPre":      return handleOmmlSPre(node, depth);
    case "m:sSub":      return handleOmmlSSub(node, depth);
    case "m:sSup":      return handleOmmlSSup(node, depth);
    case "m:sSubSup":   return handleOmmlSSubSup(node, depth);
    case "m:m":         return handleOmmlMatrix(node, depth);
    case "m:d":         return handleOmmlDelimiter(node, depth);
    case "m:borderBox": return handleOmmlBorderBox(node, depth);
    case "m:phant":     return handleOmmlPhantom(node, depth);
    case "m:r":         return handleOmmlRun(node, depth);
    case "m:t":         return getTextContent(node);
    default:            return walkChildren(node, depth);
  }
}
```

### Path C — Total Fallback

If both paths fail (exception thrown or output is empty), emit `[equation]` as a placeholder and record an `equation_parse_error` warning.

---

## 11. OMML Element Reference (Path B)

Complete mapping of every OMML element to its LaTeX output:

### Fractions — `m:f`

The fraction type is controlled by `m:fPr/m:type`:

| `m:type` value | Meaning | LaTeX output |
|---|---|---|
| _(absent / `bar`)_ | Normal fraction | `\frac{num}{den}` |
| `noBar` | No fraction bar | `\binom{n}{k}` if 2 args; `{n \atop k}` otherwise |
| `lin` | Linear / inline | `num/den` |
| `skw` | Skewed | `{}^{num}/{}_{den}` |

### N-ary Operators — `m:nary`

`m:nary` covers integrals, sums, and products. The sub/superscript visibility is controlled by `m:naryPr/m:subHide` and `m:naryPr/m:supHide`.

| Character (`m:naryPr/m:chr`) | LaTeX command |
|---|---|
| `∑` | `\sum` |
| `∏` | `\prod` |
| `∐` | `\coprod` |
| `∫` | `\int` |
| `∬` | `\iint` |
| `∭` | `\iiint` |
| `∮` | `\oint` |
| `∯` | `\oiint` |
| `∰` | `\oiiint` |
| `⋀` | `\bigwedge` |
| `⋁` | `\bigvee` |
| `⋂` | `\bigcap` |
| `⋃` | `\bigcup` |
| `⊕` (big) | `\bigoplus` |
| `⊗` (big) | `\bigotimes` |
| `⊙` (big) | `\bigodot` |
| `⊎` (big) | `\biguplus` |
| `⨀` | `\bigodot` |

Bounds:
- Both visible: `\sum_{sub}^{sup}` or `\int_{lo}^{hi}`
- Sub hidden: `\sum^{sup}`
- Sup hidden: `\sum_{sub}`
- Both hidden: `\sum`

### Radicals — `m:rad`

- Square root (`m:radPr/m:degHide = 1`): `\sqrt{base}`
- nth root: `\sqrt[n]{base}`

### Accents — `m:acc`

`m:acc` with `m:accPr/m:chr`:

| Character | LaTeX |
|---|---|
| `̂` (combining hat) | `\hat{x}` |
| `̌` (combining caron) | `\check{x}` |
| `̃` (combining tilde) | `\tilde{x}` |
| `́` (combining acute) | `\acute{x}` |
| `̀` (combining grave) | `\grave{x}` |
| `̄` (combining macron) | `\bar{x}` |
| `̆` (combining breve) | `\breve{x}` |
| `̇` (combining dot above) | `\dot{x}` |
| `̈` (combining diaeresis) | `\ddot{x}` |
| `⃗` (combining right arrow above) | `\vec{x}` |
| `⃖` (combining left arrow above) | `\overleftarrow{x}` |
| `⃡` (combining left-right arrow above) | `\overleftrightarrow{x}` |
| `⃞` (combining enclosing square) | `\square` |
| `̊` (combining ring above) | `\mathring{x}` |

### Bar — `m:bar`

`m:barPr/m:pos`:
- `top` (default): `\overline{x}`
- `bot`: `\underline{x}`

### Function Application — `m:func`

`m:func` has a function name (`m:fName`) and argument (`m:e`):

```
m:fName contains: sin → \sin{arg}
m:fName contains: lim → \lim_{sub}{arg}   (sub from m:limLow if nested)
m:fName contains: max → \max{arg}
```

### Equation Array — `m:eqArr`

A vertical stack of equations, each in `m:e`. Produces aligned equations:

```latex
\begin{aligned}
row_1 \\
row_2 \\
row_3
\end{aligned}
```

### Group Character — `m:groupChr`

`m:groupChr` with `m:groupChrPr/m:chr` and `m:groupChrPr/m:pos`:

| Character | Position | LaTeX |
|---|---|---|
| `⏟` or `_` | `bot` | `\underbrace{x}` |
| `⏞` or `^` | `top` | `\overbrace{x}` |
| `→` | `top` | `\overrightarrow{x}` |
| `←` | `top` | `\overleftarrow{x}` |
| `↔` | `top` | `\overleftrightarrow{x}` |
| `⌣` | `top` | `\overset{\frown}{x}` |

### Limits — `m:limLow` / `m:limUpp`

```
m:limLow → \underset{lim}{base}  or  base_{lim} (for operators)
m:limUpp → \overset{lim}{base}   or  base^{lim} (for operators)
```

### Pre-Scripts — `m:sPre`

Used for nuclear notation (`^{14}_{6}C`) and chemical notation:

```typescript
function handleOmmlSPre(node: OmmlNode, depth: number): string {
  const sub  = getChild(node, "m:sub");
  const sup  = getChild(node, "m:sup");
  const base = getChild(node, "m:e");
  const b    = ommlToLatex(base, depth + 1);
  const lo   = sub  ? `_{${ommlToLatex(sub,  depth + 1)}}` : "";
  const hi   = sup  ? `^{${ommlToLatex(sup,  depth + 1)}}` : "";
  return `{}${lo}${hi}${b}`;
}
```

### Delimiter — `m:d`

`m:d` with `m:dPr/m:begChr` and `m:dPr/m:endChr`. Uses `\left...\right` for auto-sizing:

| Begin | End | LaTeX |
|---|---|---|
| `(` | `)` | `\left( ... \right)` |
| `[` | `]` | `\left[ ... \right]` |
| `{` | `}` | `\left\{ ... \right\}` |
| `\|` | `\|` | `\left\| ... \right\|` |
| `‖` | `‖` | `\left\Vert ... \right\Vert` |
| `⌊` | `⌋` | `\left\lfloor ... \right\rfloor` |
| `⌈` | `⌉` | `\left\lceil ... \right\rceil` |
| `⟨` | `⟩` | `\left\langle ... \right\rangle` |
| _(none)_ | _(none)_ | `\left. ... \right.` |

### Border Box — `m:borderBox`

```typescript
function handleOmmlBorderBox(node: OmmlNode, depth: number): string {
  const inner = ommlToLatex(getChild(node, "m:e"), depth + 1);
  // m:borderBoxPr can specify which sides; default = all sides = \boxed
  return `\\boxed{${inner}}`;
}
```

### Matrix — `m:m` and `m:mr`

Matrix bracket type from surrounding `m:d` delimiter. Rows are `m:mr`, cells are `m:e`:

```latex
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
```

---

## 12. MathML Element Reference (Path A Walker)

Complete set of MathML 3 elements handled by `MathmlToLatex.ts`:

### Token Elements

| Element | LaTeX Handling |
|---|---|
| `mi` | Identifier: look up Greek map, then return as-is; single char → italic by default |
| `mn` | Number: return text content as-is |
| `mo` | Operator: look up operator map; apply `\left`/`\right` for stretchy delimiters |
| `mtext` | `\text{content}` |
| `ms` | String literal: `\text{"content"}` |
| `mspace` | Map `width` attribute → `\,` / `\:` / `\;` / `\quad` / `\qquad` |
| `mglyph` | Emit the `alt` attribute text or a warning |

### Layout Elements

| Element | LaTeX Handling |
|---|---|
| `mrow` | Concatenate children; add `{...}` grouping when needed |
| `mfrac` | `\frac{num}{den}` |
| `msqrt` | `\sqrt{content}` |
| `mroot` | `\sqrt[index]{base}` |
| `mstyle` | Apply font/style mapping; pass through children |
| `merror` | `\text{[error: content]}` |
| `mpadded` | Pass through children (LaTeX has no direct equivalent) |
| `mphantom` | `\phantom{content}` |
| `mfenced` | See matrix/delimiter rules |
| `menclose` | See below |

### Script and Limit Elements

| Element | LaTeX Handling |
|---|---|
| `msub` | `base_{sub}` |
| `msup` | `base^{sup}` |
| `msubsup` | `base_{sub}^{sup}` |
| `munder` | `\underset{under}{base}` — or `\underleftarrow` etc. for arrow operators |
| `mover` | `\overset{over}{base}` — or specific accents for single chars |
| `munderover` | Detect operator type: `\sum_{lo}^{hi}`, `\int_{lo}^{hi}`, etc. |
| `mmultiscripts` | Pre/post scripts: `{}_{pre-sub}^{pre-sup} base _{post-sub}^{post-sup}` |

### Tabular Elements

| Element | LaTeX Handling |
|---|---|
| `mtable` | Check context (matrix vs aligned vs tabular); emit appropriate environment |
| `mtr` | Row with `\\` separator |
| `mtd` | Cell with `&` separator |
| `mlabeledtr` | Treat first child as label annotation; rest as row |
| `maligngroup` | Insert `&` alignment point |
| `malignmark` | Insert `&` alignment point |

### `menclose` Notation Types

The `notation` attribute can be a space-separated list of values:

| Notation value | LaTeX |
|---|---|
| `longdiv` | `\overline{x}` with long-division annotation |
| `actuarial` | `\overline{x}` |
| `radical` | `\sqrt{x}` |
| `box` | `\boxed{x}` |
| `roundedbox` | `\boxed{x}` |
| `circle` | `\boxed{x}` (approximation) |
| `left` | `\left\vert x` |
| `right` | `x \right\vert` |
| `top` | `\overline{x}` |
| `bottom` | `\underline{x}` |
| `updiagonalstrike` | `\cancel{x}` |
| `downdiagonalstrike` | `\bcancel{x}` |
| `verticalstrike` | `\hcancel{x}` (requires `cancel` package) |
| `horizontalstrike` | `\xcancel{x}` |
| `madruwb` | `\overline{x}` (actuarial notation) |
| `phasorangle` | `\angle x` |
| `updiagonalarrow` | `\nearrow x` |

Multiple notations (e.g., `box updiagonalstrike`) are combined: `\cancel{\boxed{x}}`.

### `mmultiscripts` — Pre/Post Scripts

Used for nuclear notation and tensor indices:

```
²³⁸U  →  {}^{238}_{92}\mathrm{U}
```

```typescript
function handleMultiscripts(node: XmlNode): string {
  const [base, ...rest] = node.children;
  const postScripts: string[] = [];
  const preScripts: string[] = [];

  // Alternating sub, sup pairs after base; <mprescripts/> separates post from pre
  let inPre = false;
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i].tagName === "mprescripts") { inPre = true; continue; }
    const sub = mathmlToLatex(rest[i]);
    const sup = rest[i+1] ? mathmlToLatex(rest[i+1]) : "";
    if (inPre) preScripts.push([sub, sup]);
    else postScripts.push([sub, sup]);
  }

  const pre  = preScripts.map(([s,p]) => `${s ? `_{${s}}` : ""}${p ? `^{${p}}` : ""}`).join("");
  const post = postScripts.map(([s,p]) => `${s ? `_{${s}}` : ""}${p ? `^{${p}}` : ""}`).join("");
  return `{}${pre}${mathmlToLatex(base)}${post}`;
}
```

### `mstyle` — Font and Style Attributes

| `mstyle` attribute | LaTeX command |
|---|---|
| `mathvariant="bold"` | `\mathbf{...}` |
| `mathvariant="italic"` | `\mathit{...}` |
| `mathvariant="bold-italic"` | `\boldsymbol{...}` |
| `mathvariant="double-struck"` | `\mathbb{...}` |
| `mathvariant="fraktur"` | `\mathfrak{...}` |
| `mathvariant="bold-fraktur"` | `\mathbf{\mathfrak{...}}` |
| `mathvariant="script"` | `\mathcal{...}` |
| `mathvariant="sans-serif"` | `\mathsf{...}` |
| `mathvariant="monospace"` | `\mathtt{...}` |
| `mathvariant="normal"` | `\mathrm{...}` |
| `displaystyle="true"` | `\displaystyle` prefix |
| `scriptlevel="+1"` | `\scriptstyle` |
| `scriptlevel="+2"` | `\scriptscriptstyle` |

---

## 13. Complete Symbol Tables

### Operators

```typescript
export const OPERATOR_MAP: Record<string, string> = {
  // Arithmetic
  "×": "\\times",       "÷": "\\div",        "±": "\\pm",
  "∓": "\\mp",          "·": "\\cdot",        "∘": "\\circ",
  "⊕": "\\oplus",       "⊗": "\\otimes",      "⊙": "\\odot",
  "⊖": "\\ominus",      "⊘": "\\oslash",

  // Relations
  "≤": "\\leq",         "≥": "\\geq",         "≠": "\\neq",
  "≈": "\\approx",      "≡": "\\equiv",        "≅": "\\cong",
  "≃": "\\simeq",       "∼": "\\sim",          "≪": "\\ll",
  "≫": "\\gg",          "⊥": "\\perp",         "∥": "\\parallel",
  "∝": "\\propto",      "≺": "\\prec",         "≻": "\\succ",
  "⊢": "\\vdash",       "⊨": "\\models",       "⊏": "\\sqsubset",
  "⊐": "\\sqsupset",    "⊑": "\\sqsubseteq",   "⊒": "\\sqsupseteq",

  // Set theory
  "∈": "\\in",          "∉": "\\notin",        "∋": "\\ni",
  "⊂": "\\subset",      "⊃": "\\supset",       "⊆": "\\subseteq",
  "⊇": "\\supseteq",    "⊄": "\\not\\subset",  "∪": "\\cup",
  "∩": "\\cap",         "∖": "\\setminus",      "△": "\\triangle",
  "∅": "\\emptyset",    "𝒫": "\\mathcal{P}",   "⊎": "\\uplus",
  "⊓": "\\sqcap",       "⊔": "\\sqcup",

  // Logic
  "∧": "\\land",        "∨": "\\lor",          "¬": "\\lneg",
  "⊻": "\\veebar",      "∀": "\\forall",       "∃": "\\exists",
  "∄": "\\nexists",     "⊤": "\\top",          "⊥": "\\bot",

  // Calculus
  "∂": "\\partial",     "∇": "\\nabla",        "∞": "\\infty",
  "∑": "\\sum",         "∏": "\\prod",         "∫": "\\int",
  "∬": "\\iint",        "∭": "\\iiint",        "∮": "\\oint",
  "∯": "\\oiint",       "∰": "\\oiiint",       "∆": "\\Delta",

  // Number theory / misc
  "∣": "\\mid",         "∤": "\\nmid",         "⌊": "\\lfloor",
  "⌋": "\\rfloor",      "⌈": "\\lceil",        "⌉": "\\rceil",
  "‖": "\\|",           "∠": "\\angle",        "△": "\\triangle",
  "□": "\\square",      "◇": "\\diamond",      "★": "\\bigstar",
  "†": "\\dagger",      "‡": "\\ddagger",      "§": "\\S",

  // Functions (rendered as operators)
  "sin":  "\\sin",   "cos":  "\\cos",   "tan":  "\\tan",
  "sec":  "\\sec",   "csc":  "\\csc",   "cot":  "\\cot",
  "sinh": "\\sinh",  "cosh": "\\cosh",  "tanh": "\\tanh",
  "arcsin": "\\arcsin", "arccos": "\\arccos", "arctan": "\\arctan",
  "log":  "\\log",   "ln":   "\\ln",    "exp":  "\\exp",
  "det":  "\\det",   "dim":  "\\dim",   "ker":  "\\ker",
  "lim":  "\\lim",   "max":  "\\max",   "min":  "\\min",
  "sup":  "\\sup",   "inf":  "\\inf",   "gcd":  "\\gcd",
  "lcm":  "\\operatorname{lcm}",
  "mod":  "\\bmod",  "deg":  "\\deg",   "Pr":   "\\Pr",
  "arg":  "\\arg",   "hom":  "\\hom",   "rank": "\\operatorname{rank}",
  "tr":   "\\operatorname{tr}", "adj":  "\\operatorname{adj}",

  // Dots
  "…": "\\ldots",   "⋯": "\\cdots",   "⋮": "\\vdots",   "⋱": "\\ddots",
};
```

### Arrows

```typescript
export const ARROW_MAP: Record<string, string> = {
  "→": "\\to",               "←": "\\leftarrow",
  "↔": "\\leftrightarrow",   "⟶": "\\longrightarrow",
  "⟵": "\\longleftarrow",    "⟷": "\\longleftrightarrow",
  "⇒": "\\Rightarrow",       "⇐": "\\Leftarrow",
  "⇔": "\\Leftrightarrow",   "⟹": "\\implies",
  "⟺": "\\iff",              "⟸": "\\impliedby",
  "↑": "\\uparrow",          "↓": "\\downarrow",
  "↕": "\\updownarrow",      "⇑": "\\Uparrow",
  "⇓": "\\Downarrow",        "⇕": "\\Updownarrow",
  "↗": "\\nearrow",          "↘": "\\searrow",
  "↙": "\\swarrow",          "↖": "\\nwarrow",
  "↦": "\\mapsto",           "⟼": "\\longmapsto",
  "↪": "\\hookrightarrow",   "↩": "\\hookleftarrow",
  "↠": "\\twoheadrightarrow","↞": "\\twoheadleftarrow",
  "⇌": "\\rightleftharpoons","⇋": "\\leftrightharpoons",
  "⇀": "\\rightharpoonup",   "⇁": "\\rightharpoondown",
  "↼": "\\leftharpoonup",    "↽": "\\leftharpoondown",
  "⤒": "\\Mapsto",           "↬": "\\looparrowright",
  "⇝": "\\leadsto",          "↝": "\\rightsquigarrow",
};
```

### Greek Letters

```typescript
export const GREEK_MAP: Record<string, string> = {
  // Lowercase
  "α": "\\alpha",    "β": "\\beta",     "γ": "\\gamma",    "δ": "\\delta",
  "ε": "\\epsilon",  "ζ": "\\zeta",     "η": "\\eta",      "θ": "\\theta",
  "ι": "\\iota",     "κ": "\\kappa",    "λ": "\\lambda",   "μ": "\\mu",
  "ν": "\\nu",       "ξ": "\\xi",       "ο": "o",          "π": "\\pi",
  "ρ": "\\rho",      "σ": "\\sigma",    "τ": "\\tau",      "υ": "\\upsilon",
  "φ": "\\phi",      "χ": "\\chi",      "ψ": "\\psi",      "ω": "\\omega",
  // Variant forms
  "ϵ": "\\varepsilon", "ϑ": "\\vartheta", "ϰ": "\\varkappa",
  "ϕ": "\\varphi",     "ϱ": "\\varrho",   "ς": "\\varsigma",
  // Uppercase
  "Α": "A",   "Β": "B",   "Γ": "\\Gamma",   "Δ": "\\Delta",
  "Ε": "E",   "Ζ": "Z",   "Η": "H",         "Θ": "\\Theta",
  "Ι": "I",   "Κ": "K",   "Λ": "\\Lambda",  "Μ": "M",
  "Ν": "N",   "Ξ": "\\Xi", "Ο": "O",        "Π": "\\Pi",
  "Ρ": "P",   "Σ": "\\Sigma", "Τ": "T",     "Υ": "\\Upsilon",
  "Φ": "\\Phi", "Χ": "X", "Ψ": "\\Psi",    "Ω": "\\Omega",
};
```

### Font Style Map

```typescript
// src/equations/FontStyleMap.ts
// Maps mathvariant attribute values or detected math-run styles to LaTeX wrappers

export const MATH_FONT_MAP: Record<string, (x: string) => string> = {
  "bold":          x => `\\mathbf{${x}}`,
  "italic":        x => `\\mathit{${x}}`,
  "bold-italic":   x => `\\boldsymbol{${x}}`,
  "double-struck": x => `\\mathbb{${x}}`,
  "fraktur":       x => `\\mathfrak{${x}}`,
  "bold-fraktur":  x => `\\mathbf{\\mathfrak{${x}}}`,
  "script":        x => `\\mathcal{${x}}`,
  "bold-script":   x => `\\mathbf{\\mathcal{${x}}}`,
  "sans-serif":    x => `\\mathsf{${x}}`,
  "sans-serif-bold": x => `\\mathbf{\\mathsf{${x}}}`,
  "monospace":     x => `\\mathtt{${x}}`,
  "normal":        x => `\\mathrm{${x}}`,
  "initial":       x => x,    // no LaTeX equivalent, pass through
  "tailed":        x => x,
  "looped":        x => x,
  "stretched":     x => x,
};

// Common blackboard-bold symbols
export const BLACKBOARD_MAP: Record<string, string> = {
  "ℝ": "\\mathbb{R}",  "ℚ": "\\mathbb{Q}",  "ℤ": "\\mathbb{Z}",
  "ℕ": "\\mathbb{N}",  "ℂ": "\\mathbb{C}",  "ℙ": "\\mathbb{P}",
  "𝔽": "\\mathbb{F}",  "𝕜": "\\mathbb{k}",
};
```

### Spacing Commands

```typescript
export const SPACE_MAP: Record<string, string> = {
  "0.0em":  "",
  "0.1em":  "\\,",         // thin space
  "0.2em":  "\\:",         // medium space
  "0.3em":  "\\;",         // thick space
  "1.0em":  "\\quad",
  "2.0em":  "\\qquad",
  "negativethinmathspace": "\\!",
};
```

---

## 14. Equation Contexts Requiring Special Handling

### Aligned Equations / Systems

`m:eqArr` in OMML, or `mtable` in MathML used for alignment:

```latex
\begin{aligned}
x + y &= 5 \\
2x - y &= 1
\end{aligned}
```

Detection: `mtable` with `columnalign` containing `left` or alignment marks — emit `aligned` environment instead of `array`.

### Piecewise Functions

`m:d` with `open="{"` + `m:m` (matrix) with 2 columns. Second column contains conditions:

```latex
f(x) = \begin{cases}
x^2       & \text{if } x \geq 0 \\
-x        & \text{if } x < 0
\end{cases}
```

### Long Division / Division Algorithm

`menclose notation="longdiv"` or `m:eqArr` patterns:

```latex
\require{enclose}
7 \enclose{longdiv}{42}
```

### Continued Fractions

Deeply nested `m:f` elements — no special case needed; the recursive walker handles them naturally. Depth guard prevents stack overflow.

### Column Vectors

`m:m` with a single column — rendered as `\begin{pmatrix} a \\ b \\ c \end{pmatrix}`.

### Augmented Matrices

`m:m` followed by a vertical bar delimiter — rendered with `\left[\begin{array}{ccc|c}...\end{array}\right]`.

Detection: check if the matrix is inside a `m:d` with a visible vertical bar, or if the matrix has a `|` column separator.

### Absolute Value vs Norm

| Context | LaTeX |
|---|---|
| Single `|` around scalar | `\left\lvert ... \right\rvert` |
| Double `‖` around vector | `\left\lVert ... \right\rVert` |
| `det` with `|` | `\begin{vmatrix}...\end{vmatrix}` |

Detection based on the delimiter character plus the type of content inside.

### Stacked Notation (Long Multiplication / Addition)

`m:eqArr` used to stack numbers for vertical arithmetic — rare in math MCQs but possible. Rendered as a `tabular`-style aligned block.

---

## 15. Safety Guards

### Recursion Depth Limit

```typescript
const MAX_RECURSION_DEPTH = 50;

function mathmlToLatex(node: XmlNode, depth = 0): string {
  if (depth > MAX_RECURSION_DEPTH) {
    warnings.push({ type: "recursion_limit", ... });
    return "\\ldots";
  }
  // ...recurse with depth + 1
}
```

### Large Matrix Guard

Matrices larger than 20×20 are still processed but a warning is emitted. Matrices larger than 50×50 are truncated with `\ldots` rows/columns added.

### XSLT Timeout

If the XSLT transform takes longer than 500ms for a single equation, fall back to Path B (direct OMML walker).

### Malformed XML Guard

All XML parsing is wrapped in `try/catch`. A malformed `m:oMath` node emits `equation_parse_error` and produces `[equation]`.

---

## 16. Document Layout Edge Cases

### Full-Paper Layout Tables

Some documents wrap the entire content in a `<w:tbl>` for typesetting purposes:

```
<w:tbl>
  <w:tr>
    <w:tc>[question number]</w:tc>  ← narrow column
    <w:tc>[full question content]</w:tc>  ← wide column
  </w:tr>
</w:tbl>
```

Detection: cell in column 0 is very narrow (< 20% of page width) and contains only a number. Treat column 1 as the question body.

### Questions Spanning Page Breaks

`<w:lastRenderedPageBreak>` and `<w:br w:type="page">` do not interrupt question grouping — the state machine ignores page break markers.

### Questions in Text Boxes

`<w:txbxContent>` is treated the same as `<w:body>` — walk its children and run the full pipeline.

### Footnotes and Endnotes

`word/footnotes.xml` and `word/endnotes.xml` are loaded alongside `document.xml`. Footnote references in question text are replaced with `[n]` superscript text.

### Images in Questions

`<w:drawing>` and `<w:pict>` nodes:
- Emit the configured `imageToken` (default: `[image]`) in place
- Record `image_skipped` warning with relationship ID for caller to handle
- The `ConversionResult` does NOT include image data — callers can extract images separately using the relationship IDs from warnings

### Track Changes (Revision Marks)

`<w:ins>` content is included (accepted). `<w:del>` content is excluded (rejected). This matches the "accept all changes" behavior expected for final documents.

### Hidden Text

`<w:rPr><w:vanish/></w:rPr>` — hidden runs are skipped.

---

## 17. Text Styling Preservation

Bold and italic in question text (not equations) are preserved in the output as Markdown-style markers:

| Word formatting | Output |
|---|---|
| Bold | `**text**` |
| Italic | `_text_` |
| Bold + Italic | `**_text_**` |

This is optional and controlled by `ConvertOptions.preserveFormatting` (default: `false`). When disabled, styling is stripped and plain text is emitted.

---

## 18. Public API

```typescript
// src/index.ts

/**
 * Convert a .docx file to a structured array of questions.
 */
export async function convertDocx(
  filePath: string,
  options?: ConvertOptions
): Promise<ConversionResult>;

/**
 * Convert a .docx Buffer (e.g. from a web upload) to questions.
 */
export async function convertBuffer(
  buffer: Buffer,
  options?: ConvertOptions
): Promise<ConversionResult>;

// Re-export types for library consumers
export type {
  Question,
  ConversionResult,
  ConversionStats,
  ConversionWarning,
  ConvertOptions,
  WarningType,
};
```

---

## 19. CLI Interface

```
Usage: bijoy-to-latex [options] <file>

Convert a Bijoy Bangla Word (.docx) file to structured question JSON.

Arguments:
  file                       Path to the .docx file

Options:
  -o, --output <path>        Write JSON to file (default: stdout)
  --pretty                   Pretty-print JSON output
  --skip-bijoy               Skip Bijoy → Unicode conversion
  --skip-equations           Skip equation → LaTeX conversion
  --force-display            Force all equations to \[...\] mode
  --force-inline             Force all equations to $...$ mode
  --preserve-formatting      Emit **bold** / _italic_ markers
  --image-token <token>      Placeholder for images (default: [image])
  --stats                    Print conversion stats to stderr
  -v, --version              Show version
  -h, --help                 Show help

Examples:
  bijoy-to-latex questions.docx
  bijoy-to-latex questions.docx -o output.json --pretty --stats
  bijoy-to-latex questions.docx --preserve-formatting
```

---

## 20. Testing Strategy

### Unit Test Coverage

| Test File | What It Tests |
|---|---|
| `BijoyDetector.test.ts` | Known fonts, bold/italic variants, null, partial names, heuristic markers |
| `BijoyConverter.test.ts` | Full 256 charmap, reorder (simple/conjunct/reph), hasanta, chandrabindu, nukta |
| `OmmlToMathml.test.ts` | XSLT: valid OMML input → expected MathML output for each equation type |
| `OmmlDirectWalker.test.ts` | Every OMML element: `m:nary`, `m:acc`, `m:groupChr`, `m:eqArr`, `m:sPre`, `m:borderBox`, `m:limLow`, `m:func`, `m:d`, `m:fPr` variants |
| `MathmlToLatex.test.ts` | Every MathML element including `mmultiscripts`, `menclose` all notations, `mstyle` all mathvariants, `mspace` widths |
| `TableParser.test.ts` | 1/2/3/4-col option tables, empty cells, layout tables, data tables |
| `QuestionDetector.test.ts` | Bangla numerals, English numerals, list paragraphs, sub-parts, page breaks |
| `OptionDetector.test.ts` | All marker styles (A/B/C/D, ক/খ/গ/ঘ, i/ii/iii/iv, circle), strip logic, embedded options |

### Integration Test Fixtures

| Fixture | Tests |
|---|---|
| `single_column.docx` | Basic 1-col options, Bijoy text, inline equations |
| `two_column_options.docx` | 2×2 option table |
| `three_column_options.docx` | Short options in 3 columns |
| `four_column_options.docx` | 1×4 option table (HSC style) |
| `layout_table.docx` | Full paper in a 2-col layout table |
| `matrix_determinant.docx` | All 6 matrix environments |
| `calculus_heavy.docx` | Limits, integrals (all types), derivatives, summations |
| `piecewise_functions.docx` | `\begin{cases}` |
| `aligned_equations.docx` | `\begin{aligned}` system of equations |
| `nuclear_notation.docx` | `mmultiscripts` / `m:sPre` |
| `nary_all_types.docx` | All 17 n-ary operator types |
| `fraction_types.docx` | Normal, noBar (binom), linear, skewed fractions |
| `accents_all.docx` | All 14 accent types |
| `arrows_all.docx` | All arrow types |
| `greek_all.docx` | All Greek letters including variant forms |
| `font_styles.docx` | `\mathbb`, `\mathbf`, `\mathcal`, `\mathfrak`, etc. |
| `menclose_all.docx` | All menclose notation types |
| `sub_parts.docx` | Questions with (a), (b), (c) sub-parts |
| `embedded_options.docx` | Options on same line as question text |
| `track_changes.docx` | Document with insertions and deletions |
| `images_in_questions.docx` | Questions with embedded images |
| `mixed_bijoy_english.docx` | Runs with mixed font in same paragraph |
| `hsc_sample_paper.docx` | Real anonymised HSC paper (comprehensive) |

### Coverage Targets

| Metric | Target |
|---|---|
| Statement coverage | ≥ 90% |
| Branch coverage | ≥ 85% |
| Bijoy character accuracy | ≥ 99% |
| Equation structural accuracy | ≥ 98% |
| Multi-column layout detection | 100% on known patterns |
| OMML element coverage | 100% of elements listed in this plan |

---

## 21. Error Handling

| Case | Handling |
|---|---|
| File not found | Throw `InvalidDocxError` |
| File is not a ZIP / not a docx | Throw `InvalidDocxError` with message |
| Missing `word/document.xml` | Throw `InvalidDocxError` |
| Malformed OMML XML | Path C fallback: `[equation]` + `equation_parse_error` warning |
| XSLT produces empty output | Path B (direct OMML walker) |
| Direct OMML walker fails | Path C: `[equation]` + `equation_parse_error` warning |
| Recursion depth exceeded | Emit `\\ldots` + `recursion_limit` warning |
| Missing font metadata | Heuristic Bijoy detection |
| OLE-embedded equations | `ole_equation` warning, skip |
| `w:drawing` / image | `image_skipped` warning, emit `imageToken` |
| Empty `m:oMath` node | Skip silently |
| Table with no cells | Skip silently |
| Question with no options | Valid — `options: []` |
| XSLT transform timeout (>500ms) | Fall back to Path B |
| Unknown `menclose` notation | Passthrough content, emit warning |

---

## 22. Implementation Phases

### Phase 1 — Infrastructure (Week 1)
- [ ] Project scaffold: `tsconfig`, `vitest`, `eslint`, `prettier`, `husky`
- [ ] `DocxReader.ts`: jszip + load all XML files
- [ ] `XmlParser.ts`: typed fast-xml-parser wrapper
- [ ] `types.ts`: all interfaces

### Phase 2 — Bijoy Engine (Week 2)
- [ ] `bijoy_charmap.json`: complete 256-entry map with all Bijoy variants
- [ ] `BijoyDetector.ts` (font + heuristic) + full unit tests
- [ ] `BijoyConverter.ts` (all 4 stages, all edge cases) + full unit tests

### Phase 3 — Equation Engine: OMML Direct Walker (Week 3)
- [ ] `OmmlDirectWalker.ts`: all OMML elements from Section 11
- [ ] `OperatorMap.ts`, `ArrowMap.ts`, `GreekMap.ts`, `FontStyleMap.ts`, `AccentMap.ts`
- [ ] Full unit tests for every OMML element

### Phase 4 — Equation Engine: MathML Walker (Week 4)
- [ ] `OmmlToMathml.ts` (XSLT integration, timeout guard)
- [ ] `MathmlToLatex.ts`: all MathML elements from Section 12 + symbol tables
- [ ] `LatexWrapper.ts` (inline/display detection)
- [ ] Full unit tests for every MathML element

### Phase 5 — Document Walker (Week 5)
- [ ] `DocumentWalker.ts`: walk `w:body`, `w:txbxContent`, handle page breaks + hidden text + track changes
- [ ] `ParagraphParser.ts`: `DocNode[]` ordered list, bold/italic flags, image nodes
- [ ] `TableParser.ts`: option / layout / data classification, all column counts

### Phase 6 — Question Assembler (Week 6)
- [ ] `QuestionDetector.ts`, `OptionDetector.ts` (all marker styles)
- [ ] `QuestionAssembler.ts`: full state machine from Section 7
- [ ] Integration tests with all 24 fixture files

### Phase 7 — API + CLI (Week 7)
- [ ] `src/index.ts`: `convertDocx`, `convertBuffer`
- [ ] `src/cli.ts`: Commander with all options
- [ ] Build pipeline with `tsup`

### Phase 8 — Hardening & Release (Week 8)
- [ ] Error handling audit against every case in Section 21
- [ ] JSDoc on all public APIs
- [ ] Performance benchmark (target: 100q < 1s)
- [ ] GitHub Actions CI
- [ ] npm publish

---

## 23. CI/CD

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "24", cache: "npm" }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --coverage
      - run: npm run build
```

---

## 24. Performance Targets

| Document Size | Target |
|---|---|
| 50 questions | < 0.5s |
| 100 questions | < 1s |
| 500 questions | < 5s |

Achieved by:
- XSLT processor instantiated once at module load
- All regex patterns compiled at module level
- Symbol lookup tables as `Record<string, string>` (O(1))
- Single-pass document walk — no re-parsing
- `fast-xml-parser` (significantly faster than DOM parsers)
- Path A preferred; Path B only on fallback (not default overhead)
