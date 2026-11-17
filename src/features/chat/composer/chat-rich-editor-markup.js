import { BLOCK_TAGS, RICH_FORMAT_MARKERS, RICH_EDITOR_CARET_MARKER, TYPED_MARKUP_FORMATS } from "./chat-rich-editor-constants.js";
import { parseInlineFormatting } from "../inline-formatting-markup.js";
import { normalizeEmptyRichEditorFormats, applyRichEditorFormat } from "./chat-rich-editor-formatting.js";
import { normalizeRichEditorLink } from "./chat-rich-editor-links.js";
import { replaceRichEditorSelection } from "./chat-rich-editor-editing.js";
import { buildTextModel, getRichEditorSelection, setRichEditorSelection } from "./chat-rich-editor-selection.js";
import { createFormatElement } from "./chat-rich-editor-format-elements.js";
import { isEmptyRichBoundary } from "./chat-rich-editor-quotes.js";

export function serializeRichEditor(editor) {
  if (!editor) return "";
  return serializeChildren(editor).replace(/\n+$/g, "");
}

export function renderRichEditor(editor, value) {
  if (!editor) return;
  editor.replaceChildren();
  appendMarkup(editor, String(value || ""));
}

export function normalizeRichEditorMarkup(editor) {
  if (!editor) return false;
  normalizeEmptyRichEditorFormats(editor);
  const selection = getRichEditorSelection(editor);
  if (selection.start !== selection.end) return false;

  const model = buildTextModel(editor);
  const textBeforeCaret = model.text.slice(0, selection.start);
  for (const { format, pattern } of TYPED_MARKUP_FORMATS) {
    const match = pattern.exec(textBeforeCaret);
    if (!match) continue;

    const markupStart = selection.start - match[0].length;
    const url = format === "link" ? normalizeRichEditorLink(match[2]) : "";
    if (format === "link" && !url) continue;
    replaceRichEditorSelection(editor, match[1], markupStart, selection.end);
    setRichEditorSelection(editor, markupStart, markupStart + match[1].length);
    applyRichEditorFormat(editor, format, url);
    return true;
  }
  return false;
}

function appendMarkup(container, text, depth = 0) {
  if (depth > 8) {
    container.append(container.ownerDocument.createTextNode(text));
    return;
  }
  appendMarkupNodes(container, parseInlineFormatting(text), depth);
}

function appendMarkupNodes(container, nodes, depth) {
  nodes.forEach((node) => {
    if (node.type === "text") {
      container.append(container.ownerDocument.createTextNode(node.value));
      return;
    }
    const element = createFormatElement(container.ownerDocument, node.format, node.url);
    if (!element) {
      container.append(container.ownerDocument.createTextNode(node.value || ""));
      return;
    }
    appendMarkupNodes(element, node.children, depth + 1);
    container.append(element);
  });
}

function serializeChildren(parent) {
  let result = "";
  const children = [...parent.childNodes];
  let index = 0;
  while (index < children.length) {
    const node = children[index];
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.nodeValue;
      index += 1;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      index += 1;
      continue;
    }
    if (node.tagName === "BR") {
      result += "\n";
      index += 1;
      continue;
    }

    const formatRun = collectRichFormatRun(children, index);
    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock && result && !result.endsWith("\n")) result += "\n";
    if (formatRun) {
      const content = formatRun.elements.map((element) => serializeChildren(element)).join("");
      result += serializeRichFormat(formatRun.format, formatRun.elements[0], content);
      index = formatRun.nextIndex;
    } else {
      result += serializeElement(node);
      index += 1;
    }
    if (isBlock && index < children.length && !result.endsWith("\n")) result += "\n";
  }
  return result;
}

function serializeElement(element) {
  const content = serializeChildren(element);
  if (element.dataset.richEditorPlainBoundary === "true") {
    return content.replaceAll(RICH_EDITOR_CARET_MARKER, "");
  }
  const format = element.dataset.chatFormat;
  if (format && !element.textContent && !element.querySelector("br")) return "";
  return serializeRichFormat(format, element, content);
}

function collectRichFormatRun(children, start) {
  const first = children[start];
  const format = first?.dataset?.chatFormat;
  if (!format || (!RICH_FORMAT_MARKERS[format] && format !== "link")) return null;
  const elements = [first];
  let index = start + 1;

  while (index < children.length) {
    let candidateIndex = index;
    while (candidateIndex < children.length && isEmptyRichBoundary(children[candidateIndex])) candidateIndex += 1;
    const candidate = children[candidateIndex];
    if (
      candidate?.dataset?.chatFormat !== format
      || (format === "link" && candidate.href !== first.href)
    ) break;
    elements.push(candidate);
    index = candidateIndex + 1;
  }

  return elements.length > 1 ? { format, elements, nextIndex: index } : null;
}

function serializeRichFormat(format, element, content) {
  const wrappers = RICH_FORMAT_MARKERS[format];
  if (wrappers) return `${wrappers[0]}${content}${wrappers[1]}`;
  if (format === "link") return `[${content}](${element.href})`;
  return content;
}
