const SKIP_CONFIRMATION_KEY = "cine-juntos.skip-chat-link-confirmation";
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const chatLinksBound = new WeakSet();
let confirmationDialog;
let confirmationLabel;
let rememberCheckbox;

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
  if (isConfirmationSkipped()) {
    openChatLinkInNewWindow(safeUrl);
    return;
  }

  const dialog = getConfirmationDialog();
  confirmationLabel.textContent = safeUrl;
  rememberCheckbox.checked = false;
  if (!dialog.open) dialog.showModal();
}

function getConfirmationDialog() {
  if (confirmationDialog) return confirmationDialog;

  const dialog = document.createElement("dialog");
  dialog.className = "chat-link-confirmation";
  dialog.setAttribute("aria-labelledby", "chatLinkConfirmationTitle");
  dialog.setAttribute("aria-describedby", "chatLinkConfirmationDescription");

  const title = document.createElement("h2");
  title.id = "chatLinkConfirmationTitle";
  title.textContent = "Abrir enlace";
  const description = document.createElement("p");
  description.id = "chatLinkConfirmationDescription";
  description.textContent = "¿Querés abrir este enlace en una ventana nueva?";
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

  dialog.append(title, description, confirmationLabel, label, form);
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
