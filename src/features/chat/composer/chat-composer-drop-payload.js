import { addPendingImageFile } from "./chat-message-input.js";
import { addPendingImageDataUrl } from "../messages/image-compress.js";
import { getRichEditorTextLength, insertRichEditorText, setRichEditorSelection } from "./chat-rich-editor.js";

const IMAGE_URL_EXTENSION = /\.(?:avif|gif|jpe?g|png|webp|bmp|svg)$/i;
const INTERNAL_PREVIEW_DRAG_TYPE = "application/x-cine-juntos-preview";

export function markInternalPreviewDrag(event) {
  const source = event.target instanceof Element
    ? event.target.closest(".message__media-link, .image-preview-container__item")
    : null;
  if (!source || !event.dataTransfer) return;
  try {
    event.dataTransfer.setData(INTERNAL_PREVIEW_DRAG_TYPE, "1");
  } catch {
    // A browser may expose a read-only drag payload for some media sources.
  }
}

export function isInternalPreviewDrag(dataTransfer) {
  return Array.from(dataTransfer?.types || [])
    .some((type) => String(type).toLowerCase() === INTERNAL_PREVIEW_DRAG_TYPE);
}

export function canAcceptDrop(dataTransfer, isBlocked = () => false) {
  if (!dataTransfer || isInternalPreviewDrag(dataTransfer) || isBlocked()) return false;
  const types = Array.from(dataTransfer.types || []).map((type) => String(type).toLowerCase());
  if (types.includes("files")) return true;
  return types.some((type) => [
    "text/uri-list",
    "text/html",
    "text/plain",
    "text/x-moz-url",
    "url",
  ].includes(type));
}

export function readDropPayload(dataTransfer) {
  if (!dataTransfer) return { files: [], urls: [], text: "" };
  const files = Array.from(dataTransfer.files || []).filter(isImageFile);
  if (files.length) return { files, urls: [], text: "" };
  const itemFiles = Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(isImageFile);
  if (itemFiles.length) return { files: itemFiles, urls: [], text: "" };
  const urls = readDroppedUrls(dataTransfer);
  if (urls.length) return { files: [], urls, text: "" };
  return { files: [], urls: [], text: getTransferData(dataTransfer, "text/plain").trim() };
}

function isImageFile(file) {
  return Boolean(file?.type?.startsWith("image/") || /\.(?:avif|gif|jpe?g|png|webp|bmp|svg)$/i.test(file?.name || ""));
}

function readDroppedUrls(dataTransfer) {
  const uriList = getTransferData(dataTransfer, "text/uri-list");
  const urls = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => describeUrl(line))
    .filter(Boolean);
  if (urls.length) return deduplicateUrls(urls).slice(0, 2);

  const mozillaUrl = getTransferData(dataTransfer, "text/x-moz-url");
  const mozillaCandidate = describeUrl(mozillaUrl.split(/\r?\n/, 1)[0]);
  if (mozillaCandidate) return [mozillaCandidate];

  const html = getTransferData(dataTransfer, "text/html");
  if (html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const anchor = describeHtmlUrl(parsed.querySelector("a[href]")?.getAttribute("href"));
    const image = describeHtmlUrl(parsed.querySelector("img[src]")?.getAttribute("src"));
    if (anchor?.isImage) return [anchor];
    if (image?.isImage) return [image];
    if (anchor) return [anchor];
    if (image) return [image];
  }

  const urlData = getTransferData(dataTransfer, "URL");
  const urlCandidate = describeUrl(urlData);
  if (urlCandidate) return [urlCandidate];

  const plainText = getTransferData(dataTransfer, "text/plain").trim();
  const plainCandidate = describeUrl(plainText);
  return plainCandidate ? [plainCandidate] : [];
}

function describeHtmlUrl(value) {
  return describeUrl(value)
    || describeUrl(normalizeHttpUrl(value, true));
}

function getTransferData(dataTransfer, type) {
  try {
    return dataTransfer.getData(type) || "";
  } catch {
    return "";
  }
}

function normalizeHttpUrl(value, allowRelative = false) {
  try {
    const url = allowRelative
      ? new URL(String(value || ""), window.location.href)
      : new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function describeUrl(value) {
  const candidate = String(value || "").trim();
  if (/^data:image\/(?:avif|gif|jpe?g|png|webp|bmp|svg\+xml);base64,/i.test(candidate)) {
    return { url: candidate, isImage: true };
  }

  try {
    const parsedUrl = new URL(candidate);
    if (["http:", "https:"].includes(parsedUrl.protocol)) {
      return { url: parsedUrl.href, isImage: IMAGE_URL_EXTENSION.test(parsedUrl.pathname) };
    }
    if (parsedUrl.protocol === "file:") {
      return { url: parsedUrl.href, isImage: IMAGE_URL_EXTENSION.test(parsedUrl.pathname), isLocalFile: true };
    }
    return null;
  } catch {
    return null;
  }
}

function deduplicateUrls(urls) {
  const seen = new Set();
  return urls.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function addDroppedUrls(urls, isOverlay, input) {
  urls.forEach(({ url, isImage, isLocalFile }) => {
    if (isImage) {
      // A file:// URL is text supplied by the source page, not permission to
      // read that local path. Browsers only expose its bytes when the drop also
      // includes a File object, handled above.
      if (isLocalFile) {
        appendDroppedLink(input, url);
        return;
      }
      addRemoteImage(url, isOverlay);
      return;
    }
    appendDroppedLink(input, url);
  });
}

function addRemoteImage(url, isOverlay) {
  addPendingImageDataUrl(isOverlay, url);
}

function appendDroppedLink(input, url) {
  appendDroppedText(input, url);
}

function appendDroppedText(input, text) {
  const separator = input.value && !/\s$/.test(input.value) ? "\n" : "";
  setRichEditorSelection(input, getRichEditorTextLength(input));
  insertRichEditorText(input, `${separator}${text}`);
}

export function applyDropPayload(payload, isOverlay, input) {
  payload.files.forEach((file) => addPendingImageFile(file, isOverlay));
  addDroppedUrls(payload.urls, isOverlay, input);
  if (payload.text) appendDroppedText(input, payload.text);
}
