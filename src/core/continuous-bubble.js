function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function clampBubbleTailCenter(center, width, radius, tailWidth) {
  const safeWidth = Math.max(0, finiteNumber(width));
  const safeRadius = Math.max(0, finiteNumber(radius));
  const safeTailWidth = Math.max(0, finiteNumber(tailWidth));
  const minCenter = safeRadius + safeTailWidth / 2;
  const maxCenter = safeWidth - safeRadius - safeTailWidth / 2;

  if (minCenter > maxCenter) return safeWidth / 2;
  return Math.min(maxCenter, Math.max(minCenter, finiteNumber(center, safeWidth / 2)));
}

export function buildContinuousBubblePath({
  width,
  height,
  tailSide,
  tailCenter,
  radius,
  tailWidth,
  tailHeight,
  tailSideRadius,
}) {
  const safeWidth = Math.max(0, finiteNumber(width));
  const safeHeight = Math.max(0, finiteNumber(height));
  const safeRadius = Math.min(
    Math.max(0, finiteNumber(radius)),
    safeWidth / 2,
    safeHeight / 2,
  );
  const safeTailSideRadius = Math.min(
    Math.max(0, finiteNumber(tailSideRadius, safeRadius)),
    safeWidth / 2,
    safeHeight / 2,
  );
  const safeTailWidth = Math.max(0, finiteNumber(tailWidth));
  const safeTailHeight = Math.max(0, finiteNumber(tailHeight));
  const center = clampBubbleTailCenter(
    tailCenter,
    safeWidth,
    safeTailSideRadius,
    safeTailWidth,
  );
  const tailLeft = center - safeTailWidth / 2;
  const tailRight = center + safeTailWidth / 2;

  if (tailSide === "top") {
    return [
      `M ${center} 0`,
      `L ${tailRight} ${safeTailHeight}`,
      `L ${safeWidth - safeTailSideRadius} ${safeTailHeight}`,
      `A ${safeTailSideRadius} ${safeTailSideRadius} 0 0 1 ${safeWidth} ${safeTailHeight + safeTailSideRadius}`,
      `L ${safeWidth} ${safeTailHeight + safeHeight - safeRadius}`,
      `A ${safeRadius} ${safeRadius} 0 0 1 ${safeWidth - safeRadius} ${safeTailHeight + safeHeight}`,
      `L ${safeRadius} ${safeTailHeight + safeHeight}`,
      `A ${safeRadius} ${safeRadius} 0 0 1 0 ${safeTailHeight + safeHeight - safeRadius}`,
      `L 0 ${safeTailHeight + safeTailSideRadius}`,
      `A ${safeTailSideRadius} ${safeTailSideRadius} 0 0 1 ${safeTailSideRadius} ${safeTailHeight}`,
      `L ${tailLeft} ${safeTailHeight}`,
      "Z",
    ].join(" ");
  }

  return [
    `M ${safeRadius} 0`,
    `L ${safeWidth - safeRadius} 0`,
    `A ${safeRadius} ${safeRadius} 0 0 1 ${safeWidth} ${safeRadius}`,
    `L ${safeWidth} ${safeHeight - safeTailSideRadius}`,
    `A ${safeTailSideRadius} ${safeTailSideRadius} 0 0 1 ${safeWidth - safeTailSideRadius} ${safeHeight}`,
    `L ${tailRight} ${safeHeight}`,
    `L ${center} ${safeHeight + safeTailHeight}`,
    `L ${tailLeft} ${safeHeight}`,
    `L ${safeTailSideRadius} ${safeHeight}`,
    `A ${safeTailSideRadius} ${safeTailSideRadius} 0 0 1 0 ${safeHeight - safeTailSideRadius}`,
    `L 0 ${safeRadius}`,
    `A ${safeRadius} ${safeRadius} 0 0 1 ${safeRadius} 0`,
    "Z",
  ].join(" ");
}
