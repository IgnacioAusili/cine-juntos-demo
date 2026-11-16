const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  "m4v",
  "mov",
  "mp4",
  "ogg",
  "ogv",
  "webm",
]);

const INVALID_VIDEO_URL_MESSAGE =
  "El enlace no es válido o tiene un formato de video no admitido.";

export function getVideoUrlValidationMessage(source) {
  const normalized = String(source || "").trim();
  if (!normalized) return "";

  let url;
  try {
    url = new URL(normalized);
  } catch {
    return INVALID_VIDEO_URL_MESSAGE;
  }

  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    return INVALID_VIDEO_URL_MESSAGE;
  }

  let filename;
  try {
    filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return INVALID_VIDEO_URL_MESSAGE;
  }

  const extensionMatch = filename.match(/\.([^.]*)$/);
  if (extensionMatch && !SUPPORTED_VIDEO_EXTENSIONS.has(extensionMatch[1].toLowerCase())) {
    return INVALID_VIDEO_URL_MESSAGE;
  }

  return "";
}
