import { dom } from "../../../core/dom.js";

export const MINI_PLAYER_DEBUG_TAG = "[MINI_PLAYER_TRACE]";

function finiteOrNull(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function getMiniPlayerVideoSnapshot() {
  const video = dom.videoPlayer;
  const mediaError = video?.error;

  return {
    miniPlayerActive: Boolean(video?.closest(".mini-player-surface")),
    video: video ? {
      paused: video.paused,
      ended: video.ended,
      seeking: video.seeking,
      currentTime: finiteOrNull(video.currentTime),
      duration: finiteOrNull(video.duration),
      readyState: video.readyState,
      networkState: video.networkState,
      playbackRate: video.playbackRate,
      muted: video.muted,
      volume: finiteOrNull(video.volume),
      hasSource: Boolean(video.currentSrc || video.getAttribute("src")),
      error: mediaError ? {
        code: mediaError.code,
        message: mediaError.message || "",
      } : null,
    } : null,
  };
}

export function traceMiniPlayer(eventName, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    ...getMiniPlayerVideoSnapshot(),
    ...details,
  };
  console.info(`${MINI_PLAYER_DEBUG_TAG} ${eventName} ${JSON.stringify(payload)}`);
}
