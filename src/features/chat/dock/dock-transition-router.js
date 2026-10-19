export const CHAT_DOCK_TRANSITIONS = Object.freeze({
  COLLAPSE_SWITCH_EXPAND: "collapse-switch-expand",
  BOTTOM_TO_RIGHT: "bottom-to-right",
  FULLSCREEN_BOTTOM_TO_RIGHT: "fullscreen-bottom-to-right",
  FULLSCREEN: "fullscreen",
  RIGHT_TO_BOTTOM_NATIVE: "right-to-bottom-native",
});

export function resolveChatDockTransition({
  currentDock,
  nextDock,
  skipTransition,
  isCollapsed,
  isFullscreen,
  isStacked,
}) {
  if (skipTransition || currentDock === nextDock) return null;

  // Fuera de fullscreen, todos los cambios de dock siguen el mismo ciclo:
  // contraer el panel actual, cambiar la disposición y expandirlo en destino.
  // El dock actual sigue determinando la animación visual de cada fase.
  if (!isFullscreen) {
    return isCollapsed
      ? null
      : CHAT_DOCK_TRANSITIONS.COLLAPSE_SWITCH_EXPAND;
  }

  if (currentDock === "bottom" && nextDock === "right") {
    return !isStacked
      ? CHAT_DOCK_TRANSITIONS.FULLSCREEN_BOTTOM_TO_RIGHT
      : CHAT_DOCK_TRANSITIONS.BOTTOM_TO_RIGHT;
  }

  if (!isCollapsed) {
    if (currentDock === "right" && nextDock === "bottom" && !isStacked) {
      return CHAT_DOCK_TRANSITIONS.RIGHT_TO_BOTTOM_NATIVE;
    }
    return CHAT_DOCK_TRANSITIONS.FULLSCREEN;
  }

  return null;
}
