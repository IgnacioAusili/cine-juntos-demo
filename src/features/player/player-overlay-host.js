export function appendToPlayerOverlayHost(element) {
  // Los nodos anexados a body quedan fuera de la capa fullscreen nativa.
  const fullscreenShell = document.fullscreenElement?.matches?.(".app-shell")
    ? document.fullscreenElement
    : null;
  (fullscreenShell || document.body).append(element);
}
