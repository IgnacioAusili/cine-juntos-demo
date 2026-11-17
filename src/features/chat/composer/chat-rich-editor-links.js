import { AUTO_LINK_PATTERN, RICH_EDITOR_CARET_MARKER } from "./chat-rich-editor-constants.js";
import { createRangeAtOffsets, buildTextModel, getRichEditorRange, getRichEditorSelection, setRichEditorRange } from "./chat-rich-editor-selection.js";
import { getCaretBoundaryAfter } from "./chat-rich-editor-quotes.js";
import { createFormatElement } from "./chat-rich-editor-format-elements.js";

export function getRichEditorLinkForRange(editor, range) {
  if (!editor || !range || range.collapsed) return null;
  const startLink = getRichEditorLinkFromNode(range.startContainer);
  const endLink = getRichEditorLinkFromNode(range.endContainer);
  return startLink && startLink === endLink && editor.contains(startLink) ? startLink : null;
}

export function normalizeRichEditorAutolinks(editor, { placeCaretOutside = false } = {}) {
  const range = getRichEditorRange(editor);
  if (!range?.collapsed) return false;

  const activeLink = getRichEditorLinkFromNode(range.startContainer);
  if (activeLink?.dataset.chatAutolink === "true") {
    return normalizeAutoLinkAtCaret(editor, activeLink, range, placeCaretOutside);
  }
  if (activeLink) return false;

  if (appendTextToAdjacentAutoLink(editor, range)) return true;

  const context = getRichEditorTextNodeAtCaret(range);
  if (!context || context.node.parentElement?.closest("a[data-chat-format='link']")) return false;
  const text = context.node.nodeValue;
  const matches = [...text.matchAll(AUTO_LINK_PATTERN)];
  const candidate = findAutoLinkCandidate(text, matches, context.offset, placeCaretOutside);
  if (!candidate) return false;

  const urlText = candidate[0];
  const delimiterFollows = /\s/.test(text[candidate.index + urlText.length] || "");
  const punctuation = delimiterFollows || placeCaretOutside
    ? getTrailingUrlPunctuation(urlText)
    : "";
  const linkedText = punctuation ? urlText.slice(0, -punctuation.length) : urlText;
  const href = normalizeRichEditorLink(linkedText);
  if (!href) return false;

  const start = candidate.index;
  const end = start + linkedText.length;
  const savedSelection = getRichEditorSelection(editor, range);
  const urlRange = editor.ownerDocument.createRange();
  urlRange.setStart(context.node, start);
  urlRange.setEnd(context.node, end);
  const element = createFormatElement(editor.ownerDocument, "link", href);
  if (!element) return false;
  element.dataset.chatAutolink = "true";
  element.append(urlRange.extractContents());
  urlRange.insertNode(element);
  getCaretBoundaryAfter(element);

  if (placeCaretOutside || context.offset > end) {
    forceSetRichEditorSelection(editor, savedSelection.start);
  } else if (context.offset >= start) {
    setRichEditorCaretInsideElement(editor, element, context.offset - start);
  }
  return true;
}

function appendTextToAdjacentAutoLink(editor, range) {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;

  const boundary = node.parentElement?.dataset.richEditorPlainBoundary === "true"
    ? node.parentElement
    : null;
  const link = (boundary ? boundary.previousSibling : node.previousSibling);
  if (link?.nodeType !== Node.ELEMENT_NODE || link.tagName !== "A" || link.dataset.chatAutolink !== "true") return false;

  const markerLength = boundary && node.nodeValue.startsWith(RICH_EDITOR_CARET_MARKER)
    ? RICH_EDITOR_CARET_MARKER.length
    : 0;
  const insertedText = node.nodeValue.slice(markerLength, range.startOffset);
  if (!insertedText || /\s/.test(insertedText)) return false;

  const nextLabel = `${link.textContent}${insertedText}`;
  const href = normalizeRichEditorLink(nextLabel);
  if (!href) return false;

  const labelNode = editor.ownerDocument.createTextNode(insertedText);
  link.append(labelNode);
  node.deleteData(markerLength, insertedText.length);
  if (!node.nodeValue && !boundary) node.remove();
  link.href = href;
  setRichEditorCaretAtTextNode(labelNode, labelNode.length);
  return true;
}

