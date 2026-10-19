export function resolveRightChatComposition({
  availableWidth,
  viewportWidth,
  minChatWidth,
  minPlayerWidth,
  columnGap = 0,
  overlayMaxWidth,
}) {
  if (
    Number.isFinite(overlayMaxWidth)
    && Number.isFinite(viewportWidth)
    && viewportWidth <= overlayMaxWidth
  ) {
    return "overlay";
  }

  const requiredParallelWidth = minPlayerWidth + minChatWidth + columnGap;
  if (
    !Number.isFinite(availableWidth)
    || availableWidth <= 0
    || !Number.isFinite(requiredParallelWidth)
    || requiredParallelWidth <= 0
  ) {
    return "parallel";
  }

  return availableWidth >= requiredParallelWidth ? "parallel" : "stacked";
}
