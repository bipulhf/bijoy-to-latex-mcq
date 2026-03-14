# bijoy-to-latex

**Parse Bijoy Bangla MCQ Word documents into structured JSON with embedded LaTeX equations.**

A TypeScript/Node.js tool that reads `.docx` files written in Bijoy encoding (SutonnyMJ font) — including multi-column option layouts and embedded Word equations — and outputs a clean JSON array of questions with raw LaTeX:

```typescript
{ question: string; options: string[] }[]
```

Bangla text is converted to Unicode. Math equations are converted to raw LaTeX and embedded directly in the question and option strings alongside plain text — ready for rendering with KaTeX or MathJax.

---

## Example

**Input `.docx`** (Bijoy-encoded with Word equations):

```
৩। [2 3 x; 3 4 -5; 4 1 2] + [-6 8 7; 2 y -9; z 1 2] = [-4 3; 8 8; 0 5] হলে x, y ও z এর মান কত?
    ক) -4, 8, 2   খ) 6, -8, -2   গ) 2, 5, 8   ঘ) 6, 8, -2
```

**Output JSON:**

```json
[
  {
    "question": "\\begin{bmatrix}2 & 3 & x \\\\3 & 4 & -5 \\\\4 & 1 & 2\\end{bmatrix}+\\begin{bmatrix}-6 & 8 & 7 \\\\2 & y & -9 \\\\z & 1 & 2\\end{bmatrix}=\\begin{bmatrix}-4 & 3 \\\\8 & 8 \\\\0 & 5\\end{bmatrix} হলে x, y ও z এর মান কত? [MSB 2021]",
    "options": ["-4, 8, 2", "6, -8, -2", "2, 5, 8", "6, 8, -2"]
  }
]
```

Equations are raw LaTeX (no `$...$` delimiters), suitable for direct use with `katex.render()` or a component that auto-wraps Bangla text in `\text{}`.

---

## Features

- **Bijoy to Unicode** — Full character map, multi-char sequences, vowel sign reordering, conjunct consonant handling, NFC normalization, cross-run boundary fixes
- **OMML to LaTeX** — Direct recursive OMML walker that converts all Word equation types to LaTeX
- **Document-order preservation** — Equations, operators, and text appear in their original positions using ordered XML parsing
- **Multi-column layouts** — Detects 1-, 2-, 3-, and 4-column option tables, plus inline multi-marker patterns
- **Unnumbered question support** — Handles both numbered (`1.`, `২।`) and unnumbered content paragraphs
- **English and variable preservation** — Non-Bijoy runs (Times New Roman, etc.) are left untouched
- **Web UI** — Upload `.docx` files, view rendered output with KaTeX, edit inline, copy to clipboard
- **Conversion statistics** — Warns about skipped images, equation parse errors, recursion limits
- **TypeScript-first** — Full types exported, strict mode, ESM

---

## Quick Start

### Web UI

```bash
npm install
npm run start:web
```

Open `http://localhost:3000` — drag and drop a `.docx` file to see structured questions with rendered LaTeX.

### CLI

```bash
# Print JSON to stdout
npx tsx src/cli.ts questions.docx

# Write to file, pretty-printed
npx tsx src/cli.ts questions.docx -o output.json --pretty

# Show conversion statistics
npx tsx src/cli.ts questions.docx --stats
```

### Node.js / TypeScript

```typescript
import { convertDocx } from "bijoy-to-latex";

const result = await convertDocx("questions.docx");

for (const q of result.questions) {
  console.log(q.question);
  console.log(q.options);
}
```

### From a Buffer (e.g. file upload)

```typescript
import { convertBuffer } from "bijoy-to-latex";

app.post("/convert", upload.single("file"), async (req, res) => {
  const result = await convertBuffer(req.file.buffer);
  res.json(result.questions);
});
```

---

## Output Type

```typescript
interface Question {
  question: string;
  options: string[];
}

interface ConversionResult {
  questions: Question[];
  stats: ConversionStats;
}

interface ConversionStats {
  totalQuestions: number;
  totalEquations: number;
  bijoyRunsConverted: number;
  tablesProcessed: number;
  imagesSkipped: number;
  warnings: ConversionWarning[];
}

interface ConversionWarning {
  type:
    | "unknown_char"
    | "unsupported_equation"
    | "ambiguous_option"
    | "ole_equation"
    | "image_skipped"
    | "xslt_fallback"
    | "equation_parse_error"
    | "recursion_limit";
  message: string;
  paragraphIndex: number;
}
```

---

## Multi-Column Layout Support

MCQ documents in Bangladesh commonly arrange options in tables. All common layouts are detected automatically:

