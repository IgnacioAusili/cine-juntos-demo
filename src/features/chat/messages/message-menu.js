// Menu contextual del mensaje: posicion, ocultado y copiado de texto.
import { dom } from "../../../core/dom.js";
import { state, logEvent } from "../../../core/state.js";
import { openChatLinkInNewWindow } from "./chat-link-confirmation.js";

let currentLinkHref = "";

export function showMessageMenu(message, x, y, replyInput = null, linkHref = "") {
  clearMessageMenuSourceState();
  state.chat.menuMessage = message;
  state.chat.menuReplyInput = replyInput;
  currentLinkHref = getOpenableLinkHref(linkHref);
  const openLinkButton = dom.messageMenu.querySelector('[data-action="open-link"]');
  if (openLinkButton) openLinkButton.hidden = !currentLinkHref;
  state.chat.messageMenuOpenedAt = Date.now();
  dom.messageMenu.hidden = false;
  const rect = dom.messageMenu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, x));
  const top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, y));
  dom.messageMenu.style.left = `${left}px`;
  dom.messageMenu.style.top = `${top}px`;
  markMessageMenuSource(message, replyInput);
}

export function hideMessageMenu() {
  clearMessageMenuSourceState();
  state.chat.menuMessage = null;
  state.chat.menuReplyInput = null;
  currentLinkHref = "";
  dom.messageMenu.hidden = true;
}

export function openMessageMenuLink() {
  if (!currentLinkHref) return;
  openChatLinkInNewWindow(currentLinkHref);
  hideMessageMenu();
}

function getOpenableLinkHref(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";

  try {
    const url = new URL(candidate, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function markMessageMenuSource(message, replyInput) {
  const container = replyInput === dom.overlayMessageInput ? dom.overlayMessages : dom.messages;
  const item = Array.from(container?.children || []).find(
    (candidate) => candidate._chatMessage === message || candidate.dataset.messageId === message?.id,
  );
  item?.classList.add('message-menu--open');
}

function clearMessageMenuSourceState() {
  document.querySelectorAll('.message-menu--open').forEach((item) => {
    item.classList.remove('message-menu--open');
  });
}

export function copyMessageText(message) {
  navigator.clipboard?.writeText(message.text || "").catch(() => {});
  logEvent("chat", "Mensaje copiado.");
}
