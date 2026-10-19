import { dom } from "../../../core/dom.js";
import { isStackedSessionLayout } from "./chat-responsive-layout.js";
import { isFullscreenPageActive } from "./chat-page-scroll.js";

export function isDesktopBottomDock() {
  const isLandscape = isFullscreenPageActive()
    ? window.matchMedia("(orientation: landscape)").matches
    : document.documentElement.classList.contains("page-context--viewport-landscape");
  const isLandscapeMobile = isStackedSessionLayout() && isLandscape;
  return dom.sessionView?.dataset.chatDock === "bottom"
    && (!isStackedSessionLayout() || isLandscapeMobile);
}

export function easeBottomChatCurtainProgress(progress) {
  // Curva de salida equivalente a la que usa la cortina lateral:
  // arranca decidida y desacelera al llegar al borde final.
  return 1 - ((1 - progress) ** 3);
}

export function easeBottomChatRevealProgress(progress) {
  // La apertura debe recorrer la cortina a velocidad perceptible durante todo
  // el despliegue; la curva de salida mostraba casi todo el panel al inicio.
  const value = Math.max(0, Math.min(1, progress));
  return value * value * (3 - (2 * value));
}

export function getWorkspaceRowHeights() {
  if (!dom.workspace) return [0, 0];

  const rows = getComputedStyle(dom.workspace)
    .gridTemplateRows
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseFloat(value));
  return [
    Number.isFinite(rows[0]) ? rows[0] : 0,
    Number.isFinite(rows[1]) ? rows[1] : 0,
  ];
}

export function getWorkspaceContentHeight() {
  if (!dom.workspace) return 0;

  const styles = getComputedStyle(dom.workspace);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  return Math.max(0, dom.workspace.clientHeight - paddingTop - paddingBottom);
}

function getComponentStackCollapsedVideoHeight() {
  if (!dom.workspace) return 0;

  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  Object.assign(probe.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "0",
    height: "var(--component-stack-collapsed-video-block-size)",
    visibility: "hidden",
    pointerEvents: "none",
  });
  dom.workspace.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();

  return Math.max(0, height);
}

export function getCollapsedWorkspaceContentHeight() {
  if (dom.sessionView?.classList.contains("session-view--layout-component-stack")) {
    return getComponentStackCollapsedVideoHeight();
  }

  const workspaceHeight = getWorkspaceContentHeight();
  const isEdgeToEdgeBottomDock = dom.sessionView?.dataset.chatDock === "bottom"
    && dom.sessionView.classList.contains("session-view--layout-edge-to-edge")
    && !dom.sessionView.classList.contains("session-view--layout-component-stack");
  if (!isEdgeToEdgeBottomDock) return workspaceHeight;

  const visibleHeight = Number.parseFloat(
    getComputedStyle(document.documentElement)
      .getPropertyValue("--chat-bottom-viewport-height"),
  );
  if (!Number.isFinite(visibleHeight) || visibleHeight <= 0) return workspaceHeight;

  const styles = getComputedStyle(dom.workspace);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  return Math.max(0, visibleHeight - paddingTop - paddingBottom);
}
