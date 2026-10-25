import { dom } from "../../../core/dom.js";
import { addPendingImageFile } from "./chat-message-input.js";
import { addPendingImageDataUrl } from "../messages/image-compress.js";
import { getRichEditorTextLength, insertRichEditorText, setRichEditorSelection } from "./chat-rich-editor.js";

const IMAGE_URL_EXTENSION = /\.(?:avif|gif|jpe?g|png|webp|bmp|svg)$/i;
const INTERNAL_PREVIEW_DRAG_TYPE = "application/x-cine-juntos-preview";
const DRAG_SCROLL_EDGE = 64;
const DRAG_SCROLL_MAX_SPEED = 18;
const DRAG_IDLE_TIMEOUT_MS = 750;

const dropTargetForms = new Set();
let documentDropEventsBound = false;
let dragIsActive = false;
let dragWatchdogTimer = 0;
let dragModalObserver = null;
let dragScrollFrame = 0;
let dragScrollTarget = null;
let dragScrollBounds = null;
let dragPointerY = 0;

export function wireChatComposerDropTargets() {
  wireDropTarget(dom.messageForm, dom.messageInput, false);
  wireDropTarget(dom.overlayMessageForm, dom.overlayMessageInput, true);
  wireDocumentDropEvents();
}

function wireDropTarget(form, input, isOverlay) {
  if (!form || !input || form.dataset.chatDropBound === "true") return;
  form.dataset.chatDropBound = "true";
  dropTargetForms.add(form);

  const inputWrapper = form.querySelector(".message-form__input-wrapper");
  if (inputWrapper) {
    const hint = form.ownerDocument.createElement("div");
    hint.className = "message-form__drop-overlay";
    hint.textContent = "Arrastra aquí";
    hint.setAttribute("aria-hidden", "true");
    inputWrapper.append(hint);
  }

  form.addEventListener("dragenter", (event) => {
    if (!canAcceptDrop(event.dataTransfer)) return;
    event.preventDefault();
    form.classList.add("message-form--drag-hover");
  });

  form.addEventListener("dragover", (event) => {
    if (!canAcceptDrop(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    form.classList.add("message-form--drag-hover");
  });

  form.addEventListener("dragleave", (event) => {
    const rect = form.getBoundingClientRect();
    const pointerStillInside = event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
    if (!pointerStillInside) form.classList.remove("message-form--drag-hover");
  });

  form.addEventListener("drop", (event) => {
    if (isInternalPreviewDrag(event.dataTransfer)) {
      event.preventDefault();
      form.classList.remove("message-form--drag-hover");
      clearDragState();
      return;
    }

    const payload = readDropPayload(event.dataTransfer);
    form.classList.remove("message-form--drag-hover");
    if (canAcceptDrop(event.dataTransfer)) event.preventDefault();
    if (!payload.files.length && !payload.urls.length && !payload.text) return;

    payload.files.forEach((file) => addPendingImageFile(file, isOverlay));
    addDroppedUrls(payload.urls, isOverlay, input);
    if (payload.text) appendDroppedText(input, payload.text);
  });

  form.addEventListener("dragend", () => {
    clearDragState();
  });
}

function wireDocumentDropEvents() {
  if (documentDropEventsBound) return;
  documentDropEventsBound = true;

  document.addEventListener("dragenter", (event) => {
    if (isInternalPreviewDrag(event.dataTransfer)) {
      clearDragState();
      return;
    }
    if (canAcceptDrop(event.dataTransfer)) setDropReady(true);
  }, true);

  document.addEventListener("dragover", (event) => {
    if (isInternalPreviewDrag(event.dataTransfer)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
      clearDragState();
      return;
    }
    if (!canAcceptDrop(event.dataTransfer)) return;
    setDropReady(true);
    updateDragAutoScroll(event);
  }, true);

  document.addEventListener("dragleave", (event) => {
    if (isPointerOutsidePage(event)) clearDragState();
  }, true);

  document.addEventListener("drop", (event) => {
    if (isInternalPreviewDrag(event.dataTransfer)) event.preventDefault();
    clearDragState();
  }, true);
  document.addEventListener("dragstart", markInternalPreviewDrag, true);
  window.addEventListener("dragend", clearDragState, true);
  window.addEventListener("blur", clearDragState);
  window.addEventListener("pagehide", clearDragState);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearDragState();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dragIsActive) clearDragState();
  }, true);
}

function markInternalPreviewDrag(event) {
  const source = event.target instanceof Element
    ? event.target.closest(".message__media-link, .image-preview-container__item")
    : null;
  if (!source || !event.dataTransfer) return;
  try {
    event.dataTransfer.setData(INTERNAL_PREVIEW_DRAG_TYPE, "1");
  } catch {
    // A browser may expose a read-only drag payload for some media sources.
  }
}

function isInternalPreviewDrag(dataTransfer) {
  return Array.from(dataTransfer?.types || [])
    .some((type) => String(type).toLowerCase() === INTERNAL_PREVIEW_DRAG_TYPE);
}

