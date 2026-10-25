import { buildTextModel, findPointIndex } from "./chat-rich-editor-selection.js";
import { handleRichEditorLinkClick } from "../messages/chat-link-confirmation.js";
import { parseInlineFormatting } from "../inline-formatting-markup.js";

const BLOCK_TAGS = new Set(["DIV", "P"]);
const RICH_FORMAT_MARKERS = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  monospace: ["`", "`"],
  underline: ["__", "__"],
  strike: ["~~", "~~"],
  spoiler: ["||", "||"],
};
const installedEditors = new WeakSet();
const formattingBoundaries = new WeakMap();
const TYPED_MARKUP_FORMATS = [
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
    const spoiler = target?.closest("[data-chat-format='spoiler']");
    if (spoiler && editor.contains(spoiler)) {
      spoiler.classList.add("chat-rich-editor__spoiler--revealed");
    }
    const link = target?.closest("a[data-chat-format='link']");
    if (link && editor.contains(link)) handleRichEditorLinkClick(event, link);
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

export function setRichEditorRange(editor, range) {
  if (!editor || !range) return;
  const selection = editor.ownerDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(range.cloneRange());
}

export function applyRichEditorFormat(editor, format, url = "", savedRange = null) {
  const range = savedRange?.cloneRange() || getRichEditorRange(editor);
  if (!range || range.collapsed || !range.toString()) return false;
  formattingBoundaries.delete(editor);

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
  const boundary = setCaretAfterRichFormat(range, element);
  const selection = editor.ownerDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  formattingBoundaries.set(editor, {
    element,
    boundary,
    format,
    caretOffset: getRichEditorSelection(editor).start,
  });
  return true;
}

export function normalizeRichEditorMarkup(editor) {
  normalizeRichEditorTypingBoundary(editor);
  const selection = getRichEditorSelection(editor);
  if (!editor || selection.start !== selection.end) return false;

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

function normalizeRichEditorTypingBoundary(editor) {
  const pending = formattingBoundaries.get(editor);
  if (!pending) return false;
  if (!pending.element.isConnected || !pending.boundary.isConnected) {
    formattingBoundaries.delete(editor);
    return false;
  }

  const range = getRichEditorRange(editor);
  if (!range?.collapsed) {
    formattingBoundaries.delete(editor);
    return false;
  }
  const caret = getRichEditorSelection(editor).start;
  if (pending.element.contains(range.startContainer) && caret > pending.caretOffset) {
    const model = buildTextModel(editor);
    const insertedRange = createRangeAtOffsets(editor, model, pending.caretOffset, caret);
    const inserted = insertedRange.extractContents();
    unwrapRichFormat(inserted, `[data-chat-format="${pending.format}"]`);
    pending.boundary.insertBefore(inserted, pending.boundary.firstChild);

    const updatedModel = buildTextModel(editor);
    const updatedRange = createRangeAtOffsets(editor, updatedModel, caret, caret);
    const selection = editor.ownerDocument.getSelection();
    selection.removeAllRanges();
    selection.addRange(updatedRange);
    pending.caretOffset = caret;
    return true;
  }

  if (pending.boundary.contains(range.startContainer)) {
    pending.caretOffset = caret;
    return false;
  }

  if (!pending.element.contains(range.startContainer)) formattingBoundaries.delete(editor);
  return false;
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

function unwrapRichFormat(root, selector) {
  [...root.querySelectorAll(selector)].reverse().forEach((element) => {
    const parent = element.parentNode;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    element.remove();
  });
}

function hasRichEditorContent(root) {
  return [...root.childNodes].some((node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.length > 0;
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

export function insertRichEditorText(editor, text, savedSelection = null) {
  const { start, end } = savedSelection || getRichEditorSelection(editor);
  replaceRichEditorSelection(editor, text, start, end);
  editor?.dispatchEvent(new Event("input", { bubbles: true }));
}

export function deleteRichEditorForward(editor) {
  if (!editor) return false;
  const { start, end } = getRichEditorSelection(editor);
  let deleteEnd = end;

  if (start === end) {
    deleteEnd = getNextGraphemeEnd(buildTextModel(editor).text, start);
    if (deleteEnd === start) return false;
  }

  replaceRichEditorSelection(editor, "", start, deleteEnd);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
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
    const original = node.textContent;
    const next = replaceShortcodes(original);
    if (next === original) continue;
    updates.push({
      node,
      start: findPointIndex(model, node, 0),
      end: findPointIndex(model, node, original.length),
      original,
      next,
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
  updates.forEach(({ node, next }) => {
    node.textContent = next;
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
  const text = element.ownerDocument.createTextNode("");
  boundary.append(text);
  element.parentNode.insertBefore(boundary, element.nextSibling);
  range.setStart(text, 0);
  range.collapse(true);
  return boundary;
}

function createFormatElement(documentRef, format, url = "") {
  const tags = { bold: "strong", italic: "em", monospace: "code", underline: "u", strike: "s", spoiler: "span", link: "a" };
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
    element.rel = "noreferrer";
  }
  if (format === "monospace") element.className = "message__monospace";
  if (format === "italic") element.className = "chat-rich-editor__italic";
  if (format === "spoiler") {
    element.className = "chat-rich-editor__spoiler";
    element.dataset.tooltip = "Esto puede ser un spoiler. Haz clic para revelar el texto.";
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
    && !node.textContent
    && !node.querySelector("br");
}

function serializeRichFormat(format, element, content) {
  const wrappers = RICH_FORMAT_MARKERS[format];
  if (wrappers) return `${wrappers[0]}${content}${wrappers[1]}`;
  if (format === "link") return `[${content}](${element.href})`;
  return content;
}
