import { syncComponentStackChatHandle } from "./component-stack-controls.js";
import { syncComponentStackShellInsets } from "./component-stack-insets.js";
import { wireComponentAspectObservers } from "./component-aspect-observers.js";
import {
  hasLoadedVideo,
  resolveBottomDockLayout,
} from "./component-aspect-measurement.js";

const sessionView = document.querySelector("#sessionView");
const appShell = document.querySelector(".app-shell");
const workspace = sessionView?.querySelector('.o-workspace');
const videoArea = sessionView?.querySelector('.o-video-area');
const videoPlayer = sessionView?.querySelector("#videoPlayer");
const playerFrame = sessionView?.querySelector(".player-frame");
const chatArea = sessionView?.querySelector(".chat-area");
const chatTools = chatArea?.querySelector(".chat-tools");
const messageListShell = chatArea?.querySelector(".chat-message-list-shell");
const messageForm = chatArea?.querySelector(":scope > .message-form");
const FULL_PANEL_LAYOUT_CLASS = 'session-view--layout-component-stack';
const EDGE_TO_EDGE_LAYOUT_CLASS = 'session-view--layout-edge-to-edge';
const BOTTOM_DOCK_FIT_VIEWPORT_CLASS = 'session-view--bottom-dock-panels-fit-viewport';

let pendingFrame = 0;
let pendingScrollTarget = "";
let initialSessionScrollPending = true;

function applyComponentLayoutState({
  requiresSequentialLayout,
  videoMinimumBlockSize,
  chatMinimumBlockSize,
  hasMeasuredPanels,
}) {
  const isDesktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const isExpandedBottomDock = sessionView?.dataset.chatDock === "bottom"
    && !sessionView.classList.contains('session-view--chat-collapsed');
  const panelsFitViewport = Boolean(
    isExpandedBottomDock
    && hasMeasuredPanels
    && !requiresSequentialLayout
  );
  const needsScrollSnap = Boolean(
    isDesktop
    && isExpandedBottomDock
    && hasMeasuredPanels
    && requiresSequentialLayout,
  );

  // CSS define los mínimos de cada panel y la capacidad del estado compartido.
  // El resolver mide esos límites sin alterar clases ni estilos visibles.
  if (hasMeasuredPanels) {
    sessionView.style.setProperty(
      "--bottom-dock-video-min-block-size",
      `${videoMinimumBlockSize}px`,
    );
    sessionView.style.setProperty(
      "--bottom-dock-chat-min-block-size",
      `${chatMinimumBlockSize}px`,
    );
    sessionView.classList.toggle(FULL_PANEL_LAYOUT_CLASS, requiresSequentialLayout);
    sessionView.classList.toggle("session-view--layout-stacked", !requiresSequentialLayout);
    sessionView.style.setProperty(
      "--session-layout-mode",
      requiresSequentialLayout ? "side-by-side" : "stacked",
    );
  } else if (sessionView?.dataset.chatDock !== "bottom") {
    sessionView?.classList.remove(FULL_PANEL_LAYOUT_CLASS);
  }

  // Los tres estados se aplican juntos, antes del siguiente repintado.
  sessionView?.classList.toggle(BOTTOM_DOCK_FIT_VIEWPORT_CLASS, panelsFitViewport);
  sessionView?.classList.toggle('session-view--chat-bottom-snap-enabled', needsScrollSnap);
  syncComponentStackChatHandle(sessionView, chatArea);
}

function syncEdgeToEdgeLayout() {
  if (!sessionView || !appShell) return;

  const shellBounds = appShell.getBoundingClientRect();
  const sessionBounds = sessionView.getBoundingClientRect();
  const fillsShellWidth = shellBounds.width > 0
    && sessionBounds.width > 0
    && sessionBounds.left <= shellBounds.left
    && sessionBounds.right >= shellBounds.right;

  sessionView.classList.toggle(EDGE_TO_EDGE_LAYOUT_CLASS, fillsShellWidth);
}

