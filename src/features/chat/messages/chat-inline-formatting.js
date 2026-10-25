import { hasInlineFormatting, parseInlineFormatting } from "../inline-formatting-markup.js";

export { hasInlineFormatting };

const copyFeedbackTimers = new WeakMap();

export function appendRemoteImage(container, imageUrl) {
  const link = document.createElement("a");
  link.className = "message__media-link";
  link.href = imageUrl;
  link.target = "_blank";
  link.rel = "noreferrer";

  const image = document.createElement("img");
  image.className = "message__media";
  image.src = imageUrl;
  image.alt = "Imagen enviada";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    link.className = "message__link";
    link.replaceChildren();
    link.textContent = imageUrl;
  }, { once: true });
  link.append(image);
  container.append(link);
}

export function appendInlineFormatting(container, text, appendPlainText, depth = 0) {
  if (depth > 8) {
    appendPlainText(container, text);
    return;
  }
  appendFormattedNodes(container, parseInlineFormatting(text), appendPlainText, depth);
}

function appendFormattedNodes(container, nodes, appendPlainText, depth) {
  if (depth > 8) {
    nodes.forEach((node) => appendPlainText(container, node.type === "text" ? node.value : serializeNodeText(node)));
    return;
  }

  nodes.forEach((node) => {
    if (node.type === "text") {
      appendPlainText(container, node.value);
      return;
    }

    if (node.format === "link") {
      const link = document.createElement("a");
      link.className = "message__link";
      link.href = node.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      appendFormattedNodes(link, node.children, appendPlainText, depth + 1);
      container.append(link);
      return;
    }

    if (node.format === "monospace") {
      const code = document.createElement("code");
      code.className = "message__monospace message__monospace--copyable";
      code.setAttribute("role", "button");
      code.setAttribute("tabindex", "0");
      code.setAttribute("aria-label", "Copiar texto monoespaciado");
      code.dataset.tooltip = "Copiar texto";
      appendFormattedNodes(code, node.children, appendPlainText, depth + 1);
      appendCopyConfirmation(code);
      code.addEventListener("click", (event) => {
        event.preventDefault();
        void copyMonospaceText(code);
      });
      code.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        void copyMonospaceText(code);
      });
      container.append(code);
      return;
    }

    const tagNames = { bold: "strong", italic: "em", underline: "u", strike: "s", spoiler: "span" };
    const element = document.createElement(tagNames[node.format] || "span");
    if (node.format === "italic") element.className = "message__italic";
    if (node.format === "strike") element.className = "message__strike";
    if (node.format === "spoiler") {
      element.className = "message__spoiler";
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      element.setAttribute("aria-label", "Revelar spoiler");
      element.setAttribute("aria-pressed", "false");
      element.dataset.tooltip = "Esto puede ser un spoiler. Haz clic para revelar el texto.";
      element.addEventListener("click", () => revealSpoiler(element));
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        revealSpoiler(element);
      });
    }
    appendFormattedNodes(element, node.children, appendPlainText, depth + 1);
    container.append(element);
  });
}

function appendCopyConfirmation(code) {
  const confirmation = code.ownerDocument.createElement("span");
  confirmation.className = "message__copy-confirmation";
  confirmation.setAttribute("aria-hidden", "true");
  const icon = code.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "3");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  const check = code.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  check.setAttribute("d", "m20 6-11 11-5-5");
  icon.append(check);
  confirmation.append(icon);
  code.append(confirmation);
}

function serializeNodeText(node) {
  if (node.type === "text") return node.value;
  return (node.children || []).map(serializeNodeText).join("");
}

async function copyMonospaceText(element) {
  const text = element.childNodes.length
    ? [...element.childNodes].filter((node) => !node.classList?.contains("message__copy-confirmation")).map((node) => node.textContent || "").join("")
    : element.textContent || "";
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      showCopyConfirmation(element);
      return true;
    } catch {
      // Continue with the synchronous clipboard fallback below.
    }
  }
  if (copyTextWithTemporaryInput(element.ownerDocument, text)) {
    showCopyConfirmation(element);
    return true;
  }
  return false;
}

function showCopyConfirmation(element) {
  window.clearTimeout(copyFeedbackTimers.get(element));
  element.classList.add("message__monospace--copied");
  copyFeedbackTimers.set(element, window.setTimeout(() => {
    element.classList.remove("message__monospace--copied");
    copyFeedbackTimers.delete(element);
  }, 1600));
}

function copyTextWithTemporaryInput(documentRef, text) {
  const activeElement = documentRef.activeElement;
  const selection = documentRef.getSelection();
  const savedRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : [];
  const input = documentRef.createElement("textarea");
  input.value = text;
  input.readOnly = true;
  input.setAttribute("aria-hidden", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  input.style.pointerEvents = "none";
  documentRef.body.append(input);
  input.select();
  try {
    return documentRef.execCommand("copy");
  } catch {
    // Clipboard access may be disabled by the browser.
    return false;
  } finally {
    input.remove();
    if (activeElement?.isConnected) activeElement.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      savedRanges.forEach((range) => selection.addRange(range));
    }
  }
}

function revealSpoiler(element) {
  element.classList.add("message__spoiler--revealed");
  element.setAttribute("aria-label", "Spoiler revelado");
  element.setAttribute("aria-pressed", "true");
}
