const PLACEMENT_ATTRIBUTE = "data-inside-chat-placement";
const EDGE_GAP_PX = 8;
const BUTTON_GAP_PX = 10;
const CLOSE_PLACEMENT_CLEANUP_DELAY_MS = 220;
const PLACEMENT_PROPERTIES = [
  "--inside-chat-placement-top",
  "--inside-chat-placement-left",
  "--inside-chat-placement-width",
  "--inside-chat-placement-height",
  "--inside-chat-placement-max-height",
];

export function wireMiniPlayerChatPlacement(surface) {
  const chat = surface?.querySelector("#playerChat");
  const toggle = surface?.querySelector(
    "#playerChatToggleButton, [data-proxy-for=\"playerChatToggleButton\"]",
  );
  const ownerWindow = surface?.ownerDocument?.defaultView;
  if (!surface || !chat || !toggle || !ownerWindow) return () => {};

  let syncFrame = 0;
  let closePlacementTimer = 0;
  let hasSynced = false;
  let wasOpen = surface.classList.contains("u-chat-inside-open");
  const clearPlacement = () => {
    chat.removeAttribute(PLACEMENT_ATTRIBUTE);
    PLACEMENT_PROPERTIES.forEach((property) => chat.style.removeProperty(property));
  };
  const clearClosePlacementTimer = () => {
    if (!closePlacementTimer) return;
    ownerWindow.clearTimeout(closePlacementTimer);
    closePlacementTimer = 0;
  };
  const preservePlacementDuringClose = () => {
    clearClosePlacementTimer();
    closePlacementTimer = ownerWindow.setTimeout(() => {
      closePlacementTimer = 0;
      if (!surface.classList.contains("u-chat-inside-open")) clearPlacement();
    }, CLOSE_PLACEMENT_CLEANUP_DELAY_MS);
  };
  const sync = () => {
    syncFrame = 0;
    if (!surface.isConnected) {
      clearClosePlacementTimer();
      clearPlacement();
      return;
    }
    const isOpen = surface.classList.contains("u-chat-inside-open");
    if (!isOpen) {
      if (wasOpen && chat.hasAttribute(PLACEMENT_ATTRIBUTE)) preservePlacementDuringClose();
      else if (!hasSynced) clearPlacement();
      wasOpen = false;
      hasSynced = true;
      return;
    }
    wasOpen = true;
    hasSynced = true;
    clearClosePlacementTimer();

    // Medir la posición base permite recalcular después de cada cambio de tamaño
    // sin conservar coordenadas de un tamaño anterior del mini reproductor.
    clearPlacement();
    const surfaceRect = surface.getBoundingClientRect();
    const contentLeft = surfaceRect.left + surface.clientLeft;
    const contentTop = surfaceRect.top + surface.clientTop;
    const contentWidth = surface.clientWidth;
    const contentHeight = surface.clientHeight;
    const chatRect = chat.getBoundingClientRect();
    const toggleRect = toggle.getBoundingClientRect();
    if (!contentWidth || !contentHeight || !chatRect.width || !toggleRect.width) return;
    if (!overlapsWithGap(chatRect, toggleRect, BUTTON_GAP_PX)) return;

    const rightEdge = contentLeft + contentWidth;
    const leftSpace = toggleRect.left - contentLeft - BUTTON_GAP_PX - EDGE_GAP_PX;
    const rightSpace = rightEdge - toggleRect.right - BUTTON_GAP_PX - EDGE_GAP_PX;
    const toggleCenter = toggleRect.left + toggleRect.width / 2;
    const prefersLeftSide = toggleCenter >= contentLeft + contentWidth / 2;
    const preferredSideSpace = prefersLeftSide ? leftSpace : rightSpace;
    const alternateSideSpace = prefersLeftSide ? rightSpace : leftSpace;
    const useLeftSide = preferredSideSpace > 0
      ? prefersLeftSide
      : !prefersLeftSide && alternateSideSpace > 0;
    const availableSideWidth = Math.max(0, useLeftSide ? leftSpace : rightSpace);
    const panelWidth = Math.min(chatRect.width, availableSideWidth);
    const panelHeight = Math.min(
      readCssPixels(ownerWindow.getComputedStyle(chat).getPropertyValue("--player-chat-max-height"), 330),
      Math.max(0, contentHeight - EDGE_GAP_PX * 2),
    );
    if (!panelWidth || !panelHeight) return;

    const rawLeft = useLeftSide
      ? toggleRect.left - contentLeft - BUTTON_GAP_PX - panelWidth
      : toggleRect.right - contentLeft + BUTTON_GAP_PX;
    const left = clamp(rawLeft, EDGE_GAP_PX, contentWidth - EDGE_GAP_PX - panelWidth);
    const rawTop = toggleRect.top - contentTop + toggleRect.height / 2 - panelHeight / 2;
    const top = clamp(rawTop, EDGE_GAP_PX, contentHeight - EDGE_GAP_PX - panelHeight);

    chat.setAttribute(PLACEMENT_ATTRIBUTE, "side");
    chat.style.setProperty("--inside-chat-placement-top", `${Math.round(top)}px`);
    chat.style.setProperty("--inside-chat-placement-left", `${useLeftSide ? Math.floor(left) : Math.ceil(left)}px`);
    chat.style.setProperty("--inside-chat-placement-width", `${Math.round(panelWidth)}px`);
    chat.style.setProperty("--inside-chat-placement-height", `${Math.round(panelHeight)}px`);
    chat.style.setProperty("--inside-chat-placement-max-height", `${Math.round(panelHeight)}px`);
  };
  const scheduleSync = () => {
    if (!syncFrame) syncFrame = ownerWindow.requestAnimationFrame(sync);
  };

  const resizeObserver = new ownerWindow.ResizeObserver(scheduleSync);
  resizeObserver.observe(surface);
  resizeObserver.observe(toggle);
  // La posición debe actualizarse antes del primer frame de la transición;
  // esperar a requestAnimationFrame provoca un salto durante la entrada.
  const stateObserver = new ownerWindow.MutationObserver(sync);
  stateObserver.observe(surface, { attributes: true, attributeFilter: ["class"] });
  ownerWindow.addEventListener("resize", scheduleSync, { passive: true });
  ownerWindow.visualViewport?.addEventListener("resize", scheduleSync, { passive: true });
  sync();

  return () => {
    resizeObserver.disconnect();
    stateObserver.disconnect();
    ownerWindow.removeEventListener("resize", scheduleSync);
    ownerWindow.visualViewport?.removeEventListener("resize", scheduleSync);
    if (syncFrame) ownerWindow.cancelAnimationFrame(syncFrame);
    clearClosePlacementTimer();
    clearPlacement();
  };
}

function overlapsWithGap(panel, button, gap) {
  return panel.left < button.right + gap
    && panel.right > button.left - gap
    && panel.top < button.bottom + gap
    && panel.bottom > button.top - gap;
}

function readCssPixels(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