function setDropReady(isReady) {
  if (isReady && hasBlockingDialog()) {
    clearDragState();
    return;
  }

  dragIsActive = isReady;
  dropTargetForms.forEach((form) => {
    form.classList.toggle("message-form--drag-ready", isReady);
  });

  window.clearTimeout(dragWatchdogTimer);
  dragWatchdogTimer = 0;
  if (!isReady) {
    dragModalObserver?.disconnect();
    dragModalObserver = null;
    return;
  }

  dragWatchdogTimer = window.setTimeout(clearDragState, DRAG_IDLE_TIMEOUT_MS);
  observeBlockingDialogs();
}

function clearDropReady() {
  setDropReady(false);
  dropTargetForms.forEach((form) => form.classList.remove("message-form--drag-hover"));
}

function clearDragState() {
  clearDropReady();
  dragScrollTarget = null;
  dragScrollBounds = null;
  if (dragScrollFrame) {
    window.cancelAnimationFrame(dragScrollFrame);
    dragScrollFrame = 0;
  }
}

function observeBlockingDialogs() {
  if (dragModalObserver || !document.documentElement) return;
  dragModalObserver = new MutationObserver(() => {
    if (dragIsActive && hasBlockingDialog()) clearDragState();
  });
  dragModalObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open", "aria-modal", "hidden", "class", "style"],
  });
}

function hasBlockingDialog() {
  const dialogs = document.querySelectorAll("dialog[open], [role='dialog'][aria-modal='true']");
  return Array.from(dialogs).some((dialog) => {
    if (!dialog.isConnected || dialog.hidden) return false;
    const style = window.getComputedStyle(dialog);
    if (style.display === "none" || style.visibility === "hidden") return false;

    if (dialog.localName === "dialog") {
      try {
        if (dialog.matches(":modal")) return true;
      } catch {
        // Use the explicit aria-modal and viewport checks when :modal is unavailable.
      }
    }
    if (dialog.getAttribute("aria-modal") === "true") return true;

    const rect = dialog.getBoundingClientRect();
    return rect.left <= 1
      && rect.top <= 1
      && rect.right >= window.innerWidth - 1
      && rect.bottom >= window.innerHeight - 1;
  });
}

function isPointerOutsidePage(event) {
  if (event.relatedTarget) return false;
  return event.clientX < 0
    || event.clientY < 0
    || event.clientX > window.innerWidth
    || event.clientY > window.innerHeight;
}

function updateDragAutoScroll(event) {
  const target = getDragScrollTarget(event.target);
  dragScrollTarget = target?.element || null;
  dragScrollBounds = target?.bounds || null;
  dragPointerY = event.clientY;
  if (dragScrollTarget && !dragScrollFrame) {
    dragScrollFrame = window.requestAnimationFrame(stepDragAutoScroll);
  }
}

function getDragScrollTarget(eventTarget) {
  const target = eventTarget instanceof Element ? eventTarget : null;
  const chatArea = target?.closest(".chat-area, .player-frame");
  if (chatArea) {
    const messageList = Array.from(chatArea.querySelectorAll(".chat-message-list"))
      .find((element) => element.getClientRects().length && element.scrollHeight > element.clientHeight + 1);
    if (messageList) return { element: messageList, bounds: getVisibleBounds(chatArea) };
  }

  let current = target;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const canScroll = /(auto|scroll|overlay)/.test(style.overflowY)
      && current.scrollHeight > current.clientHeight + 1;
    if (canScroll && !current.matches(".message-form__rich-editor, .composer-scrollbar")) {
      return { element: current, bounds: getVisibleBounds(current) };
    }
    current = current.parentElement;
  }

  const documentScroller = document.scrollingElement;
  if (documentScroller && documentScroller.scrollHeight > documentScroller.clientHeight + 1) {
    return {
      element: documentScroller,
      bounds: { top: 0, bottom: window.innerHeight },
    };
  }
  return null;
}

function getVisibleBounds(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: Math.max(0, rect.top),
    bottom: Math.min(window.innerHeight, rect.bottom),
  };
}

function stepDragAutoScroll() {
  dragScrollFrame = 0;
  if (!dragScrollTarget || !dragScrollBounds) return;

  const { top, bottom } = dragScrollBounds;
  const height = Math.max(1, bottom - top);
  const edge = Math.min(DRAG_SCROLL_EDGE, height * 0.18);
  let speed = 0;
  if (dragPointerY < top + edge) {
    speed = -getEdgeScrollSpeed(top + edge - dragPointerY, edge);
  } else if (dragPointerY > bottom - edge) {
    speed = getEdgeScrollSpeed(dragPointerY - (bottom - edge), edge);
  }

  const previousScrollTop = dragScrollTarget.scrollTop;
  if (speed) dragScrollTarget.scrollTop += speed;
  const didScroll = dragScrollTarget.scrollTop !== previousScrollTop;
  dragScrollFrame = speed && didScroll
    ? window.requestAnimationFrame(stepDragAutoScroll)
    : 0;
}

