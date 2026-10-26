import { dom } from "../../../core/dom.js";
import { state } from "../../../core/state.js";
import { hideTooltip } from "../../icons-tooltips.js";
import { focusChatInput } from "../composer/chat-input-focus.js";
import {
  getSystemMessageText,
  normalizeOwnSystemBody,
} from "../system-messages/chat-system-message-text.js";
import {
  configureReplyPreviewOperations,
  renderReplyPreview,
} from "./chat-reply-preview.js";

export { renderReplyPreview } from "./chat-reply-preview.js";
export { scrollToMessage, scrollToMessageFragment } from "./chat-message-navigation.js";

export function setReplyTarget(message, focusInput = dom.messageInput, quote = null) {
  const hadReplyTarget = Boolean(state.chat.replyTarget);
  const isSameReplyTarget = state.chat.replyTarget?.id === message.id;
  state.chat.replyTarget = {
    id: message.id,
    from: message.from || null,
    name: message.name || "Invitado",
    text: getReplyLabel(message),
    ...getSystemReplyPreview(message),
    quote: quote ? { text: quote.text, start: quote.start, end: quote.end } : null,
  };
  state.chat.replyPreviewScope = focusInput?.closest?.(".player-chat")
    ? "overlay"
    : "external";
  renderReplyPreview({
    animate: !isSameReplyTarget,
    preserveHeight: hadReplyTarget && !isSameReplyTarget,
  });
  focusChatInput(focusInput);
  hideTooltip();
}

function getReplyLabel(message) {
  const text = String(message?.text || "").trim();
  if (text && !(text.startsWith("data:image/") && text.includes("base64,"))) return text;
  if (message?.image || (Array.isArray(message?.images) && message.images.length)) {
    return "(Imagen)";
  }
  return "";
}

function getSystemReplyPreview(message) {
  if (!message?.system) return {};

  const isMine = message.from === state.session.clientId;
  const name = String(message.name || "Invitado").trim();
  const text = getSystemMessageText(message, isMine);
  const body = name && text.startsWith(name)
    ? text.slice(name.length).trimStart()
    : text;

  return {
    previewName: isMine ? "Tú" : name,
    previewText: isMine ? normalizeOwnSystemBody(body) || body : body,
  };
}

export function clearReplyTarget() {
  state.chat.replyTarget = null;
  state.chat.replyPreviewScope = "both";
  renderReplyPreview();
}

configureReplyPreviewOperations({ clearReplyTarget });
