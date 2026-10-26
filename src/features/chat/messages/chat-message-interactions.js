// Cableado de interacciones del mensaje: listeners de puntero, long-press y contextmenu.
// El motor de gesto vive en swipe-reply.js.
import { state } from "../../../core/state.js";
import { dom } from "../../../core/dom.js";
import { createSwipeReply } from "./swipe-reply.js";
import { hideMessageMenu, showMessageMenu } from "./message-menu.js";

const LONG_PRESS_DELAY = 560;

export function extendMessageHitArea(item, container) {
  const containerStyle = window.getComputedStyle(container);
  const startInset = Number.parseFloat(containerStyle.paddingInlineStart) || 0;
  const endInset = Number.parseFloat(containerStyle.paddingInlineEnd) || 0;
  const totalInset = startInset + endInset;
  if (totalInset <= 0) return;

  // Keep message content in place while extending its hit area into the
  // container padding, so edge swipes still target the message article.
  item.style.boxSizing = "border-box";
  item.style.width = `calc(100% + ${totalInset}px)`;
  item.style.maxWidth = `calc(100% + ${totalInset}px)`;
  item.style.marginInlineStart = `${-startInset}px`;
  item.style.marginInlineEnd = `${-endInset}px`;
  item.style.paddingInlineStart = `${startInset}px`;
  item.style.paddingInlineEnd = `${endInset}px`;
}

export function wireMessageInteractions(
  bubble,
  message,
  hint,
  {
    setReplyTarget,
    replyInput,
    companions = [],
    interactionTarget = bubble,
    interactionBand = interactionTarget,
    interactionBands = [],
    allowSwipeInsideBubble = false,
  },
) {
  const swipeBands = [interactionBand, ...interactionBands].filter(Boolean);
  const swipe = createSwipeReply(bubble, hint, {
    onReply: () => setReplyTarget?.(message, replyInput),
    companions,
    pointerCaptureTarget: interactionTarget,
  });
  let longPressPointerId = null;
  let longPressStart = null;
  let longPressTriggered = false;
  let textSelectionPointerId = null;

  function clearLongPress() {
    window.clearTimeout(state.chat.longPressTimer);
    state.chat.longPressTimer = null;
    state.chat.longPressStart = null;
    longPressPointerId = null;
    longPressStart = null;
  }

  function armLongPress(event) {
    longPressTriggered = false;
    longPressPointerId = event.pointerId;
    longPressStart = { x: event.clientX, y: event.clientY };
    const link = event.target.closest?.("a[href]");
    const linkHref = link && bubble.contains(link) ? link.href : "";
    state.chat.longPressStart = { x: event.clientX, y: event.clientY, message };
    window.clearTimeout(state.chat.longPressTimer);
    state.chat.longPressTimer = window.setTimeout(() => {
      if (
        longPressPointerId === event.pointerId
        && longPressStart
      ) {
        longPressTriggered = true;
        showMessageMenu(message, event.clientX, event.clientY, replyInput, linkHref);
      }
    }, LONG_PRESS_DELAY);
  }

  function isWithinInteractionBand(event) {
    if (swipeBands.includes(interactionTarget)) return true;
    return swipeBands.some((band) => {
      const rect = band.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
  }

  // --- listeners ---

  interactionTarget.addEventListener("contextmenu", (event) => {
    if (!isWithinInteractionBand(event)) return;
    event.preventDefault();
    if (dom.messageMenu && !dom.messageMenu.hidden) {
      hideMessageMenu();
      return;
    }
    const link = event.target.closest?.("a[href]");
    const linkHref = link && bubble.contains(link) ? link.href : "";
    showMessageMenu(message, event.clientX, event.clientY, replyInput, linkHref);
  });

  interactionTarget.addEventListener("dragstart", (event) => {
    if (bubble.contains(event.target)) return;
    event.preventDefault();
  });

  interactionTarget.addEventListener("click", (event) => {
    if (longPressTriggered) {
      longPressTriggered = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!swipe.blockClick) return;
    swipe.blockClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  interactionTarget.addEventListener("pointerdown", (event) => {
    if (event.button && event.button !== 0) return;
    if (!isWithinInteractionBand(event)) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, [contenteditable='true']")) {
      return;
    }
    if (event.pointerType !== "touch" && event.target instanceof Element) {
      const contentTarget = event.target.closest(".message__content");
      if (contentTarget && bubble.contains(contentTarget)) {
        // Deja que el navegador inicie la selección nativa en el texto del chat.
        textSelectionPointerId = event.pointerId;
        return;
      }
      const textMetaTarget = event.target.closest(".message__meta, .message__time-anchor");
      if (textMetaTarget && (textMetaTarget.matches(".message__meta") || bubble.contains(textMetaTarget))) {
        textSelectionPointerId = null;
        return;
      }
    }
    const horizontalMediaStrip = event.target instanceof Element
      ? event.target.closest(".message__media-strip")
      : null;
    if (
      event.pointerType === "touch"
      && horizontalMediaStrip
      && horizontalMediaStrip.scrollWidth > horizontalMediaStrip.clientWidth
    ) {
      armLongPress(event);
      return;
    }
    if (!allowSwipeInsideBubble && bubble.contains(event.target)) {
      if (event.pointerType === "touch") armLongPress(event);
      return;
    }
    if (event.pointerType !== "touch") {
      event.preventDefault();
    }
    swipe.beginSwipe(event);
    if (event.pointerType === "touch") {
      armLongPress(event);
    } else {
      clearLongPress();
    }
  });

  interactionTarget.addEventListener("pointermove", (event) => {
    if (longPressStart && longPressPointerId === event.pointerId) {
      const movedX = event.clientX - longPressStart.x;
      const movedY = event.clientY - longPressStart.y;
      if (Math.hypot(movedX, movedY) > 10) clearLongPress();
    }
    if (!swipe.tracking || event.pointerId !== swipe.pointerId) return;
    swipe.updateSwipe(event.clientX, event.clientY);
    // Una vez confirmado el eje horizontal, impedir que el desplazamiento
    // diagonal siga propagándose al scroll de la página.
    if (swipe.directionLocked) event.preventDefault();
  });

  interactionTarget.addEventListener("pointerup", (event) => {
    clearLongPress();
    if (textSelectionPointerId === event.pointerId) {
      textSelectionPointerId = null;
      const timeTarget = event.target instanceof Element
        ? event.target.closest(".message__time-anchor")
        : null;
      if (timeTarget && bubble.contains(timeTarget)) {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(bubble);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
    if (event.pointerId !== swipe.pointerId) return;
    swipe.endSwipe();
  });

  interactionTarget.addEventListener("pointercancel", (event) => {
    clearLongPress();
    if (textSelectionPointerId === event.pointerId) textSelectionPointerId = null;
    if (event.pointerId !== swipe.pointerId) return;
    swipe.cancelSwipe(swipe.offset > 0);
  });

  interactionTarget.addEventListener("lostpointercapture", () => {
    clearLongPress();
    textSelectionPointerId = null;
    if (swipe.tracking) {
      swipe.cancelSwipe(swipe.offset > 0);
    }
  });
}
