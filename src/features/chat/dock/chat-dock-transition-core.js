import { dom } from "../../../core/dom.js";
import { getPageScrollContainer, getPageScrollMax, getPageScrollTop, isFullscreenPageActive, scrollPageTo } from "./chat-page-scroll.js";
import { syncComponentAspectLayoutNow } from "./component-aspect-layout.js";
import { chatDockTransitionState, getChatDockOperations } from "./chat-layout-transition-state.js";
import { easeBottomChatCurtainProgress, easeBottomChatRevealProgress, getWorkspaceRowHeights, getWorkspaceContentHeight, getCollapsedWorkspaceContentHeight } from "./chat-dock-transition-measurements.js";
import { BOTTOM_CHAT_CURTAIN_MS, BOTTOM_CHAT_SCROLL_TIMEOUT_MS } from "./chat-layout-timing.js";

function shouldAnimateBottomChatRows() {
  const isEdgeToEdgeBottomDock = dom.sessionView?.classList.contains('session-view--layout-edge-to-edge')
    && !dom.sessionView.classList.contains('session-view--layout-component-stack');
  return dom.sessionView?.classList.contains('session-view--bottom-dock-panels-fit-viewport')
    || dom.sessionView?.classList.contains('session-view--layout-component-stack')
    || isEdgeToEdgeBottomDock;
}

function captureBottomControlsBounds() {
  const progress = dom.playerFrame?.querySelector(".player-progress-group");
  const controls = dom.playerFrame?.querySelector(".player-controls-bar");
  const elements = [
    ...(progress ? [{ element: progress, stretchX: true }] : []),
    ...Array.from(controls?.children || [])
      .filter((element) => !element.matches(".player-progress-group"))
      .map((element) => ({ element, stretchX: false })),
  ];

  return elements.flatMap(({ element, stretchX }) => {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return [];
    return [{ element, stretchX, x: bounds.x, y: bounds.y, width: bounds.width }];
  });
}

