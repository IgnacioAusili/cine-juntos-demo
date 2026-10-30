import { focusChatInput } from "./chat-input-focus.js";
import {
  applyRichEditorFormat,
  getRichEditorRange,
  getRichEditorRangeAtPoint,
  getRichEditorLinkForRange,
  getRichEditorSelection,
  getRichEditorTextLength,
  insertRichEditorText,
  replaceRichEditorRangeText,
  setRichEditorRange,
  setRichEditorSelection,
} from "./chat-rich-editor.js";
import { openChatLinkInNewWindow } from "../messages/chat-link-confirmation.js";

const FORMATS = {
  quote: { label: "Cita", symbol: "❝ ❞" },
  bold: { label: "Negrita", symbol: "**" },
  italic: { label: "Cursiva", symbol: "*" },
  monospace: { label: "Monoespaciado", symbol: "`" },
  underline: { label: "Subrayado", symbol: "__" },
  strike: { label: "Tachado", symbol: "~~" },
  spoiler: { label: "Spoiler", symbol: "||" },
  link: { label: "Crear enlace", symbol: "[texto](url)" },
};

let menu;
let menuActions;
let formatActions;
let stylesGroup;
let stylesButton;
let stylesSubmenu;
let selectAllButton;
let copyButton;
let cutButton;
let selectAllLinkButton;
let clipboardStatus;
let linkForm;
let linkInput;
let linkAliasLabel;
let linkAliasInput;
let linkError;
let linkActions;
let linkFormatLabel;
let currentLinkHref;
let currentSelectionLink;
let currentSelection;
let menuAnchor;
let stylesSubmenuCloseTimer = 0;

export function wireChatFormatMenu(inputs) {
  const formatMenu = getFormatMenu();

  inputs.filter(Boolean).forEach((input) => {
    if (input.dataset.formatMenuBound === "true") return;
    input.dataset.formatMenuBound = "true";
    input.addEventListener("contextmenu", (event) => {
      if (!formatMenu.hidden) {
        event.preventDefault();
        closeMenu();
        return;
      }

      const link = event.target.closest?.("a[data-chat-format='link']");
      if (link && input.contains(link)) {
        event.preventDefault();
        const range = getRichEditorRange(input)
          || getRichEditorRangeAtPoint(input, event.clientX, event.clientY);
        currentSelection = range ? { input, range } : null;
        currentLinkHref = link.href;
        currentSelectionLink = getRichEditorLinkForRange(input, range) === link ? link : null;
        openMenu(formatMenu, event.clientX, event.clientY, currentSelectionLink ? "format" : "link");
        return;
      }

      let range = getRichEditorRange(input);
      if (!range || range.collapsed || !range.toString()) {
        const caretRange = getRichEditorRangeAtPoint(input, event.clientX, event.clientY);
        if (caretRange) {
          range = caretRange;
          setRichEditorRange(input, range);
        }
      }
      if (!range) return;

      event.preventDefault();
      currentLinkHref = "";
      currentSelection = { input, range };
      currentSelectionLink = getRichEditorLinkForRange(input, range);
      openMenu(formatMenu, event.clientX, event.clientY);
    });
  });

  if (formatMenu.dataset.eventsBound === "true") return;
  formatMenu.dataset.eventsBound = "true";
  formatMenu.addEventListener("mousedown", (event) => event.preventDefault());
  formatMenu.addEventListener("contextmenu", (event) => {
    if (formatMenu.hidden) return;
    event.preventDefault();
    closeMenu();
  });
  formatMenu.addEventListener("pointermove", (event) => {
    if (!menuAnchor) return;
    const pointerMoved = Math.abs(event.clientX - menuAnchor.x) + Math.abs(event.clientY - menuAnchor.y) >= 2;
    if (pointerMoved) formatMenu.dataset.hoverEnabled = "true";
  });
  stylesGroup.addEventListener("pointerenter", openStylesSubmenu);
  stylesGroup.addEventListener("pointerleave", (event) => {
    if (!stylesGroup.contains(event.relatedTarget)) scheduleStylesSubmenuClose();
  });
  formatMenu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.formatAction;
    if (action === "select-all") {
      selectAllInputText();
      return;
    }
    if (action === "copy") {
      copySelection();
      return;
    }
    if (action === "cut") {
      cutSelection();
      return;
    }
    if (action === "paste") {
      pasteSelection();
      return;
    }
    if (action === "styles") {
      if (stylesSubmenu.hidden) openStylesSubmenu();
      else closeStylesSubmenu();
      return;
    }
    if (action === "open-link" && currentLinkHref) {
      openChatLinkInNewWindow(currentLinkHref);
      closeMenu();
      return;
    }
    if (action === "link" && currentSelection) {
      showLinkEditor();
      return;
    }
    if (action && currentSelection) applyFormat(action);
  });
  formatMenu.addEventListener("keydown", (event) => {
    if (["Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      formatMenu.dataset.keyboardNavigation = "true";
    }
  });
  linkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyLinkFormat();
  });
  linkInput.addEventListener("input", clearLinkError);
  linkAliasInput.addEventListener("input", clearLinkError);
  linkForm.querySelector("[data-format-cancel]").addEventListener("click", () => closeMenu(true));
  document.addEventListener("pointerdown", (event) => {
    if (event.button === 2 && inputs.some((input) => input?.contains(event.target))) return;
    if (!formatMenu.hidden && !formatMenu.contains(event.target)) closeMenu();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !formatMenu.hidden) {
      event.preventDefault();
      closeMenu(true);
    }
  });
  document.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu, { passive: true });
}