| Layout | Structure | Detection |
|---|---|---|
| Single column | Consecutive paragraphs starting with ক), খ)... | Option marker regex |
| Multi-marker inline | Multiple markers in a single paragraph | Multi-strategy parser |
| Two-column table | 2x2 Word table | `isOptionTable()` check |
| Three-column table | 2x3 Word table | Row-major cell scan |
| Four-column table | 1x4 Word table (HSC style) | Row-major cell scan |

Empty cells in sparse tables are skipped. Option markers (`(A)`, `ক.`, `i.`, etc.) are stripped from the option text.

---

## Supported Equation Types

The tool converts OMML (Office Math Markup Language) directly to LaTeX using a recursive walker that preserves document order.

### Structure

| Category | Examples |
|---|---|
| Fractions | `\frac{a}{b}`, nested, linear `a/b`, skewed, no-bar `\binom{n}{k}` |
| All matrix types | `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `Vmatrix`, `Bmatrix` |
| Column vectors | `\begin{pmatrix} a \\ b \\ c \end{pmatrix}` |
| Determinants | `\begin{vmatrix}...\end{vmatrix}` |
| Roots | `\sqrt{x}`, `\sqrt[n]{x}` |
| Subscript / Superscript | `a_n`, `x^2`, `x_i^j`, pre-scripts `{}^{14}_{6}C` |
| Aligned equations | `\begin{aligned} ... \end{aligned}` |
| Boxed expressions | `\boxed{x}` |
| Phantom | `\phantom{x}` |

### Calculus & Analysis

| Category | Examples |
|---|---|
| Integrals | `\int`, `\iint`, `\iiint`, `\oint`, definite bounds |
| Summations | `\sum_{i=1}^{n}` with hidden sub/sup variants |
| Products | `\prod`, `\coprod` |
| Big operators | `\bigcup`, `\bigcap`, `\bigwedge`, `\bigvee`, `\bigoplus`, `\bigotimes` |
| Limits | `\lim_{x \to 0}` |

### Symbols

| Category | Examples |
|---|---|
| Greek letters | Full set alpha-omega, Alpha-Omega + variant forms |
| Arrows | `\to`, `\Rightarrow`, `\iff`, `\mapsto`, `\hookrightarrow`, 30+ total |
| Relations | `\leq`, `\geq`, `\neq`, `\approx`, `\equiv`, `\cong`, `\sim`, `\perp`, `\parallel` |
| Set theory | `\in`, `\notin`, `\subset`, `\cup`, `\cap`, `\setminus`, `\emptyset` |
| Logic | `\land`, `\lor`, `\lneg`, `\forall`, `\exists` |
| Dots | `\ldots`, `\cdots`, `\vdots`, `\ddots` |
| Blackboard bold | `\mathbb{R}`, `\mathbb{Z}`, `\mathbb{Q}`, `\mathbb{C}`, `\mathbb{N}` |

### Functions

All standard LaTeX functions: `\sin`, `\cos`, `\tan`, `\log`, `\ln`, `\exp`, `\det`, `\lim`, `\max`, `\min`, `\gcd`, and more.

### Accents & Decorations

| Symbol | LaTeX |
|---|---|
| Hat / check / tilde | `\hat`, `\check`, `\tilde` |
| Bar / breve / ring | `\bar`, `\breve`, `\mathring` |
| Dot / double-dot | `\dot`, `\ddot` |
| Vector | `\vec`, `\overrightarrow` |
| Over/under braces | `\overbrace`, `\underbrace` |
| Over/under lines | `\overline`, `\underline` |

---

## API Reference

### `convertDocx(filePath, options?)`

```typescript
function convertDocx(filePath: string, options?: ConvertOptions): Promise<ConversionResult>
```

Reads a `.docx` file from disk and returns the structured question array.

### `convertBuffer(buffer, options?)`

```typescript
function convertBuffer(buffer: Buffer, options?: ConvertOptions): Promise<ConversionResult>
```

Accepts a `Buffer` directly — useful for web servers receiving file uploads.

### `ConvertOptions`

```typescript
interface ConvertOptions {
  skipBijoy?: boolean;           // Skip Bijoy to Unicode (default: false)
  skipEquations?: boolean;       // Skip equation to LaTeX (default: false)
  forceDisplay?: boolean;        // Force all equations to display mode
  forceInline?: boolean;         // Force all equations to inline mode
  preserveFormatting?: boolean;  // Emit **bold** / _italic_ markers
  imageToken?: string;           // Placeholder for images (default: "[image]")
  maxRecursionDepth?: number;    // OMML recursion limit (default: 50)
}
```

---

## CLI Reference

```
Usage: bijoy-to-latex [options] <file>

