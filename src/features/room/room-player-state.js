import { state } from "../../core/state.js";
import { playerRuntimeState } from "../player/player-runtime-state.js";

export function resetRoomPlayerState() {
  const pendingSourceReplacement = playerRuntimeState.pendingSourceReplacement;
  if (pendingSourceReplacement?.cancel) {
    pendingSourceReplacement.cancel();
  } else {
    window.clearTimeout(pendingSourceReplacement?.acceptanceTimeoutId);
    const candidate = pendingSourceReplacement?.candidateVideo;
    if (candidate) {
      candidate.removeEventListener("error", pendingSourceReplacement.errorHandler);
      candidate.pause();
      candidate.removeAttribute("src");
      candidate.load();
      candidate.remove();
    }
    pendingSourceReplacement?.resolveReady?.({ cancelled: true });
    playerRuntimeState.pendingSourceReplacement = null;
  }
  state.player.lastRemoteState = null;
  state.player.lastStateSentAt = 0;
  state.player.lastActionAt = 0;
  state.player.lastActionAuthor = "";
  state.player.lastPlaybackIssueAt = 0;
  state.player.lastPlaybackIssueReason = "";
  state.player.lastPlaybackIssueAnnouncementAt = 0;
  state.player.lastPlaybackIssueAnnouncementKey = "";
  state.player.remotePlaybackIssueCooldownUntil = 0;
  if (state.player.playbackRecoveryTimeoutId) {
    window.clearTimeout(state.player.playbackRecoveryTimeoutId);
  }
  if (state.player.playbackErrorTimeoutId) {
    window.clearTimeout(state.player.playbackErrorTimeoutId);
  }
  state.player.playbackRecoveryPending = false;
  state.player.playbackRecoveryAttempting = false;
  state.player.playbackRecoveryTimeoutId = null;
  state.player.playbackErrorTimeoutId = null;
  state.player.playbackErrorSnapshot = null;
  state.player.remoteStateActive = false;
  state.player.suppressVideoEvents = false;
}
