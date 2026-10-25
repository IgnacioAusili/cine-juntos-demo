export function wireComponentAspectObservers({
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
}) {
  if (!sessionView || !workspace || !videoArea || !videoPlayer || !playerFrame || !chatArea) return;

  const workspaceObserver = new ResizeObserver(scheduleComponentLayoutMeasure);
  workspaceObserver.observe(workspace);
  workspaceObserver.observe(sessionView);
  workspaceObserver.observe(videoArea);
  workspaceObserver.observe(chatArea);
  [chatTools, messageListShell, messageForm].forEach((element) => {
    if (element) workspaceObserver.observe(element);
  });
  let dockLayoutTransitionPending = false;
  const dockObserver = new MutationObserver(() => {
    if (sessionView.classList.contains('session-view--chat-layout-transitioning')) {
      // Recalcular al asentarse el cambio de dock para leer las restricciones
      // definitivas del layout y sus controles.
      dockLayoutTransitionPending = true;
    }
    scheduleComponentLayoutMeasure();
  });
  dockObserver.observe(sessionView, {
    attributes: true,
    attributeFilter: ["data-chat-dock"],
  });

  let visibilityTransitionPending = false;
  const layoutStateObserver = new MutationObserver((records) => {
    const currentClasses = new Set(sessionView.className.split(/\s+/));
    let shouldMeasure = false;
    let shouldReveal = false;
    let shouldCenterVideo = false;
    let shouldSuppressScroll = false;

    for (const record of records) {
      if (record.attributeName !== "class") continue;

      const previousClasses = new Set((record.oldValue || "").split(/\s+/));
      const justExpanded = previousClasses.has("session-view--chat-collapsed")
        && !currentClasses.has("session-view--chat-collapsed");
      const justCollapsed = !previousClasses.has("session-view--chat-collapsed")
        && currentClasses.has("session-view--chat-collapsed");
      const transitionJustSettled = previousClasses.has("session-view--chat-layout-transitioning")
        && !currentClasses.has("session-view--chat-layout-transitioning");

      if (justExpanded) {
        if (currentClasses.has("session-view--chat-layout-transitioning")) {
          visibilityTransitionPending = true;
        } else {
          shouldMeasure = true;
          shouldReveal = true;
        }
      }

      if (transitionJustSettled && visibilityTransitionPending) {
        visibilityTransitionPending = false;
        shouldMeasure = true;
        shouldSuppressScroll = true;
      }

      if (transitionJustSettled && dockLayoutTransitionPending) {
        dockLayoutTransitionPending = false;
        shouldMeasure = true;
        shouldSuppressScroll = true;
      }

      if (justCollapsed) {
        shouldMeasure = true;
        if (currentClasses.has("session-view--chat-layout-transitioning")) {
          visibilityTransitionPending = true;
        } else {
          shouldCenterVideo = true;
        }
      }
    }

    if (shouldMeasure) {
      scheduleComponentLayoutMeasure(
        shouldSuppressScroll
          ? "suppress-scroll"
          : shouldReveal
            ? "reveal-chat"
            : shouldCenterVideo
              ? "center-video"
              : "",
      );
    }
  });
  layoutStateObserver.observe(sessionView, {
    attributes: true,
    attributeFilter: ["class"],
    attributeOldValue: true,
  });

  videoPlayer.addEventListener("loadedmetadata", () => {
    scheduleComponentLayoutMeasure("center-video");
  });
  window.addEventListener("resize", () => scheduleComponentLayoutMeasure("responsive-resize"), {
    passive: true,
  });
  window.visualViewport?.addEventListener(
    "resize",
    () => scheduleComponentLayoutMeasure("responsive-resize"),
    { passive: true },
  );
  window.addEventListener("chat-layout-settled", () => {
    const shouldCenterCollapsedBottomDock = sessionView.dataset.chatDock === "bottom"
      && sessionView.classList.contains("session-view--chat-collapsed");
    scheduleComponentLayoutMeasure(
      shouldCenterCollapsedBottomDock ? "center-video" : "suppress-scroll",
    );
  }, { passive: true });

  scheduleComponentLayoutMeasure();
}