function getFormatMenu() {
  if (menu) return menu;
  menu = document.createElement("div");
  menu.className = "chat-format-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Acciones del campo de mensaje");
  menu.hidden = true;
  menuActions = document.createElement("div");
  menuActions.className = "chat-format-menu__actions";
  formatActions = document.createElement("div");
  formatActions.className = "chat-format-menu__styles-submenu";
  formatActions.setAttribute("role", "menu");
  formatActions.setAttribute("aria-label", "Estilos de texto");
  formatActions.hidden = true;

  Object.entries(FORMATS).forEach(([action, format]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.formatAction = action;
    button.setAttribute("role", "menuitem");
    const label = document.createElement("span");
    label.className = "chat-format-menu__label";
    label.textContent = format.label;
    if (action === "link") linkFormatLabel = label;
    const symbol = document.createElement("span");
    symbol.className = "chat-format-menu__symbol";
    symbol.textContent = format.symbol;
    button.append(label, symbol);
    formatActions.append(button);
  });
  selectAllButton = createMenuButton("select-all", "Seleccionar todo");
  copyButton = createMenuButton("copy", "Copiar");
  cutButton = createMenuButton("cut", "Cortar");
  const pasteButton = createMenuButton("paste", "Pegar");
  stylesGroup = document.createElement("div");
  stylesGroup.className = "chat-format-menu__styles-group";
  stylesButton = createMenuButton("styles", "Estilos");
  stylesButton.setAttribute("aria-haspopup", "menu");
  stylesButton.setAttribute("aria-expanded", "false");
  const stylesArrow = document.createElement("span");
  stylesArrow.className = "chat-format-menu__submenu-arrow";
  stylesArrow.setAttribute("aria-hidden", "true");
  stylesArrow.textContent = "›";
  stylesButton.append(stylesArrow);
  stylesSubmenu = document.createElement("div");
  stylesSubmenu.className = "chat-format-menu__styles-submenu-wrap";
  stylesSubmenu.hidden = true;
  stylesSubmenu.append(formatActions);
  stylesGroup.append(stylesButton, stylesSubmenu);
  menuActions.append(selectAllButton, copyButton, cutButton, pasteButton, stylesGroup);
  clipboardStatus = document.createElement("div");
  clipboardStatus.className = "chat-format-menu__clipboard-status";
  clipboardStatus.setAttribute("role", "status");
  clipboardStatus.hidden = true;
  linkActions = document.createElement("div");
  linkActions.className = "chat-format-menu__link-actions-list";
  linkActions.hidden = true;
  const openLinkButton = document.createElement("button");
  openLinkButton.type = "button";
  openLinkButton.dataset.formatAction = "open-link";
  openLinkButton.setAttribute("role", "menuitem");
  openLinkButton.textContent = "Abrir en ventana nueva";
  selectAllLinkButton = createMenuButton("select-all", "Seleccionar todo");
  linkActions.append(selectAllLinkButton, openLinkButton);
  linkForm = document.createElement("form");
  linkForm.className = "chat-format-menu__link-form";
  linkForm.hidden = true;
  const label = document.createElement("label");
  label.className = "chat-format-menu__link-label";
  label.textContent = "Dirección del enlace";
  linkInput = document.createElement("input");
  linkInput.className = "chat-format-menu__url";
  linkInput.type = "text";
  linkInput.inputMode = "url";
  linkInput.placeholder = "https://ejemplo.com";
  linkInput.autocomplete = "url";
  linkInput.setAttribute("aria-label", "Dirección del enlace");
  linkInput.setAttribute("spellcheck", "false");
  label.append(linkInput);
  linkAliasLabel = document.createElement("label");
  linkAliasLabel.className = "chat-format-menu__link-label";
  linkAliasLabel.textContent = "Texto del alias";
  linkAliasLabel.hidden = true;
  linkAliasInput = document.createElement("input");
  linkAliasInput.className = "chat-format-menu__url";
  linkAliasInput.type = "text";
  linkAliasInput.autocomplete = "off";
  linkAliasInput.setAttribute("aria-label", "Texto del alias");
  linkAliasLabel.append(linkAliasInput);
  linkError = document.createElement("span");
  linkError.className = "chat-format-menu__link-error";
  linkError.setAttribute("role", "alert");
  linkError.textContent = "Ingresá una dirección http o https válida.";
  linkError.hidden = true;
  const actions = document.createElement("div");
  actions.className = "chat-format-menu__link-actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.formatCancel = "true";
  cancelButton.textContent = "Cancelar";
  const applyButton = document.createElement("button");
  applyButton.type = "submit";
  applyButton.textContent = "Aplicar";
  actions.append(cancelButton, applyButton);
  linkForm.append(label, linkAliasLabel, linkError, actions);
  menu.append(menuActions, linkActions, linkForm, clipboardStatus);
  document.body.append(menu);
  return menu;
}

