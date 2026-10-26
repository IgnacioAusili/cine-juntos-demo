// Menu contextual del mensaje: posicion, ocultado y copiado de texto.
import { dom } from "../../../core/dom.js";
import { state, logEvent } from "../../../core/state.js";
import { openChatLinkInNewWindow } from "./chat-link-confirmation.js";

let currentLinkHref = "";
let currentQuoteSelection = null;

export function showMessageMenu(message, x, y, replyInput = null, linkHref = "") {
  if (dom.messageMenu.dataset.contextToggleBound !== "true") {
    dom.messageMenu.dataset.contextToggleBound = "true";
    dom.messageMenu.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      hideMessageMenu();
    });
  }
  clearMessageMenuSourceState();
  state.chat.menuMessage = message;
  state.chat.menuReplyInput = replyInput;
  currentLinkHref = getOpenableLinkHref(linkHref);
  currentQuoteSelection = getSelectedQuoteFragment(message, replyInput);
  const quoteButton = dom.messageMenu.querySelector('[data-action="quote-selection"]');
  if (quoteButton) quoteButton.hidden = !currentQuoteSelection;
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
  currentQuoteSelection = null;
  dom.messageMenu.hidden = true;
}

export function getCurrentMessageMenuQuoteSelection() {
  return currentQuoteSelection;
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
  getMessageMenuSource(message, replyInput)?.classList.add('message-menu--open');
}

function getMessageMenuSource(message, replyInput = state.chat.menuReplyInput) {
  const container = replyInput === dom.overlayMessageInput ? dom.overlayMessages : dom.messages;
  return Array.from(container?.children || []).find(
    (candidate) => candidate._chatMessage === message || candidate.dataset.messageId === message?.id,
  );
}

function getSelectedQuoteFragment(message, replyInput) {
  const content = getMessageMenuSource(message, replyInput)?.querySelector(".message__content");
  const selection = window.getSelection();
  if (!content || !selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) return null;

  let start = getTextOffset(content, range.startContainer, range.startOffset);
  let end = getTextOffset(content, range.endContainer, range.endOffset);
  if (end < start) [start, end] = [end, start];
  const selectedText = content.textContent.slice(start, end);
  const leadingSpace = selectedText.length - selectedText.trimStart().length;
  const text = selectedText.trim();
  if (!text) return null;

  start += leadingSpace;
  end = start + text.length;
  return { text: text.slice(0, 180), start, end };
}

function getTextOffset(root, target, targetOffset) {
  let textOffset = 0;
  let result = 0;
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        result = textOffset + Math.max(0, Math.min(node.nodeValue.length, targetOffset));
      } else {
        for (let index = 0; index < Math.min(node.childNodes.length, targetOffset); index += 1) {
          textOffset += node.childNodes[index].textContent?.length || 0;
        }
        result = textOffset;
      }
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      textOffset += node.nodeValue.length;
      return;
    }
    for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return result;
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

export function selectMessageText(message, replyInput = state.chat.menuReplyInput) {
  const bubble = getMessageMenuSource(message, replyInput)?.querySelector(".message__bubble");
  const selection = window.getSelection();
  if (!bubble || !selection) return false;

  const textRoots = [...bubble.querySelectorAll(".message__text, .message__system-text, .message__link")]
    .filter((element) => {
      if (element.closest(".message__reply")) return false;
      return !element.parentElement?.closest(".message__text, .message__system-text");
    });
  if (!textRoots.length) return false;

  const range = document.createRange();
  range.setStartBefore(textRoots[0]);
  range.setEndAfter(textRoots.at(-1));
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
