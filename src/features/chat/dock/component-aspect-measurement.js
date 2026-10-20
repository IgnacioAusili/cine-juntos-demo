const VIDEO_ASPECT_RATIO_FALLBACK = 16 / 9;
const MINIMUM_CHAT_TO_VIDEO_HEIGHT_RATIO = 1;

function readCssPixels(style, property) {
  const value = Number.parseFloat(style.getPropertyValue(property));
  return Number.isFinite(value) ? value : 0;
}

function readAspectRatio(value) {
  const [width, height] = value.split("/").map(Number);
  return width > 0 && height > 0 ? width / height : 0;
}

function getVideoAspectRatio(videoPlayer, playerFrame) {
  if (videoPlayer?.videoWidth > 0 && videoPlayer.videoHeight > 0) {
    return videoPlayer.videoWidth / videoPlayer.videoHeight;
  }

  const videoRatio = readAspectRatio(getComputedStyle(videoPlayer).aspectRatio);
  if (videoRatio) return videoRatio;

  const frameStyle = getComputedStyle(playerFrame);
  return readAspectRatio(
    frameStyle.getPropertyValue("--bottom-dock-video-default-aspect-ratio"),
  ) || VIDEO_ASPECT_RATIO_FALLBACK;
}

function getVideoMinimumBlockSize(playerFrame, videoPlayer, maxBlockSize) {
  const frameRect = playerFrame.getBoundingClientRect();
  const frameStyle = getComputedStyle(playerFrame);
  const contentWidth = Math.max(
    0,
    frameRect.width
      - readCssPixels(frameStyle, "border-left-width")
      - readCssPixels(frameStyle, "border-right-width"),
  );
  const borderBlockSize = readCssPixels(frameStyle, "border-top-width")
    + readCssPixels(frameStyle, "border-bottom-width");

  const aspectRatioBlockSize = contentWidth / getVideoAspectRatio(videoPlayer, playerFrame)
    + borderBlockSize;

  // No imponerle al reproductor una altura mayor que el viewport disponible.
  // El video conserva su proporción dentro del frame mediante object-fit: contain.
  return maxBlockSize > 0
    ? Math.min(aspectRatioBlockSize, maxBlockSize)
    : aspectRatioBlockSize;
}

function getChatMinimumBlockSize(
  chatArea,
  chatTools,
  messageListShell,
  videoMinimumBlockSize,
) {
  const toolsStyle = getComputedStyle(chatTools);
  const toolsHeight = Math.max(
    chatTools.getBoundingClientRect().height,
    readCssPixels(toolsStyle, "min-height"),
  );
  const messageListStyle = getComputedStyle(messageListShell);
  const messageListHeight = readCssPixels(messageListStyle, "min-height");
  const chatStyle = getComputedStyle(chatArea);
  const chatInsets = readCssPixels(chatStyle, "border-top-width")
    + readCssPixels(chatStyle, "border-bottom-width")
    + readCssPixels(chatStyle, "padding-top")
    + readCssPixels(chatStyle, "padding-bottom");
  const chatRowGap = readCssPixels(chatStyle, "row-gap");

  const structuralMinimum = toolsHeight + messageListHeight + chatInsets + chatRowGap;
  const readableMinimum = videoMinimumBlockSize * MINIMUM_CHAT_TO_VIDEO_HEIGHT_RATIO;

  return Math.max(structuralMinimum, readableMinimum);
}

export function hasLoadedVideo(videoPlayer) {
  return Boolean(
    (videoPlayer?.currentSrc || videoPlayer?.getAttribute("src"))
    && videoPlayer.readyState >= HTMLMediaElement.HAVE_METADATA,
  );
}

export function resolveBottomDockLayout({
  sessionView,
  workspace,
  playerFrame,
  videoPlayer,
  chatArea,
  chatTools,
  messageListShell,
}) {
  const unavailable = {
    requiresSequentialLayout: false,
    combinedPanelHeight: 0,
    availableBlockSize: 0,
    videoMinimumBlockSize: 0,
    chatMinimumBlockSize: 0,
    hasMeasuredPanels: false,
  };

  if (
    !sessionView
    || !workspace
    || !playerFrame
    || !videoPlayer
    || !chatArea
    || !chatTools
    || !messageListShell
    || sessionView.dataset.chatDock !== "bottom"
  ) {
    return unavailable;
  }

  const workspaceStyle = getComputedStyle(workspace);
  const workspaceRect = workspace.getBoundingClientRect();
  const appViewportBlockSize = readCssPixels(
    getComputedStyle(document.documentElement),
    "--app-viewport-height",
  );
  const sharedBlockSizeInset = readCssPixels(
    workspaceStyle,
    "--bottom-dock-shared-block-size-inset-start",
  ) + readCssPixels(
    workspaceStyle,
    "--bottom-dock-shared-block-size-inset-end",
  );
  const isDesktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const videoViewportInset = isDesktop
    ? readCssPixels(workspaceStyle, "--component-stack-video-viewport-inset")
    : 0;
  const availableBlockSize = Math.max(0, appViewportBlockSize - sharedBlockSizeInset);
  const videoMaximumBlockSize = Math.min(
    availableBlockSize,
    Math.max(0, appViewportBlockSize - videoViewportInset),
  );
  const videoMinimumBlockSize = getVideoMinimumBlockSize(
    playerFrame,
    videoPlayer,
    videoMaximumBlockSize,
  );
  const chatMinimumBlockSize = getChatMinimumBlockSize(
    chatArea,
    chatTools,
    messageListShell,
    videoMinimumBlockSize,
  );
  const rowGap = readCssPixels(workspaceStyle, "row-gap");
  const hasMeasuredPanels = Boolean(
    workspaceRect.width > 0
    && availableBlockSize > 0
    && videoMinimumBlockSize > 0
    && chatMinimumBlockSize > 0,
  );
  const combinedPanelHeight = hasMeasuredPanels
    ? videoMinimumBlockSize + chatMinimumBlockSize + rowGap
    : 0;

  return {
    requiresSequentialLayout: hasMeasuredPanels
      && combinedPanelHeight > availableBlockSize,
    combinedPanelHeight,
    availableBlockSize,
    videoMinimumBlockSize,
    chatMinimumBlockSize,
    hasMeasuredPanels,
  };
}
