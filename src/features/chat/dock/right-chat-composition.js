const CHAT_TO_VIDEO_WIDTH_RATIO = 1.25;
const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;

export function resolveRightChatComposition({
  availableWidth,
  availableHeight,
  minChatWidth,
  minPlayerWidth,
  columnGap = 0,
  videoAspectRatio = DEFAULT_VIDEO_ASPECT_RATIO,
}) {
  if (
    !Number.isFinite(availableWidth)
    || !Number.isFinite(availableHeight)
    || !Number.isFinite(minChatWidth)
    || !Number.isFinite(minPlayerWidth)
    || !Number.isFinite(videoAspectRatio)
    || videoAspectRatio <= 0
  ) {
    return "parallel";
  }

  if (availableWidth <= 0 || availableHeight <= 0) return "overlay";

  const requiredParallelVideoWidth = Math.max(
    minPlayerWidth,
    minChatWidth * CHAT_TO_VIDEO_WIDTH_RATIO,
  );
  const availableParallelVideoWidth = availableWidth - minChatWidth - columnGap;
  const heightLimitedVideoWidth = availableHeight * videoAspectRatio;
  const usableVideoWidth = Math.min(
    availableParallelVideoWidth,
    heightLimitedVideoWidth,
  );
  if (
    !Number.isFinite(requiredParallelVideoWidth)
    || requiredParallelVideoWidth <= 0
    || !Number.isFinite(usableVideoWidth)
  ) {
    return "parallel";
  }

  return usableVideoWidth >= requiredParallelVideoWidth ? "parallel" : "overlay";
}
