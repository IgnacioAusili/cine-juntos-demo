import { handleRichEditorLinkClick } from "../messages/chat-link-confirmation.js";
import { getLeadingTimecodeSeconds, seekVideoToSeconds } from "../messages/chat-timecode-links.js";
import { refreshTooltipForTarget } from "../../icons-tooltips.js";
import { getRichEditorSelection, setRichEditorSelection } from "./chat-rich-editor-selection.js";
import { replaceRichEditorSelection } from "./chat-rich-editor-editing.js";
import { normalizeRichEditorTimecodes } from "./chat-rich-editor-timecodes.js";
import { moveRichEditorCaretOutsideQuoteAtPoint } from "./chat-rich-editor-quotes.js";
import { renderRichEditor, serializeRichEditor } from "./chat-rich-editor-markup.js";

const installedEditors = new WeakSet();

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

export { getRichEditorSelection, setRichEditorSelection, renderRichEditor, serializeRichEditor, replaceRichEditorSelection, normalizeRichEditorTimecodes, moveRichEditorCaretOutsideQuoteAtPoint };
export { getRichEditorTextLength, getRichEditorRange, getRichEditorRangeAtPoint, setRichEditorRange } from "./chat-rich-editor-selection.js";
export { getRichEditorLinkForRange, normalizeRichEditorAutolinks } from "./chat-rich-editor-links.js";
export { applyRichEditorFormat } from "./chat-rich-editor-formatting.js";
export { normalizeRichEditorMarkup } from "./chat-rich-editor-markup.js";
export { moveRichEditorCaretOutOfQuote } from "./chat-rich-editor-quotes.js";
export { replaceRichEditorRangeText, insertRichEditorText, deleteRichEditorForward, deleteRichEditorBackward, normalizeRichEditorShortcodes } from "./chat-rich-editor-editing.js";
