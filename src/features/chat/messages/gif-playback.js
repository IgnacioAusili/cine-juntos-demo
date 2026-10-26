const pausedGifFrames = new WeakMap();
const MAX_FRAME_DIMENSION = 1024;

export function isGifImage(image) {
  const source = String(image?.currentSrc || image?.src || "");
  if (/^data:image\/gif(?:[;,])/i.test(source)) return true;

  try {
    return /\.gif$/i.test(new URL(source, document.baseURI).pathname);
  } catch {
    return false;
  }
}

export function toggleGifPlayback(image) {
  const pausedFrame = pausedGifFrames.get(image);
  if (pausedFrame) {
    pausedFrame.remove();
    pausedGifFrames.delete(image);
    image.classList.remove("message__media--gif-paused");
    image.removeAttribute("aria-hidden");
    image.closest(".message__media-link")?.classList.remove("message__media-link--gif-paused");
    return true;
  }

  if (!image?.naturalWidth || !image?.naturalHeight || !image.isConnected) return false;

  const scale = Math.min(1, MAX_FRAME_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const frame = document.createElement("canvas");
  frame.className = "message__gif-frame";
  frame.width = Math.max(1, Math.round(image.naturalWidth * scale));
  frame.height = Math.max(1, Math.round(image.naturalHeight * scale));
  frame.setAttribute("role", "img");
  frame.setAttribute("aria-label", image.alt || "GIF pausado");

  try {
    const context = frame.getContext("2d");
    if (!context) return false;
    context.drawImage(image, 0, 0, frame.width, frame.height);
  } catch {
    return false;
  }

  image.classList.add("message__media--gif-paused");
  image.setAttribute("aria-hidden", "true");
  image.closest(".message__media-link")?.classList.add("message__media-link--gif-paused");
  image.after(frame);
  pausedGifFrames.set(image, frame);
  return true;
}
