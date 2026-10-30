import { dom } from "../../../core/dom.js";
import { expandSystemMessageGroupForItem } from "../system-messages/system-message-groups.js";

const pendingOverlayHighlights = new WeakMap();
const pendingOverlayHighlightTimers = new WeakMap();
const pendingFragmentHighlightTimers = new WeakMap();
const pendingFragmentHighlightLayers = new WeakMap();
let activeFragmentHighlightContent = null;

export function scrollToMessage(messageId, preferredContainer = null) {
  if (!messageId) return;
  const containers = [preferredContainer, dom.overlayMessages, dom.messages].filter(
    (container, index, all) => container && all.indexOf(container) === index,
  );
  for (const container of containers) {
    const target = container.querySelector(
      `article[data-message-id="${messageId}"]`,
    );
    if (target) {
      const expansion = expandSystemMessageGroupForItem(target);
      if (expansion) {
        expansion.then(() => scrollToMessage(messageId, container));
        return;
      }

      const targetTop = target.offsetTop;
      const targetBottom = targetTop + target.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      const fullyVisible = targetTop >= viewTop && targetBottom <= viewBottom;

      if (!fullyVisible) {
        const nextTop = Math.max(0, targetTop - container.clientHeight / 2 + target.offsetHeight / 2);
        container.scrollTo({ top: nextTop, behavior: "smooth" });
      }

      highlightMessage(target);
      return;
    }
  }
}

export function scrollToMessageFragment(messageId, start, end, preferredContainer = null) {
  if (!messageId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
  const containers = [preferredContainer, dom.overlayMessages, dom.messages].filter(
    (container, index, all) => container && all.indexOf(container) === index,
  );
  for (const container of containers) {
    const target = container.querySelector(`article[data-message-id="${messageId}"]`);
    if (!target) continue;

    const expansion = expandSystemMessageGroupForItem(target);
    if (expansion) {
      expansion.then(() => scrollToMessageFragment(messageId, start, end, container));
      return;
    }

    scrollMessageIntoView(container, target);
    const content = target.querySelector(".message__content");
    if (content && highlightMessageFragment(content, start, end)) return;
    highlightMessage(target);
    return;
  }
}

function scrollMessageIntoView(container, target) {
  const targetTop = target.offsetTop;
  const targetBottom = targetTop + target.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  if (targetTop < viewTop || targetBottom > viewBottom) {
    const nextTop = Math.max(0, targetTop - container.clientHeight / 2 + target.offsetHeight / 2);
    container.scrollTo({ top: nextTop, behavior: "smooth" });
  }
}

function highlightMessageFragment(content, start, end) {
  if (activeFragmentHighlightContent && activeFragmentHighlightContent !== content) {
    clearFragmentHighlight(activeFragmentHighlightContent);
  }
  clearFragmentHighlight(content);
  const matches = [];
  const walker = content.ownerDocument.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let textOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeEnd = textOffset + node.nodeValue.length;
    const localStart = Math.max(0, start - textOffset);
    const localEnd = Math.min(node.nodeValue.length, end - textOffset);
    if (localStart < localEnd) matches.push({ node, start: localStart, end: localEnd });
    textOffset = nodeEnd;
  }
  if (!matches.length) return false;

  const first = matches[0];
  const last = matches.at(-1);
  if (!first.node.isConnected || !last.node.isConnected) return false;

  const range = content.ownerDocument.createRange();
  range.setStart(first.node, first.start);
  range.setEnd(last.node, last.end);

  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return false;
  const bubble = content.closest(".message__bubble");
  if (!bubble) return false;

  const highlightLayer = content.ownerDocument.createElement("div");
  highlightLayer.className = "message-fragment-highlight-layer";
  highlightLayer.setAttribute("aria-hidden", "true");
  bubble.append(highlightLayer);
  bubble.classList.add("message__bubble--fragment-highlighted");
  pendingFragmentHighlightLayers.set(content, highlightLayer);
  activeFragmentHighlightContent = content;

  const bubbleRect = bubble.getBoundingClientRect();
  mergeFragmentLineRects(rects).forEach((line, index, lines) => {
    const center = (line.top + line.bottom) / 2;
    const previousGap = index > 0 ? center - lines[index - 1].center : Infinity;
    const nextGap = index < lines.length - 1 ? lines[index + 1].center - center : Infinity;
    const halfHeight = Math.max(1, Math.min(
      (line.bottom - line.top) / 2 - 1,
      previousGap / 2 - 1.1,
      nextGap / 2 - 1.1,
    ));
    const highlight = content.ownerDocument.createElement("span");
    highlight.className = "message-fragment-highlight";
    highlight.style.left = `${line.left - bubbleRect.left - bubble.clientLeft + bubble.scrollLeft}px`;
    highlight.style.top = `${center - halfHeight - bubbleRect.top - bubble.clientTop + bubble.scrollTop}px`;
    highlight.style.width = `${line.right - line.left}px`;
    highlight.style.height = `${halfHeight * 2}px`;
    highlightLayer.append(highlight);
  });

  const view = content.ownerDocument.defaultView;
  pendingFragmentHighlightTimers.set(content, view.setTimeout(() => clearFragmentHighlight(content), 2400));
  return true;
}

