import { dom } from "../../core/dom.js";
import { formatClockTime } from "../../core/utils.js";
import { focusChatInput } from "../chat/composer/chat-input-focus.js";
import { getRichEditorSelection, insertRichEditorText, setRichEditorSelection } from "../chat/composer/chat-rich-editor.js";
import { scrollToChatPosition, setExternalChatCollapsed } from "../chat/index.js";
import { requestVideoDownload } from "./video-download.js";
import { closeVideoLoadPopover, openVideoLoadPopover } from "./video-load-popover.js";

const LONG_PRESS_MS = 560;
const POINTER_MOVE_LIMIT_PX = 12;
const VIEWPORT_GUTTER_PX = 10;

let contextMenu = null;
let capturedVideoTime = 0;
let openedAtX = 0;
let openedAtY = 0;
let longPressTimer = 0;
let longPressTriggered = false;
let suppressNextVideoClick = false;
let suppressClickTimer = 0;
let pointerStart = null;
let loadVideo = () => {};
let removeVideo = () => {};

export function wireVideoContextMenu(actions = {}) {
  const video = dom.videoPlayer;
  if (!video) return;
  loadVideo = actions.loadVideo || (() => {});
  removeVideo = actions.removeVideo || (() => {});

  video.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (longPressTriggered) return;
    if (contextMenu) {
      closeContextMenu();
      return;
    }
    openMenu(event.clientX, event.clientY);
  });
  video.addEventListener("pointerdown", startLongPress, { passive: true });
  video.addEventListener("pointermove", cancelLongPressOnMove, { passive: true });
  video.addEventListener("pointerup", endLongPress, { passive: true });
  video.addEventListener("pointercancel", endLongPress, { passive: true });
  video.addEventListener("click", (event) => {
    if (!suppressNextVideoClick) return;
    suppressNextVideoClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function startLongPress(event) {
  if (event.pointerType !== "touch" || event.button !== 0 || !event.isPrimary) return;
  clearLongPress();
  pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  longPressTriggered = false;
  longPressTimer = window.setTimeout(() => {
    longPressTimer = 0;
    longPressTriggered = true;
    suppressNextVideoClick = true;
    openMenu(pointerStart.x, pointerStart.y);
  }, LONG_PRESS_MS);
}

function cancelLongPressOnMove(event) {
  if (!pointerStart || event.pointerId !== pointerStart.id) return;
  if (
    Math.abs(event.clientX - pointerStart.x) > POINTER_MOVE_LIMIT_PX
    || Math.abs(event.clientY - pointerStart.y) > POINTER_MOVE_LIMIT_PX
  ) clearLongPress();
}

function endLongPress(event) {
  if (pointerStart && event.pointerId !== pointerStart.id) return;
  clearLongPress();
  pointerStart = null;
  if (!longPressTriggered) return;
  window.clearTimeout(suppressClickTimer);
  suppressClickTimer = window.setTimeout(() => {
    suppressNextVideoClick = false;
    longPressTriggered = false;
  }, 900);
}

function clearLongPress() {
  if (longPressTimer) window.clearTimeout(longPressTimer);
  longPressTimer = 0;
}

function openMenu(x, y) {
  closeContextMenu();
  closeVideoLoadPopover();
  capturedVideoTime = Number.isFinite(dom.videoPlayer?.currentTime)
    ? Math.max(0, dom.videoPlayer.currentTime)
    : 0;
  openedAtX = x;
  openedAtY = y;

  const menu = document.createElement("div");
  menu.className = "video-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Opciones del video");
  const hasVideo = Boolean(dom.videoPlayer?.currentSrc || dom.videoPlayer?.getAttribute("src"));
  [
    ["mention", "Mencionar este momento", "message", !hasVideo],
    ["copy", "Copiar", "copy", !hasVideo],
    ["paste", "Pegar", "clipboard", false],
    ["load", "Cargar otro video", "film", false],
    ["download", "Descargar", "download", !hasVideo],
    ["remove", "Sacar video", "trash", !hasVideo],
  ].forEach(([action, label, iconName, disabled]) => {
    const button = document.createElement("button");
    button.className = "video-context-menu__item";
    button.type = "button";
    button.dataset.action = action;
    button.setAttribute("role", "menuitem");
    button.disabled = Boolean(disabled);
    const icon = createIcon(iconName);
    icon.classList.add("video-context-menu__icon");
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);
    menu.append(button);
  });
  menu.addEventListener("click", handleMenuAction);
  menu.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    closeContextMenu();
  });
  document.body.append(menu);
  contextMenu = menu;
  placePopup(menu, x, y);
  installDismissListeners(closeContextMenu, menu);
}

