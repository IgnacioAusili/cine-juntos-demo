import { RICH_EDITOR_CARET_MARKER } from "./chat-rich-editor-constants.js";
import { buildTextModel, findPointIndex, getRichEditorRange, getRichEditorSelection, setRichEditorRange, setRichEditorSelection } from "./chat-rich-editor-selection.js";
import { deleteAdjacentQuote } from "./chat-rich-editor-quotes.js";

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
