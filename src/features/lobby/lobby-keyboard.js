import { scheduleLobbyContentCenter } from "./lobby-content-layout.js";

const LOBBY_INPUT_SELECTOR = "#lobbyNameInput, #roomInput";
const KEYBOARD_DELTA_PX = 80;
const KEYBOARD_GAP_PX = 8;
const RESTING_VIEWPORT_STORAGE_KEY = "cine-juntos:lobby-resting-viewport";

let restoreScrollTop = 0;
let baselineViewportHeight = 0;
let activeLobbyInput = null;
let keyboardOpen = false;
let restoreTimer = 0;
let alignFrame = 0;
let restingBrowserViewportHeight = 0;
let restingBrowserViewportWidth = 0;
let previousBrowserKeyboardHeroRowGap = null;

function isLobbyInput(target) {
  return target instanceof HTMLInputElement
    && target.matches(LOBBY_INPUT_SELECTOR)
    && document.body.classList.contains("page-context--lobby");
}

function getViewportHeight() {
  return window.visualViewport?.height || window.innerHeight || 0;
}

function getViewportWidth() {
  return document.documentElement.clientWidth || window.innerWidth || 0;
}

function getLayoutViewportHeight() {
  return Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--app-viewport-height"),
  ) || getViewportHeight();
}

function getResizedEmbeddedViewportHeight(viewportHeight) {
  const frame = window.frameElement;
  if (!frame || !viewportHeight) return 0;

  // getBoundingClientRect reporta el iframe reducido por la escala del
  // Mirador; clientHeight sigue en píxeles CSS del viewport interno.
  const frameHeight = Math.round(frame.clientHeight);
  const layoutHeight = Math.round(
    document.documentElement.clientHeight || window.innerHeight || 0,
  );
  return frameHeight > 0
    && Math.abs(frameHeight - viewportHeight) <= 1
    && Math.abs(frameHeight - layoutHeight) <= 1
    ? frameHeight
    : 0;
}

function readRestingViewport() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RESTING_VIEWPORT_STORAGE_KEY) || "null");
    if (
      Number.isFinite(saved?.height)
      && Number.isFinite(saved?.width)
      && Number.isFinite(saved?.layoutHeight)
    ) return saved;
  } catch {
    // La referencia de este ciclo sigue funcionando aunque el storage no esté disponible.
  }
  return null;
}

function saveRestingViewport(layoutHeight = getLayoutViewportHeight()) {
  if (!restingBrowserViewportHeight || !restingBrowserViewportWidth) return;
  try {
    sessionStorage.setItem(RESTING_VIEWPORT_STORAGE_KEY, JSON.stringify({
      height: restingBrowserViewportHeight,
      width: restingBrowserViewportWidth,
      layoutHeight,
    }));
  } catch {
    // El ajuste del viewport no depende de que el navegador permita storage.
  }
}

function clearBrowserKeyboardLayout() {
  delete document.body.dataset.lobbyBrowserKeyboardOpen;
  document.body.style.removeProperty("--lobby-resting-viewport-height");
  document.body.style.removeProperty("--lobby-resting-grid-gap");
  document.body.style.removeProperty("--lobby-resting-grid-margin-top");
  const hero = document.querySelector(".lobby-screen__hero");
  if (hero && previousBrowserKeyboardHeroRowGap !== null) {
    if (previousBrowserKeyboardHeroRowGap) {
      hero.style.setProperty("row-gap", previousBrowserKeyboardHeroRowGap);
    } else {
      hero.style.removeProperty("row-gap");
    }
  }
  previousBrowserKeyboardHeroRowGap = null;
}

function setBrowserKeyboardLayout(height, layoutHeight = getLayoutViewportHeight()) {
  const body = document.body;
  const rootHeight = layoutHeight || height;
  body.dataset.lobbyBrowserKeyboardOpen = "true";
  body.style.setProperty("--lobby-resting-viewport-height", `${height}px`);
  body.style.setProperty("--lobby-resting-grid-gap", `${Math.max(12, Math.min(18, rootHeight * 0.018))}px`);
  body.style.setProperty("--lobby-resting-grid-margin-top", `${Math.max(16, Math.min(24, rootHeight * 0.02))}px`);
  const hero = document.querySelector(".lobby-screen__hero");
  if (hero) {
    previousBrowserKeyboardHeroRowGap = hero.style.getPropertyValue("row-gap");
    hero.style.setProperty("row-gap", `${Math.max(2, Math.min(4, rootHeight * 0.004))}px`);
  }
}