async function handleMenuAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === "mention") {
    closeContextMenu();
    mentionCapturedMoment();
  } else if (action === "copy") {
    const source = dom.videoPlayer.getAttribute("src") || dom.videoPlayer.currentSrc || dom.videoUrlInput.value.trim();
    closeContextMenu();
    void copyText(source);
  } else if (action === "paste") {
    closeContextMenu();
    const source = await readVideoUrlFromClipboard();
    if (source) await loadVideo(source);
  } else if (action === "load") {
    closeContextMenu();
    openVideoLoadPopover(openedAtX, openedAtY, loadVideo);
  } else if (action === "download") {
    const source = dom.videoPlayer.currentSrc || dom.videoPlayer.src;
    closeContextMenu();
    void requestVideoDownload(source);
  } else if (action === "remove") {
    closeContextMenu();
    await removeVideo();
  }
}

function mentionCapturedMoment() {
  const input = dom.messageInput;
  const tag = `${formatClockTime(capturedVideoTime)} `;
  const selection = getRichEditorSelection(input);
  const caretPosition = selection.start + tag.length;
  insertRichEditorText(input, tag, selection);
  setRichEditorSelection(input, caretPosition);
  if (dom.sessionView.classList.contains("session-view--chat-collapsed")) {
    setExternalChatCollapsed(false, { source: "video-context-menu" });
  }
  window.requestAnimationFrame(() => {
    scrollToChatPosition("smooth");
    window.requestAnimationFrame(() => focusChatInput(input, caretPosition));
  });
}

function createIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const paths = {
    message: ["path|M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z", "path|M8 10h8", "path|M8 14h5"],
    copy: ["rect|8|8|13|13|2", "path|M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"],
    clipboard: ["rect|4|6|16|15|2", "path|M9 4h6v4H9z", "path|M9 14h6", "path|M12 11v6"],
    film: ["rect|M4 4h16v16H4z", "path|M4 8h16", "path|M4 16h16", "path|M8 4v4", "path|M16 4v4", "path|M8 16v4", "path|M16 16v4"],
    download: ["path|M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "path|M7 10l5 5 5-5", "path|M12 15V3"],
    trash: ["path|M3 6h18", "path|M8 6V4h8v2", "path|M19 6l-1 14H6L5 6", "path|M10 11v5", "path|M14 11v5"],
  }[name] || [];
  paths.forEach((definition) => {
    const [tag, data] = definition.split("|");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (tag === "rect") {
      const parts = definition.split("|");
      const [, x, y, width, height, radius] = parts;
      const bounds = parts.length === 6 ? [x, y, width, height, radius] : ["4", "4", "16", "16", "2"];
      shape.setAttribute("x", bounds[0]);
      shape.setAttribute("y", bounds[1]);
      shape.setAttribute("width", bounds[2]);
      shape.setAttribute("height", bounds[3]);
      shape.setAttribute("rx", bounds[4]);
    } else shape.setAttribute("d", data);
    svg.append(shape);
  });
  return svg;
}

async function copyText(text) {
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fallback for browsers that deny clipboard API access.
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  try {
    document.execCommand("copy");
  } catch {
    // Clipboard access is optional; the context menu can close without it.
  }
  input.remove();
}

async function readVideoUrlFromClipboard() {
  try {
    const text = await navigator.clipboard?.readText();
    const candidate = String(text || "").trim();
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? candidate : "";
  } catch {
    return "";
  }
}

function placePopup(popup, x, y) {
  const rect = popup.getBoundingClientRect();
  const maxX = Math.max(VIEWPORT_GUTTER_PX, window.innerWidth - rect.width - VIEWPORT_GUTTER_PX);
  const maxY = Math.max(VIEWPORT_GUTTER_PX, window.innerHeight - rect.height - VIEWPORT_GUTTER_PX);
  popup.style.left = `${Math.min(Math.max(VIEWPORT_GUTTER_PX, x), maxX)}px`;
  popup.style.top = `${Math.min(Math.max(VIEWPORT_GUTTER_PX, y), maxY)}px`;
}

function installDismissListeners(close, popup) {
  const onPointerDown = (event) => {
    if (popup.contains(event.target)) return;
    if (event.button === 2 && dom.videoPlayer?.contains(event.target)) return;
    close();
  };
  const onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    close();
  };
  const onScroll = () => close();
  const onResize = () => close();
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onResize, { passive: true });
  popup._dismiss = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
  };
}

function closeContextMenu() {
  contextMenu?._dismiss?.();
  contextMenu?.remove();
  contextMenu = null;
}
