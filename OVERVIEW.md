# PLAN.md

**Project:** Word Plugin for Bijoy Bangla → Unicode + Equation → LaTeX Converter
**Goal:** Convert mathematics MCQ documents written in Bijoy Bangla (SutonnyMJ font) into clean Unicode Bangla with LaTeX equations.

---

# 1. Problem Overview

Many mathematics question banks in Bangladesh are written in Microsoft Word using:

- **Bijoy encoding** (SutonnyMJ font)
- **English words and variables** (Times New Roman)
- **Word equations** (OMML format)

This mixture causes problems when trying to generate LaTeX or structured question banks.

Typical input:

```
A =  g¨vwUª‡·i AbyeÜx (conjugate) g¨vwUª· †KvbwU? [SB 2023]
```

Characteristics:

- Bangla text → Bijoy encoding
- English text → Unicode
- Variables → English
- Equations → Word OMath objects

Goal output:

```
A = ম্যাট্রিক্সের অনুবন্ধী (conjugate) ম্যাট্রিক্স কোনটি? [SB 2023]
```

and equations converted to:

```
\begin{vmatrix}
4 & 0 & -2 \\
0 & 5 & m \\
-2 & 4 & 5
\end{vmatrix}
```

The plugin must produce **accurate, fast, and scalable conversion**.

---

# 2. High Level Architecture

The system will process the Word document in structured stages.

```
Word Document
      │
      ▼
Document Scanner
      │
      ├── Text Runs
      │       │
      │       ▼
      │   Bijoy Detection
      │       │
      │       ▼
      │ Bijoy → Unicode Converter
      │
      └── Word Equations
              │
              ▼
       OMML Extractor
              │
              ▼
       OMML → LaTeX Converter
              │
              ▼
       Final Document Builder
              │
              ▼
           LaTeX Output
```

---

# 3. Technology Choice

### Plugin Type

**VSTO Word Add-in (C#)**

Reason:

- Full access to Word API
- Direct access to `OMath` objects
- Fast execution
- Stable integration with Word

### Core APIs

Microsoft Word Interop:

```
Document
Paragraphs
Range
Font
OMaths
WordOpenXML
```

### Supporting Components

Bijoy Conversion Engine
OMML Parser
LaTeX Generator

---

# 4. Document Processing Strategy

The document will be processed **run-by-run instead of paragraph-by-paragraph**.

Why?

Word internally stores text as **runs**:

A run is a segment of text with consistent formatting.

Example internal structure:

```
Run 1: "A = "                     font: Times New Roman
Run 2: "g¨vwUª‡·i AbyeÜx "        font: SutonnyMJ
Run 3: "(conjugate)"              font: Times New Roman
Run 4: " g¨vwUª· †KvbwU?"          font: SutonnyMJ
Run 5: " [SB 2023]"               font: Times New Roman
```

This allows precise detection of Bijoy text.

Processing rule:

```
If font == SutonnyMJ
    Convert Bijoy → Unicode
Else
    Keep unchanged
```

This prevents corruption of:

- English words
- variables
- exam references
- numbers

---

# 5. Bijoy Detection

Primary detection method:

Font name.

Bijoy fonts include:

```
SutonnyMJ
SutonnyOMJ
Bijoy
BanglaBijoy
```

Detection rule:

```
if fontName contains "Sutonny"
    treat as bijoy
```

Secondary heuristic:

ASCII patterns used by Bijoy encoding.

Examples:

```
‡
†
ƒ
œ
™
```

These characters do not appear in normal English text.

---

# 6. Bijoy → Unicode Conversion

Bijoy encoding is **ASCII substitution**, not Unicode.

Example mapping:

```
g → ম
v → া
n → ব
```

Conversion stages:

### Stage 1 — Tokenization

Split text into manageable segments.

### Stage 2 — Character Mapping

Replace ASCII characters using the mapping table.

### Stage 3 — Reordering

Bangla vowel signs sometimes appear before the consonant in Bijoy.

Example:

```
gv‡bi
```

Converted to:

```
মানের
```

### Stage 4 — Unicode Normalization

Ensure proper Unicode ordering.

---

# 7. Equation Extraction

Word equations are stored separately from text.

Word object:

```
Document.OMaths
```

Each equation contains **OMML XML**.

Example:

```
<m:oMath>
  <m:f>
     ...
  </m:f>
</m:oMath>
```

Extraction method:

```
foreach (Word.OMath eq in doc.OMaths)
{
    string omml = eq.Range.WordOpenXML;
}
```

Each equation will be stored with its document position.

---

# 8. OMML → LaTeX Conversion

Word uses **Office Math Markup Language (OMML)**.

Conversion pipeline:

```
OMML
  ↓
MathML
  ↓
LaTeX
```

Transformation:

1. Apply XSL transformation
2. Convert MathML to LaTeX

Supported structures:

- fractions
- matrices
- determinants
- roots
- integrals
- summations
- limits
- vectors
- subscripts
- superscripts
- greek symbols
- piecewise functions

Example conversion:

Word matrix:

```
| 4 0 -2 |
| 0 5 m |
| -2 4 5 |
```

LaTeX output:

```
\begin{vmatrix}
4 & 0 & -2 \\
0 & 5 & m \\
-2 & 4 & 5
\end{vmatrix}
```

---

# 9. Protecting Variables and English Text

English words and variables must remain unchanged.

Protected patterns:

```
A
B
x
y
z
matrix
determinant
```

Protection rule:

```
if font != SutonnyMJ
    skip conversion
```

This ensures that:

```
(conjugate)
[SB 2023]
A
B
x
```

remain intact.

---

# 10. Document Reconstruction

After processing text and equations, the plugin reconstructs the document.

Structure example:

```
Question text
↓
Equation
↓
Options
```

LaTeX output:

```
\question
A = ম্যাট্রিক্সের অনুবন্ধী (conjugate) ম্যাট্রিক্স কোনটি?

\[
\begin{vmatrix}
4 & 0 & -2 \\
0 & 5 & m \\
-2 & 4 & 5
\end{vmatrix}
\]

A. 5
B. 10
C. 15
D. 20
```

---

# 11. Performance Optimization

Key performance decisions:

Process runs instead of characters.

Cache Bijoy mappings.

Avoid heavy regex operations.

Batch convert equations.

Target performance:

```
100 questions
< 2 seconds
```

---

# 12. Plugin User Interface

Add Word ribbon tab:

```
Bangla Math Tools
```

Buttons:

```
Convert Bijoy → Unicode
Extract Equations
Export LaTeX
Convert Full Document
Preview LaTeX
```

---

# 13. Testing Strategy

Test with real datasets:

- HSC mathematics papers
- Coaching center question banks
- University admission questions

Equation coverage:

```
Matrices
Determinants
Fractions
Integrals
Limits
Vectors
Summations
Nested equations
```

Target accuracy:

```
Text conversion: >99%
Equation conversion: >98%
```
