import { openChatLinkInNewWindow } from "../messages/chat-link-confirmation.js";
import { getRichEditorRange, getRichEditorRangeAtPoint, getRichEditorLinkForRange, setRichEditorRange } from "./chat-rich-editor.js";
import { getFormatMenu } from "./chat-format-menu-view.js";
import { openMenu, closeMenu, openStylesSubmenu, closeStylesSubmenu, scheduleStylesSubmenuClose, clearLinkError } from "./chat-format-menu-position.js";
import { applyFormat, selectAllInputText, showLinkEditor, applyLinkFormat, copySelection, cutSelection, pasteSelection } from "./chat-format-menu-actions.js";

const menuState = {
  menu: null,
  menuActions: null,
  formatActions: null,
  stylesGroup: null,
  stylesButton: null,
  stylesSubmenu: null,
  selectAllButton: null,
  copyButton: null,
  cutButton: null,
  selectAllLinkButton: null,
  clipboardStatus: null,
  linkForm: null,
  linkInput: null,
  linkAliasLabel: null,
  linkAliasInput: null,
  linkError: null,
  linkActions: null,
  linkFormatLabel: null,
  currentLinkHref: "",
  currentSelectionLink: null,
  currentSelection: null,
  menuAnchor: null,
  stylesSubmenuCloseTimer: 0,
};

export function wireChatFormatMenu(inputs) {
  const formatMenu = getFormatMenu(menuState);

  inputs.filter(Boolean).forEach((input) => {
    if (input.dataset.formatMenuBound === "true") return;
    input.dataset.formatMenuBound = "true";
    input.addEventListener("contextmenu", (event) => {
      if (!formatMenu.hidden) {
        event.preventDefault();
        closeMenu(menuState);
        return;
      }

      const link = event.target.closest?.("a[data-chat-format='link']");
      if (link && input.contains(link)) {
        event.preventDefault();
        const range = getRichEditorRange(input)
          || getRichEditorRangeAtPoint(input, event.clientX, event.clientY);
        menuState.currentSelection = range ? { input, range } : null;
        menuState.currentLinkHref = link.href;
        menuState.currentSelectionLink = getRichEditorLinkForRange(input, range) === link ? link : null;
        openMenu(menuState, formatMenu, event.clientX, event.clientY, menuState.currentSelectionLink ? "format" : "link");
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
      menuState.currentLinkHref = "";
      menuState.currentSelection = { input, range };
      menuState.currentSelectionLink = getRichEditorLinkForRange(input, range);
      openMenu(menuState, formatMenu, event.clientX, event.clientY);
    });
  });

  if (formatMenu.dataset.eventsBound === "true") return;
  formatMenu.dataset.eventsBound = "true";
  formatMenu.addEventListener("mousedown", (event) => event.preventDefault());
  formatMenu.addEventListener("contextmenu", (event) => {
    if (formatMenu.hidden) return;
    event.preventDefault();
    closeMenu(menuState);
  });
  formatMenu.addEventListener("pointermove", (event) => {
    if (!menuState.menuAnchor) return;
    const pointerMoved = Math.abs(event.clientX - menuState.menuAnchor.x) + Math.abs(event.clientY - menuState.menuAnchor.y) >= 2;
    if (pointerMoved) formatMenu.dataset.hoverEnabled = "true";
  });
  menuState.stylesGroup.addEventListener("pointerenter", () => openStylesSubmenu(menuState));
  menuState.stylesGroup.addEventListener("pointerleave", (event) => {
    if (!menuState.stylesGroup.contains(event.relatedTarget)) scheduleStylesSubmenuClose(menuState);
  });
  formatMenu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.formatAction;
    if (action === "select-all") {
      selectAllInputText(menuState);
      return;
    }
    if (action === "copy") {
      copySelection(menuState);
      return;
    }
    if (action === "cut") {
      cutSelection(menuState);
      return;
    }
    if (action === "paste") {
      void pasteSelection(menuState);
      return;
    }
    if (action === "styles") {
      if (menuState.stylesSubmenu.hidden) openStylesSubmenu(menuState);
      else closeStylesSubmenu(menuState);
      return;
    }
    if (action === "open-link" && menuState.currentLinkHref) {
      openChatLinkInNewWindow(menuState.currentLinkHref);
      closeMenu(menuState);
      return;
    }
    if (action === "link" && menuState.currentSelection) {
      showLinkEditor(menuState);
      return;
    }
    if (action && menuState.currentSelection) applyFormat(menuState, action);
  });
  formatMenu.addEventListener("keydown", (event) => {
    if (["Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      formatMenu.dataset.keyboardNavigation = "true";
    }
  });
  menuState.linkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyLinkFormat(menuState);
  });
  menuState.linkInput.addEventListener("input", () => clearLinkError(menuState));
  menuState.linkAliasInput.addEventListener("input", () => clearLinkError(menuState));
  menuState.linkForm.querySelector("[data-format-cancel]").addEventListener("click", () => closeMenu(menuState, true));
  document.addEventListener("pointerdown", (event) => {
    if (event.button === 2 && inputs.some((input) => input?.contains(event.target))) return;
    if (!formatMenu.hidden && !formatMenu.contains(event.target)) closeMenu(menuState);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !formatMenu.hidden) {
      event.preventDefault();
      closeMenu(menuState, true);
    }
  });
  document.addEventListener("scroll", () => closeMenu(menuState), true);
  window.addEventListener("resize", () => closeMenu(menuState), { passive: true });
}