function syncBrowserKeyboardLayout() {
  const body = document.body;
  if (!body.classList.contains("page-context--lobby")) {
    clearBrowserKeyboardLayout();
    restingBrowserViewportHeight = 0;
    restingBrowserViewportWidth = 0;
    return;
  }

  const viewportHeight = getViewportHeight();
  const viewportWidth = getViewportWidth();
  if (!viewportHeight || !viewportWidth) return;

  if (!restingBrowserViewportHeight) {
    restingBrowserViewportHeight = viewportHeight;
    restingBrowserViewportWidth = viewportWidth;
    return;
  }

  // Un cambio de ancho indica una rotación o un redimensionamiento real. En
  // ese caso el lobby debe volver a medir su composición con el viewport nuevo.
  if (Math.abs(viewportWidth - restingBrowserViewportWidth) > 1) {
    clearBrowserKeyboardLayout();
    restingBrowserViewportHeight = viewportHeight;
    restingBrowserViewportWidth = viewportWidth;
    saveRestingViewport();
    scheduleLobbyContentCenter();
    return;
  }

  // En el Mirador el iframe cambia de alto al redimensionar el dispositivo.
  // Ese cambio real de viewport no es el teclado ni las barras del navegador.
  const embeddedViewportHeight = getResizedEmbeddedViewportHeight(viewportHeight);
  if (
    embeddedViewportHeight
    && Math.abs(embeddedViewportHeight - restingBrowserViewportHeight) > 1
  ) {
    clearBrowserKeyboardLayout();
    restingBrowserViewportHeight = embeddedViewportHeight;
    restingBrowserViewportWidth = viewportWidth;
    saveRestingViewport(embeddedViewportHeight);
    scheduleLobbyContentCenter();
    return;
  }

  if (
    activeLobbyInput
    || body.dataset.lobbyInputFocused === "true"
    || body.dataset.lobbyKeyboardOpen === "true"
  ) {
    clearBrowserKeyboardLayout();
    return;
  }

  const browserKeyboardOpen = body.dataset.lobbyBrowserKeyboardOpen === "true";
  if (!browserKeyboardOpen && viewportHeight > restingBrowserViewportHeight) {
    // Chrome también puede conservar el teclado durante una recarga iniciada
    // desde la barra. Al volver al alto normal, actualizar la referencia para
    // que el siguiente cambio de viewport se detecte desde el tamaño correcto.
    restingBrowserViewportHeight = viewportHeight;
    saveRestingViewport(embeddedViewportHeight || getLayoutViewportHeight());
    return;
  }

  if (restingBrowserViewportHeight - viewportHeight > KEYBOARD_DELTA_PX) {
    if (!browserKeyboardOpen) {
      setBrowserKeyboardLayout(restingBrowserViewportHeight);
    }
    return;
  }

  if (browserKeyboardOpen && viewportHeight >= restingBrowserViewportHeight - KEYBOARD_DELTA_PX) {
    clearBrowserKeyboardLayout();
    restingBrowserViewportHeight = viewportHeight;
    saveRestingViewport();
    scheduleLobbyContentCenter();
  }
}

function setKeyboardLayoutActive(active) {
  if (active) document.body.dataset.lobbyKeyboardOpen = "true";
  else delete document.body.dataset.lobbyKeyboardOpen;
  document.body.style.removeProperty("--lobby-keyboard-scroll-space");
  scheduleLobbyContentCenter();
}

function restoreLobbyScroll() {
  window.clearTimeout(restoreTimer);
  restoreTimer = window.setTimeout(() => {
    if (!document.body.classList.contains("page-context--lobby")) return;

    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    window.scrollTo({
      top: Math.min(restoreScrollTop, maxScroll),
      behavior: "auto",
    });

    // Chrome puede aplicar un segundo ajuste después del primer resize.
    restoreTimer = window.setTimeout(() => {
      window.scrollTo({
        top: Math.min(restoreScrollTop, Math.max(
          0,
          document.documentElement.scrollHeight - document.documentElement.clientHeight,
        )),
        behavior: "auto",
      });
    }, 80);
  }, 0);
}

function alignLobbyInputWithKeyboard() {
  alignFrame = 0;
  if (!keyboardOpen || !activeLobbyInput?.isConnected) return;

  const viewport = window.visualViewport;
  const visibleBottom = (viewport?.offsetTop || 0) + getViewportHeight();
  const inputBottom = activeLobbyInput.getBoundingClientRect().bottom;
  const scrollDelta = inputBottom - visibleBottom + KEYBOARD_GAP_PX;
  if (!Number.isFinite(scrollDelta) || Math.abs(scrollDelta) <= 1) return;

  const targetScroll = Math.max(0, window.scrollY + scrollDelta);
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  const neededScrollSpace = Math.max(0, targetScroll - maxScroll);
  const currentScrollSpace = Number.parseFloat(
    document.body.style.getPropertyValue("--lobby-keyboard-scroll-space"),
  ) || 0;

  if (neededScrollSpace > currentScrollSpace + 1) {
    document.body.style.setProperty(
      "--lobby-keyboard-scroll-space",
      `${neededScrollSpace.toFixed(2)}px`,
    );
    scheduleInputAlignment();
    return;
  }

  window.scrollTo({ top: targetScroll, behavior: "auto" });
}

