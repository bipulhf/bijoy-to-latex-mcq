# bijoy-to-latex

**Parse Bijoy Bangla MCQ Word documents into structured JSON with embedded LaTeX equations.**

A TypeScript/Node.js library and CLI that reads `.docx` files written in Bijoy encoding (SutonnyMJ font) — including 2- and 3-column option layouts and embedded Word equations — and outputs a clean JSON array of:

```typescript
{ question: string; options: string[] }[]
```

Bangla text is converted to Unicode. All math equations are converted to LaTeX (`$...$` inline or `\[...\]` display) and embedded directly in the question and option strings.

---

## Example

**Input `.docx`** (internal Word structure):

```
[Paragraph]  "1. A =  g¨vwUª‡·i AbyeÜx (conjugate) g¨vwUª· †KvbwU?"
             + [Word equation: 3×3 determinant]

[Table, 2 columns]
┌────────────────┬────────────────┐
│ (A) 5          │ (B) 10         │
├────────────────┼────────────────┤
│ (C) 15         │ (D) 20         │
└────────────────┴────────────────┘
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

## Features

- **Bijoy → Unicode** — Full 256-entry character map, vowel sign reordering, conjunct consonant handling, NFC normalization
- **OMML → LaTeX** — Converts all Word equation types via XSLT + recursive MathML walker
- **Multi-column layouts** — Detects 1-, 2-, 3-, and 4-column option tables automatically
- **Equations embedded in text** — LaTeX lives inside the `question`/`options` strings, not in a separate structure
- **Inline vs display mode** — Equations inside text become `$...$`; standalone equation paragraphs become `\[...\]`
- **English and variable preservation** — Non-Bijoy runs (Times New Roman, etc.) are left untouched
- **Conversion statistics** — Warns about skipped OLE equations, unknown characters, or ambiguous layouts
- **TypeScript-first** — Full types exported, strict mode, ESM

---

## Installation

```bash
npm install bijoy-to-latex
```

**Requirements:** Node.js 20+

---

## Quick Start

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

// Express / Multer example
app.post("/convert", upload.single("file"), async (req, res) => {
  const result = await convertBuffer(req.file.buffer);
  res.json(result.questions);
});
```

### CLI

```bash
# Print JSON to stdout
npx bijoy-to-latex questions.docx

# Write to file, pretty-printed
npx bijoy-to-latex questions.docx -o output.json --pretty

# Show conversion statistics
npx bijoy-to-latex questions.docx --stats
```

---

## Output Type

```typescript
interface Question {
  /** Unicode Bangla text. Equations are embedded as LaTeX:
   *  - Inline:  $x^2 + 1$
   *  - Display: \[\begin{vmatrix}...\end{vmatrix}\]
   */
  question: string;

  /** One entry per option. Same LaTeX embedding rules apply. */
  options: string[];
}

interface ConversionResult {
  questions: Question[];
  stats: {
    totalQuestions: number;
    totalEquations: number;
    bijoyRunsConverted: number;
    tablesProcessed: number;
    warnings: Array<{
      type: "unknown_char" | "unsupported_equation" | "ambiguous_option" | "ole_equation";
      message: string;
      paragraphIndex: number;
    }>;
  };
}
```

---

## Multi-Column Layout Support

MCQ documents in Bangladesh commonly arrange options in tables. All common layouts are detected automatically:

| Layout | Structure | Detection |
|---|---|---|
| Single column | Consecutive paragraphs starting with (A), (B)… | Option marker regex |
| Two-column table | 2×2 Word table | `isOptionTable()` check |
| Three-column table | 2×3 Word table | Row-major cell scan |
| Four-column table | 1×4 Word table (HSC style) | Row-major cell scan |

Empty cells in sparse tables are skipped. Option markers (`(A)`, `ক.`, `i.`, etc.) are stripped from the option text.

---

## Supported Equation Types

The tool handles every equation type that can appear in Word documents, across two conversion paths: XSLT (primary) and a direct OMML walker (fallback). If both fail, a `[equation]` placeholder is emitted with a warning.

