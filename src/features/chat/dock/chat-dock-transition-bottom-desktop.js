import { dom } from "../../../core/dom.js";
import { getPageScrollContainer, getPageScrollMax, getPageScrollTop, scrollPageTo } from "./chat-page-scroll.js";
import { syncComponentAspectLayoutNow } from "./component-aspect-layout.js";
import { chatDockTransitionState, getChatDockOperations } from "./chat-layout-transition-state.js";
import { easeBottomChatCurtainProgress, easeBottomChatRevealProgress, getWorkspaceRowHeights, getCollapsedWorkspaceContentHeight } from "./chat-dock-transition-measurements.js";
import { BOTTOM_CHAT_CURTAIN_MS, BOTTOM_CHAT_SCROLL_TIMEOUT_MS } from "./chat-layout-timing.js";
import { clearBottomChatTransitionVisuals, lockBottomChatScrollAnchoring, restoreBottomChatScrollAnchoring } from "./chat-dock-transition-core.js";
import { captureBottomControlsBounds, animateBottomControlsLayout, settleBottomControlsLayout } from "./chat-dock-transition-controls.js";
import { animateFullscreenBottomChatExpand, createFullscreenBottomChatTransition, isFullscreenBottomDock, restoreFullscreenBottomChatScrollSpace, scrollFullscreenBottomChat } from "./chat-dock-transition-fullscreen-scroll.js";

function shouldAnimateBottomChatRows() {
  const isEdgeToEdgeBottomDock = dom.sessionView?.classList.contains('session-view--layout-edge-to-edge')
    && !dom.sessionView.classList.contains('session-view--layout-component-stack');
  return dom.sessionView?.classList.contains('session-view--bottom-dock-panels-fit-viewport')
    || dom.sessionView?.classList.contains('session-view--layout-component-stack')
    || isEdgeToEdgeBottomDock;
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
