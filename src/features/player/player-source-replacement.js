import { dom, replaceActiveVideoPlayer } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";
import { showErrorDialog } from "../session/session-dialogs.js";
import { clearPlaybackRecoveryTracking, publishState } from "./player-sync-logic.js";
import { playerRuntimeState } from "./player-runtime-state.js";
import {
  armSlowLoadPrompt,
  clearPlaybackErrorTracking,
  clearSlowLoadPromptTracking,
  getLoadedVideoSourceKey,
} from "./player-media.js";

const SOURCE_REPLACEMENT_GRACE_MS = 3000;

export function createPlayerSourceReplacementController({
  setVideoSource,
  setVideoStatus,
  syncPlayerControls,
} = {}) {
  function syncPlayerControlsNow(...args) {
    syncPlayerControls?.(...args);
  }

  function setPlayerStatus(...args) {
    setVideoStatus?.(...args);
  }

  function createReplacementReadyPromise(replacement) {
    replacement.readyPromise = new Promise((resolve) => {
      replacement.resolveReady = resolve;
    });
  }

  function clearReplacementTimers(replacement) {
    window.clearTimeout(replacement?.acceptanceTimeoutId);
    replacement.acceptanceTimeoutId = null;
  }

  function removeReplacementCandidate(replacement) {
    const candidate = replacement?.candidateVideo;
    if (!candidate) return;
    if (replacement.errorHandler) {
      candidate.removeEventListener("error", replacement.errorHandler);
    }
    candidate.pause();
    candidate.removeAttribute("src");
    candidate.load();
    candidate.remove();
    replacement.candidateVideo = null;
  }

  function cancelPendingSourceReplacement({ result = { cancelled: true }, restoreSuppression = true } = {}) {
    const replacement = playerRuntimeState.pendingSourceReplacement;
    if (!replacement) return null;
    clearReplacementTimers(replacement);
    removeReplacementCandidate(replacement);
    playerRuntimeState.pendingSourceReplacement = null;
    replacement.resolveReady?.(result);
    playerRuntimeState.pendingLoadCompletionAnnouncement = false;
    playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
    playerRuntimeState.pendingVideoActivityAnnouncement = false;
    if (state.player.resumePromptSource === replacement.candidateSourceKey) {
      state.player.resumePromptSource = "";
    }
    if (restoreSuppression && !state.player.remoteStateActive) {
      state.player.suppressVideoEvents = replacement.previousSuppressVideoEvents;
    }
    return replacement;
  }

  function discardPendingSourceReplacement(replacement) {
    if (playerRuntimeState.pendingSourceReplacement !== replacement) return false;
    clearReplacementTimers(replacement);
    removeReplacementCandidate(replacement);
    playerRuntimeState.pendingSourceReplacement = null;
    replacement.resolveReady?.({ failed: true });
    playerRuntimeState.pendingLoadCompletionAnnouncement = false;
    playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
    playerRuntimeState.pendingVideoActivityAnnouncement = false;
    if (state.player.resumePromptSource === replacement.candidateSourceKey) {
      state.player.resumePromptSource = "";
    }
    dom.videoUrlInput.value = replacement.previousSource || "";
    if (!state.player.remoteStateActive) {
      state.player.suppressVideoEvents = replacement.previousSuppressVideoEvents;
      if (state.session.activeRoom && state.session.transport && !state.player.suppressVideoEvents) {
        publishState("sync", {
          time: Number(dom.videoPlayer.currentTime) || 0,
          paused: dom.videoPlayer.paused,
          rate: Number(dom.videoPlayer.playbackRate || 1),
          suppressActivityMessage: true,
        });
      }
    }
    clearSlowLoadPromptTracking();
    syncPlayerControlsNow(true);
    logEvent("error", "La nueva URL falló antes de aceptarse; se conserva el video anterior.");
    showErrorDialog("No se pudo cargar el video nuevo. El video anterior sigue disponible.");
    return true;
  }

  function replayReadyVideoEvents(video) {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.dispatchEvent(new Event("loadedmetadata"));
    }
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      video.dispatchEvent(new Event("loadeddata"));
    }
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      video.dispatchEvent(new Event("canplay"));
    }
  }

  function promotePendingSourceReplacement(replacement) {
    if (playerRuntimeState.pendingSourceReplacement !== replacement) return false;
    const candidate = replacement.candidateVideo;
    const activeVideo = dom.videoPlayer;
    const parent = activeVideo.parentNode;
    if (!candidate || !parent || candidate.error) {
      return discardPendingSourceReplacement(replacement);
    }

    clearReplacementTimers(replacement);
    if (replacement.errorHandler) {
      candidate.removeEventListener("error", replacement.errorHandler);
    }
    candidate.volume = activeVideo.volume;
    candidate.muted = activeVideo.muted;
    candidate.playbackRate = activeVideo.playbackRate;
    candidate.loop = activeVideo.loop;
    candidate.controls = activeVideo.controls;
    candidate.autoplay = activeVideo.autoplay;
    candidate.playsInline = activeVideo.playsInline;
    candidate.style.cssText = replacement.activeStyle;
    candidate.removeAttribute("aria-hidden");
    candidate.removeAttribute("data-player-candidate");
    if (replacement.activeTabIndex == null) {
      candidate.removeAttribute("tabindex");
    } else {
      candidate.setAttribute("tabindex", replacement.activeTabIndex);
    }

    if (candidate.parentNode !== parent) {
      parent.insertBefore(candidate, activeVideo.nextSibling);
    }
    parent.replaceChild(candidate, activeVideo);
    candidate.id = activeVideo.id;
    replaceActiveVideoPlayer(candidate);

    activeVideo.pause();
    activeVideo.removeAttribute("src");
    activeVideo.load();
    activeVideo.remove();

    playerRuntimeState.pendingSourceReplacement = null;
    playerRuntimeState.isDurationShowingRemaining = false;
    state.player.hasPlayableVideo = candidate.readyState >= HTMLMediaElement.HAVE_METADATA;
    state.player.videoFingerprint = "";
    state.player.videoFingerprintSource = "";
    state.player.resumePromptSource = replacement.resumePromptSource;
    state.player.lastKnownTime = Number(candidate.currentTime) || 0;
    clearPlaybackErrorTracking();
    clearSlowLoadPromptTracking();
    clearPlaybackRecoveryTracking();
    setPlayerStatus("loading", "Cargando video");
    dom.videoUrlInput.value = replacement.source;
    syncPlayerControlsNow(true);
    armSlowLoadPrompt(replacement.source);
    replacement.resolveReady?.({ accepted: true });
    replayReadyVideoEvents(candidate);
    if (!state.player.remoteStateActive) {
      state.player.suppressVideoEvents = replacement.previousSuppressVideoEvents;
      if (state.session.activeRoom && state.session.transport && !state.player.suppressVideoEvents) {
        publishState("sync", {
          time: Number(candidate.currentTime) || 0,
          paused: candidate.paused,
          rate: Number(candidate.playbackRate || 1),
          suppressActivityMessage: true,
        });
      }
    }
    logEvent("video", "El video nuevo se aceptó tras 3 segundos sin errores.");
    return true;
  }

  function stageSourceReplacement(source, sourceKey, pending) {
    const activeVideo = dom.videoPlayer;
    const parent = activeVideo.parentNode;
    const candidate = activeVideo.cloneNode(false);
    candidate.id = `${activeVideo.id}Candidate`;
    candidate.removeAttribute("src");
    candidate.preload = "auto";
    candidate.autoplay = false;
    candidate.controls = false;
    candidate.muted = true;
    candidate.tabIndex = -1;
    candidate.setAttribute("aria-hidden", "true");
    candidate.dataset.playerCandidate = "true";
    candidate.style.cssText = `${activeVideo.style.cssText};position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;`;

    const replacement = {
      ...(pending || {}),
      source,
      previousSource: pending?.previousSource || activeVideo.getAttribute("src") || activeVideo.currentSrc || "",
      candidateSourceKey: sourceKey,
      candidateVideo: candidate,
      activeStyle: activeVideo.style.cssText,
      activeTabIndex: activeVideo.getAttribute("tabindex"),
      previousSuppressVideoEvents: pending?.previousSuppressVideoEvents ?? state.player.suppressVideoEvents,
      resumePromptSource: sourceKey,
      acceptanceTimeoutId: null,
      errorHandler: null,
    };
    createReplacementReadyPromise(replacement);
    replacement.cancel = () => cancelPendingSourceReplacement({
      result: { cancelled: true },
      restoreSuppression: true,
    });
    replacement.errorHandler = () => discardPendingSourceReplacement(replacement);
    candidate.addEventListener("error", replacement.errorHandler, { once: true });
    parent.insertBefore(candidate, activeVideo.nextSibling);
    playerRuntimeState.pendingSourceReplacement = replacement;
    state.player.suppressVideoEvents = true;
    candidate.src = source;
    replacement.acceptanceTimeoutId = window.setTimeout(() => {
      if (candidate.error) {
        discardPendingSourceReplacement(replacement);
        return;
      }
      promotePendingSourceReplacement(replacement);
    }, SOURCE_REPLACEMENT_GRACE_MS);
    return replacement;
  }

  function restorePreviousVideoSource(failedSourceKey) {
    const replacement = playerRuntimeState.pendingSourceReplacement;
    if (!replacement || replacement.candidateSourceKey !== failedSourceKey) return false;

    window.clearTimeout(replacement.acceptanceTimeoutId);
    playerRuntimeState.pendingSourceReplacement = null;
    const video = dom.videoPlayer;
    state.player.suppressVideoEvents = true;

    const restorePlaybackPosition = () => {
      video.playbackRate = replacement.rate;
      try {
        video.currentTime = replacement.time;
      } catch {
        // Algunos streams en vivo no permiten buscar a un tiempo guardado.
      }
      state.player.lastKnownTime = replacement.time;
    };

    video.addEventListener("loadedmetadata", restorePlaybackPosition, { once: true });
    video.addEventListener("loadeddata", () => {
      restorePlaybackPosition();
      if (replacement.paused) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
      syncPlayerControlsNow(true);
    }, { once: true });

    setVideoSource?.(replacement.source, false, { skipRollbackBackup: true });
    logEvent("video", "Restaurando la fuente y la posición anteriores.");

    window.setTimeout(() => {
      if (!state.player.remoteStateActive) {
        state.player.suppressVideoEvents = false;
      }
      if (
        state.session.activeRoom
        && state.session.transport
        && getLoadedVideoSourceKey() === replacement.sourceKey
      ) {
        publishState("video-restore", {
          time: replacement.time,
          paused: replacement.paused,
          rate: replacement.rate,
          suppressActivityMessage: true,
        });
      }
    }, 700);

    return true;
  }

  function waitForVideoMetadata() {
    const pendingReplacement = playerRuntimeState.pendingSourceReplacement;
    if (pendingReplacement?.candidateVideo) {
      return pendingReplacement.readyPromise.then((result) => {
        if (result?.failed || result?.cancelled) return { failed: true };
        return waitForActiveVideoMetadata();
      });
    }
    return waitForActiveVideoMetadata();
  }

  function waitForActiveVideoMetadata() {
    const video = dom.videoPlayer;
    if (video.error || video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      return Promise.resolve({ failed: Boolean(video.error) });
    }
    return new Promise((resolve) => {
      const done = () => {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("error", done);
        resolve({ failed: Boolean(video.error) });
      };
      video.addEventListener("loadedmetadata", done, { once: true });
      video.addEventListener("error", done, { once: true });
    });
  }

  return {
    cancelPendingSourceReplacement,
    stageSourceReplacement,
    restorePreviousVideoSource,
    waitForVideoMetadata,
  };
}
