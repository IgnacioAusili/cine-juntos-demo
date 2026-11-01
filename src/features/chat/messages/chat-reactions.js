import { state } from "../../../core/state.js";
import { dom } from "../../../core/dom.js";
import { openEmojiPickerForReaction } from "../composer/emoji-picker.js";

let nextReactionPickerId = 0;
let reactionHoverTrackingBound = false;

function bindReactionHoverTracking() {
  if (reactionHoverTrackingBound) return;
  reactionHoverTrackingBound = true;

  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;

    const pointerTarget = document.elementFromPoint(event.clientX, event.clientY);
    const isOverMessageText = Boolean(pointerTarget?.closest?.(".message__bubble, .message__meta"))
      && !pointerTarget?.closest?.(".message__time-row");
    if (isOverMessageText) {
      document.querySelectorAll(".message--reaction-zone-hover").forEach((item) => {
        item.classList.remove("message--reaction-zone-hover");
      });
      return;
    }

    document.querySelectorAll(".message__reaction-hover-sensor").forEach((sensor) => {
      const item = sensor.closest(".message");
      const rect = sensor.getBoundingClientRect();
      const isOverRevealZone = event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;
      item?.classList.toggle("message--reaction-zone-hover", isOverRevealZone);
    });
  }, { passive: true });
}

export function createMessageReactionControls(item) {
  if (!item || item.classList.contains("message--system")) return null;
  bindReactionHoverTracking();

  const tools = document.createElement("div");
  tools.className = "message__reaction-tools";
  tools.addEventListener("pointerenter", () => {
    item.classList.remove("message--reaction-button-dismissed");
  });

  const pickerButton = document.createElement("button");
  pickerButton.type = "button";
  pickerButton.className = "message__reaction-picker icon-button--emoji-trigger";
  pickerButton.id = `messageReactionPicker-${++nextReactionPickerId}`;
  pickerButton.setAttribute("aria-label", "Agregar reacción");
  pickerButton.setAttribute("aria-haspopup", "dialog");
  pickerButton.setAttribute("aria-expanded", "false");
  pickerButton.dataset.tooltip = "Agregar reacción";
  pickerButton.innerHTML = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true' class='lucide lucide-smile-plus'><path d='M22 11v1a10 10 0 1 1-9-10'/><path d='M8 14s1.5 2 4 2 4-2 4-2'/><line x1='9' x2='9.01' y1='9' y2='9'/><line x1='15' x2='15.01' y1='9' y2='9'/><path d='M16 5h6'/><path d='M19 2v6'/></svg>";

  const hoverSensor = document.createElement("span");
  hoverSensor.className = "message__reaction-hover-sensor";
  hoverSensor.setAttribute("aria-hidden", "true");

  pickerButton.addEventListener("click", () => {
    void openEmojiPickerForReaction(pickerButton, (emoji) => selectMessageReaction(item, emoji));
  });
  item.addEventListener("pointerleave", () => {
    item.classList.remove("message--reaction-zone-hover");
    item.classList.remove("message--reaction-button-dismissed");
  });
  item.addEventListener("pointerenter", () => {
    item.classList.remove("message--reaction-button-dismissed");
  });
  item.addEventListener("focusin", () => {
    item.classList.remove("message--reaction-button-dismissed");
  });

  const reactions = document.createElement("div");
  reactions.className = "message__reaction-list";
  reactions.setAttribute("aria-label", "Reacciones al mensaje");
  tools.append(hoverSensor, pickerButton, reactions);
  renderMessageReactionList(item, tools);
  return tools;
}

export function updateMessageReactionControls(item) {
  const tools = item?.querySelector(".message__reaction-tools");
  if (!tools) return;
  renderMessageReactionList(item, tools);
}

export function openMessageReactionPicker(message, replyInput) {
  if (!message?.id || message.system) return;
  const preferredContainer = replyInput === dom.overlayMessageInput ? dom.overlayMessages : dom.messages;
  const containers = [
    preferredContainer,
    preferredContainer === dom.overlayMessages ? dom.messages : dom.overlayMessages,
  ];
  const item = containers
    .flatMap((container) => Array.from(container?.querySelectorAll(".message") || []))
    .find((candidate) => (
      candidate._chatMessage === message
      || candidate.dataset.messageId === String(message.id)
    ));
  const pickerButton = item?.querySelector(".message__reaction-picker");
  if (!pickerButton) return;
  void openEmojiPickerForReaction(pickerButton, (emoji) => selectMessageReaction(item, emoji));
}

export function mergeMessageUpdate(item, update) {
  const current = item?._chatMessage;
  if (!current || !update || String(update.id) !== String(current.id)) return;

  const next = { ...current, ...update };
  if (update.reaction && typeof update.reaction.userId === "string") {
    const reactions = { ...(current.reactions || {}) };
    if (typeof update.reaction.emoji === "string" && update.reaction.emoji) {
      reactions[update.reaction.userId] = update.reaction.emoji;
    } else {
      delete reactions[update.reaction.userId];
    }
    next.reactions = reactions;
    delete next.reaction;
  } else if (Object.hasOwn(update, "reactions")) {
    next.reactions = update.reactions && typeof update.reactions === "object"
      ? { ...update.reactions }
      : {};
  }

  item._chatMessage = next;
  updateMessageReactionControls(item);
}

function renderMessageReactionList(item, tools) {
  const list = tools.querySelector(".message__reaction-list");
  if (!list) return;

  const counts = new Map();
  const reactions = item._chatMessage?.reactions;
  if (reactions && typeof reactions === "object") {
    Object.entries(reactions).forEach(([userId, emoji]) => {
      if (typeof emoji !== "string" || !emoji) return;
      const entry = counts.get(emoji) || { count: 0, hasMine: false };
      entry.count += 1;
      entry.hasMine ||= userId === state.session.clientId;
      counts.set(emoji, entry);
    });
  }

  list.replaceChildren();
  tools.classList.toggle("message__reaction-tools--has-reactions", counts.size > 0);
  counts.forEach(({ count, hasMine }, emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "message__reaction-chip";
    if (hasMine) button.classList.add("message__reaction-chip--mine");
    button.dataset.emoji = emoji;
    button.setAttribute("aria-pressed", String(hasMine));
    button.setAttribute("aria-label", `${emoji}, ${count} ${count === 1 ? "reacción" : "reacciones"}${hasMine ? ", tu reacción" : ""}`);

    const glyph = document.createElement("span");
    glyph.className = "message__reaction-emoji";
    glyph.textContent = emoji;
    const total = document.createElement("span");
    total.className = "message__reaction-count";
    total.textContent = String(count);
    button.append(glyph, total);
    button.addEventListener("click", () => toggleMessageReaction(item, emoji));
    list.append(button);
  });
}

function toggleMessageReaction(item, emoji) {
  const message = item?._chatMessage;
  const transport = state.session.transport;
  if (!message?.id || !transport?.updateMessageReaction) return;

  void transport.updateMessageReaction(message, emoji).catch((error) => {
    console.error("No se pudo guardar la reacción:", error);
  });
}

function selectMessageReaction(item, emoji) {
  item?.classList.add("message--reaction-button-dismissed");
  toggleMessageReaction(item, emoji);
}
