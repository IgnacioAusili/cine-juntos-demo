import { RICH_EDITOR_CARET_MARKER } from "./chat-rich-editor-constants.js";
import { getRawTextOffset, getRichEditorRange, getRichEditorSelection, setRichEditorSelection } from "./chat-rich-editor-selection.js";
import { getValidVideoTimecodeMatches } from "../messages/chat-timecode-links.js";

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