function openMenu(formatMenu, x, y, mode = "format") {
  if (mode === "link") showLinkActions();
  else showActions();
  const hasText = Boolean(currentSelection?.input?.textContent?.replaceAll("\u200B", "").trim());
  setTextActionsVisible(hasText);
  formatMenu.dataset.hoverEnabled = "false";
  formatMenu.dataset.keyboardNavigation = "false";
  formatMenu.hidden = false;
  menuAnchor = { x, y };
  positionMenu(formatMenu, x, y);
  if (mode !== "link" && hasText) {
    setStylesSubmenuSide(measureStylesSubmenuWidth());
  }
}

function setTextActionsVisible(visible) {
  if (selectAllButton) selectAllButton.hidden = !visible;
  if (copyButton) copyButton.hidden = !visible;
  if (cutButton) {
    const range = currentSelection?.range;
    cutButton.hidden = !visible || !range || range.collapsed || !range.toString();
  }
  if (selectAllLinkButton) selectAllLinkButton.hidden = !visible;
  if (stylesGroup) stylesGroup.hidden = !visible;
}

function createMenuButton(action, labelText) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.formatAction = action;
  button.setAttribute("role", "menuitem");
  const label = document.createElement("span");
  label.className = "chat-format-menu__label";
  label.textContent = labelText;
  button.append(label);
  return button;
}

function openStylesSubmenu() {
  if (!menu || menu.hidden || !currentSelection || !stylesSubmenu) return;
  window.clearTimeout(stylesSubmenuCloseTimer);
  stylesSubmenuCloseTimer = 0;
  stylesSubmenu.hidden = false;
  formatActions.hidden = false;
  stylesButton.setAttribute("aria-expanded", "true");
  positionStylesSubmenu();
}

function scheduleStylesSubmenuClose() {
  window.clearTimeout(stylesSubmenuCloseTimer);
  stylesSubmenuCloseTimer = window.setTimeout(() => {
    stylesSubmenuCloseTimer = 0;
    closeStylesSubmenu();
  }, 100);
}

