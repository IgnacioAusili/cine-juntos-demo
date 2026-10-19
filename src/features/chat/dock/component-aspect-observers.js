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

  let expandedChatTransitionPending = false;
  const layoutStateObserver = new MutationObserver((records) => {
    const currentClasses = new Set(sessionView.className.split(/\s+/));
    let shouldMeasure = false;
    let shouldReveal = false;
    let shouldCenterVideo = false;

    for (const record of records) {
      if (record.attributeName !== "class") continue;

      const previousClasses = new Set((record.oldValue || "").split(/\s+/));
      const justExpanded = previousClasses.has("chat-collapsed")
        && !currentClasses.has("chat-collapsed");
      const justCollapsed = !previousClasses.has("chat-collapsed")
        && currentClasses.has("chat-collapsed");
      const transitionJustSettled = previousClasses.has("chat-layout-transitioning")
        && !currentClasses.has("chat-layout-transitioning");

      if (justExpanded) {
        if (currentClasses.has("chat-layout-transitioning")) {
          expandedChatTransitionPending = true;
        } else {
          shouldMeasure = true;
          shouldReveal = true;
        }
      }

      if (transitionJustSettled && expandedChatTransitionPending) {
        expandedChatTransitionPending = false;
        shouldMeasure = true;
        shouldReveal = true;
      }

      if (transitionJustSettled && dockLayoutTransitionPending) {
        dockLayoutTransitionPending = false;
        shouldMeasure = true;
        shouldReveal = true;
      }

      if (justCollapsed) {
        shouldMeasure = true;
        shouldCenterVideo = true;
      }
    }

    if (shouldMeasure) {
      scheduleComponentLayoutMeasure(
        shouldReveal ? "reveal-chat" : shouldCenterVideo ? "center-video" : "",
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
  window.addEventListener("chat-layout-settled", () => {
    scheduleComponentLayoutMeasure("center-video");
  }, { passive: true });

  scheduleComponentLayoutMeasure();
}
