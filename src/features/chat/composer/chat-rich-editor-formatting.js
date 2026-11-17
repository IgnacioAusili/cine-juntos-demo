import { RICH_EDITOR_CARET_MARKER } from "./chat-rich-editor-constants.js";
import { buildTextModel, createRangeAtOffsets, findPointIndex, getElementTextSpan, getRichEditorRange, getRichEditorSelection, setRichEditorSelection } from "./chat-rich-editor-selection.js";
import { createFormatElement } from "./chat-rich-editor-format-elements.js";

export function applyRichEditorFormat(editor, format, url = "", savedRange = null) {
  const range = savedRange?.cloneRange() || getRichEditorRange(editor);
  if (!range || range.collapsed || !range.toString()) return false;

  if (format !== "link") {
    const selection = getRichEditorSelection(editor, range);
    if (selectionHasRichFormat(editor, format, selection)) {
      removeRichEditorFormat(editor, format, selection);
      setRichEditorSelection(editor, selection.start, selection.end);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
  }

  const element = createFormatElement(editor.ownerDocument, format, url);
  if (!element) return false;
  const selectedContents = range.extractContents();
  unwrapRichFormat(selectedContents, `[data-chat-format="${format}"]`);
  element.append(selectedContents);
  range.insertNode(element);
  setCaretAfterRichFormat(range, element);
  const selection = editor.ownerDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function selectionHasRichFormat(editor, format, selection) {
  if (selection.start >= selection.end) return false;
  const selector = `[data-chat-format="${format}"]`;
  const model = buildTextModel(editor);
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let hasSelectedText = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeStart = findPointIndex(model, node, 0);
    const nodeEnd = findPointIndex(model, node, node.nodeValue.length);
    if (Math.min(selection.end, nodeEnd) <= Math.max(selection.start, nodeStart)) continue;
    hasSelectedText = true;
    if (!node.parentElement?.closest(selector)) return false;
  }

  return hasSelectedText;
}

function removeRichEditorFormat(editor, format, selection) {
  const selector = `[data-chat-format="${format}"]`;
  const model = buildTextModel(editor);
  const formatElements = [...editor.querySelectorAll(selector)]
    .filter((element) => !element.parentElement?.closest(selector))
    .map((element) => ({ element, span: getElementTextSpan(model, element) }))
    .filter(({ span }) => span && span.start < selection.end && selection.start < span.end);

  formatElements.forEach(({ element, span }) => {
    const start = Math.max(selection.start, span.start);
    const end = Math.min(selection.end, span.end);
    const currentModel = buildTextModel(editor);
    const selectedRange = createRangeAtOffsets(editor, currentModel, start, end);
    const prefixRange = editor.ownerDocument.createRange();
    prefixRange.selectNodeContents(element);
    prefixRange.setEnd(selectedRange.startContainer, selectedRange.startOffset);
    const suffixRange = editor.ownerDocument.createRange();
    suffixRange.selectNodeContents(element);
    suffixRange.setStart(selectedRange.endContainer, selectedRange.endOffset);
    const prefix = prefixRange.cloneContents();
    const selected = selectedRange.cloneContents();
    const suffix = suffixRange.cloneContents();
    unwrapRichFormat(selected, selector);

    const parent = element.parentNode;
    if (hasRichEditorContent(prefix)) {
      const prefixElement = element.cloneNode(false);
      prefixElement.append(prefix);
      parent.insertBefore(prefixElement, element);
    }
    parent.insertBefore(selected, element);
    if (hasRichEditorContent(suffix)) {
      const suffixElement = element.cloneNode(false);
      suffixElement.append(suffix);
      parent.insertBefore(suffixElement, element);
    }
    element.remove();
  });
}

export function normalizeEmptyRichEditorFormats(editor) {
  editor.querySelectorAll("[data-chat-format]").forEach((element) => {
    if (!element.textContent && !element.querySelector("br")) element.remove();
  });
}

function unwrapRichFormat(root, selector) {
  [...root.querySelectorAll(selector)].reverse().forEach((element) => {
    const parent = element.parentNode;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    element.remove();
  });
}

function hasRichEditorContent(root) {
  return [...root.childNodes].some((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue.replaceAll(RICH_EDITOR_CARET_MARKER, "").length > 0;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    return node.tagName === "BR" || hasRichEditorContent(node);
  });
}

function setCaretAfterRichFormat(range, element) {
  const boundary = element.ownerDocument.createElement("span");
  boundary.dataset.richEditorPlainBoundary = "true";
  const text = element.ownerDocument.createTextNode(RICH_EDITOR_CARET_MARKER);
  boundary.append(text);
  const parent = element.parentNode;
  parent.insertBefore(boundary, element.nextSibling);
  // Dejar el cursor en el límite del editor evita que el navegador continúe
  // escribiendo dentro del último formato inline aplicado.
  range.setStart(parent, [...parent.childNodes].indexOf(boundary) + 1);
  range.collapse(true);
  return boundary;
}
