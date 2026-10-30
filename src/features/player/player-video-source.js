import { dom, replaceActiveVideoPlayer } from "../../core/dom.js";
import { state, getDisplayName, logEvent } from "../../core/state.js";
import { sendVideoEventMessage, scrollToVideoPosition } from "../chat/index.js";
import { showLoadReplaceDialog } from "../session/session-ui.js";
import { showErrorDialog } from "../session/session-dialogs.js";
import { clearPlaybackRecoveryTracking, publishState } from "./player-sync-logic.js";
import { playerRuntimeState } from "./player-runtime-state.js";
import { configurePlayerMediaSourcePort, SKIP_LOAD_REPLACE_DIALOG_KEY, getLoadedVideoSourceKey, getVideoSourceKey, updateLoadButtonState, clearSlowLoadPromptTracking, clearPlaybackErrorTracking, armSlowLoadPrompt, hasLoadedMediaSource, isVideoLoadCoolingDown, shouldConfirmLoadReplacement } from "./player-media.js";

const VIDEO_LOAD_COOLDOWN_MS = 3000;
const SOURCE_REPLACEMENT_GRACE_MS = 3000;
const VIDEO_STATUS_TOOLTIPS = Object.freeze({
  empty: "Todavía no hay un video cargado en la sala",
  loading: "El video se está cargando. Los controles se habilitarán cuando esté listo",
  loaded: "El video está cargado para todos los usuarios y listo para reproducir",
  playing: "El video se está reproduciendo de forma sincronizada para todos los usuarios",
  error: "No se pudo cargar el video. Revisá el enlace e intentá cargarlo nuevamente",
});

let syncControls = () => {};

export function configurePlayerMedia({ syncPlayerControls } = {}) {
  if (typeof syncPlayerControls === "function") {
    syncControls = syncPlayerControls;
    configurePlayerMediaSourcePort({ setVideoSource, setVideoStatus, syncPlayerControls, restorePreviousVideoSource });
  }
}

