import { BLOCK_TAGS, RICH_EDITOR_CARET_MARKER } from "./chat-rich-editor-constants.js";

export function buildTextModel(editor) {
  const points = [{ node: editor, offset: 0 }];
  const boundaries = new Map();
  let text = "";
  const rememberBoundary = (node, offset) => {
    if (!boundaries.has(node)) boundaries.set(node, new Map());
    boundaries.get(node).set(offset, text.length);
  };
  rememberBoundary(editor, 0);
  const appendNewline = (node, offset) => {
    if (text.endsWith("\n")) return;
    text += "\n";
    points.push({ node, offset });
    rememberBoundary(node, offset);
  };
  const walk = (parent) => {
    const children = [...parent.childNodes];
    children.forEach((child, index) => {
      rememberBoundary(parent, index);
      if (child.nodeType === Node.TEXT_NODE) {
        const isPlainBoundary = parent.dataset?.richEditorPlainBoundary === "true";
        for (let offset = 0; offset <= child.nodeValue.length; offset += 1) {
          rememberBoundary(child, offset);
          if (offset < child.nodeValue.length) {
            if (isPlainBoundary && child.nodeValue[offset] === "\u200B") {
              points[text.length] = { node: child, offset: offset + 1 };
              continue;
            }
            text += child.nodeValue[offset];
            points.push({ node: child, offset: offset + 1 });
          }
        }
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === "BR") {
        appendNewline(parent, index + 1);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (BLOCK_TAGS.has(child.tagName) && text && !text.endsWith("\n")) appendNewline(parent, index);
        walk(child);
        if (BLOCK_TAGS.has(child.tagName) && index < children.length - 1) appendNewline(parent, index + 1);
      }
      rememberBoundary(parent, index + 1);
    });
  };
  walk(editor);
  return { text, points, boundaries };
}

export function findPointIndex(model, node, offset) {
  const exact = model.boundaries.get(node)?.get(offset);
  if (exact != null) return exact;
  let ancestor = node.parentNode;
  while (ancestor && !model.boundaries.has(ancestor)) ancestor = ancestor.parentNode;
  if (!ancestor) return model.text.length;
  const childIndex = [...ancestor.childNodes].indexOf(node);
  return model.boundaries.get(ancestor)?.get(Math.max(0, childIndex)) ?? 0;
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

export function getElementTextSpan(model, element) {
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

export function getRawTextOffset(text, visibleOffset, bias = "start") {
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

export function createRangeAtOffsets(editor, model, start, end) {
  const clamp = (offset) => Math.max(0, Math.min(model.text.length, Number(offset) || 0));
  const startPoint = model.points[clamp(start)];
  const endPoint = model.points[clamp(end)];
  const range = editor.ownerDocument.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}