function measureComponentLayout({ allowDuringChatTransition = false } = {}) {
  pendingFrame = 0;
  syncComponentStackShellInsets(appShell, sessionView, workspace);
  syncEdgeToEdgeLayout();
  const wasSequential = sessionView?.classList.contains(FULL_PANEL_LAYOUT_CLASS);
  if (
    sessionView?.classList.contains('session-view--chat-layout-transitioning')
    && !allowDuringChatTransition
  ) return;

  const isFullscreen = Boolean(document.fullscreenElement)
    || document.body.classList.contains('page-context--fullscreen');
  if (isFullscreen && sessionView?.dataset.chatDock === "bottom") return;

  const targetLayout = resolveBottomDockLayout({
    sessionView,
    workspace,
    playerFrame,
    videoPlayer,
    chatArea,
    chatTools,
    messageListShell,
  });
  if (!targetLayout.hasMeasuredPanels && sessionView?.dataset.chatDock === "bottom") return;

  if (
    targetLayout.requiresSequentialLayout
    && !wasSequential
    && !sessionView.classList.contains('session-view--chat-collapsed')
    && !pendingScrollTarget
  ) {
    pendingScrollTarget = "center-video";
  }

  applyComponentLayoutState(targetLayout);

  const scrollTarget = pendingScrollTarget;
  pendingScrollTarget = "";
  const shouldResolveInitialScroll = initialSessionScrollPending && !sessionView?.hidden;
  if (!scrollTarget && !shouldResolveInitialScroll) return;
  if (!sessionView) return;

  window.requestAnimationFrame(() => {
    if (sessionView.hidden) return;

    const isCollapsed = sessionView.classList.contains('session-view--chat-collapsed');
    const isSequential = sessionView.classList.contains(FULL_PANEL_LAYOUT_CLASS);
    const isFullHeightCollapsedPlayer = isCollapsed
      && sessionView.dataset.chatDock === "bottom"
      && isSequential;
    if (initialSessionScrollPending) {
      initialSessionScrollPending = false;
      if (isFullHeightCollapsedPlayer) {
        videoArea.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
      } else if (!hasLoadedVideo(videoPlayer)) {
        if (
          sessionView.dataset.chatDock === "bottom"
          && isCollapsed
          && sessionView.classList.contains(EDGE_TO_EDGE_LAYOUT_CLASS)
        ) {
          videoArea.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
        } else {
          window.scrollTo({ top: 0, behavior: "auto" });
        }
      } else if (
        sessionView.dataset.chatDock === "bottom"
        && (isSequential || isCollapsed)
      ) {
        videoArea.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      }
      return;
    }

    if (sessionView.dataset.chatDock !== "bottom") return;
    if (scrollTarget === "reveal-chat" && isSequential && !isCollapsed) {
      const chatTop = chatArea.getBoundingClientRect().top;
      if (Math.abs(chatTop) > 1) {
        chatArea.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
      }
    } else if (
      scrollTarget === "center-video"
      && (isSequential || isCollapsed)
      && (hasLoadedVideo(videoPlayer) || isFullHeightCollapsedPlayer)
    ) {
      videoArea.scrollIntoView({
        block: isFullHeightCollapsedPlayer ? "start" : "center",
        inline: "nearest",
        behavior: "auto",
      });
    }
  });
}

function scheduleComponentLayoutMeasure(scrollTarget = "") {
  if (scrollTarget === "reveal-chat") {
    pendingScrollTarget = "reveal-chat";
  } else if (scrollTarget === "center-video" && pendingScrollTarget !== "reveal-chat") {
    pendingScrollTarget = "center-video";
  }
  if (pendingFrame) return;
  pendingFrame = window.requestAnimationFrame(measureComponentLayout);
}

export function syncComponentAspectLayoutNow(options = {}) {
  // La entrada a sala lo llama antes de ceder el hilo; el primer frame visible
  // ya usa el tamaño medido y no muestra primero las filas compactas.
  if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
  pendingFrame = 0;
  measureComponentLayout(options);
}

wireComponentAspectObservers({
  sessionView,
  workspace,
  videoArea,
  videoPlayer,
  playerFrame,
  chatArea,
  chatTools,
  messageListShell,
  messageForm,
  scheduleComponentLayoutMeasure,
});

window.addEventListener("load", scheduleComponentLayoutMeasure, { once: true });