### Structure

| Category | Examples |
|---|---|
| Fractions | `\frac{a}{b}`, nested, linear `a/b`, skewed `a⁄b`, no-bar `\binom{n}{k}` |
| All matrix types | `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `Vmatrix`, `Bmatrix` |
| Column vectors | `\begin{pmatrix} a \\ b \\ c \end{pmatrix}` |
| Augmented matrices | `\left[\begin{array}{cc\|c}...\end{array}\right]` |
| Determinants | `\begin{vmatrix}...\end{vmatrix}` |
| Roots | `\sqrt{x}`, `\sqrt[n]{x}` |
| Subscript / Superscript | `a_n`, `x^2`, `x_i^j`, pre-scripts `{}^{14}_{6}C` |
| Piecewise functions | `\begin{cases}...\end{cases}` |
| Aligned equations / systems | `\begin{aligned} ... \end{aligned}` |
| Boxed expressions | `\boxed{x}` |
| Phantom | `\phantom{x}` |

### Calculus & Analysis

| Category | Examples |
|---|---|
| Integrals | `\int`, `\iint`, `\iiint`, `\oint`, `\oiint`, definite bounds |
| Summations | `\sum_{i=1}^{n}` with hidden sub/sup variants |
| Products | `\prod`, `\coprod` |
| Big operators | `\bigcup`, `\bigcap`, `\bigwedge`, `\bigvee`, `\bigoplus`, `\bigotimes` |
| Limits | `\lim_{x \to 0}` |
| Derivatives | `\frac{d}{dx}`, `\frac{\partial f}{\partial x}` |

### Symbols

| Category | Examples |
|---|---|
| Greek letters | Full set α–ω, Α–Ω + variant forms ϵ ϑ ϕ ϱ ς ϰ |
| Arrows | `\to`, `\Rightarrow`, `\iff`, `\mapsto`, `\hookrightarrow`, `\overleftrightarrow`, 30+ total |
| Relations | `\leq`, `\geq`, `\neq`, `\approx`, `\equiv`, `\cong`, `\sim`, `\ll`, `\gg`, `\perp`, `\parallel`, `\propto` |
| Set theory | `\in`, `\notin`, `\subset`, `\cup`, `\cap`, `\setminus`, `\emptyset` |
| Logic | `\land`, `\lor`, `\lneg`, `\forall`, `\exists`, `\top`, `\bot` |
| Dots | `\ldots`, `\cdots`, `\vdots`, `\ddots` |
| Geometry | `\angle`, `\triangle`, `\square`, `\diamond` |
| Misc | `\infty`, `\partial`, `\nabla`, `\mid`, `\nmid`, `\lfloor`, `\lceil`, `\langle`, `\rangle` |
| Blackboard bold | `\mathbb{R}`, `\mathbb{Z}`, `\mathbb{Q}`, `\mathbb{C}`, `\mathbb{N}` |

### Functions

All standard LaTeX functions: `\sin`, `\cos`, `\tan`, `\sec`, `\csc`, `\cot`, `\sinh`, `\cosh`, `\tanh`, `\arcsin`, `\arccos`, `\arctan`, `\log`, `\ln`, `\exp`, `\det`, `\dim`, `\ker`, `\lim`, `\max`, `\min`, `\sup`, `\inf`, `\gcd`, `\operatorname{lcm}`, `\operatorname{tr}`, `\operatorname{rank}`, `\operatorname{adj}`

### Accents & Decorations

| Symbol | LaTeX |
|---|---|
| Hat / check / tilde / acute / grave | `\hat`, `\check`, `\tilde`, `\acute`, `\grave` |
| Bar / breve / ring | `\bar`, `\breve`, `\mathring` |
| Dot / double-dot | `\dot`, `\ddot` |
| Vector | `\vec`, `\overleftarrow`, `\overrightarrow`, `\overleftrightarrow` |
| Over/under braces | `\overbrace`, `\underbrace` |
| Over/under lines | `\overline`, `\underline` |
| Cancel | `\cancel`, `\bcancel`, `\xcancel` |
| Strikethrough notations | All `menclose` notation types |

### Font Styles in Equations

`\mathbf`, `\mathit`, `\boldsymbol`, `\mathbb`, `\mathfrak`, `\mathcal`, `\mathsf`, `\mathtt`, `\mathrm`

### Nuclear / Chemistry Notation

Pre-scripts via `m:sPre` / `mmultiscripts`: `{}^{238}_{92}\mathrm{U}`

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
  skipBijoy?: boolean;      // Skip Bijoy → Unicode (default: false)
  skipEquations?: boolean;  // Skip equation → LaTeX (default: false)
  forceDisplay?: boolean;   // Force all equations to \[...\] mode
  forceInline?: boolean;    // Force all equations to $...$ mode
}
```

