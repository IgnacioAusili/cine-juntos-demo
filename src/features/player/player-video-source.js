import { dom } from "../../core/dom.js";
import { state, getDisplayName, logEvent } from "../../core/state.js";
import { sendVideoEventMessage, scrollToVideoPosition } from "../chat/index.js";
import { showLoadReplaceDialog } from "../session/session-ui.js";
import { showErrorDialog } from "../session/session-dialogs.js";
import { clearPlaybackRecoveryTracking, publishState } from "./player-sync-logic.js";
import { playerRuntimeState } from "./player-runtime-state.js";
import { configurePlayerMediaSourcePort, SKIP_LOAD_REPLACE_DIALOG_KEY, getLoadedVideoSourceKey, getVideoSourceKey, updateLoadButtonState, clearSlowLoadPromptTracking, clearPlaybackErrorTracking, armSlowLoadPrompt, hasLoadedMediaSource, isVideoLoadCoolingDown, shouldConfirmLoadReplacement } from "./player-media.js";
import { getVideoUrlValidationMessage } from "./video-url-validation.js";
import { createPlayerSourceReplacementController } from "./player-source-replacement.js";

const VIDEO_LOAD_COOLDOWN_MS = 3000;
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

const sourceReplacement = createPlayerSourceReplacementController({
  setVideoSource: (...args) => setVideoSource(...args),
  setVideoStatus: (...args) => setVideoStatus(...args),
  syncPlayerControls: (...args) => syncControls(...args),
});

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
  const validationMessage = source ? getVideoUrlValidationMessage(source) : "";
  if (validationMessage) {
    showErrorDialog(validationMessage);
    return;
  }

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
    sourceReplacement.cancelPendingSourceReplacement({ result: { cancelled: true } });
    pendingReplacement = null;
  } else if (pendingReplacement?.candidateVideo) {
    if (currentSourceKey === nextSourceKey) {
      sourceReplacement.cancelPendingSourceReplacement({ result: { cancelled: true } });
      dom.videoUrlInput.value = source;
      return;
    }
    pendingReplacement = sourceReplacement.cancelPendingSourceReplacement({
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
    const replacement = sourceReplacement.stageSourceReplacement(source, nextSourceKey, pendingReplacement);
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
  return sourceReplacement.restorePreviousVideoSource(failedSourceKey);
}

export function waitForVideoMetadata() {
  return sourceReplacement.waitForVideoMetadata();
}

export function clearVideoSource(shouldAnnounce = false) {
  sourceReplacement.cancelPendingSourceReplacement({ result: { cancelled: true } });
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

configurePlayerMediaSourcePort({
  setVideoSource,
  setVideoStatus,
  syncPlayerControls: syncControls,
  restorePreviousVideoSource,
});