function animateBottomControlsLayout(transition) {
  const starts = transition.controlsBounds;
  if (!transition.animateRows || !starts?.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const easing = transition.collapsed
    ? "cubic-bezier(0.22, 1, 0.36, 1)"
    : "cubic-bezier(0.42, 0, 0.58, 1)";
  transition.controlsAnimations = starts.flatMap((start) => {
    if (typeof start.element.animate !== "function") return [];
    const end = start.element.getBoundingClientRect();
    if (!end.width || !end.height) return [];

    const translateX = start.x - end.x;
    const translateY = start.y - end.y;
    const scaleX = start.stretchX ? start.width / end.width : 1;
    if (
      Math.abs(translateX) < 0.5
      && Math.abs(translateY) < 0.5
      && Math.abs(scaleX - 1) < 0.005
    ) return [];

    const initialTransform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, 1)`;
    return [start.element.animate(
      [
        { transformOrigin: "0 50%", transform: initialTransform },
        { transformOrigin: "0 50%", transform: "none" },
      ],
      { duration: BOTTOM_CHAT_CURTAIN_MS, easing },
    )];
  });
}

function settleBottomControlsLayout(transition) {
  for (const animation of transition?.controlsAnimations || []) {
    if (animation.playState === "running") animation.finish();
    animation.cancel();
  }
  if (transition) transition.controlsAnimations = [];
}

export function clearBottomChatTransitionVisuals() {
  dom.sessionView?.classList.remove(
    'session-view--chat-bottom-collapse-visual',
    'session-view--chat-bottom-expand-visual',
    'session-view--chat-bottom-mobile-collapse-visual',
    'session-view--chat-bottom-mobile-expand-visual',
    'session-view--chat-bottom-mobile-curtain-active',
    'session-view--chat-bottom-pc-collapse-visual',
    'session-view--chat-bottom-pc-expand-visual',
    'session-view--chat-bottom-pc-expand-controls-transition',
    'session-view--chat-bottom-pc-collapse-controls-transition',
    'session-view--chat-bottom-curtain-active',
  );
  dom.sessionView?.style.removeProperty("--chat-bottom-curtain-clip");
  dom.workspace?.style.removeProperty("grid-template-rows");
  dom.chatArea?.style.removeProperty("clip-path");
  dom.chatArea?.style.removeProperty("opacity");
  const messageForm = dom.chatArea?.querySelector(".message-form");
  messageForm?.style.removeProperty("--chat-bottom-pc-expand-composer-left");
  messageForm?.style.removeProperty("--chat-bottom-pc-expand-composer-width");
  if (dom.sessionView?.dataset.chatDock === "bottom") {
    messageForm?.style.removeProperty("width");
  }
}

export function lockBottomChatScrollAnchoring(transition) {
  const scrollContainer = isFullscreenPageActive()
    ? getPageScrollContainer()
    : document.scrollingElement || document.documentElement;
  if (!scrollContainer?.style) return;

  transition.scrollAnchorContainer = scrollContainer;
  transition.previousScrollAnchor = scrollContainer.style.getPropertyValue("overflow-anchor");
  transition.previousScrollAnchorPriority = scrollContainer.style.getPropertyPriority("overflow-anchor");
  scrollContainer.style.setProperty("overflow-anchor", "none");
}

export function restoreBottomChatScrollAnchoring(transition) {
  const scrollContainer = transition?.scrollAnchorContainer;
  if (!scrollContainer?.style) return;

  if (transition.previousScrollAnchor) {
    scrollContainer.style.setProperty(
      "overflow-anchor",
      transition.previousScrollAnchor,
      transition.previousScrollAnchorPriority,
    );
  } else {
    scrollContainer.style.removeProperty("overflow-anchor");
  }
  transition.scrollAnchorContainer = null;
}

export function cancelBottomChatTransition() {
  if (chatDockTransitionState.bottomChatTransition) {
    const transition = chatDockTransitionState.bottomChatTransition;
    window.cancelAnimationFrame(transition.frameId);
    window.clearTimeout(transition.timeoutId);
    if (transition.scrollEndListener && transition.scrollContainer) {
      transition.scrollContainer.removeEventListener("scrollend", transition.scrollEndListener);
    }
    if (transition.nativeScrollInProgress) {
      transition.nativeScrollInProgress = false;
      scrollPageTo(getPageScrollTop(), "auto");
    }
    for (const animation of transition.controlsAnimations || []) animation.cancel();
    restoreFullscreenBottomChatScrollSpace(transition);
    restoreBottomChatScrollAnchoring(transition);
    chatDockTransitionState.bottomChatTransition = null;
    transition.cancelled = true;
    transition.resolveFinished?.(false);
  }
  clearBottomChatTransitionVisuals();
}

function isFullscreenBottomDock() {
  return isFullscreenPageActive() && dom.sessionView?.dataset.chatDock === "bottom";
}

function restoreFullscreenBottomChatScrollSpace(transition) {
  transition?.scrollSpacer?.remove();
  if (transition) transition.scrollSpacer = null;
}

function createFullscreenBottomChatTransition(collapsed) {
  let resolveFinished;
  const finished = new Promise((resolve) => {
    resolveFinished = resolve;
  });
  return {
    collapsed,
    frameId: 0,
    timeoutId: 0,
    nativeScrollInProgress: false,
    finished,
    resolveFinished,
    cancelled: false,
  };
}

function finishFullscreenBottomChatScroll(transition, onFinish) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  const container = transition.scrollContainer;
  if (transition.scrollEndListener && container) {
    container.removeEventListener("scrollend", transition.scrollEndListener);
  }
  window.clearTimeout(transition.timeoutId);
  transition.nativeScrollInProgress = false;
  onFinish();
  chatDockTransitionState.bottomChatTransition = null;
  getChatDockOperations().setCollapseHandleTransitioning(false);
  getChatDockOperations().scheduleExternalChatCollapseHandleOffset();
  getChatDockOperations().scheduleMessageTimeAdjustmentAfterLayout();
  transition.resolveFinished?.(true);
}

function scrollFullscreenBottomChat(transition, targetScrollTop, onFinish) {
  const container = getPageScrollContainer();
  if (!container) {
    onFinish();
    chatDockTransitionState.bottomChatTransition = null;
    transition.resolveFinished?.(true);
    return;
  }

  transition.scrollContainer = container;
  transition.targetScrollTop = targetScrollTop;
  transition.nativeScrollInProgress = true;
  transition.scrollEndListener = () => {
    if (Math.abs(getPageScrollTop() - targetScrollTop) > 1) {
      scrollPageTo(targetScrollTop, "auto");
    }
    finishFullscreenBottomChatScroll(transition, onFinish);
  };
  container.addEventListener("scrollend", transition.scrollEndListener, { once: true });
  transition.timeoutId = window.setTimeout(() => {
    if (Math.abs(getPageScrollTop() - targetScrollTop) > 1) {
      scrollPageTo(targetScrollTop, "auto");
    }
    finishFullscreenBottomChatScroll(transition, onFinish);
  }, BOTTOM_CHAT_SCROLL_TIMEOUT_MS);

  if (Math.abs(getPageScrollTop() - targetScrollTop) <= 1) {
    finishFullscreenBottomChatScroll(transition, onFinish);
    return;
  }

  getChatDockOperations().lockChatScrollSnapDuringProgrammaticScroll(
    BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  scrollPageTo(targetScrollTop, "smooth");
}

function animateFullscreenBottomChatCollapse(targetScrollTop) {
  const sessionView = dom.sessionView;
  const startRows = getWorkspaceRowHeights();
  const startScrollTop = getPageScrollTop();
  const scrollContainer = getPageScrollContainer();
  const transition = {
    ...createFullscreenBottomChatTransition(true),
    animateRows: true,
    startRows,
    targetRows: [startRows[0], 0],
    startScrollTop,
    targetScrollTop,
    finalScrollTop: targetScrollTop,
    fullscreenCollapseAfterRows: true,
    startedAt: performance.now(),
    scrollSpacer: null,
  };
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  if (scrollContainer && startRows[1] > 0) {
    const spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    Object.assign(spacer.style, {
      position: "absolute",
      left: "0",
      top: "100%",
      width: "1px",
      height: `${startRows[1]}px`,
      overflow: "hidden",
      pointerEvents: "none",
      visibility: "hidden",
    });
    scrollContainer.append(spacer);
    transition.scrollSpacer = spacer;
  }
  if (sessionView) {
    sessionView.classList.add("session-view--chat-bottom-pc-collapse-visual");
    dom.workspace.style.setProperty(
      "grid-template-rows",
      `${startRows[0]}px ${startRows[1]}px`,
    );
  }
  setDesktopBottomChatCurtainProgress(0);
  getChatDockOperations().setCollapseHandleTransitioning(true, BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80);
  void dom.chatArea?.offsetWidth;
  transition.frameId = window.requestAnimationFrame(() => {
    stepDesktopBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepDesktopBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

function animateFullscreenBottomChatExpand() {
  const transition = createFullscreenBottomChatTransition(false);
  chatDockTransitionState.bottomChatTransition = transition;
  getChatDockOperations().applyExternalChatCollapsed(false);
  const targetScrollTop = getPageScrollMax();
  getChatDockOperations().setCollapseHandleTransitioning(true, BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80);
  scrollFullscreenBottomChat(transition, targetScrollTop, () => {
    scrollPageTo(targetScrollTop, "auto");
  });
}

export function completeDesktopBottomChatTransition(transition) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  const shouldPinExpandedChatToBottom = !transition.collapsed;
  window.cancelAnimationFrame(transition.frameId);
  window.clearTimeout(transition.timeoutId);
  settleBottomControlsLayout(transition);
  restoreBottomChatScrollAnchoring(transition);
  chatDockTransitionState.bottomChatTransition = null;
  clearBottomChatTransitionVisuals();
  getChatDockOperations().setCollapseHandleTransitioning(false);
  if (shouldPinExpandedChatToBottom) scrollPageTo(getPageScrollMax(), "auto");
  getChatDockOperations().scheduleExternalChatCollapseHandleOffset();
}

export function setDesktopBottomChatCurtainProgress(progress) {
  const clip = Math.max(0, Math.min(100, progress));
  dom.sessionView?.style.setProperty("--chat-bottom-curtain-clip", `${clip}%`);
}

export function setMobileBottomTransitionProgress(transition, progress) {
  const easedProgress = transition.collapsed
    ? easeBottomChatCurtainProgress(progress)
    : easeBottomChatRevealProgress(progress);
  const videoHeight = transition.startRows[0]
    + ((transition.targetRows[0] - transition.startRows[0]) * easedProgress);
  const chatHeight = transition.startRows[1]
    + ((transition.targetRows[1] - transition.startRows[1]) * easedProgress);
  dom.workspace?.style.setProperty(
    "grid-template-rows",
    `${Math.max(0, videoHeight)}px ${Math.max(0, chatHeight)}px`,
  );

  const clipProgress = transition.collapsed ? easedProgress : 1 - easedProgress;
  dom.chatArea?.style.setProperty(
    "clip-path",
    `inset(0 0 ${Math.max(0, Math.min(100, clipProgress * 100))}% 0)`,
  );

  const scrollProgress = transition.startScrollTop
    + ((transition.targetScrollTop - transition.startScrollTop) * easedProgress);
  scrollPageTo(Math.round(scrollProgress), "auto");
}

export function setDesktopBottomTransitionRowsProgress(transition, progress) {
  if (!transition.animateRows || !dom.workspace) return;

  const videoHeight = transition.startRows[0]
    + ((transition.targetRows[0] - transition.startRows[0]) * progress);
  const chatHeight = transition.startRows[1]
    + ((transition.targetRows[1] - transition.startRows[1]) * progress);
  dom.workspace.style.setProperty(
    "grid-template-rows",
    `${Math.max(0, videoHeight)}px ${Math.max(0, chatHeight)}px`,
  );
}

export function completeMobileBottomChatTransition(transition) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  const shouldPinExpandedChatToBottom = !transition.collapsed;
  window.cancelAnimationFrame(transition.frameId);
  window.clearTimeout(transition.timeoutId);
  restoreBottomChatScrollAnchoring(transition);
  chatDockTransitionState.bottomChatTransition = null;
  clearBottomChatTransitionVisuals();
  getChatDockOperations().setCollapseHandleTransitioning(false);
  if (shouldPinExpandedChatToBottom) scrollPageTo(getPageScrollMax(), "auto");
  getChatDockOperations().scheduleExternalChatCollapseHandleOffset();
}

export function stepMobileBottomChatTransition(transition, force = false) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  const linearProgress = force
    ? 1
    : Math.min(1, Math.max(0, (performance.now() - transition.startedAt) / BOTTOM_CHAT_CURTAIN_MS));
  setMobileBottomTransitionProgress(transition, linearProgress);

  if (linearProgress < 1) {
    transition.frameId = window.requestAnimationFrame(() => {
      stepMobileBottomChatTransition(transition);
    });
    return;
  }

  completeMobileBottomChatTransition(transition);
}

export function stepDesktopBottomChatTransition(transition, force = false) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  const elapsed = performance.now() - transition.startedAt;
  const linearProgress = force
    ? 1
    : Math.min(1, Math.max(0, elapsed / BOTTOM_CHAT_CURTAIN_MS));
  const progress = transition.collapsed
    ? easeBottomChatCurtainProgress(linearProgress)
    : easeBottomChatRevealProgress(linearProgress);
  // En escritorio la unión visual está en el borde superior del panel. Al
  // cerrar se oculta desde arriba hacia abajo; al abrir se revela desde abajo
  // hacia arriba, mientras el shell desplaza el video en el mismo frame.
  const clipProgress = transition.collapsed ? progress : 1 - progress;
  setDesktopBottomChatCurtainProgress(clipProgress * 100);
  setDesktopBottomTransitionRowsProgress(transition, progress);

  const scrollProgress = transition.startScrollTop
    + ((transition.targetScrollTop - transition.startScrollTop) * progress);
  scrollPageTo(Math.round(scrollProgress), "auto");

  if (linearProgress < 1) {
    transition.frameId = window.requestAnimationFrame(() => {
      stepDesktopBottomChatTransition(transition);
    });
    return;
  }

  if (transition.fullscreenCollapseAfterRows) {
    window.clearTimeout(transition.timeoutId);
    getChatDockOperations().applyExternalChatCollapsed(true);
    scrollFullscreenBottomChat(transition, transition.finalScrollTop, () => {
      restoreFullscreenBottomChatScrollSpace(transition);
      settleBottomControlsLayout(transition);
      restoreBottomChatScrollAnchoring(transition);
      clearBottomChatTransitionVisuals();
    });
    return;
  }

  if (transition.collapsed) {
    // El último frame ya dejó el panel cerrado y el scroll en el destino; al
    // reducir ahora la fila no se produce un salto ni se pierde la cortina.
    getChatDockOperations().applyExternalChatCollapsed(true);
    getChatDockOperations().setCollapseHandleTransitioning(
      true,
      BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
    );
    scrollPageTo(transition.targetScrollTop, "auto");
  }
  completeDesktopBottomChatTransition(transition);
}

export function animateDesktopBottomChatCollapse(targetScrollTop) {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(true);
    return;
  }

  if (isFullscreenBottomDock()) {
    animateFullscreenBottomChatCollapse(targetScrollTop);
    return;
  }

  const animateRows = shouldAnimateBottomChatRows();
  const startRows = animateRows ? getWorkspaceRowHeights() : [0, 0];
  const transition = {
    collapsed: true,
    animateRows,
    controlsBounds: animateRows ? captureBottomControlsBounds() : null,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startRows,
    targetRows: animateRows ? [getCollapsedWorkspaceContentHeight(), 0] : [0, 0],
    startScrollTop: getPageScrollTop(),
    targetScrollTop,
  };
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.sessionView.classList.add('session-view--chat-bottom-pc-collapse-visual');
  setDesktopBottomChatCurtainProgress(0);
  if (transition.animateRows) {
    // Reanclar los controles al video desde el primer frame; si se espera a
    // que termine la medición del layout, cambian de posición al final.
    dom.sessionView.classList.add('session-view--chat-bottom-pc-collapse-controls-transition');
    dom.workspace.style.setProperty(
      "grid-template-rows",
      `${transition.startRows[0]}px ${transition.startRows[1]}px`,
    );
  }
  void dom.chatArea.offsetWidth;
  animateBottomControlsLayout(transition);
  transition.frameId = window.requestAnimationFrame(() => {
    if (chatDockTransitionState.bottomChatTransition !== transition) return;
    stepDesktopBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepDesktopBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

export function animateDesktopBottomChatExpand() {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(false);
    return;
  }

  if (isFullscreenBottomDock()) {
    animateFullscreenBottomChatExpand();
    return;
  }

  const animateRows = shouldAnimateBottomChatRows();
  const transition = {
    collapsed: false,
    animateRows,
    controlsBounds: animateRows ? captureBottomControlsBounds() : null,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startRows: animateRows ? getWorkspaceRowHeights() : [0, 0],
    targetRows: [0, 0],
    // Guardar el anclaje antes de abrir la segunda fila. De lo contrario el
    // scroll anchoring del navegador desplaza la página durante el reflow y la
    // animación empieza desde una posición intermedia, mostrando dos etapas.
    startScrollTop: getPageScrollTop(),
    targetScrollTop: 0,
  };
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  setDesktopBottomChatCurtainProgress(100);
  // Activar la transición antes de cambiar el estado del dock para que la
  // pista llegue a la disposición expandida en el mismo recorrido del frame.
  if (animateRows) {
    dom.sessionView.classList.add('session-view--chat-bottom-pc-expand-controls-transition');
  }
  // Se reserva la fila completa con la cortina cerrada. Desde el primer frame
  // el scroll y la apertura recorren juntos la distancia hasta la unión.
  getChatDockOperations().applyExternalChatCollapsed(false);
  // Resolver aquí el estado final de ajuste al viewport. Si se deja al observer,
  // la clase de ajuste llega durante la cortina y cambia de golpe la altura del
  // riel inferior, desplazando la pista después de que ya empezó a animarse.
  if (animateRows) syncComponentAspectLayoutNow({ allowDuringChatTransition: true });
  if (animateRows) transition.targetRows = getWorkspaceRowHeights();
  const messageForm = dom.chatArea.querySelector(".message-form");
  const composerBounds = messageForm?.getBoundingClientRect();
  const chatAreaBounds = dom.chatArea.getBoundingClientRect();
  if (messageForm && composerBounds?.width > 0) {
    // Ajustar la coordenada una vez aplicado fixed: el containing block puede
    // ser un ancestro interno, así que un left porcentual no equivale al viewport.
    messageForm.style.setProperty("--chat-bottom-pc-expand-composer-left", "0px");
    messageForm.style.setProperty(
      "--chat-bottom-pc-expand-composer-width",
      `${composerBounds.width}px`,
    );
  }
  dom.sessionView.classList.add('session-view--chat-bottom-pc-expand-visual');
  if (messageForm && composerBounds?.width > 0) {
    const fixedBounds = messageForm.getBoundingClientRect();
    const targetLeft =
      chatAreaBounds.left + (chatAreaBounds.width - fixedBounds.width) / 2;
    messageForm.style.setProperty(
      "--chat-bottom-pc-expand-composer-left",
      `${targetLeft - fixedBounds.left}px`,
    );
  }
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  transition.targetScrollTop = getPageScrollMax();
  if (animateRows) {
    dom.workspace.style.setProperty(
      "grid-template-rows",
      `${transition.startRows[0]}px ${transition.startRows[1]}px`,
    );
  }
  // Eliminar el ajuste automático de scroll que produjo el reflow antes del
  // primer repintado, para que la cortina y el scroll recorran una sola fase.
  scrollPageTo(transition.startScrollTop, "auto");
  void dom.chatArea.offsetWidth;
  animateBottomControlsLayout(transition);
  transition.startedAt = performance.now();
  transition.frameId = window.requestAnimationFrame(() => {
    stepDesktopBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepDesktopBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

export function animateBottomChatCollapse(targetScrollTop) {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(true);
    return;
  }

  const transition = {
    collapsed: true,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startRows: getWorkspaceRowHeights(),
    targetRows: [0, 0],
    startScrollTop: getPageScrollTop(),
    targetScrollTop,
  };
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.sessionView.classList.add('session-view--chat-bottom-mobile-collapse-visual');
  void dom.workspace?.offsetWidth;
  getChatDockOperations().applyExternalChatCollapsed(true);
  transition.targetRows = [
    getWorkspaceContentHeight(),
    0,
  ];
  dom.workspace?.style.setProperty(
    "grid-template-rows",
    `${transition.startRows[0]}px ${transition.startRows[1]}px`,
  );
  // El viewport acompaña la cortina desde el primer frame: al terminar el
  // reproductor queda alineado en la posición superior de la página.
  setMobileBottomTransitionProgress(transition, 0);
  void dom.chatArea.offsetWidth;
  dom.sessionView.classList.add('session-view--chat-bottom-mobile-curtain-active');
  transition.frameId = window.requestAnimationFrame(() => {
    stepMobileBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepMobileBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

export function animateBottomChatExpand() {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(false);
    return;
  }

  const transition = {
    collapsed: false,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startRows: getWorkspaceRowHeights(),
    targetRows: [0, 0],
    startScrollTop: getPageScrollTop(),
    targetScrollTop: 0,
  };
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  dom.sessionView.classList.add('session-view--chat-bottom-mobile-expand-visual');
  void dom.workspace?.offsetWidth;
  // Primero se reserva la fila completa con el contenido todavía oculto;
  // después se revela desde la unión superior hacia abajo.
  getChatDockOperations().applyExternalChatCollapsed(false);
  transition.targetRows = getWorkspaceRowHeights();
  transition.targetScrollTop = getPageScrollMax();
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.workspace?.style.setProperty(
    "grid-template-rows",
    `${transition.startRows[0]}px ${transition.startRows[1]}px`,
  );
  setMobileBottomTransitionProgress(transition, 0);
  void dom.chatArea.offsetWidth;
  dom.sessionView.classList.add('session-view--chat-bottom-mobile-curtain-active');
  transition.startedAt = performance.now();
  transition.frameId = window.requestAnimationFrame(() => {
    stepMobileBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepMobileBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}
