import type {
  BodyElement,
  Question,
  ConvertOptions,
  ConversionWarning,
  ParsedParagraph,
} from "../types.js";
import {
  isQuestionParagraph,
  isSubPartParagraph,
  isBlankParagraph,
  isEquationOnlyParagraph,
  isContentParagraph,
  getParagraphText,
  stripQuestionNumber,
  getFullTextContent,
} from "./QuestionDetector.js";
import {
  isOptionParagraph,
  hasMultipleOptionMarkers,
  getOptionText,
  parseMultiOptionNodes,
  tryExtractEmbeddedOptions,
  getTextBeforeEmbeddedOptions,
} from "./OptionDetector.js";
import { classifyTable, flattenOptionTable } from "../walker/TableParser.js";

type State = "IDLE" | "QUESTION" | "OPTIONS";

interface AssemblerState {
  state: State;
  currentQuestion: string;
  currentOptions: string[];
  questions: Question[];
}

export function assembleQuestions(
  elements: BodyElement[],
  options: ConvertOptions,
  warnings: ConversionWarning[],
): Question[] {
  const imageToken = options.imageToken ?? "[image]";

  const st: AssemblerState = {
    state: "IDLE",
    currentQuestion: "",
    currentOptions: [],
    questions: [],
  };

  for (const elem of elements) {
    if (elem.type === "paragraph") {
      handleParagraph(elem.paragraph, st, imageToken, warnings);
    } else if (elem.type === "table") {
      handleTable(elem, st, imageToken, warnings, options);
    }
  }

  finalize(st);
  return st.questions;
}

function handleParagraph(
  p: ParsedParagraph,
  st: AssemblerState,
  imageToken: string,
  _warnings: ConversionWarning[],
): void {
  if (isBlankParagraph(p)) {
    if (st.state === "OPTIONS") {
      finalize(st);
    }
    return;
  }

  switch (st.state) {
    case "IDLE":
      handleIdle(p, st, imageToken);
      break;
    case "QUESTION":
      handleInQuestion(p, st, imageToken);
      break;
    case "OPTIONS":
      handleInOptions(p, st, imageToken);
      break;
  }
}

function handleIdle(
  p: ParsedParagraph,
  st: AssemblerState,
  imageToken: string,
): void {
  if (isQuestionParagraph(p)) {
    startQuestion(p, st, imageToken);
    return;
  }

  if (isOptionParagraph(p)) {
    return;
  }

  if (isContentParagraph(p)) {
    startUnnumberedQuestion(p, st, imageToken);
  }
}

function handleInQuestion(
  p: ParsedParagraph,
  st: AssemblerState,
  imageToken: string,
): void {
  if (isQuestionParagraph(p)) {
    finalize(st);
    startQuestion(p, st, imageToken);
    return;
  }

  if (isOptionParagraph(p)) {
    collectOptions(p, st, imageToken);
    st.state = "OPTIONS";
    return;
  }

  if (isSubPartParagraph(p)) {
    st.currentQuestion += "\n" + getParagraphText(p, imageToken);
    return;
  }

  if (isEquationOnlyParagraph(p)) {
    st.currentQuestion += "\n" + getParagraphText(p, imageToken);
    return;
  }

  const text = getParagraphText(p, imageToken);
  if (text.trim().length > 0) {
    const embedded = tryExtractEmbeddedOptions(getFullTextContent(p));
    if (embedded) {
      const questionPart = getTextBeforeEmbeddedOptions(getFullTextContent(p));
      if (questionPart) {
        st.currentQuestion += "\n" + questionPart;
      }
      st.currentOptions = embedded;
      finalize(st);
      return;
    }

    st.currentQuestion += "\n" + text;
  }
}

function handleInOptions(
  p: ParsedParagraph,
  st: AssemblerState,
  imageToken: string,
): void {
  if (isQuestionParagraph(p)) {
    finalize(st);
    startQuestion(p, st, imageToken);
    return;
  }

  if (isOptionParagraph(p)) {
    collectOptions(p, st, imageToken);
    return;
  }

  if (isContentParagraph(p) && !isOptionParagraph(p)) {
    finalize(st);
    startUnnumberedQuestion(p, st, imageToken);
    return;
  }

  const text = getParagraphText(p, imageToken);
  if (text.trim().length > 0 && st.currentOptions.length > 0) {
    const lastIdx = st.currentOptions.length - 1;
    st.currentOptions[lastIdx] = st.currentOptions[lastIdx]! + " " + text;
  }
}

function collectOptions(
  p: ParsedParagraph,
  st: AssemblerState,
  imageToken: string,
): void {
  if (hasMultipleOptionMarkers(p)) {
    const parsed = parseMultiOptionNodes(p.nodes, imageToken);
    st.currentOptions.push(...parsed);
  } else {
    const optText = getOptionText(p, imageToken);
    st.currentOptions.push(optText);
  }
}

function handleTable(
  elem: BodyElement & { type: "table" },
  st: AssemblerState,
  imageToken: string,
  warnings: ConversionWarning[],
  _options: ConvertOptions,
): void {
  const classification = classifyTable(elem.table);

  switch (classification) {
    case "option": {
      const optionCells = flattenOptionTable(elem.table);
      const opts = optionCells.map((cell) => getOptionText(cell, imageToken));
      st.currentOptions = opts;
      if (st.state === "QUESTION" || st.state === "OPTIONS") {
        finalize(st);
      }
      break;
    }
    case "layout": {
      for (const row of elem.table.rows) {
        for (const cell of row) {
          const text = getFullTextContent(cell);
          if (text.trim().length > 0) {
            handleParagraph(cell, st, imageToken, warnings);
          }
        }
      }
      break;
    }
    case "data": {
      if (st.state === "QUESTION") {
        const tableText = renderDataTable(elem.table, imageToken);
        st.currentQuestion += "\n" + tableText;
      }
      break;
    }
  }
}

function startQuestion(
  p: ParsedParagraph,
  st: AssemblerState,
  imageToken: string,
): void {
  const rawText = getParagraphText(p, imageToken);
  const text = stripQuestionNumber(rawText);

  const embedded = tryExtractEmbeddedOptions(text);
  if (embedded) {
    const questionPart = getTextBeforeEmbeddedOptions(text);
    st.currentQuestion = questionPart ?? text;
    st.currentOptions = embedded;
    st.state = "QUESTION";
    finalize(st);
    return;
  }

  st.currentQuestion = text;
  st.currentOptions = [];
  st.state = "QUESTION";
}

function startUnnumberedQuestion(
  p: ParsedParagraph,
  st: AssemblerState,
  imageToken: string,
): void {
  const text = getParagraphText(p, imageToken);

  const embedded = tryExtractEmbeddedOptions(text);
  if (embedded) {
    const questionPart = getTextBeforeEmbeddedOptions(text);
    st.currentQuestion = questionPart ?? text;
    st.currentOptions = embedded;
    st.state = "QUESTION";
    finalize(st);
    return;
  }

  st.currentQuestion = text;
  st.currentOptions = [];
  st.state = "QUESTION";
}

function finalize(st: AssemblerState): void {
  if (st.currentQuestion.trim().length > 0) {
    st.questions.push({
      question: st.currentQuestion.trim(),
      options: st.currentOptions
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
    });
  }
  st.currentQuestion = "";
  st.currentOptions = [];
  st.state = "IDLE";
}

function renderDataTable(
  table: { rows: ParsedParagraph[][] },
  imageToken: string,
): string {
  const rows = table.rows.map((row) =>
    row.map((cell) => getParagraphText(cell, imageToken)).join(" | "),
  );
  return rows.join("\n");
}