function syncPlayerControlsNow(...args) {
  syncControls(...args);
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
  setVideoStatus("loading", "Cargando video");
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

export function loadVideoFromUrl(source, origin) {
  if (!source) {
    setVideoStatus("empty", "Sin contenido");
    playerRuntimeState.pendingLoadCompletionAnnouncement = false;
    playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
    playerRuntimeState.pendingVideoActivityAnnouncement = false;
    state.player.resumePromptSource = "";
    clearSlowLoadPromptTracking();
    logEvent("video", "No se cargo video: falta URL.");
    return;
  }

  // El valor inicial del input puede contener una URL de ejemplo, pero eso no
  // significa que ya haya un video cargado. Para detectar una recarga hay que
  // comparar únicamente contra la fuente real del reproductor.
  const currentSourceKey = getLoadedVideoSourceKey();
  const nextSourceKey = getVideoSourceKey(source);
  const isReload = Boolean(currentSourceKey && currentSourceKey === nextSourceKey);
  setVideoSource(source, true, { isReload });
  logEvent("video", `Video ${isReload ? "recargado" : `${origin} cargado`}: ${source}`);
  if (state.session.activeRoom && state.session.transport) {
    playerRuntimeState.pendingVideoActivityAnnouncement = true;
    publishState("video", { suppressActivityMessage: true });
  }
}

export async function handleManualLoadRequest(sourceOverride = null) {
  if (state.player.remoteStateActive || state.player.suppressVideoEvents) return;

  const source = sourceOverride == null ? dom.videoUrlInput.value.trim() : String(sourceOverride).trim();
  if (!source) {
    // Sin un video cargado no hay nada que reemplazar ni limpiar.
    // Evita mostrar la confirmación y deja el botón sin efecto.
    if (!hasLoadedMediaSource()) return;

    const { confirmed } = await showLoadReplaceDialog(
      "No se encontró ningún enlace para cargar. Si continuás, se quitará el video cargado actualmente para todas las personas de la sala. ¿Estás seguro?",
      { action: "remove" },
    );
    if (!confirmed) return;
    clearVideoSource(true);
    return;
  }

  if (isVideoLoadCoolingDown()) {
    return;
  }

  let shouldCenterVideoAfterLoad = false;
  if (shouldConfirmLoadReplacement()) {
    const { confirmed, skipFutureWarnings } = await showLoadReplaceDialog(
      "Se está reproduciendo un video. ¿Quieres cargar otro ahora?",
    );
    if (!confirmed) return;
    shouldCenterVideoAfterLoad = true;
    if (skipFutureWarnings) {
      localStorage.setItem(SKIP_LOAD_REPLACE_DIALOG_KEY, "1");
    }
  }

  loadVideoFromUrl(source, "manual");
  window.requestAnimationFrame(() => {
    if (shouldCenterVideoAfterLoad) {
      dom.videoArea?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      return;
    }
    scrollToVideoPosition("smooth");
  });
}

export function setVideoSource(source, shouldAnnounce, options = {}) {
  const nextSourceKey = getVideoSourceKey(source);
  const currentSource = dom.videoPlayer.getAttribute("src") || dom.videoPlayer.currentSrc || "";
  const currentSourceKey = getVideoSourceKey(currentSource);
  let pendingReplacement = playerRuntimeState.pendingSourceReplacement;
  if (
    !options.skipRollbackBackup
    && pendingReplacement?.candidateVideo
    && pendingReplacement.candidateSourceKey === nextSourceKey
  ) {
    dom.videoUrlInput.value = source;
    return;
  }

  if (options.skipRollbackBackup && pendingReplacement) {
    cancelPendingSourceReplacement({ result: { cancelled: true } });
    pendingReplacement = null;
  } else if (pendingReplacement?.candidateVideo) {
    if (currentSourceKey === nextSourceKey) {
      cancelPendingSourceReplacement({ result: { cancelled: true } });
      dom.videoUrlInput.value = source;
      return;
    }
    pendingReplacement = cancelPendingSourceReplacement({
      result: { cancelled: true },
      restoreSuppression: false,
    });
  }

  const shouldStageReplacement = Boolean(
    !options.skipRollbackBackup
    && currentSource
    && currentSourceKey !== nextSourceKey
    && state.player.hasPlayableVideo
    && dom.videoPlayer.readyState >= HTMLMediaElement.HAVE_METADATA
    && dom.videoPlayer.parentNode
  );
  const isReload = Boolean(options.isReload);

  if (!shouldStageReplacement) {
    playerRuntimeState.isDurationShowingRemaining = false;
    state.player.hasPlayableVideo = false;
    state.player.videoFingerprint = "";
    state.player.videoFingerprintSource = "";
  }
  playerRuntimeState.pendingVideoActivityAnnouncement = false;
  playerRuntimeState.pendingLoadCompletionAnnouncement = Boolean(
    options.announceLoadCompletion ?? shouldAnnounce,
  );
  playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = options.animateSystemGroups
    ?? shouldAnnounce;
  state.player.lastVideoLoadWasReload = isReload;
  // La sala puede devolver nuestro propio evento de carga. Si sigue siendo
  // el mismo contenido, no hay que borrar el aviso que se está preparando.
  if (!shouldStageReplacement) {
    if (shouldAnnounce) {
      state.player.resumePromptSource = nextSourceKey;
    } else if (state.player.resumePromptSource !== nextSourceKey) {
      state.player.resumePromptSource = "";
    }
  }
  window.clearTimeout(state.player.videoLoadCooldownTimeoutId);
  state.player.videoLoadCooldownUntil = Date.now() + VIDEO_LOAD_COOLDOWN_MS;
  state.player.videoLoadCooldownTimeoutId = window.setTimeout(() => {
    state.player.videoLoadCooldownUntil = 0;
    state.player.videoLoadCooldownTimeoutId = null;
    updateLoadButtonState();
  }, VIDEO_LOAD_COOLDOWN_MS);
  updateLoadButtonState();

  if (shouldStageReplacement) {
    clearSlowLoadPromptTracking();
    clearPlaybackErrorTracking();
    dom.videoUrlInput.value = source;
    const replacement = stageSourceReplacement(source, nextSourceKey, pendingReplacement);
    if (shouldAnnounce) logEvent("video", "Carga de video iniciada en segundo plano.");
    syncPlayerControlsNow(true);
    return replacement;
  }

  clearPlaybackErrorTracking();
  clearSlowLoadPromptTracking();
  clearPlaybackRecoveryTracking();
  const sourceWasUnchanged = dom.videoPlayer.getAttribute("src") === String(source);
  dom.videoPlayer.src = source;
  setVideoStatus("loading", isReload ? "Recargando video" : "Cargando video");
  if (sourceWasUnchanged) dom.videoPlayer.load();
  dom.videoUrlInput.value = source;
  syncPlayerControlsNow(true);
  armSlowLoadPrompt(source);
  if (shouldAnnounce) logEvent("video", "Carga de video iniciada.");
}

export function restorePreviousVideoSource(failedSourceKey) {
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

  setVideoSource(replacement.source, false, { skipRollbackBackup: true });
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

export function clearVideoSource(shouldAnnounce = false) {
  cancelPendingSourceReplacement({ result: { cancelled: true } });
  playerRuntimeState.isDurationShowingRemaining = false;
  playerRuntimeState.pendingLoadCompletionAnnouncement = false;
  playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
  playerRuntimeState.pendingVideoActivityAnnouncement = false;
  state.player.hasPlayableVideo = false;
  state.player.videoFingerprint = "";
  state.player.videoFingerprintSource = "";
  state.player.resumePromptSource = "";
  clearPlaybackErrorTracking();
  clearSlowLoadPromptTracking();
  clearPlaybackRecoveryTracking();
  dom.videoPlayer.pause();
  dom.videoPlayer.removeAttribute("src");
  dom.videoPlayer.load();
  dom.videoUrlInput.value = "";
  setVideoStatus("empty", "Sin contenido");
  syncPlayerControlsNow(true);
  if (shouldAnnounce && state.session.activeRoom && state.session.transport) {
    sendVideoEventMessage("video-removed", {
      from: state.session.clientId,
      name: getDisplayName(),
      time: 0,
    });
    publishState("video", { suppressActivityMessage: true });
  }
}

export function announceVideoLoadCompletion() {
  if (playerRuntimeState.pendingSourceReplacement?.candidateVideo) return;
  if (!playerRuntimeState.pendingLoadCompletionAnnouncement) return;
  // loadedmetadata puede llegar después de que se haya quitado la fuente
  // anterior. En ese caso no corresponde anunciar que el video terminó de
  // cargarse para los demás.
  if (!hasLoadedMediaSource()) {
    playerRuntimeState.pendingLoadCompletionAnnouncement = false;
    playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
    return;
  }
  playerRuntimeState.pendingLoadCompletionAnnouncement = false;
  const animateSystemGroups = playerRuntimeState.pendingLoadCompletionAnimateSystemGroups;
  playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
  if (!state.session.activeRoom || !state.session.transport) return;

  sendVideoEventMessage("video-ready", {
    from: state.session.clientId,
    name: getDisplayName(),
    isReload: Boolean(state.player.lastVideoLoadWasReload),
    time: Number(dom.videoPlayer.currentTime) || 0,
    rate: Number(dom.videoPlayer.playbackRate || 1),
    animateSystemGroups,
  });
}

export function announceVideoActivity() {
  if (playerRuntimeState.pendingSourceReplacement?.candidateVideo) return;
  if (!playerRuntimeState.pendingVideoActivityAnnouncement) return;
  playerRuntimeState.pendingVideoActivityAnnouncement = false;
  if (!state.session.activeRoom || !state.session.transport) return;

  sendVideoEventMessage("video", {
    from: state.session.clientId,
    name: getDisplayName(),
    time: Number(dom.videoPlayer.currentTime) || 0,
    rate: Number(dom.videoPlayer.playbackRate || 1),
  });
}

export function setVideoStatus(videoState, text) {
  dom.syncStatus.className = `sync-status sync-status--video player-status-badge sync-status--${videoState}`;
  dom.emptyPlayer?.classList.toggle('u-hidden', videoState !== "empty");
  dom.syncStatus.classList.toggle(
    'sync-status--live',
    videoState === "loaded" && text === "En vivo",
  );
  dom.playerFrame?.classList.toggle('player-frame--no-content', videoState === "empty");
  if (dom.playerLoadingOverlay) {
    dom.playerLoadingOverlay.hidden = videoState !== "loading";
    dom.playerLoadingOverlay.setAttribute(
      "aria-label",
      videoState === "loading" ? (text || "Cargando video") : "",
    );
  }
  if (videoState === "empty") {
    dom.playerFrame?.classList.remove('player-frame--overlay-suppressed', 'player-frame--cursor-hidden');
    dom.playerFrame?.classList.add('player-frame--overlay-visible');
  }
  const tooltipKey = videoState === "loaded" && text === "En vivo" ? "playing" : videoState;
  const tooltip = VIDEO_STATUS_TOOLTIPS[tooltipKey] || "Estado actual del video en la sala";
  dom.syncStatus.dataset.tooltip = tooltip;
  dom.syncStatus.setAttribute("aria-label", `${text}. ${tooltip}`);
  if (dom.videoStatusText) {
    dom.videoStatusText.textContent = text;
  }
}

export function waitForVideoMetadata() {
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

configurePlayerMediaSourcePort({
  setVideoSource,
  setVideoStatus,
  syncPlayerControls: syncControls,
  restorePreviousVideoSource,
});