---

## CLI Reference

```
Usage: bijoy-to-latex [options] <file>

Convert a Bijoy Bangla Word (.docx) file to structured question JSON.

Arguments:
  file                     Path to the input .docx file

Options:
  -o, --output <path>      Write JSON to file (default: stdout)
  --pretty                 Pretty-print output JSON
  --skip-bijoy             Skip Bijoy → Unicode conversion
  --skip-equations         Skip equation → LaTeX conversion
  --force-display          Force all equations to display mode \[...\]
  --force-inline           Force all equations to inline mode $...$
  --stats                  Print conversion stats to stderr
  -v, --version            Show version
  -h, --help               Show help

Examples:
  bijoy-to-latex questions.docx
  bijoy-to-latex questions.docx -o output.json --pretty --stats
  bijoy-to-latex questions.docx --skip-bijoy
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
npm run build        # Compile TypeScript with tsup
npm run dev          # Run CLI directly with tsx (no compile step)
npm run test         # Run all tests with Vitest
npm run test:watch   # Watch mode
npm run coverage     # Test + coverage report
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

### Project Structure

```
src/
├── reader/        .docx unzip + XML parsing
├── walker/        Document tree walker (paragraphs + tables)
├── bijoy/         Bijoy detection + Unicode conversion
├── equations/     OMML extraction, XSLT, MathML → LaTeX
├── assembler/     Question grouping state machine
└── assets/        OMML2MML.XSL, bijoy_charmap.json
```

### Running Tests

```bash
npm test                              # All tests
npm test -- tests/unit/               # Unit tests only
npm test -- tests/integration/        # Integration tests only
npm test -- --coverage                # With coverage report
```

### Adding a New Equation Type

1. Add the MathML element handler in [`src/equations/MathmlToLatex.ts`](src/equations/MathmlToLatex.ts)
2. Add the corresponding unit test in [`tests/unit/MathmlToLatex.test.ts`](tests/unit/MathmlToLatex.test.ts)
3. Add a fixture `.docx` + expected JSON in [`tests/integration/fixtures/`](tests/integration/fixtures/)

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

High-impact areas:

- **Bijoy character map** — edge cases in rare conjunct consonants
- **MathML → LaTeX coverage** — uncommon equation structures from university papers
- **Test fixtures** — real HSC/SSC/university question papers (anonymised)
- **Performance** — profiling on large (500+ question) documents

When reporting a conversion bug, please include:
1. A minimal `.docx` file reproducing the issue
2. The expected output JSON
3. The actual output from the tool

---

## Roadmap

- [x] Project design and architecture
- [ ] Core Bijoy → Unicode engine
- [ ] OMML → LaTeX pipeline (all equation types)
- [ ] Multi-column table option detection
- [ ] Question assembler state machine
- [ ] `convertDocx` / `convertBuffer` public API
- [ ] CLI with full options
- [ ] npm publish (`bijoy-to-latex`)
- [ ] GitHub Actions CI
- [ ] MkDocs documentation site

---

## License

[MIT License](LICENSE)

---

## Acknowledgements

- Microsoft's `OMML2MML.XSL` stylesheet for OMML → MathML transformation
- The Bangla computing community for documenting Bijoy encoding mappings
- Teachers and developers digitizing Bangla educational content across Bangladesh