function closeStylesSubmenu() {
  window.clearTimeout(stylesSubmenuCloseTimer);
  stylesSubmenuCloseTimer = 0;
  if (!stylesSubmenu) return;
  stylesSubmenu.hidden = true;
  formatActions.hidden = true;
  stylesButton.setAttribute("aria-expanded", "false");
}

function positionStylesSubmenu() {
  const margin = 8;
  const groupBounds = stylesGroup.getBoundingClientRect();
  const submenuBounds = stylesSubmenu.getBoundingClientRect();
  setStylesSubmenuSide(submenuBounds.width);
  const defaultTop = stylesGroup.dataset.submenuSide === "below" ? groupBounds.height - 1 : 0;
  const maxTop = window.innerHeight - margin - groupBounds.top - submenuBounds.height;
  const minTop = margin - groupBounds.top;
  stylesSubmenu.style.top = `${Math.max(minTop, Math.min(defaultTop, maxTop))}px`;
}

function measureStylesSubmenuWidth() {
  const wasSubmenuHidden = stylesSubmenu.hidden;
  const wereActionsHidden = formatActions.hidden;
  stylesSubmenu.hidden = false;
  formatActions.hidden = false;
  const width = stylesSubmenu.getBoundingClientRect().width;
  stylesSubmenu.hidden = wasSubmenuHidden;
  formatActions.hidden = wereActionsHidden;
  return width;
}

function setStylesSubmenuSide(submenuWidth) {
  const margin = 8;
  const menuBounds = menu.getBoundingClientRect();
  const rightSpace = window.innerWidth - menuBounds.right - margin;
  const leftSpace = menuBounds.left - margin;
  const side = rightSpace >= submenuWidth ? "right"
    : leftSpace >= submenuWidth ? "left" : "below";
  stylesGroup.dataset.submenuSide = side;
  stylesButton.querySelector(".chat-format-menu__submenu-arrow").textContent = side === "left" ? "‹" : side === "below" ? "⌄" : "›";
}

function positionMenu(formatMenu, x, y) {
  formatMenu.style.left = `${x}px`;
  formatMenu.style.top = `${y}px`;
  const bounds = formatMenu.getBoundingClientRect();
  const margin = 8;
  formatMenu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - bounds.width - margin))}px`;
  formatMenu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - bounds.height - margin))}px`;
}

function applyFormat(action) {
  const selection = currentSelection;
  const format = FORMATS[action];
  if (!selection || !format) return;
  const { input, range } = selection;
  if (!applyRichEditorFormat(input, action, "", range)) return;
  closeMenu();
  focusChatInput(input);
}

function selectAllInputText() {
  const selection = currentSelection;
  if (!selection) return;
  const { input } = selection;
  closeMenu();
  focusChatInput(input);
  setRichEditorSelection(input, 0, getRichEditorTextLength(input));
}

function showLinkEditor() {
  menu.setAttribute("role", "dialog");
  const isAlias = Boolean(currentSelectionLink);
  menu.setAttribute("aria-label", isAlias ? "Crear alias para el enlace" : "Crear enlace para el texto seleccionado");
  menuActions.hidden = true;
  linkForm.hidden = false;
  clearLinkError();
  linkAliasLabel.hidden = !isAlias;
  linkInput.closest("label").hidden = isAlias;
  linkFormatLabel.textContent = isAlias ? "Crear alias" : "Crear enlace";
  if (isAlias) {
    linkAliasInput.value = currentSelection.range.toString();
    linkInput.value = currentSelectionLink.href;
  } else {
    linkAliasInput.value = "";
    linkInput.value = "";
  }
  positionMenu(menu, menuAnchor.x, menuAnchor.y);
  (isAlias ? linkAliasInput : linkInput).focus({ preventScroll: true });
}

