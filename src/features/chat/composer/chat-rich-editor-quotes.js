import { RICH_EDITOR_CARET_MARKER } from "./chat-rich-editor-constants.js";
import { buildTextModel, getElementTextSpan, getRichEditorRange, getRichEditorSelection, setRichEditorSelection } from "./chat-rich-editor-selection.js";

function getQuoteContainingCaret(editor, range) {
  const caretNode = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const quote = caretNode?.closest('[data-chat-format="quote"]');
  return quote && editor.contains(quote) ? quote : null;
}

export function getCaretBoundaryAfter(element) {
  let sibling = element.nextSibling;
  while (sibling?.nodeType === Node.TEXT_NODE && !sibling.nodeValue) sibling = sibling.nextSibling;

  if (sibling?.nodeType === Node.TEXT_NODE) return { node: sibling, offset: 0 };
  if (sibling?.dataset?.richEditorPlainBoundary === "true") {
    let text = sibling.firstChild;
    if (text?.nodeType !== Node.TEXT_NODE) {
      text = element.ownerDocument.createTextNode(RICH_EDITOR_CARET_MARKER);
      sibling.prepend(text);
    }
    return { node: text, offset: ensureRichEditorCaretMarker(text) };
  }

  const boundary = element.ownerDocument.createElement("span");
  boundary.dataset.richEditorPlainBoundary = "true";
  const text = element.ownerDocument.createTextNode(RICH_EDITOR_CARET_MARKER);
  boundary.append(text);
  element.parentNode.insertBefore(boundary, sibling);
  return { node: text, offset: 1 };
}

function getCaretBoundaryBefore(element) {
  let sibling = element.previousSibling;
  while (sibling?.nodeType === Node.TEXT_NODE && !sibling.nodeValue) sibling = sibling.previousSibling;

  if (sibling?.nodeType === Node.TEXT_NODE) return { node: sibling, offset: sibling.nodeValue.length };
  if (sibling?.dataset?.richEditorPlainBoundary === "true") {
    let text = sibling.lastChild;
    if (text?.nodeType !== Node.TEXT_NODE) {
      text = element.ownerDocument.createTextNode(RICH_EDITOR_CARET_MARKER);
      sibling.append(text);
    }
    ensureRichEditorCaretMarker(text);
    return { node: text, offset: text.nodeValue.length };
  }

  const boundary = element.ownerDocument.createElement("span");
  boundary.dataset.richEditorPlainBoundary = "true";
  const text = element.ownerDocument.createTextNode(RICH_EDITOR_CARET_MARKER);
  boundary.append(text);
  element.parentNode.insertBefore(boundary, element);
  return { node: text, offset: 1 };
}

function ensureRichEditorCaretMarker(text) {
  const markerIndex = text.nodeValue.indexOf(RICH_EDITOR_CARET_MARKER);
  if (markerIndex >= 0) return markerIndex + RICH_EDITOR_CARET_MARKER.length;
  text.insertData(0, RICH_EDITOR_CARET_MARKER);
  return RICH_EDITOR_CARET_MARKER.length;
}

function setRichEditorCaretAtQuoteBoundary(editor, quote, direction) {
  const boundary = direction === "backward"
    ? getCaretBoundaryBefore(quote)
    : getCaretBoundaryAfter(quote);
  const nextRange = editor.ownerDocument.createRange();
  nextRange.setStart(boundary.node, boundary.offset);
  nextRange.collapse(true);
  const selection = editor.ownerDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

export function moveRichEditorCaretOutsideQuoteAtPoint(editor, x, y) {
  const range = getRichEditorRange(editor);
  if (!range?.collapsed) return false;
  const quote = getQuoteContainingCaret(editor, range);
  if (!quote) return false;

  const rect = quote.getBoundingClientRect();
  const pointIsInsideQuote = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  if (pointIsInsideQuote) return false;

  const direction = x < rect.left + rect.width / 2 ? "backward" : "forward";
  setRichEditorCaretAtQuoteBoundary(editor, quote, direction);
  return true;
}

export function moveRichEditorCaretOutOfQuote(editor, direction = "forward") {
  const range = getRichEditorRange(editor);
  if (!range?.collapsed) return false;
  const quote = getQuoteContainingCaret(editor, range);
  if (!quote) return false;

  const model = buildTextModel(editor);
  const span = getElementTextSpan(model, quote);
  const caret = getRichEditorSelection(editor, range).start;
  const atQuoteBoundary = direction === "backward" ? caret === span?.start : caret === span?.end;
  if (!span || !atQuoteBoundary) return false;

  setRichEditorCaretAtQuoteBoundary(editor, quote, direction);
  return true;
}

export function deleteAdjacentQuote(editor, direction, range) {
  if (!range?.collapsed) return false;
  const caret = getRichEditorSelection(editor, range).start;
  const model = buildTextModel(editor);
  const quote = [...editor.querySelectorAll('[data-chat-format="quote"]')].find((element) => {
    if (element.contains(range.startContainer)) return false;
    const span = getElementTextSpan(model, element);
    return direction === "backward" ? span?.end === caret : span?.start === caret;
  });
  if (!quote) return false;

  const quoteStart = getElementTextSpan(model, quote).start;
  const nextSibling = quote.nextSibling;
  quote.remove();
  if (isEmptyRichBoundary(nextSibling)) nextSibling.remove();
  setRichEditorSelection(editor, quoteStart);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

export function isEmptyRichBoundary(node) {
  if (node?.nodeType === Node.TEXT_NODE) return node.nodeValue.length === 0;
  return node?.nodeType === Node.ELEMENT_NODE
    && node.dataset.richEditorPlainBoundary === "true"
    && !node.textContent.replaceAll(RICH_EDITOR_CARET_MARKER, "")
    && !node.querySelector("br");
}
