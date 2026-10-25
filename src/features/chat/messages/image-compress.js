import { dom } from "../../../core/dom.js";
import { state } from "../../../core/state.js";
import {
  isPinnedToBottom,
  queuePinnedChatScrollSync,
} from "../dock/chat-scroll-sync.js";
import { hashImageFingerprint } from "../composer/chat-spam-guard.js";
import { createForeignDocumentIcon } from "../../foreign-lucide-icon.js";

const pendingImageFingerprints = {
  main: [],
  overlay: [],
};
const imagePreviewWheelListeners = new WeakSet();

function enableImagePreviewWheelScroll(container) {
  if (imagePreviewWheelListeners.has(container)) return;

  imagePreviewWheelListeners.add(container);
  container.addEventListener("wheel", (event) => {
    if (event.ctrlKey) return;

    const delta = event.deltaX || event.deltaY;
    if (!delta) return;

    const lineHeight = Number.parseFloat(getComputedStyle(container).lineHeight) || 16;
    const multiplier = event.deltaMode === 1
      ? lineHeight
      : event.deltaMode === 2
        ? container.clientWidth
        : 1;
    const currentScroll = container.scrollLeft;
    const maxScroll = container.scrollWidth - container.clientWidth;
    const nextScroll = Math.max(0, Math.min(maxScroll, currentScroll + (delta * multiplier)));

    if (nextScroll === currentScroll) return;
    event.preventDefault();
    container.scrollLeft = nextScroll;
  }, { passive: false });
}

export function getImageSourceFingerprint(image) {
  const value = String(image || "").trim();
  if (!value) return "";

  const base64Match = value.match(/^data:image\/[\w.+-]+;base64,([\s\S]*)$/i);
  if (base64Match) return `data:${hashImageFingerprint(base64Match[1])}`;
  return `url:${value}`;
}

export function addPendingImageDataUrl(isOverlay, image, sourceFingerprint = getImageSourceFingerprint(image)) {
  const images = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;
  const nextImages = Array.isArray(images) ? images.slice(0, 2) : [];
  if (nextImages.length >= 2) return false;

  const imageFingerprint = hashImageFingerprint(image);
  const imageFingerprints = pendingImageFingerprints[isOverlay ? "overlay" : "main"];
  const duplicate = nextImages.some((existing, index) => {
    const existingFingerprints = imageFingerprints[index];
    const existingSourceFingerprint = existingFingerprints?.source || getImageSourceFingerprint(existing);
    const existingImageFingerprint = existingFingerprints?.compressed || hashImageFingerprint(existing);
    return existing === image
      || (sourceFingerprint && existingSourceFingerprint === sourceFingerprint)
      || (imageFingerprint && existingImageFingerprint === imageFingerprint);
  });
  if (duplicate) return false;

  nextImages.push(image);
  imageFingerprints.push({ source: sourceFingerprint, compressed: imageFingerprint });
  if (isOverlay) {
    state.chat.pendingOverlayImage = nextImages;
  } else {
    state.chat.pendingImage = nextImages;
  }
  renderImagePreview(isOverlay);
  return true;
}

function hydrateImagePreviewIcons(container) {
  if (container.ownerDocument === document) {
    window.lucide?.createIcons();
    return;
  }

  container.querySelectorAll("[data-lucide]").forEach((placeholder) => {
    placeholder.replaceWith(
      createForeignDocumentIcon(
        container.ownerDocument,
        placeholder.getAttribute("data-lucide"),
      ),
    );
  });
}

export function compressImageBase64(base64Str, maxWidth, maxHeight, quality, callback) {
  const img = new Image();
  img.src = base64Str;
  img.onload = () => {
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
    } else if (height > maxHeight) {
      width = Math.round((width * maxHeight) / height);
      height = maxHeight;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
    callback(compressedDataUrl);
  };
}

export function renderImagePreview(isOverlay) {
  const container = isOverlay ? dom.overlayImagePreview : dom.imagePreview;
  const images = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;
  const messagesContainer = isOverlay ? dom.overlayMessages : dom.messages;
  const wasPinnedToBottom = isPinnedToBottom(messagesContainer);

  if (!container) return;
  enableImagePreviewWheelScroll(container);

  const pendingImages = Array.isArray(images) ? images.slice(0, 2) : [];
  if (!pendingImages.length) {
    container.hidden = true;
    container.replaceChildren();
    queuePinnedChatScrollSync(messagesContainer, isOverlay, wasPinnedToBottom);
    return;
  }

  container.hidden = false;

  const documentRef = container.ownerDocument;
  container.replaceChildren();
  pendingImages.forEach((image, index) => {
    const item = documentRef.createElement("div");
    item.className = "image-preview-container__item";

    const trigger = documentRef.createElement("a");
    trigger.className = "message__media-link image-preview-container__image-trigger";
    trigger.href = image;
    trigger.target = "_blank";
    trigger.rel = "noreferrer";
    trigger.setAttribute("aria-label", `Abrir imagen adjunta ${index + 1}`);

    const thumbnail = documentRef.createElement("img");
    thumbnail.className = "message__media";
    thumbnail.src = image;
    thumbnail.alt = `Vista previa de imagen adjunta ${index + 1}`;
    trigger.append(thumbnail);
    item.append(trigger, createRemoveButton(documentRef, `Quitar imagen ${index + 1}`, "data-image-index", index));
    container.append(item);
  });

  hydrateImagePreviewIcons(container);

  container.querySelectorAll("[data-image-index]").forEach((button) => {
    button.addEventListener("click", () => {
      removePendingImage(isOverlay, Number.parseInt(button.dataset.imageIndex || "0", 10));
    });
  });

  queuePinnedChatScrollSync(messagesContainer, isOverlay, wasPinnedToBottom);
}

function createRemoveButton(documentRef, label, dataAttribute, index) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "image-preview-container__remove-button";
  button.setAttribute(dataAttribute, String(index));
  button.setAttribute("aria-label", label);
  const icon = documentRef.createElement("span");
  icon.setAttribute("data-lucide", "x");
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  return button;
}

export function clearPendingImage(isOverlay) {
  if (isOverlay) {
    state.chat.pendingOverlayImage = [];
  } else {
    state.chat.pendingImage = [];
  }
  pendingImageFingerprints[isOverlay ? "overlay" : "main"] = [];
  renderImagePreview(isOverlay);
}

function removePendingImage(isOverlay, index) {
  const nextImages = (isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage).slice();
  if (index >= 0 && index < nextImages.length) {
    nextImages.splice(index, 1);
    pendingImageFingerprints[isOverlay ? "overlay" : "main"].splice(index, 1);
  }

  if (isOverlay) {
    state.chat.pendingOverlayImage = nextImages;
  } else {
    state.chat.pendingImage = nextImages;
  }

  renderImagePreview(isOverlay);
}
