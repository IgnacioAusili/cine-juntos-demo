const VIEWPORT_GUTTER_PX = 10;

let loadPopover = null;

export function openVideoLoadPopover(x, y, onAccept) {
  closeVideoLoadPopover();
  const popup = document.createElement("form");
  popup.className = "video-load-popover";
  popup.setAttribute("aria-label", "Cargar otro video");

  const header = document.createElement("div");
  header.className = "video-load-popover__header";
  const label = document.createElement("label");
  label.className = "video-load-popover__label";
  label.htmlFor = "videoContextLoadUrl";
  label.textContent = "Enlace del nuevo video";
  const closeButton = document.createElement("button");
  closeButton.className = "video-load-popover__close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Cerrar");
  closeButton.append(createPopoverIcon("close"));
  closeButton.addEventListener("click", closeVideoLoadPopover);
  header.append(label, closeButton);

  const input = document.createElement("input");
  input.className = "video-load-popover__input";
  input.id = "videoContextLoadUrl";
  input.type = "url";
  input.inputMode = "url";
  input.autocomplete = "off";
  input.required = true;
  input.placeholder = "https://servidor.com/video.mp4";
  input.setAttribute("aria-label", "Enlace del nuevo video");

  const fieldRow = document.createElement("div");
  fieldRow.className = "video-load-popover__field-row";
  const acceptButton = document.createElement("button");
  acceptButton.className = "video-load-popover__accept";
  acceptButton.type = "submit";
  acceptButton.setAttribute("aria-label", "Aceptar y cargar video");
  acceptButton.title = "Aceptar y cargar video";
  acceptButton.append(createPopoverIcon("accept"));
  fieldRow.append(input, acceptButton);
  popup.append(header, fieldRow);

  popup.addEventListener("submit", (event) => {
    event.preventDefault();
    const source = input.value.trim();
    if (!source) return;
    closeVideoLoadPopover();
    void onAccept(source);
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (loadPopover === popup && !popup.contains(document.activeElement)) closeVideoLoadPopover();
    }, 0);
  });

  document.body.append(popup);
  loadPopover = popup;
  placePopover(popup, x, y);
  installDismissListeners(popup);
  input.focus({ preventScroll: true });
}

export function closeVideoLoadPopover() {
  loadPopover?._dismiss?.();
  loadPopover?.remove();
  loadPopover = null;
}

function createPopoverIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const paths = kind === "close"
    ? ["M18 6 6 18", "m6 6 12 12"]
    : ["m20 6-11 11-5-5"];
  paths.forEach((data) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", data);
    svg.append(path);
  });
  return svg;
}

function placePopover(popup, x, y) {
  const rect = popup.getBoundingClientRect();
  const maxX = Math.max(VIEWPORT_GUTTER_PX, window.innerWidth - rect.width - VIEWPORT_GUTTER_PX);
  const maxY = Math.max(VIEWPORT_GUTTER_PX, window.innerHeight - rect.height - VIEWPORT_GUTTER_PX);
  popup.style.left = `${Math.min(Math.max(VIEWPORT_GUTTER_PX, x), maxX)}px`;
  popup.style.top = `${Math.min(Math.max(VIEWPORT_GUTTER_PX, y), maxY)}px`;
}

function installDismissListeners(popup) {
  const onPointerDown = (event) => {
    if (!popup.contains(event.target)) closeVideoLoadPopover();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") closeVideoLoadPopover();
  };
  const onScroll = () => closeVideoLoadPopover();
  const onResize = () => closeVideoLoadPopover();
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onResize, { passive: true });
  popup._dismiss = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
  };
}
