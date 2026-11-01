import { enableHorizontalWheelScroll } from "./horizontal-wheel-scroll.js";
import { REMOTE_IMAGE_EXTENSIONS, REMOTE_VIDEO_EXTENSIONS } from "../../../core/utils.js";

export function getRenderableMessageImages(message, messageText = "") {
  const images = Array.isArray(message?.images)
    ? message.images.filter(Boolean)
    : message?.image
      ? [message.image]
      : [];
  if (images.length) return images;
  if (isStandaloneImageText(messageText)) return [messageText.trim()];
  if (getStandaloneRemoteMediaKind(messageText) === "image") return [String(messageText).trim()];
  return [];
}

export function isStandaloneImageText(text) {
  const trimmed = String(text || "").trim();
  return trimmed.startsWith("data:image/") && trimmed.includes("base64,");
}

export function getStandaloneRemoteMediaKind(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const mediaUrl = getStandaloneLinkUrl(text);
  if (!mediaUrl) return "";

  let url;
  try {
    url = new URL(mediaUrl);
  } catch {
    return "";
  }

  if (!['http:', 'https:'].includes(url.protocol) || isLocalHostname(url.hostname)) return "";
  const path = url.pathname.toLowerCase();
  if (REMOTE_IMAGE_EXTENSIONS.some((extension) => path.endsWith(extension))) return "image";
  if (REMOTE_VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension))) return "video";
  return "";
}

function getStandaloneLinkUrl(text) {
  const match = text.match(/^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)$/i);
  if (!match) return text;

  try {
    const labelUrl = new URL(match[1]).href;
    const destinationUrl = new URL(match[2]).href;
    return labelUrl === destinationUrl ? destinationUrl : "";
  } catch {
    return "";
  }
}

function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host || host === "localhost" || host === "0.0.0.0" || host === "::1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || /^169\.254\./.test(host)) return true;
  return false;
}

export function appendMessageMedia(container, images, isStandalone = false) {
  if (!container || !Array.isArray(images) || !images.length) return null;
  const shell = document.createElement("div");
  shell.className = "message__media-strip-shell";

  const strip = document.createElement("div");
  strip.className = 'message__media-strip';
  if (isStandalone) strip.classList.add('message__media-strip--standalone');

  for (const imageUrl of images.slice(0, 2)) {
    const link = document.createElement("a");
    link.className = 'message__media-link';
    link.href = imageUrl;
    link.target = "_blank";
    link.rel = "noreferrer";

    const imgElement = document.createElement("img");
    imgElement.className = 'message__media';
    imgElement.src = imageUrl;
    imgElement.alt = "Imagen adjunta";
    imgElement.loading = "lazy";

    link.append(imgElement);
    strip.append(link);
  }

  const scrollbar = document.createElement("div");
  scrollbar.className = "composer-scrollbar composer-scrollbar--horizontal";
  scrollbar.setAttribute("aria-hidden", "true");
  const thumb = document.createElement("div");
  thumb.className = "composer-scrollbar__thumb";
  scrollbar.append(thumb);

  shell.append(strip, scrollbar);
  container.append(shell);
  enableHorizontalWheelScroll(strip, shell);
  return strip;
}
