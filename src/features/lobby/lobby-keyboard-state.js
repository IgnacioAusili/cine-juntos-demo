export function isLobbySoftKeyboardFocusPending() {
  if (document.body.dataset.lobbyInputFocused !== "true") return false;

  return navigator.maxTouchPoints > 0
    || window.matchMedia("(pointer: coarse)").matches;
}