function getEdgeScrollSpeed(distance, edge) {
  return Math.min(DRAG_SCROLL_MAX_SPEED, Math.max(2, (distance / edge) * DRAG_SCROLL_MAX_SPEED));
}

function canAcceptDrop(dataTransfer) {
  if (!dataTransfer || isInternalPreviewDrag(dataTransfer) || hasBlockingDialog()) return false;
  const types = Array.from(dataTransfer.types || []).map((type) => String(type).toLowerCase());
  if (types.includes("files")) return true;
  return types.some((type) => [
    "text/uri-list",
    "text/html",
    "text/plain",
    "text/x-moz-url",
    "url",
  ].includes(type));
}

function readDropPayload(dataTransfer) {
  if (!dataTransfer) return { files: [], urls: [], text: "" };
  const files = Array.from(dataTransfer.files || []).filter(isImageFile);
  if (files.length) return { files, urls: [], text: "" };
  const itemFiles = Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(isImageFile);
  if (itemFiles.length) return { files: itemFiles, urls: [], text: "" };
  const urls = readDroppedUrls(dataTransfer);
  if (urls.length) return { files: [], urls, text: "" };
  return { files: [], urls: [], text: getTransferData(dataTransfer, "text/plain").trim() };
}

function isImageFile(file) {
  return Boolean(file?.type?.startsWith("image/") || /\.(?:avif|gif|jpe?g|png|webp|bmp|svg)$/i.test(file?.name || ""));
}

function readDroppedUrls(dataTransfer) {
  const uriList = getTransferData(dataTransfer, "text/uri-list");
  const urls = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => describeUrl(line))
    .filter(Boolean);
  if (urls.length) return deduplicateUrls(urls).slice(0, 2);

  const mozillaUrl = getTransferData(dataTransfer, "text/x-moz-url");
  const mozillaCandidate = describeUrl(mozillaUrl.split(/\r?\n/, 1)[0]);
  if (mozillaCandidate) return [mozillaCandidate];

  const html = getTransferData(dataTransfer, "text/html");
  if (html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const anchor = describeHtmlUrl(parsed.querySelector("a[href]")?.getAttribute("href"));
    const image = describeHtmlUrl(parsed.querySelector("img[src]")?.getAttribute("src"));
    if (anchor?.isImage) return [anchor];
    if (image?.isImage) return [image];
    if (anchor) return [anchor];
    if (image) return [image];
  }

  const urlData = getTransferData(dataTransfer, "URL");
  const urlCandidate = describeUrl(urlData);
  if (urlCandidate) return [urlCandidate];

  const plainText = getTransferData(dataTransfer, "text/plain").trim();
  const plainCandidate = describeUrl(plainText);
  return plainCandidate ? [plainCandidate] : [];
}

function describeHtmlUrl(value) {
  return describeUrl(value)
    || describeUrl(normalizeHttpUrl(value, true));
}

function getTransferData(dataTransfer, type) {
  try {
    return dataTransfer.getData(type) || "";
  } catch {
    return "";
  }
}

function normalizeHttpUrl(value, allowRelative = false) {
  try {
    const url = allowRelative
      ? new URL(String(value || ""), window.location.href)
      : new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function describeUrl(value) {
  const candidate = String(value || "").trim();
  if (/^data:image\/(?:avif|gif|jpe?g|png|webp|bmp|svg\+xml);base64,/i.test(candidate)) {
    return { url: candidate, isImage: true };
  }

  try {
    const parsedUrl = new URL(candidate);
    if (["http:", "https:"].includes(parsedUrl.protocol)) {
      return { url: parsedUrl.href, isImage: IMAGE_URL_EXTENSION.test(parsedUrl.pathname) };
    }
    if (parsedUrl.protocol === "file:") {
      return { url: parsedUrl.href, isImage: IMAGE_URL_EXTENSION.test(parsedUrl.pathname), isLocalFile: true };
    }
    return null;
  } catch {
    return null;
  }
}

function deduplicateUrls(urls) {
  const seen = new Set();
  return urls.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function addDroppedUrls(urls, isOverlay, input) {
  urls.forEach(({ url, isImage, isLocalFile }) => {
    if (isImage) {
      // A file:// URL is text supplied by the source page, not permission to
      // read that local path. Browsers only expose its bytes when the drop also
      // includes a File object, handled above.
      if (isLocalFile) {
        appendDroppedLink(input, url);
        return;
      }
      addRemoteImage(url, isOverlay);
      return;
    }
    appendDroppedLink(input, url);
  });
}

function addRemoteImage(url, isOverlay) {
  addPendingImageDataUrl(isOverlay, url);
}

function appendDroppedLink(input, url) {
  appendDroppedText(input, url);
}

function appendDroppedText(input, text) {
  const separator = input.value && !/\s$/.test(input.value) ? "\n" : "";
  setRichEditorSelection(input, getRichEditorTextLength(input));
  insertRichEditorText(input, `${separator}${text}`);
}
