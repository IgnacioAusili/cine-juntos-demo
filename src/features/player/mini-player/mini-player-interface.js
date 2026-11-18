import { dom } from "../../../core/dom.js";
import { syncMiniChatAutoExpand } from "./mini-player-chat-mirror.js";
import { setInsideChatAutoExpandEnabled } from "../../chat/chat-layout.js";
import { wireMiniPlayerShortcuts } from "./mini-player-shortcuts.js";
import {
  traceMiniPlayer,
  getMiniPlayerVideoSnapshot,
  describeTraceTarget,
} from "./mini-player-debug.js";
import { createInteractiveMirror } from "./mini-player-interface-mirror.js";

const VIDEO_EVENTS = ["play", "pause", "ended", "timeupdate", "seeked", "ratechange", "volumechange"];
const TRACE_VIDEO_EVENTS = ["play", "playing", "pause", "waiting", "stalled", "canplay", "seeking", "seeked", "ended", "error", "timeupdate"];
const TRACE_SURFACE_DOM_EVENTS = ["pointerdown", "pointerup", "pointercancel", "click"];

export function movePlayerInterface(surface, options = {}) {
  const {
    includeChat = true,
    includeChatToggle = true,
  } = options;
  const videoAnchor = document.createComment("mini-player-video-origin");
  const gestureAnchor = document.createComment("mini-player-gesture-origin");
  dom.videoPlayer.parentNode?.insertBefore(videoAnchor, dom.videoPlayer);
  dom.playbackGestureIndicator?.parentNode?.insertBefore(
    gestureAnchor,
    dom.playbackGestureIndicator,
  );
  surface.append(dom.videoPlayer);
  if (dom.playbackGestureIndicator) surface.append(dom.playbackGestureIndicator);

  const mirrors = [
    includeChatToggle ? dom.playerActions : null,
    dom.playerBottomActions,
    dom.playerCenterActions,
    dom.resumeVideoPopup,
    includeChat ? dom.playerChat : null,
  ].filter(Boolean).map((source) => createInteractiveMirror(source, surface.ownerDocument));
  mirrors.forEach(({ element }) => surface.append(element));
  traceMiniPlayer("surface-open", {
    includeChat,
    includeChatToggle,
    pictureInPictureDocument: surface.ownerDocument !== document,
    mirrorSources: mirrors.map(({ source }) => source.id || source.className),
  });
  const traceSurfaceDomEvent = (event) => {
    if (!surface.contains(event.target)) return;
    const interactiveTarget = event.target.closest?.("button, input, select, textarea, [contenteditable='true']");
    traceMiniPlayer("surface-event-capture", {
      event: event.type,
      isTrusted: event.isTrusted,
      target: describeTraceTarget(event.target),
      interactiveTarget: describeTraceTarget(interactiveTarget),
      defaultPrevented: event.defaultPrevented,
      eventPhase: event.eventPhase,
      button: event.button ?? null,
      buttons: event.buttons ?? null,
      pointerId: event.pointerId ?? null,
      pointerType: event.pointerType ?? null,
    });
  };
  TRACE_SURFACE_DOM_EVENTS.forEach((eventName) => (
    surface.ownerDocument.addEventListener(eventName, traceSurfaceDomEvent, true)
  ));
  // Los espejos se sincronizan una primera vez antes de insertarse. Repetir
  // el de acciones después de anexarlo permite aplicar el estado propio del
  // mini reproductor al botón de chat (sin copiar el estado del principal).
  mirrors
    .filter(({ source }) => source === dom.playerActions)
    .forEach(({ sync }) => sync());
  const playerChatMirror = mirrors.find(({ source }) => source === dom.playerChat)?.element;
  const handleMiniAutoExpandClick = (event) => {
    const target = event.target.closest?.(
      "#insideChatAutoExpandSwitch, [data-proxy-for=\"insideChatAutoExpandSwitch\"]",
    );
    if (!target || !playerChatMirror?.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const enabled = target.getAttribute("aria-checked") !== "true";
    syncMiniChatAutoExpand(surface, enabled);
    setInsideChatAutoExpandEnabled(enabled);
  };
  playerChatMirror?.addEventListener("click", handleMiniAutoExpandClick);
  const removeShortcuts = wireMiniPlayerShortcuts(surface.ownerDocument, surface);

  const syncMirrors = () => mirrors
    .filter(({ source }) => source !== dom.playerChat)
    .forEach(({ syncState }) => syncState());
  VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.addEventListener(eventName, syncMirrors));
  let lastTimeUpdateTraceAt = 0;
  const traceVideoEvent = (event) => {
    if (event.type === "timeupdate") {
      const now = Date.now();
      if (now - lastTimeUpdateTraceAt < 1000) return;
      lastTimeUpdateTraceAt = now;
    }
    traceMiniPlayer("video-event", {
      event: event.type,
      mediaErrorCode: dom.videoPlayer.error?.code ?? null,
      ...getMiniPlayerVideoSnapshot(),
    });
  };
  TRACE_VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.addEventListener(eventName, traceVideoEvent));

  return {
    restore() {
      traceMiniPlayer("surface-close");
      TRACE_SURFACE_DOM_EVENTS.forEach((eventName) => (
        surface.ownerDocument.removeEventListener(eventName, traceSurfaceDomEvent, true)
      ));
      VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.removeEventListener(eventName, syncMirrors));
      TRACE_VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.removeEventListener(eventName, traceVideoEvent));
      mirrors.forEach(({ restore }) => restore());
      playerChatMirror?.removeEventListener("click", handleMiniAutoExpandClick);
      removeShortcuts();
      gestureAnchor.parentNode?.insertBefore(dom.playbackGestureIndicator, gestureAnchor);
      videoAnchor.parentNode?.insertBefore(dom.videoPlayer, videoAnchor);
      gestureAnchor.remove();
      videoAnchor.remove();
    },
  };
}