function applyLinkFormat() {
  const selection = currentSelection;
  if (currentSelectionLink) {
    const alias = linkAliasInput.value.trim();
    if (!selection || !alias || !currentSelectionLink.isConnected) {
      linkError.textContent = "Ingresá un texto para el alias.";
      linkError.hidden = false;
      linkAliasInput.setAttribute("aria-invalid", "true");
      linkAliasInput.focus({ preventScroll: true });
      return;
    }

    currentSelectionLink.removeAttribute("data-chat-autolink");
    replaceRichEditorRangeText(selection.input, alias, selection.range);
    closeMenu();
    focusChatInput(selection.input);
    return;
  }

  const url = normalizeLinkUrl(linkInput.value);
  if (!selection || !url) {
    linkError.hidden = false;
    linkInput.setAttribute("aria-invalid", "true");
    linkInput.focus({ preventScroll: true });
    return;
  }

  const { input, range } = selection;
  if (!applyRichEditorFormat(input, "link", url, range)) return;
  closeMenu();
  focusChatInput(input);
}

function showActions() {
  if (!menuActions) return;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Acciones del campo de mensaje");
  menuActions.hidden = false;
  linkActions.hidden = true;
  linkForm.hidden = true;
  closeStylesSubmenu();
  clipboardStatus.hidden = true;
  clipboardStatus.textContent = "";
  linkInput.value = "";
  linkAliasInput.value = "";
  linkAliasLabel.hidden = true;
  linkInput.closest("label").hidden = false;
  if (linkFormatLabel) linkFormatLabel.textContent = currentSelectionLink ? "Crear alias" : "Crear enlace";
  clearLinkError();
}

function showLinkActions() {
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Acciones del enlace");
  menuActions.hidden = true;
  linkActions.hidden = false;
  linkForm.hidden = true;
  clipboardStatus.hidden = true;
  clipboardStatus.textContent = "";
  closeStylesSubmenu();
}

function copySelection() {
  const selection = currentSelection;
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
    closeMenu();
    return;
  }
  if (!navigator.clipboard?.writeText) {
    showClipboardError("No se pudo copiar desde el menú. Usa Ctrl+C.");
    return;
  }
  navigator.clipboard.writeText(plainText).then(closeMenu).catch(() => {
    showClipboardError("No se pudo copiar desde el menú. Usa Ctrl+C.");
  });
}

function cutSelection() {
  const selection = currentSelection;
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
    closeMenu();
    focusChatInput(input);
    return;
  }
  if (!navigator.clipboard?.writeText) {
    showClipboardError("No se pudo cortar desde el menú. Usa Ctrl+X.");
    return;
  }
  navigator.clipboard.writeText(plainText).then(() => {
    if (menu.hidden || currentSelection !== selection) return;
    focusChatInput(input);
    if (!replaceRichEditorRangeText(input, "", range)) return;
    closeMenu();
    focusChatInput(input);
  }).catch(() => {
    showClipboardError("No se pudo cortar desde el menú. Usa Ctrl+X.");
  });
}

async function pasteSelection() {
  const selection = currentSelection;
  if (!selection) return;
  if (!navigator.clipboard?.readText) {
    showClipboardError("El navegador no permitió leer el portapapeles. Usa Ctrl+V.");
    return;
  }
  const { input, range } = selection;
  const offsets = getRichEditorSelection(input, range);
  try {
    const text = await navigator.clipboard.readText();
    if (menu.hidden || currentSelection !== selection) return;
    focusChatInput(input);
    setRichEditorRange(input, range);
    insertRichEditorText(input, text, offsets);
    closeMenu();
    focusChatInput(input);
  } catch {
    showClipboardError("El navegador no permitió leer el portapapeles. Usa Ctrl+V.");
  }
}

function showClipboardError(message) {
  clipboardStatus.textContent = message;
  clipboardStatus.hidden = false;
}

function clearLinkError() {
  if (!linkError || !linkInput) return;
  linkError.hidden = true;
  linkError.textContent = "Ingresá una dirección http o https válida.";
  linkInput.removeAttribute("aria-invalid");
  linkAliasInput?.removeAttribute("aria-invalid");
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

function closeMenu(restoreFocus = false) {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  menu.style.removeProperty("left");
  menu.style.removeProperty("top");
  menuAnchor = null;
  currentLinkHref = "";
  currentSelectionLink = null;
  showActions();
  const selection = currentSelection;
  currentSelection = null;
  if (restoreFocus && selection) {
    focusChatInput(selection.input);
    setRichEditorRange(selection.input, selection.range);
  }
}
