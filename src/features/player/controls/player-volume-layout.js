import {
  MOBILE_VIEWPORT_QUERY,
  VOLUME_VERTICAL_DENSITIES,
  cancelPendingVolumeButtonAction,
  closeVolumeSlider,
  isVolumeSliderOpen,
  isVolumeSliderVertical,
  shouldToggleMuteFromVolumeButton,
  syncVolumeButtonLabel,
  wirePlayerVolumeDocumentInteractions,
  wirePlayerVolumeGroupInteractions,
} from "./player-volume-interactions.js";

export { isVolumeSliderVertical, shouldToggleMuteFromVolumeButton };

const VOLUME_ARROW_OVERLAP_CLASS = 'player-volume-group--popup-overlapping';
const wiredGroups = new WeakSet();
const observedRoots = new WeakSet();
const overlappingVolumeArrowZones = new WeakMap();

export function wirePlayerVolumeLayouts() {
  observePlayerVolumeLayouts(document);
}

export function observePlayerVolumeLayouts(root) {
  if (!root || observedRoots.has(root)) return;
  observedRoots.add(root);
  const ownerDocument = root.nodeType === 9 ? root : root.ownerDocument;
  wirePlayerVolumeDocumentInteractions(ownerDocument);
  scanVolumeGroups(root);

  if (typeof MutationObserver !== "function") return;
  const observer = new MutationObserver(() => scanVolumeGroups(root));
  observer.observe(root, { childList: true, subtree: true });
}

function scanVolumeGroups(root) {
  if (root.matches?.(".player-volume-group")) wireVolumeGroup(root);
  root.querySelectorAll?.(".player-volume-group").forEach(wireVolumeGroup);
}

function wireVolumeGroup(group) {
  if (wiredGroups.has(group)) return;
  const bar = group.closest(".player-controls-bar");
  if (!bar) return;
  wiredGroups.add(group);
  const view = group.ownerDocument.defaultView || window;
  const schedule = createFrameScheduler(() => {
    syncVolumeSliderLayout(group, bar);
    syncVolumeArrowVisibility(group);
    if (isVolumeSliderOpen(group)) schedule();
  }, view);
  wirePlayerVolumeGroupInteractions(group, {
    scheduleLayout: schedule,
    syncArrowVisibility: () => syncVolumeArrowVisibility(group),
  });

  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(schedule);
    observer.observe(bar, { attributes: true, attributeFilter: ["data-control-density", "style", "class"] });
  }
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(schedule);
    observer.observe(bar);
    const zone = bar.querySelector('.player-controls-bar__scroll-zone');
    if (zone) observer.observe(zone);
    const chatHandleZone = getActiveChatHandleZone(group);
    if (chatHandleZone) observer.observe(chatHandleZone);
  } else {
    view.addEventListener("resize", schedule, { passive: true });
  }
  const sessionView = group.closest(".session-view");
  if (sessionView && typeof MutationObserver === "function") {
    const observer = new MutationObserver(schedule);
    observer.observe(sessionView, {
      attributes: true,
      attributeFilter: ["class", "style", "data-chat-dock"],
    });
  }
  schedule();
}

function syncVolumeSliderLayout(group, bar) {
  const view = bar.ownerDocument.defaultView || window;
  const isMobileViewport = view.matchMedia?.(MOBILE_VIEWPORT_QUERY).matches;
  // En móvil la orientación se decide junto con la densidad de toda la barra,
  // porque solo allí conocemos el ancho real disponible para el slider.
  if (isMobileViewport && group.dataset.volumeSliderLayout) return;
  const useVertical = VOLUME_VERTICAL_DENSITIES.has(bar.dataset.controlDensity);
  const layout = useVertical ? "vertical" : "horizontal";
  if (group.dataset.volumeSliderLayout === layout) {
    syncVolumeButtonLabel(group);
    return;
  }
  cancelPendingVolumeButtonAction(group);
  group.dataset.volumeSliderLayout = layout;
  if (layout === "horizontal") closeVolumeSlider(group);
  syncVolumeButtonLabel(group);
}

function syncVolumeArrowVisibility(group) {
  const previousZone = overlappingVolumeArrowZones.get(group);
  previousZone?.classList.remove(VOLUME_ARROW_OVERLAP_CLASS);
  overlappingVolumeArrowZones.delete(group);
  if (!isVolumeSliderOpen(group) || !isVolumeSliderVertical(group)) return;

  const popup = group.querySelector('.player-volume-group__slider');
  const button = getActiveChatHandleButton(group);
  const handleZone = button?.closest('.chat-area__collapse-hover-zone');
  if (!popup || !button || !handleZone) return;

  const popupRect = popup.getBoundingClientRect();
  const arrowRect = button.getBoundingClientRect();
  if (popupRect.width <= 0 || popupRect.height <= 0 || arrowRect.width <= 0 || arrowRect.height <= 0) return;

  const overlapsHorizontally = popupRect.left < arrowRect.right && popupRect.right > arrowRect.left;
  const overlapsVertically = popupRect.top < arrowRect.bottom && popupRect.bottom > arrowRect.top;
  if (!overlapsHorizontally || !overlapsVertically) return;

  handleZone.classList.add(VOLUME_ARROW_OVERLAP_CLASS);
  overlappingVolumeArrowZones.set(group, handleZone);
}

function getActiveChatHandleButton(group) {
  const sessionView = group.closest(".session-view");
  if (!sessionView) return null;
  const buttonId = sessionView.classList.contains('session-view--chat-collapsed')
    ? "#expandChatButton"
    : "#collapseChatButton";
  return sessionView.querySelector(buttonId) || null;
}

function getActiveChatHandleZone(group) {
  return getActiveChatHandleButton(group)?.closest('.chat-area__collapse-hover-zone') || null;
}

function createFrameScheduler(callback, view = window) {
  let frame = 0;
  const run = () => {
    frame = 0;
    callback();
  };
  return () => {
    if (frame) return;
    frame = view?.requestAnimationFrame ? view.requestAnimationFrame(run) : requestAnimationFrame(run);
  };
}