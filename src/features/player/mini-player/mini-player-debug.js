import { dom } from "../../../core/dom.js";
import { isDebugMode } from "../../../core/debug-mode.js";

export const MINI_PLAYER_DEBUG_TAG = "[MINI_PLAYER_TRACE]";

export function describeTraceTarget(target) {
  if (!target) return null;
  return {
    tag: target.tagName?.toLowerCase() || null,
    id: target.id || null,
    className: typeof target.className === "string" ? target.className : null,
    type: target.type || null,
    disabled: typeof target.disabled === "boolean" ? target.disabled : null,
  };
}

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
  if (!isDebugMode()) return;

  const payload = {
    timestamp: new Date().toISOString(),
    ...getMiniPlayerVideoSnapshot(),
    ...details,
  };
  console.info(`${MINI_PLAYER_DEBUG_TAG} ${eventName} ${JSON.stringify(payload)}`);
}
