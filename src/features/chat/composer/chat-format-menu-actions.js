import { focusChatInput } from "./chat-input-focus.js";
import { applyRichEditorFormat, getRichEditorSelection, getRichEditorTextLength, insertRichEditorText, replaceRichEditorRangeText, setRichEditorRange, setRichEditorSelection } from "./chat-rich-editor.js";
import { closeMenu, clearLinkError, positionMenu } from "./chat-format-menu-position.js";
import { FORMATS } from "./chat-format-menu-view.js";

export function applyFormat(state, action) {
  const selection = state.currentSelection;
  const format = FORMATS[action];
  if (!selection || !format) return;
  const { input, range } = selection;
  if (!applyRichEditorFormat(input, action, "", range)) return;
  closeMenu(state);
  focusChatInput(input);
}

export function selectAllInputText(state) {
  const selection = state.currentSelection;
  if (!selection) return;
  const { input } = selection;
  closeMenu(state);
  focusChatInput(input);
  setRichEditorSelection(input, 0, getRichEditorTextLength(input));
}

export function showLinkEditor(state) {
  state.menu.setAttribute("role", "dialog");
  const isAlias = Boolean(state.currentSelectionLink);
  state.menu.setAttribute("aria-label", isAlias ? "Crear alias para el enlace" : "Crear enlace para el texto seleccionado");
  state.menuActions.hidden = true;
  state.linkForm.hidden = false;
  clearLinkError(state);
  state.linkAliasLabel.hidden = !isAlias;
  state.linkInput.closest("label").hidden = isAlias;
  state.linkFormatLabel.textContent = isAlias ? "Crear alias" : "Crear enlace";
  if (isAlias) {
    state.linkAliasInput.value = state.currentSelection.range.toString();
    state.linkInput.value = state.currentSelectionLink.href;
  } else {
    state.linkAliasInput.value = "";
    state.linkInput.value = "";
  }
  positionMenu(state.menu, state.menuAnchor.x, state.menuAnchor.y);
  (isAlias ? state.linkAliasInput : state.linkInput).focus({ preventScroll: true });
}

export function applyLinkFormat(state) {
  const selection = state.currentSelection;
  if (state.currentSelectionLink) {
    const alias = state.linkAliasInput.value.trim();
    if (!selection || !alias || !state.currentSelectionLink.isConnected) {
      state.linkError.textContent = "Ingresá un texto para el alias.";
      state.linkError.hidden = false;
      state.linkAliasInput.setAttribute("aria-invalid", "true");
      state.linkAliasInput.focus({ preventScroll: true });
      return;
    }

    state.currentSelectionLink.removeAttribute("data-chat-autolink");
    replaceRichEditorRangeText(selection.input, alias, selection.range);
    closeMenu(state);
    focusChatInput(selection.input);
    return;
  }

  const url = normalizeLinkUrl(state.linkInput.value);
  if (!selection || !url) {
    state.linkError.hidden = false;
    state.linkInput.setAttribute("aria-invalid", "true");
    state.linkInput.focus({ preventScroll: true });
    return;
  }

  const { input, range } = selection;
  if (!applyRichEditorFormat(input, "link", url, range)) return;
  closeMenu(state);
  focusChatInput(input);
}

export function copySelection(state) {
  const selection = state.currentSelection;
  if (!selection) return;
  const { input, range } = selection;
  const plainText = range.toString();
  focusChatInput(input);
  setRichEditorRange(input, range);
  const copied = (() => {
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  })();
  if (copied) {
    closeMenu(state);
    return;
  }
  if (!navigator.clipboard?.writeText) {
    showClipboardError(state, "No se pudo copiar desde el menú. Usa Ctrl+C.");
    return;
  }
  navigator.clipboard.writeText(plainText).then(() => closeMenu(state)).catch(() => {
    showClipboardError(state, "No se pudo copiar desde el menú. Usa Ctrl+C.");
  });
}

export function cutSelection(state) {
  const selection = state.currentSelection;
  if (!selection?.range || selection.range.collapsed) return;
  const { input, range } = selection;
  const plainText = range.toString();
  if (!plainText) return;

  focusChatInput(input);
  setRichEditorRange(input, range);
  const cut = (() => {
    try {
      return document.execCommand("cut");
    } catch {
      return false;
    }
  })();
  if (cut) {
    closeMenu(state);
    focusChatInput(input);
    return;
  }
  if (!navigator.clipboard?.writeText) {
    showClipboardError(state, "No se pudo cortar desde el menú. Usa Ctrl+X.");
    return;
  }
  navigator.clipboard.writeText(plainText).then(() => {
    if (state.menu.hidden || state.currentSelection !== selection) return;
    focusChatInput(input);
    if (!replaceRichEditorRangeText(input, "", range)) return;
    closeMenu(state);
    focusChatInput(input);
  }).catch(() => {
    showClipboardError(state, "No se pudo cortar desde el menú. Usa Ctrl+X.");
  });
}

export async function pasteSelection(state) {
  const selection = state.currentSelection;
  if (!selection) return;
  if (!navigator.clipboard?.readText) {
    showClipboardError(state, "El navegador no permitió leer el portapapeles. Usa Ctrl+V.");
    return;
  }
  const { input, range } = selection;
  const offsets = getRichEditorSelection(input, range);
  try {
    const text = await navigator.clipboard.readText();
    if (state.menu.hidden || state.currentSelection !== selection) return;
    focusChatInput(input);
    setRichEditorRange(input, range);
    insertRichEditorText(input, text, offsets);
    closeMenu(state);
    focusChatInput(input);
  } catch {
    showClipboardError(state, "El navegador no permitió leer el portapapeles. Usa Ctrl+V.");
  }
}

function showClipboardError(state, message) {
  state.clipboardStatus.textContent = message;
  state.clipboardStatus.hidden = false;
}

function normalizeLinkUrl(value) {
  const entered = String(value || "").trim();
  if (!entered) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(entered) ? entered : `https://${entered}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