function scheduleInputAlignment() {
  if (alignFrame || !keyboardOpen || !activeLobbyInput) return;
  alignFrame = window.requestAnimationFrame(alignLobbyInputWithKeyboard);
}

function syncKeyboardViewport() {
  syncBrowserKeyboardLayout();

  if (!document.body.classList.contains("page-context--lobby")) {
    if (keyboardOpen) {
      keyboardOpen = false;
      activeLobbyInput = null;
      document.body.removeAttribute("data-lobby-input-focused");
      setKeyboardLayoutActive(false);
    }
    return;
  }

  const viewportHeight = getViewportHeight();
  if (!viewportHeight || !baselineViewportHeight) return;

  const reduced = baselineViewportHeight - viewportHeight > KEYBOARD_DELTA_PX;
  if (reduced) {
    if (!keyboardOpen) {
      keyboardOpen = true;
      setKeyboardLayoutActive(true);
    }
    scheduleInputAlignment();
    return;
  }

  if (!keyboardOpen) return;
  keyboardOpen = false;
  document.body.removeAttribute("data-lobby-input-focused");
  setKeyboardLayoutActive(false);
  if (!activeLobbyInput) baselineViewportHeight = 0;
  restoreLobbyScroll();
}

export function wireLobbyKeyboardRestore() {
  const viewportHeight = getViewportHeight();
  const viewportWidth = getViewportWidth();
  const savedRestingViewport = readRestingViewport();
  const embeddedViewportHeight = getResizedEmbeddedViewportHeight(viewportHeight);
  const savedViewportWasResizedInFrame = Boolean(
    embeddedViewportHeight
    && savedRestingViewport
    && Math.abs(savedRestingViewport.height - embeddedViewportHeight) > 1,
  );
  if (
    document.body.classList.contains("page-context--lobby")
    && savedRestingViewport
    && savedRestingViewport.width === viewportWidth
    && savedRestingViewport.height - viewportHeight > KEYBOARD_DELTA_PX
    && !savedViewportWasResizedInFrame
  ) {
    restingBrowserViewportHeight = savedRestingViewport.height;
    restingBrowserViewportWidth = savedRestingViewport.width;
    if (!document.body.dataset.lobbyFlow) {
      document.body.dataset.lobbyFlow = viewportWidth <= 680 ? "single-column" : "columns";
    }
    setBrowserKeyboardLayout(savedRestingViewport.height, savedRestingViewport.layoutHeight);
    document.body.dataset.lobbyBrowserKeyboardInitializing = "true";
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        delete document.body.dataset.lobbyBrowserKeyboardInitializing;
        scheduleLobbyContentCenter();
      });
    });
  } else {
    restingBrowserViewportHeight = embeddedViewportHeight || viewportHeight;
    restingBrowserViewportWidth = viewportWidth;
    saveRestingViewport();
  }

  document.addEventListener("focusin", (event) => {
    if (!isLobbyInput(event.target)) return;

    window.clearTimeout(restoreTimer);
    if (!activeLobbyInput) restoreScrollTop = window.scrollY || 0;
    activeLobbyInput = event.target;
    document.body.dataset.lobbyInputFocused = "true";
    clearBrowserKeyboardLayout();
    if (!keyboardOpen) baselineViewportHeight = getViewportHeight();
    scheduleLobbyContentCenter();
    scheduleInputAlignment();
  }, { passive: true });

  document.addEventListener("focusout", (event) => {
    if (isLobbyInput(document.activeElement) || isLobbyInput(event.relatedTarget)) return;

    activeLobbyInput = null;
    document.body.removeAttribute("data-lobby-input-focused");
    window.clearTimeout(restoreTimer);
    if (!keyboardOpen) {
      baselineViewportHeight = 0;
      document.body.removeAttribute("data-lobby-keyboard-open");
      document.body.style.removeProperty("--lobby-keyboard-scroll-space");
      scheduleLobbyContentCenter();
    }
  }, { passive: true });

  window.addEventListener("resize", syncKeyboardViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", syncKeyboardViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleInputAlignment, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleInputAlignment, { passive: true });
  window.addEventListener("scroll", scheduleInputAlignment, { passive: true });
}
