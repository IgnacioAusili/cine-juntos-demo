import { dom } from "../../../core/dom.js";
import { state, getDisplayName, getTransportNow, logEvent } from "../../../core/state.js";
import { MAX_CHARS, replaceEmojiShortcodes } from "../../../core/utils.js";
import { createRandomId } from "../../../core/random-id.js";
import { setSyncStatus } from "../../session/session-ui.js";
import { markParticipantActive } from "../../presence/index.js";
import { clearReplyTarget } from "../messages/chat-reply.js";
import { renderMessage } from "../messages/chat-render.js";
import { completeAutoOpenedChatResponse } from "../chat-layout.js";
import { focusChatInput } from "./chat-input-focus.js";
import { addPendingImageDataUrl, clearPendingImage, compressImageBase64, getImageSourceFingerprint } from "../messages/image-compress.js";
import { isMobileLayout, logMobileInteraction } from "./chat-input-debug.js";
import { normalizeEmojiShortcodesInput } from "./emoji-picker.js";
import { getSpamCooldownRemaining, registerMessageForSpamCheck, updateCharCounter, updateSpamCooldownButtons } from "./chat-spam-guard.js";
import { autoResizeMessageInput } from "./chat-input-layout.js";
import { getRichEditorTextLength } from "./chat-rich-editor.js";

export function sendMessage(text, attachedImage) {
  if (!state.session.activeRoom || !state.session.transport) {
    setSyncStatus("Primero entra a una sala.");
    logEvent("chat", "Mensaje no enviado: falta sala.");
    return false;
  }

  const videoEl = dom.videoPlayer;
  const isPlaying =
    videoEl &&
    !videoEl.paused &&
    !videoEl.ended &&
    Number.isFinite(videoEl.currentTime) &&
    videoEl.currentTime > 0;

  const message = {
    id: createRandomId(),
    from: state.session.clientId,
    name: getDisplayName(),
    text: replaceEmojiShortcodes(text || ""),
    image: Array.isArray(attachedImage) && attachedImage.length ? attachedImage[0] : attachedImage || null,
    images: Array.isArray(attachedImage) ? attachedImage.slice(0, 2) : attachedImage ? [attachedImage] : [],
    replyTo: state.chat.replyTarget
      ? {
          id: state.chat.replyTarget.id,
          from: state.chat.replyTarget.from || null,
          name: state.chat.replyTarget.name,
          text: state.chat.replyTarget.text,
        }
      : null,
    createdAt: getTransportNow(),
  };

  if (isPlaying) {
    message.videoTimestamp = videoEl.currentTime;
  }

  markParticipantActive(state.session.clientId, message.name);
  state.session.transport.sendMessage(message).catch((error) => {
    console.error(error);
    logEvent("error", `No se pudo enviar mensaje: ${error.message || error}`);
    setSyncStatus("No se pudo enviar el mensaje.");
  });

  if (state.session.transport.mode === "local") renderMessage(message);
  clearReplyTarget();
  logEvent("chat:send", `Mensaje de ${message.name}.`);
  return true;
}

export function submitMessageFrom(input) {
  const isOverlay = input === dom.overlayMessageInput;
  logMobileInteraction("submit:start", input, { isOverlay, triggerActiveElement: document.activeElement?.id || null });
  normalizeEmojiShortcodesInput(input);
  const text = input.value.trim();
  const img = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;
  const hasImages = Array.isArray(img) ? img.length > 0 : Boolean(img);

  if (!text && !hasImages) {
    logMobileInteraction("submit:ignored-empty", input, { isOverlay });
    return;
  }

  const messageLength = input.isContentEditable ? getRichEditorTextLength(input) : input.value.length;
  if (messageLength >= MAX_CHARS) {
    const counter = isOverlay ? dom.overlayCharCounter : dom.mainCharCounter;
    if (counter) {
      counter.classList.add("char-counter--shake");
      window.setTimeout(() => counter.classList.remove("char-counter--shake"), 500);
    }
    return;
  }

  if (getSpamCooldownRemaining()) {
    updateSpamCooldownButtons();
    if (!isMobileLayout()) focusChatInput(input);
    return;
  }

  if (
    state.session.activeRoom &&
    state.session.transport &&
    !registerMessageForSpamCheck(text, img)
  ) {
    if (!isMobileLayout()) focusChatInput(input);
    return;
  }

  const wasQueued = sendMessage(text, img);
  if (!wasQueued) {
    logMobileInteraction("submit:not-queued", input, { isOverlay });
    return;
  }

  input.value = "";
  updateCharCounter(input, isOverlay);
  if (isOverlay) {
    clearPendingImage(true);
  } else {
    clearPendingImage(false);
  }
  completeAutoOpenedChatResponse(isOverlay);
  autoResizeMessageInput(input);
  if (!isMobileLayout()) {
    focusChatInput(input);
    logMobileInteraction("submit:after-focus", input, { isOverlay });
  }
}

export function handlePasteEvent(event, isOverlay) {
  const items = event.clipboardData?.items;
  if (!items) return;
  const pending = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;

  if (Array.isArray(pending) && pending.length >= 2) {
    if (Array.from(items).some((item) => item.type.indexOf("image") !== -1)) {
      event.preventDefault();
    }
    return;
  }

  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      event.preventDefault();
      const file = item.getAsFile();
      if (file) addPendingImageFile(file, isOverlay);
      break;
    }
  }
}

export function addPendingImageFile(file, isOverlay) {
  const imageType = getImageType(file);
  if (!imageType) return false;
  const currentImages = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;
  if (currentImages.length >= 2) return false;

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    const rawBase64 = String(loadEvent.target?.result || "");
    const sourceFingerprint = getImageSourceFingerprint(rawBase64);
    const commitImage = (image) => {
      addPendingImageDataUrl(isOverlay, image, sourceFingerprint);
    };

    if (imageType === "image/gif") {
      commitImage(rawBase64);
      return;
    }
    compressImageBase64(rawBase64, 800, 800, 0.7, commitImage);
  };
  reader.readAsDataURL(file.type === imageType ? file : new Blob([file], { type: imageType }));
  return true;
}

function getImageType(file) {
  if (file?.type?.toLowerCase().startsWith("image/")) return file.type.toLowerCase();
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  const knownTypes = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return knownTypes[extension] || "";
}
