const SKIP_CONFIRMATION_KEY = "cine-juntos.skip-chat-link-confirmation";
const SCROLL_LOCK_CLASS = "chat-link-confirmation-open";
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const chatLinksBound = new WeakSet();
let confirmationDialog;
let confirmationLabel;
let rememberCheckbox;
let confirmationScrollTop = 0;

export function wireChatLinkConfirmation() {
  if (chatLinksBound.has(document)) return;
  chatLinksBound.add(document);
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.(".message a.message__link[href]");
    if (!link || link.closest(".chat-format-menu")) return;
    event.preventDefault();
    requestOpenChatLink(link.href);
  });
}

export function handleRichEditorLinkClick(event, link) {
  if (!link) return;
  event.preventDefault();
  requestOpenChatLink(link.href);
}

export function openChatLinkInNewWindow(href) {
  const safeUrl = getSafeChatUrl(href);
  if (!safeUrl) return false;
  window.open(safeUrl, "_blank", "noopener,noreferrer");
  return true;
}

function requestOpenChatLink(href) {
  const safeUrl = getSafeChatUrl(href);
  if (!safeUrl) return;
  if (isSameOriginChatUrl(safeUrl)) {
    openChatLinkInNewWindow(safeUrl);
    return;
  }
  if (isConfirmationSkipped()) {
    openChatLinkInNewWindow(safeUrl);
    return;
  }

  const dialog = getConfirmationDialog();
  confirmationLabel.textContent = safeUrl;
  confirmationLabel.title = safeUrl;
  rememberCheckbox.checked = false;
  if (!dialog.open) {
    lockPageScroll();
    dialog.showModal();
  }
}

function lockPageScroll() {
  const root = document.documentElement;
  confirmationScrollTop = window.scrollY;
  root.style.setProperty(
    "--chat-link-confirmation-scroll-offset",
    `-${confirmationScrollTop}px`,
  );
  root.classList.add(SCROLL_LOCK_CLASS);
}

function unlockPageScroll() {
  const root = document.documentElement;
  const scrollTop = confirmationScrollTop;
  root.classList.remove(SCROLL_LOCK_CLASS);
  root.style.removeProperty("--chat-link-confirmation-scroll-offset");
  window.requestAnimationFrame(() => window.scrollTo(0, scrollTop));
}

function getConfirmationDialog() {
  if (confirmationDialog) return confirmationDialog;

  const dialog = document.createElement("dialog");
  dialog.className = "chat-link-confirmation";
  dialog.setAttribute("aria-labelledby", "chatLinkConfirmationTitle");
  dialog.setAttribute(
    "aria-describedby",
    "chatLinkConfirmationDescription chatLinkConfirmationWarning",
  );

  const title = document.createElement("h2");
  title.id = "chatLinkConfirmationTitle";
  title.textContent = "Abrir enlace";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "chat-link-confirmation__close";
  closeButton.setAttribute("aria-label", "Cerrar diálogo");
  const closeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  closeIcon.setAttribute("viewBox", "0 0 32 32");
  closeIcon.setAttribute("aria-hidden", "true");
  const closeGlyph = document.createElementNS("http://www.w3.org/2000/svg", "path");
  closeGlyph.setAttribute("d", "M4 4 28 28 M28 4 4 28");
  closeGlyph.setAttribute("fill", "none");
  closeGlyph.setAttribute("stroke", "currentColor");
  closeGlyph.setAttribute("stroke-linecap", "round");
  closeGlyph.setAttribute("stroke-width", "3");
  closeIcon.append(closeGlyph);
  closeButton.append(closeIcon);
  closeButton.addEventListener("click", () => dialog.close());

  const description = document.createElement("p");
  description.id = "chatLinkConfirmationDescription";
  description.textContent = "¿Querés abrir este enlace en una ventana nueva?";
  const warning = document.createElement("p");
  warning.id = "chatLinkConfirmationWarning";
  warning.className = "chat-link-confirmation__warning";
  warning.setAttribute("role", "note");
  warning.textContent = "Abrí solo enlaces cuyo destino reconozcas. Los enlaces desconocidos pueden ser peligrosos.";

  confirmationLabel = document.createElement("p");
  confirmationLabel.className = "chat-link-confirmation__url";

  const label = document.createElement("label");
  label.className = "chat-link-confirmation__remember";
  rememberCheckbox = document.createElement("input");
  rememberCheckbox.type = "checkbox";
  label.append(rememberCheckbox, document.createTextNode("No volver a preguntar"));

  const form = document.createElement("form");
  form.method = "dialog";
  form.className = "chat-link-confirmation__actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "submit";
  cancelButton.value = "cancel";
  cancelButton.textContent = "Cancelar";
  const openButton = document.createElement("button");
  openButton.type = "submit";
  openButton.value = "open";
  openButton.className = "chat-link-confirmation__open";
  openButton.textContent = "Abrir enlace";
  form.append(cancelButton, openButton);
  form.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "open") return;
    if (rememberCheckbox.checked) setConfirmationSkipped();
    openChatLinkInNewWindow(confirmationLabel.textContent);
  });

  dialog.append(title, closeButton, description, warning, confirmationLabel, label, form);
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom
    ) dialog.close();
  });
  dialog.addEventListener("close", unlockPageScroll);
  document.body.append(dialog);
  confirmationDialog = dialog;
  return dialog;
}

function getSafeChatUrl(href) {
  try {
    const url = new URL(String(href || ""), window.location.href);
    if (!HTTP_PROTOCOLS.has(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function isSameOriginChatUrl(href) {
  try {
    return new URL(href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function isConfirmationSkipped() {
  try {
    return window.localStorage.getItem(SKIP_CONFIRMATION_KEY) === "true";
  } catch {
    return false;
  }
}

function setConfirmationSkipped() {
  try {
    window.localStorage.setItem(SKIP_CONFIRMATION_KEY, "true");
  } catch {
    // Keep the current confirmation available when storage is disabled.
  }
}