function findAutoLinkCandidate(text, matches, caretOffset, forceLastUrl) {
  const candidates = matches.map((match) => ({
    match,
    start: match.index,
    end: match.index + match[0].length,
  }));
  const containingCaret = candidates.filter(({ start, end }) => start <= caretOffset && caretOffset <= end).at(-1);
  if (containingCaret) return containingCaret.match;

  const beforeCaret = candidates.filter(({ end }) => (
    end <= caretOffset && /^\s+$/.test(text.slice(end, caretOffset))
  )).at(-1);
  if (beforeCaret) return beforeCaret.match;

  const followedByTextBoundary = candidates.filter(({ end }) => /\s/.test(text[end] || "")).at(-1);
  if (followedByTextBoundary) return followedByTextBoundary.match;

  return forceLastUrl ? candidates.at(-1)?.match || null : null;
}

function normalizeAutoLinkAtCaret(editor, link, range, placeCaretOutside) {
  const rawText = link.textContent || "";
  const caretOffset = getCaretOffsetWithinElement(link, range);
  const whitespaceIndex = rawText.search(/\s/);
  let linkedText = whitespaceIndex < 0 ? rawText : rawText.slice(0, whitespaceIndex);
  let suffix = whitespaceIndex < 0 ? "" : rawText.slice(whitespaceIndex);
  const punctuation = whitespaceIndex >= 0 || placeCaretOutside
    ? getTrailingUrlPunctuation(linkedText)
    : "";
  if (punctuation) {
    linkedText = linkedText.slice(0, -punctuation.length);
    suffix = `${punctuation}${suffix}`;
  }

  const href = normalizeRichEditorLink(linkedText);
  if (!href) {
    const text = editor.ownerDocument.createTextNode(rawText);
    link.replaceWith(text);
    setRichEditorCaretAtTextNode(text, Math.min(caretOffset, rawText.length));
    return true;
  }

  const hrefChanged = link.href !== href;
  if (linkedText !== rawText) {
    link.textContent = linkedText;
    link.href = href;
    if (suffix) {
      const suffixNode = editor.ownerDocument.createTextNode(suffix);
      link.parentNode.insertBefore(suffixNode, link.nextSibling);
      if (caretOffset > linkedText.length || placeCaretOutside) {
        setRichEditorCaretAtTextNode(suffixNode, Math.min(suffix.length, Math.max(0, caretOffset - linkedText.length)));
      } else {
        setRichEditorCaretInsideElement(editor, link, caretOffset);
      }
    } else {
      setRichEditorCaretAtElementBoundary(editor, link);
    }
    return true;
  }

  link.href = href;
  if (placeCaretOutside) {
    setRichEditorCaretAtElementBoundary(editor, link);
    return true;
  }
  return hrefChanged;
}

function getRichEditorLinkFromNode(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return element?.closest("a[data-chat-format='link']") || null;
}

function getRichEditorTextNodeAtCaret(range) {
  const node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) return { node, offset: range.startOffset };
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const before = getLastTextNode(node.childNodes[range.startOffset - 1]);
  if (before) return { node: before, offset: before.nodeValue.length };
  const after = getFirstTextNode(node.childNodes[range.startOffset]);
  return after ? { node: after, offset: 0 } : null;
}

function getLastTextNode(node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return node;
  for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
    const text = getLastTextNode(node.childNodes[index]);
    if (text) return text;
  }
  return null;
}

function getFirstTextNode(node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return node;
  for (const child of node.childNodes) {
    const text = getFirstTextNode(child);
    if (text) return text;
  }
  return null;
}

function getCaretOffsetWithinElement(element, range) {
  const prefix = range.cloneRange();
  prefix.selectNodeContents(element);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
}

function getTrailingUrlPunctuation(text) {
  return text.match(/[.,!?;:)}\]]+$/)?.[0] || "";
}

function setRichEditorCaretInsideElement(editor, element, offset) {
  const text = getFirstTextNode(element);
  if (!text) return;
  setRichEditorCaretAtTextNode(text, Math.max(0, Math.min(text.nodeValue.length, offset)));
}

function setRichEditorCaretAtTextNode(node, offset) {
  const range = node.ownerDocument.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = node.ownerDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function setRichEditorCaretAtElementBoundary(editor, element) {
  const boundary = getCaretBoundaryAfter(element);
  setRichEditorCaretAtTextNode(boundary.node, boundary.offset);
}

function forceSetRichEditorSelection(editor, offset) {
  const model = buildTextModel(editor);
  setRichEditorRange(editor, createRangeAtOffsets(editor, model, offset, offset));
}

export function normalizeRichEditorLink(value) {
  try {
    const entered = String(value || "").trim();
    const url = new URL(/^https?:\/\//i.test(entered) ? entered : `https://${entered}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
