import { buildTextModel, findPointIndex } from "./chat-rich-editor-selection.js";
import { handleRichEditorLinkClick } from "../messages/chat-link-confirmation.js";
import { getLeadingTimecodeSeconds, getValidVideoTimecodeMatches, seekVideoToSeconds } from "../messages/chat-timecode-links.js";
import { parseInlineFormatting } from "../inline-formatting-markup.js";
import { refreshTooltipForTarget } from "../../icons-tooltips.js";

const BLOCK_TAGS = new Set(["DIV", "P"]);
const RICH_FORMAT_MARKERS = {
  quote: ["❝", "❞"],
  bold: ["**", "**"],
  italic: ["*", "*"],
  monospace: ["`", "`"],
  underline: ["__", "__"],
  strike: ["~~", "~~"],
  spoiler: ["||", "||"],
};
const RICH_EDITOR_CARET_MARKER = "\u200B";
const AUTO_LINK_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const installedEditors = new WeakSet();
const TYPED_MARKUP_FORMATS = [
  { format: "quote", pattern: /❝([^❝❞\n]+)❞$/ },
  { format: "quote", pattern: /‘([^‘’\n]+)’$/ },
  { format: "quote", pattern: /“([^“”\n]+)”$/ },
  { format: "bold", pattern: /\*\*([^*\n]+)\*\*$/ },
  { format: "italic", pattern: /\*([^*\n]+)\*$/ },
  { format: "italic", pattern: /_([^_\n]+)_$/ },
  { format: "monospace", pattern: /`([^`\n]+)`$/ },
  { format: "underline", pattern: /__([^_\n]+)__$/ },
  { format: "strike", pattern: /~~([^~\n]+)~~$/ },
  { format: "spoiler", pattern: /\|\|([^|\n]+)\|\|$/ },
  { format: "link", pattern: /\[([^\]\n]+)\]\(((?:https?:\/\/)?[^\s)]+)\)$/ },
];

export function installRichEditor(editor) {
  if (!editor || installedEditors.has(editor)) return editor;
  installedEditors.add(editor);
  editor.dataset.richEditorReady = "true";
  editor.setAttribute("contenteditable", "true");

  Object.defineProperties(editor, {
    value: {
      configurable: true,
      get: () => serializeRichEditor(editor),
      set: (value) => {
        renderRichEditor(editor, String(value ?? ""));
      },
    },
    selectionStart: {
      configurable: true,
      get: () => getRichEditorSelection(editor).start,
    },
    selectionEnd: {
      configurable: true,
      get: () => getRichEditorSelection(editor).end,
    },
  });

  editor.setSelectionRange = (start, end = start) => setRichEditorSelection(editor, start, end);
  editor.setRangeText = (replacement, start = editor.selectionStart, end = editor.selectionEnd) => {
    replaceRichEditorSelection(editor, replacement, start, end);
  };
  editor.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const timecode = target?.closest('[data-chat-timecode="true"]');
    if (timecode && editor.contains(timecode) && (event.ctrlKey || event.metaKey)) {
      const seconds = getLeadingTimecodeSeconds(timecode.textContent);
      if (seconds !== null) {
        event.preventDefault();
        seekVideoToSeconds(seconds);
      }
      return;
    }
    moveRichEditorCaretOutsideQuoteAtPoint(editor, event.clientX, event.clientY);
    const spoiler = target?.closest("[data-chat-format='spoiler']");
    if (spoiler && editor.contains(spoiler)) {
      const revealed = spoiler.classList.toggle("chat-rich-editor__spoiler--revealed");
      spoiler.dataset.tooltip = revealed ? "Ocultar spoiler" : "Mostrar spoiler";
      refreshTooltipForTarget(spoiler);
    }
    const link = target?.closest("a[data-chat-format='link']");
    if (link && editor.contains(link)) {
      if (event.ctrlKey || event.metaKey) handleRichEditorLinkClick(event, link);
      else event.preventDefault();
    }
  });
  return editor;
}

export function serializeRichEditor(editor) {
  if (!editor) return "";
  return serializeChildren(editor).replace(/\n+$/g, "");
}

export function renderRichEditor(editor, value) {
  if (!editor) return;
  editor.replaceChildren();
  appendMarkup(editor, String(value || ""));
}

export function getRichEditorTextLength(editor) {
  return buildTextModel(editor).text.length;
}

export function getRichEditorSelection(editor, savedRange = null) {
  const selection = editor?.ownerDocument.getSelection();
  const range = savedRange || (selection?.rangeCount ? selection.getRangeAt(0) : null);
  if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    const end = getRichEditorTextLength(editor);
    return { start: end, end };
  }
  const model = buildTextModel(editor);
  const start = findPointIndex(model, range.startContainer, range.startOffset);
  const end = findPointIndex(model, range.endContainer, range.endOffset);
  return { start, end };
}

export function setRichEditorSelection(editor, start, end = start) {
  if (!editor) return;
  const model = buildTextModel(editor);
  const selection = editor.ownerDocument.getSelection();
  const clamp = (offset) => Math.max(0, Math.min(model.text.length, Number(offset) || 0));
  const startOffset = clamp(start);
  const endOffset = clamp(end);
  const currentRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (
    startOffset === endOffset
    && currentRange?.collapsed
    && editor.contains(currentRange.startContainer)
    && findPointIndex(model, currentRange.startContainer, currentRange.startOffset) === startOffset
  ) return;

  const range = createRangeAtOffsets(editor, model, startOffset, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function getRichEditorRange(editor) {
  const selection = editor?.ownerDocument.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  return range.cloneRange();
}

export function getRichEditorLinkForRange(editor, range) {
  if (!editor || !range || range.collapsed) return null;
  const startLink = getRichEditorLinkFromNode(range.startContainer);
  const endLink = getRichEditorLinkFromNode(range.endContainer);
  return startLink && startLink === endLink && editor.contains(startLink) ? startLink : null;
}

export function getRichEditorRangeAtPoint(editor, x, y) {
  if (!editor) return null;
  const documentRef = editor.ownerDocument;
  const caret = documentRef.caretPositionFromPoint?.(x, y);
  if (caret && (caret.offsetNode === editor || editor.contains(caret.offsetNode))) {
    const range = documentRef.createRange();
    range.setStart(caret.offsetNode, caret.offset);
    range.collapse(true);
    return range;
  }

  const range = documentRef.caretRangeFromPoint?.(x, y);
  if (!range || !editor.contains(range.startContainer)) return null;
  return range.cloneRange();
}

export function setRichEditorRange(editor, range) {
  if (!editor || !range) return;
  const selection = editor.ownerDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(range.cloneRange());
}

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

export function normalizeRichEditorTimecodes(editor) {
  if (!editor) return false;
  const hasEditorSelection = Boolean(getRichEditorRange(editor));
  const selection = hasEditorSelection ? getRichEditorSelection(editor) : null;
  let changed = false;

  editor.querySelectorAll('[data-chat-timecode="true"]').forEach((timecode) => {
    const text = timecode.textContent || "";
    const matches = getValidVideoTimecodeMatches(text);
    const isValidWholeTimecode = matches.length === 1
      && matches[0].index === 0
      && matches[0].end === text.length;
    if (isValidWholeTimecode) return;
    timecode.replaceWith(editor.ownerDocument.createTextNode(text));
    changed = true;
  });

  const updates = [];
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('a, code, [data-chat-timecode="true"]')) continue;
    const plainText = node.nodeValue.replaceAll(RICH_EDITOR_CARET_MARKER, "");
    const matches = getValidVideoTimecodeMatches(plainText);
    if (matches.length) updates.push({ node, matches });
  }

  updates.forEach(({ node, matches }) => {
    [...matches].reverse().forEach((match) => {
      const range = editor.ownerDocument.createRange();
      range.setStart(node, getRawTextOffset(node.nodeValue, match.index));
      range.setEnd(node, getRawTextOffset(node.nodeValue, match.end, "end"));
      const chip = editor.ownerDocument.createElement("span");
      chip.className = "chat-rich-editor__timecode message__video-ts message__video-ts--inline";
      chip.dataset.chatTimecode = "true";
      chip.dataset.tooltip = `Ir al minuto ${match.label} del video`;
      chip.setAttribute("aria-label", `Saltar a ${match.label} en el video`);
      const visual = editor.ownerDocument.createElement("span");
      visual.className = "message-video-ts__visual";
      const icon = editor.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("width", "8");
      icon.setAttribute("height", "8");
      icon.setAttribute("fill", "currentColor");
      icon.setAttribute("aria-hidden", "true");
      const triangle = editor.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "polygon");
      triangle.setAttribute("points", "5,3 19,12 5,21");
      icon.append(triangle);
      const time = editor.ownerDocument.createElement("span");
      time.className = "message-video-ts__time";
      time.append(range.extractContents());
      visual.append(icon, time);
      chip.append(visual);
      range.insertNode(chip);
      changed = true;
    });
  });

  if (changed && selection) setRichEditorSelection(editor, selection.start, selection.end);
  return changed;
}

function getRawTextOffset(text, visibleOffset, bias = "start") {
  let visibleIndex = 0;
  for (let rawIndex = 0; rawIndex < text.length; rawIndex += 1) {
    if (text[rawIndex] === RICH_EDITOR_CARET_MARKER) {
      if (bias === "end" && visibleIndex === visibleOffset) return rawIndex;
      continue;
    }
    if (visibleIndex === visibleOffset) return rawIndex;
    visibleIndex += 1;
  }
  return text.length;
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

function normalizeRichEditorLink(value) {
  try {
    const entered = String(value || "").trim();
    const url = new URL(/^https?:\/\//i.test(entered) ? entered : `https://${entered}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
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

