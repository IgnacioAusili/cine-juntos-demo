import { focusChatInput } from "../../chat/composer/chat-input-focus.js";
import { getRichEditorSelection, insertRichEditorText } from "../../chat/composer/chat-rich-editor.js";
import { traceMiniPlayer } from "./mini-player-debug.js";

const EMOJI_POPOVER_TAIL_INSET_PX = 12;
const EMOJI_POPOVER_TRANSITION_MS = 150;
const MOBILE_CHAT_LAYOUT_QUERY = "(max-width: 980px)";
const miniEmojiPopoverHideTimers = new WeakMap();
const miniEmojiSelections = new WeakMap();

function isMobileChatLayout() { return Boolean(window.matchMedia && window.matchMedia(MOBILE_CHAT_LAYOUT_QUERY).matches); }
function getMirrorChatInput(element) { return element.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]"); }

export function toggleMiniEmojiPicker(element) {
  const surface = element.closest(".mini-player-surface");
  const input = getMirrorChatInput(element);
  if (!surface || !input) {
    traceMiniPlayer("emoji-toggle-failed", { hasSurface: Boolean(surface), hasInput: Boolean(input) });
    return;
  }

  const popover = getMiniEmojiPopover(surface);
  if (!popover.hidden) {
    traceMiniPlayer("emoji-popover-close-request", {
      optionCount: popover.querySelectorAll(".emoji-popover__option").length,
      hasTrack: Boolean(popover.querySelector(".emoji-popover__track")),
    });
    hideMiniEmojiPopover(popover);
    return;
  }

  const savedSelection = miniEmojiSelections.get(element)
    || (input.isContentEditable ? getRichEditorSelection(input) : null);
  const selectionStart = savedSelection?.start ?? input.selectionStart ?? input.value.length;
  const selectionEnd = savedSelection?.end ?? input.selectionEnd ?? input.value.length;
  const hideTimer = miniEmojiPopoverHideTimers.get(popover);
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    miniEmojiPopoverHideTimers.delete(popover);
  }
  popover.hidden = false;
  popover.classList.remove('emoji-popover--closing');
  const anchor = element.querySelector(
    "#overlayEmojiButton, [data-proxy-for=\"overlayEmojiButton\"]",
  );
  if (anchor) {
    const popoverRect = popover.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const anchorOffset = Math.min(
      popoverRect.width - EMOJI_POPOVER_TAIL_INSET_PX,
      Math.max(
        EMOJI_POPOVER_TAIL_INSET_PX,
        anchorRect.left + anchorRect.width / 2 - popoverRect.left,
      ),
    );
    popover.dataset.placement = popoverRect.bottom <= anchorRect.top
      ? "top"
      : "bottom";
    popover.style.setProperty("--emoji-popover-anchor-x", `${anchorOffset}px`);
  }
  window.requestAnimationFrame(() => {
    if (popover.hidden || popover.classList.contains('emoji-popover--closing')) return;
    popover.classList.add('emoji-popover--open');
  });
  if (!isMobileChatLayout()) {
    requestAnimationFrame(() => focusChatInput(input, selectionStart, selectionEnd));
  }
  const track = popover.querySelector(".emoji-popover__track");
  const rect = popover.getBoundingClientRect();
  traceMiniPlayer("emoji-popover-opened", {
    hidden: popover.hidden,
    className: popover.className,
    optionCount: popover.querySelectorAll(".emoji-popover__option").length,
    hasTrack: Boolean(track),
    trackClientWidth: track?.clientWidth ?? null,
    trackScrollWidth: track?.scrollWidth ?? null,
    bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    background: window.getComputedStyle(popover).backgroundColor,
  });
  window.requestAnimationFrame(() => {
    if (popover.hidden || popover.classList.contains('emoji-popover--closing')) return;
    const renderedRect = popover.getBoundingClientRect();
    traceMiniPlayer("emoji-popover-render-frame", {
      hidden: popover.hidden,
      className: popover.className,
      optionCount: popover.querySelectorAll(".emoji-popover__option").length,
      trackClientWidth: track?.clientWidth ?? null,
      trackScrollWidth: track?.scrollWidth ?? null,
      bounds: { x: Math.round(renderedRect.x), y: Math.round(renderedRect.y), width: Math.round(renderedRect.width), height: Math.round(renderedRect.height) },
    });
  });
}

function hideMiniEmojiPopover(popover) {
  if (popover.hidden || popover.classList.contains('emoji-popover--closing')) return;
  const hideTimer = miniEmojiPopoverHideTimers.get(popover);
  if (hideTimer) window.clearTimeout(hideTimer);
  popover.classList.remove('emoji-popover--open');
  popover.classList.add('emoji-popover--closing');
  const nextHideTimer = window.setTimeout(() => {
    popover.hidden = true;
    popover.classList.remove('emoji-popover--closing');
    popover.dataset.placement = "";
    popover.style.removeProperty("--emoji-popover-anchor-x");
    miniEmojiPopoverHideTimers.delete(popover);
  }, EMOJI_POPOVER_TRANSITION_MS);
  miniEmojiPopoverHideTimers.set(popover, nextHideTimer);
}

function getMiniEmojiPopover(surface) {
  let popover = surface.querySelector('.emoji-popover--mini');
  if (popover) return popover;

  popover = surface.ownerDocument.createElement("div");
  popover.className = 'emoji-popover emoji-popover--mini';
  popover.hidden = true;
  popover.setAttribute("aria-label", "Selector de emojis");
  const fog = surface.ownerDocument.createElement("span");
  fog.className = 'emoji-popover__fog';
  fog.setAttribute("aria-hidden", "true");
  popover.append(fog);
  const sourcePopover = document.querySelector("#emojiPopover");
  const sourceTrack = sourcePopover?.querySelector(".emoji-popover__track");
  if (sourceTrack) {
    popover.classList.toggle(
      "emoji-popover--paged",
      sourcePopover.classList.contains("emoji-popover--paged"),
    );
    popover.append(surface.ownerDocument.importNode(sourceTrack, true));
  }
  popover.addEventListener("mousedown", (event) => event.preventDefault());
  popover.addEventListener("click", (event) => insertMiniEmoji(surface, event.target));
  surface.append(popover);
  return popover;
}

function insertMiniEmoji(surface, target) {
  const option = target.closest?.('.emoji-popover__option');
  const input = surface.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
  if (!option || !input) {
    traceMiniPlayer("emoji-insert-failed", { hasOption: Boolean(option), hasInput: Boolean(input) });
    return;
  }
  traceMiniPlayer("emoji-selected", {
    emoji: option.textContent,
    inputKind: input.isContentEditable ? "contenteditable" : input.type || input.tagName.toLowerCase(),
    inputLengthBefore: input.isContentEditable ? input.textContent.length : input.value.length,
  });

  if (input.isContentEditable) {
    insertRichEditorText(input, option.textContent, miniEmojiSelections.get(surface));
    miniEmojiSelections.delete(surface);
    hideMiniEmojiPopover(surface.querySelector('.emoji-popover--mini'));
    return;
  }

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${option.textContent}${input.value.slice(end)}`;
  const position = start + option.textContent.length;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (isMobileChatLayout()) {
    input.setSelectionRange?.(position, position);
  } else {
    focusChatInput(input, position, position);
  }
  hideMiniEmojiPopover(surface.querySelector('.emoji-popover--mini'));
}

export function captureMiniEmojiSelection(element) {
  const input = element?.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
  if (input?.isContentEditable) miniEmojiSelections.set(element, getRichEditorSelection(input));
}