function mergeFragmentLineRects(rects) {
  const sortedRects = rects
    .map((rect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      center: (rect.top + rect.bottom) / 2,
    }))
    .sort((first, second) => first.center - second.center || first.left - second.left);
  const lines = [];

  sortedRects.forEach((rect) => {
    const line = lines.at(-1);
    if (line && Math.abs(rect.center - line.center) <= 2) {
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
      line.center = (line.top + line.bottom) / 2;
      return;
    }
    lines.push({ ...rect });
  });

  return lines;
}

function clearFragmentHighlight(content) {
  const timer = pendingFragmentHighlightTimers.get(content);
  if (timer) content.ownerDocument.defaultView.clearTimeout(timer);
  pendingFragmentHighlightTimers.delete(content);
  const highlightLayer = pendingFragmentHighlightLayers.get(content);
  if (highlightLayer) {
    highlightLayer.remove();
    content.closest(".message__bubble")?.classList.remove("message__bubble--fragment-highlighted");
  }
  pendingFragmentHighlightLayers.delete(content);
  if (activeFragmentHighlightContent === content) activeFragmentHighlightContent = null;
}

/**
 * Aplica un efecto visual de resaltado temporal a un elemento de mensaje.
 */
function highlightMessage(element) {
  const overlayContainer = element.closest('.chat-message-list.chat-message-list--overlay');
  if (overlayContainer) {
    highlightOverlayMessage(overlayContainer, element);
    return;
  }

  const highlightContainer = element.closest('.chat-message-list');
  if (highlightContainer) {
    const elementRect = element.getBoundingClientRect();
    const containerRect = highlightContainer.getBoundingClientRect();
    element.style.setProperty("--message-highlight-left", `${containerRect.left - elementRect.left - 2}px`);
    element.style.setProperty("--message-highlight-width", `${containerRect.width + 4}px`);
  }

  element.classList.remove("message-highlight");
  void element.offsetWidth; // Force reflow
  element.classList.add("message-highlight");
  window.setTimeout(() => {
    element.classList.remove("message-highlight");
    element.style.removeProperty("--message-highlight-left");
    element.style.removeProperty("--message-highlight-width");
  }, 2600);
}

function highlightOverlayMessage(container, element) {
  const previousHighlight = pendingOverlayHighlights.get(container);
  if (previousHighlight) {
    previousHighlight.remove();
    pendingOverlayHighlights.delete(container);
  }
  const previousTimer = pendingOverlayHighlightTimers.get(container);
  if (previousTimer) {
    window.clearTimeout(previousTimer);
    pendingOverlayHighlightTimers.delete(container);
  }

  const highlight = document.createElement("div");
  highlight.className = "message-highlight message-highlight--overlay";
  highlight.style.top = `${Math.max(0, element.offsetTop - 2)}px`;
  highlight.style.height = `${element.offsetHeight + 4}px`;
  container.append(highlight);
  pendingOverlayHighlights.set(container, highlight);

  void highlight.offsetWidth; // Force reflow for the pulse animation

  const timer = window.setTimeout(() => {
    if (pendingOverlayHighlights.get(container) !== highlight) return;
    highlight.remove();
    pendingOverlayHighlights.delete(container);
    pendingOverlayHighlightTimers.delete(container);
  }, 2600);
  pendingOverlayHighlightTimers.set(container, timer);
}