Convert a Bijoy Bangla Word (.docx) file to structured question JSON.

Arguments:
  file                        Path to the input .docx file

Options:
  -o, --output <path>         Write JSON to file (default: stdout)
  --pretty                    Pretty-print output JSON
  --skip-bijoy                Skip Bijoy to Unicode conversion
  --skip-equations            Skip equation to LaTeX conversion
  --force-display             Force all equations to display mode
  --force-inline              Force all equations to inline mode
  --preserve-formatting       Emit **bold** / _italic_ markers
  --image-token <token>       Placeholder for images (default: "[image]")
  --stats                     Print conversion stats to stderr
  -v, --version               Show version
  -h, --help                  Show help

Examples:
  npx tsx src/cli.ts questions.docx
  npx tsx src/cli.ts questions.docx -o output.json --pretty --stats
  npx tsx src/cli.ts questions.docx --skip-bijoy
```

---

## Development

### Setup

```bash
git clone https://github.com/your-org/bijoy-to-latex.git
cd bijoy-to-latex
npm install
```

### Scripts

```bash
npm run build          # Compile TypeScript with tsup
npm run dev            # Run CLI directly with tsx
npm run start:web      # Start the web UI server on port 3000
npm run test           # Run all tests with Vitest
npm run test:watch     # Watch mode
npm run test:coverage  # Test + coverage report
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm run format         # Prettier
```

### Project Structure

```
src/
├── reader/          .docx unzip + XML parsing (normal + ordered)
├── walker/          Document tree walker, paragraph parser, table parser
├── bijoy/           Bijoy detection + Unicode conversion + character map
├── equations/       OMML extraction, direct walker, LaTeX wrapper, symbol maps
├── assembler/       Question detection, option detection, assembly state machine
├── cli.ts           CLI entry point (commander)
├── server.ts        Express web server for the UI
├── index.ts         Public API (convertDocx, convertBuffer)
└── types.ts         All shared TypeScript interfaces

web/
└── index.html       Single-file web UI with KaTeX rendering

tests/
└── unit/            Unit tests for all core modules (Vitest)
```

### Running Tests

```bash
npm test                              # All tests
npm test -- tests/unit/               # Unit tests only
npm test -- --coverage                # With coverage report
```

---

## Architecture

### Conversion Pipeline

```
.docx (ZIP)
  → JSZip extract
  → fast-xml-parser (normal + preserveOrder)
  → DocumentWalker (ordered body traversal)
  → ParagraphParser (runs, equations, images, cross-run Bijoy fixes)
  → TableParser (option/layout/data classification)
  → OmmlDirectWalker (OMML → raw LaTeX, document-order)
  → QuestionAssembler (state machine: IDLE → QUESTION → OPTIONS)
  → JSON output
```

### Key Design Decisions

- **Dual XML parse**: The document XML is parsed twice — once normally (for fast child access by tag) and once with `preserveOrder: true` (for correct document order). The ordered parse guides iteration in both the paragraph parser and OMML equation walker.
- **Cross-run Bijoy fixes**: Bijoy-to-Unicode conversion can break when a single Bangla word is split across multiple `<w:r>` elements. A post-processing step reorders pre-kars and combines vowel signs across run boundaries.
- **Raw LaTeX output**: Equations are emitted as raw LaTeX without delimiters, allowing the consumer to choose their rendering strategy (e.g., KaTeX `render()` with auto `\text{}` wrapping for Bangla).

---

## Contributing

Contributions are welcome.

High-impact areas:

- **Bijoy character map** — edge cases in rare conjunct consonants
- **OMML to LaTeX coverage** — uncommon equation structures from university papers
- **Test fixtures** — real HSC/SSC/university question papers
- **Performance** — profiling on large (500+ question) documents

When reporting a conversion bug, please include:
1. A minimal `.docx` file reproducing the issue
2. The expected output JSON
3. The actual output from the tool

---

## Roadmap

- [x] Core Bijoy to Unicode engine
- [x] OMML to LaTeX pipeline (direct walker, all equation types)
- [x] Multi-column table option detection
- [x] Question assembler state machine
- [x] `convertDocx` / `convertBuffer` public API
- [x] CLI with full options
- [x] Web UI with KaTeX rendering, inline editing, localStorage
- [x] Document-order preservation (equations + operators)
- [x] Cross-run Bijoy conversion fixes
- [ ] npm publish (`bijoy-to-latex`)
- [ ] GitHub Actions CI
- [ ] Integration test fixtures

---

## License

[MIT License](LICENSE)

---

## Acknowledgements

- The Bangla computing community for documenting Bijoy encoding mappings
- Teachers and developers digitizing Bangla educational content across Bangladesh
