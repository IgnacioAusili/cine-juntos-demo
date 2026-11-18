import { focusChatInput } from "./chat-input-focus.js";
import { setRichEditorRange } from "./chat-rich-editor.js";

export function openMenu(state, formatMenu, x, y, mode = "format") {
  if (mode === "link") showLinkActions(state);
  else showActions(state);
  const hasText = Boolean(state.currentSelection?.input?.textContent?.replaceAll("\u200B", "").trim());
  setTextActionsVisible(state, hasText);
  formatMenu.dataset.hoverEnabled = "false";
  formatMenu.dataset.keyboardNavigation = "false";
  formatMenu.hidden = false;
  state.menuAnchor = { x, y };
  positionMenu(formatMenu, x, y);
  if (mode !== "link" && hasText) {
    setStylesSubmenuSide(state, measureStylesSubmenuWidth(state));
  }
}

function setTextActionsVisible(state, visible) {
  if (state.selectAllButton) state.selectAllButton.hidden = !visible;
  if (state.copyButton) state.copyButton.hidden = !visible;
  if (state.cutButton) {
    const range = state.currentSelection?.range;
    state.cutButton.hidden = !visible || !range || range.collapsed || !range.toString();
  }
  if (state.selectAllLinkButton) state.selectAllLinkButton.hidden = !visible;
  if (state.stylesGroup) state.stylesGroup.hidden = !visible;
}

export function openStylesSubmenu(state) {
  if (!state.menu || state.menu.hidden || !state.currentSelection || !state.stylesSubmenu) return;
  window.clearTimeout(state.stylesSubmenuCloseTimer);
  state.stylesSubmenuCloseTimer = 0;
  state.stylesSubmenu.hidden = false;
  state.formatActions.hidden = false;
  state.stylesButton.setAttribute("aria-expanded", "true");
  positionStylesSubmenu(state);
}

export function scheduleStylesSubmenuClose(state) {
  window.clearTimeout(state.stylesSubmenuCloseTimer);
  state.stylesSubmenuCloseTimer = window.setTimeout(() => {
    state.stylesSubmenuCloseTimer = 0;
    closeStylesSubmenu(state);
  }, 100);
}

export function closeStylesSubmenu(state) {
  window.clearTimeout(state.stylesSubmenuCloseTimer);
  state.stylesSubmenuCloseTimer = 0;
  if (!state.stylesSubmenu) return;
  state.stylesSubmenu.hidden = true;
  state.formatActions.hidden = true;
  state.stylesButton.setAttribute("aria-expanded", "false");
}

function positionStylesSubmenu(state) {
  const margin = 8;
  const groupBounds = state.stylesGroup.getBoundingClientRect();
  const submenuBounds = state.stylesSubmenu.getBoundingClientRect();
  setStylesSubmenuSide(state, submenuBounds.width);
  const defaultTop = state.stylesGroup.dataset.submenuSide === "below" ? groupBounds.height - 1 : 0;
  const maxTop = window.innerHeight - margin - groupBounds.top - submenuBounds.height;
  const minTop = margin - groupBounds.top;
  state.stylesSubmenu.style.top = `${Math.max(minTop, Math.min(defaultTop, maxTop))}px`;
}

function measureStylesSubmenuWidth(state) {
  const wasSubmenuHidden = state.stylesSubmenu.hidden;
  const wereActionsHidden = state.formatActions.hidden;
  state.stylesSubmenu.hidden = false;
  state.formatActions.hidden = false;
  const width = state.stylesSubmenu.getBoundingClientRect().width;
  state.stylesSubmenu.hidden = wasSubmenuHidden;
  state.formatActions.hidden = wereActionsHidden;
  return width;
}

function setStylesSubmenuSide(state, submenuWidth) {
  const margin = 8;
  const menuBounds = state.menu.getBoundingClientRect();
  const rightSpace = window.innerWidth - menuBounds.right - margin;
  const leftSpace = menuBounds.left - margin;
  const side = rightSpace >= submenuWidth ? "right"
    : leftSpace >= submenuWidth ? "left" : "below";
  state.stylesGroup.dataset.submenuSide = side;
  state.stylesButton.querySelector(".chat-format-menu__submenu-arrow").textContent = side === "left" ? "‹" : side === "below" ? "⌄" : "›";
}

export function positionMenu(formatMenu, x, y) {
  formatMenu.style.left = `${x}px`;
  formatMenu.style.top = `${y}px`;
  const bounds = formatMenu.getBoundingClientRect();
  const margin = 8;
  formatMenu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - bounds.width - margin))}px`;
  formatMenu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - bounds.height - margin))}px`;
}

function showActions(state) {
  if (!state.menuActions) return;
  state.menu.setAttribute("role", "menu");
  state.menu.setAttribute("aria-label", "Acciones del campo de mensaje");
  state.menuActions.hidden = false;
  state.linkActions.hidden = true;
  state.linkForm.hidden = true;
  closeStylesSubmenu(state);
  state.clipboardStatus.hidden = true;
  state.clipboardStatus.textContent = "";
  state.linkInput.value = "";
  state.linkAliasInput.value = "";
  state.linkAliasLabel.hidden = true;
  state.linkInput.closest("label").hidden = false;
  if (state.linkFormatLabel) state.linkFormatLabel.textContent = state.currentSelectionLink ? "Crear alias" : "Crear enlace";
  clearLinkError(state);
}

function showLinkActions(state) {
  state.menu.setAttribute("role", "menu");
  state.menu.setAttribute("aria-label", "Acciones del enlace");
  state.menuActions.hidden = true;
  state.linkActions.hidden = false;
  state.linkForm.hidden = true;
  state.clipboardStatus.hidden = true;
  state.clipboardStatus.textContent = "";
  closeStylesSubmenu(state);
}

export function clearLinkError(state) {
  if (!state.linkError || !state.linkInput) return;
  state.linkError.hidden = true;
  state.linkError.textContent = "Ingresá una dirección http o https válida.";
  state.linkInput.removeAttribute("aria-invalid");
  state.linkAliasInput?.removeAttribute("aria-invalid");
}

export function closeMenu(state, restoreFocus = false) {
  if (!state.menu || state.menu.hidden) return;
  state.menu.hidden = true;
  state.menu.style.removeProperty("left");
  state.menu.style.removeProperty("top");
  state.menuAnchor = null;
  state.currentLinkHref = "";
  state.currentSelectionLink = null;
  showActions(state);
  const selection = state.currentSelection;
  state.currentSelection = null;
  if (restoreFocus && selection) {
    focusChatInput(selection.input);
    setRichEditorRange(selection.input, selection.range);
  }
}