function getElementTextSpan(model, element) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let start = Infinity;
  let end = -Infinity;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    start = Math.min(start, findPointIndex(model, node, 0));
    end = Math.max(end, findPointIndex(model, node, node.nodeValue.length));
  }
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

function normalizeEmptyRichEditorFormats(editor) {
  editor.querySelectorAll("[data-chat-format]").forEach((element) => {
    if (!element.textContent && !element.querySelector("br")) element.remove();
  });
}

function getQuoteContainingCaret(editor, range) {
  const caretNode = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const quote = caretNode?.closest('[data-chat-format="quote"]');
  return quote && editor.contains(quote) ? quote : null;
}

function getCaretBoundaryAfter(element) {
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

function deleteAdjacentQuote(editor, direction, range) {
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

function createRangeAtOffsets(editor, model, start, end) {
  const clamp = (offset) => Math.max(0, Math.min(model.text.length, Number(offset) || 0));
  const startPoint = model.points[clamp(start)];
  const endPoint = model.points[clamp(end)];
  const range = editor.ownerDocument.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

export function replaceRichEditorSelection(editor, text, start, end) {
  if (!editor) return;
  setRichEditorSelection(editor, start, end);
  const range = getRichEditorRange(editor);
  if (!range) return;
  const textNode = editor.ownerDocument.createTextNode(String(text || ""));
  range.deleteContents();
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  const selection = editor.ownerDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function replaceRichEditorRangeText(editor, text, savedRange = null) {
  const range = savedRange?.cloneRange() || getRichEditorRange(editor);
  if (!editor || !range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return false;
  range.deleteContents();
  const textNode = editor.ownerDocument.createTextNode(String(text || ""));
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  setRichEditorRange(editor, range);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

export function insertRichEditorText(editor, text, savedSelection = null) {
  const { start, end } = savedSelection || getRichEditorSelection(editor);
  replaceRichEditorSelection(editor, text, start, end);
  editor?.dispatchEvent(new Event("input", { bubbles: true }));
}

export function deleteRichEditorForward(editor) {
  if (!editor) return false;
  const range = getRichEditorRange(editor);
  const { start, end } = getRichEditorSelection(editor);
  if (start === end && deleteAdjacentQuote(editor, "forward", range)) return true;
  let deleteEnd = end;

  if (start === end) {
    deleteEnd = getNextGraphemeEnd(buildTextModel(editor).text, start);
    if (deleteEnd === start) return false;
  }

  replaceRichEditorSelection(editor, "", start, deleteEnd);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

export function deleteRichEditorBackward(editor) {
  if (!editor) return false;
  const range = getRichEditorRange(editor);
  return deleteAdjacentQuote(editor, "backward", range);
}

function getNextGraphemeEnd(text, offset) {
  if (typeof Intl.Segmenter === "function") {
    for (const segment of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
      const segmentEnd = segment.index + segment.segment.length;
      if (segmentEnd > offset) return segmentEnd;
    }
    return text.length;
  }

  const codePoint = text.codePointAt(offset);
  return codePoint == null ? offset : offset + (codePoint > 0xffff ? 2 : 1);
}

export function normalizeRichEditorShortcodes(editor, replaceShortcodes) {
  if (!editor) return false;
  const model = buildTextModel(editor);
  const selection = getRichEditorSelection(editor);
  const updates = [];
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const isPlainBoundary = node.parentElement?.dataset.richEditorPlainBoundary === "true";
    const originalWithMarker = node.textContent;
    const original = isPlainBoundary
      ? originalWithMarker.replaceAll(RICH_EDITOR_CARET_MARKER, "")
      : originalWithMarker;
    const next = replaceShortcodes(original);
    if (next === original) continue;
    updates.push({
      node,
      start: findPointIndex(model, node, 0),
      end: findPointIndex(model, node, originalWithMarker.length),
      original,
      next,
      marker: isPlainBoundary && originalWithMarker.includes(RICH_EDITOR_CARET_MARKER)
        ? RICH_EDITOR_CARET_MARKER
        : "",
    });
  }
  if (!updates.length) return false;

  const mapOffset = (offset) => {
    let delta = 0;
    for (const update of updates) {
      if (offset < update.start) return offset + delta;
      if (offset <= update.end) {
        const localOffset = Math.max(0, Math.min(update.original.length, offset - update.start));
        return update.start + delta + replaceShortcodes(update.original.slice(0, localOffset)).length;
      }
      delta += update.next.length - update.original.length;
    }
    return offset + delta;
  };
  const nextStart = mapOffset(selection.start);
  const nextEnd = mapOffset(selection.end);
  updates.forEach(({ node, next, marker }) => {
    node.textContent = `${marker}${next}`;
  });
  setRichEditorSelection(editor, nextStart, nextEnd);
  return true;
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

function createFormatElement(documentRef, format, url = "") {
  const tags = { quote: "span", bold: "strong", italic: "em", monospace: "code", underline: "u", strike: "s", spoiler: "span", link: "a" };
  const tag = tags[format];
  if (!tag) return null;
  const element = documentRef.createElement(tag);
  element.dataset.chatFormat = format;
  if (format === "link") {
    let parsedUrl;
    try {
      const safeUrl = String(url).replace(/[()]/g, (character) => character === "(" ? "%28" : "%29");
      parsedUrl = new URL(safeUrl);
    } catch {
      return null;
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
    element.href = parsedUrl.href;
    element.className = "chat-rich-editor__link";
    element.dataset.tooltip = "Ctrl/Cmd + clic para abrir enlace";
    element.rel = "noreferrer";
  }
  if (format === "monospace") element.className = "message__monospace";
  if (format === "quote") element.className = "chat-rich-editor__quote";
  if (format === "italic") element.className = "chat-rich-editor__italic";
  if (format === "spoiler") {
    element.className = "chat-rich-editor__spoiler";
    element.dataset.tooltip = "Mostrar spoiler";
  }
  if (format === "strike") element.className = "chat-format-strike";
  return element;
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

function isEmptyRichBoundary(node) {
  if (node?.nodeType === Node.TEXT_NODE) return node.nodeValue.length === 0;
  return node?.nodeType === Node.ELEMENT_NODE
    && node.dataset.richEditorPlainBoundary === "true"
    && !node.textContent.replaceAll(RICH_EDITOR_CARET_MARKER, "")
    && !node.querySelector("br");
}

function serializeRichFormat(format, element, content) {
  const wrappers = RICH_FORMAT_MARKERS[format];
  if (wrappers) return `${wrappers[0]}${content}${wrappers[1]}`;
  if (format === "link") return `[${content}](${element.href})`;
  return content;
}
