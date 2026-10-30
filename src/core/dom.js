export const dom = {
  lobbyScreen: document.querySelector("#lobbyScreen"),
  sessionView: document.querySelector("#sessionView"),
  lobbyStatus: document.querySelector("#lobbyStatus"),
  connectionStatus: document.querySelector("#connectionStatus"),
  roomBadge: document.querySelector("#roomBadge"),
  hostBadge: document.querySelector("#hostBadge"),
  roomInput: document.querySelector("#roomInput"),
  lobbyNameInput: document.querySelector("#lobbyNameInput"),
  createRoomButton: document.querySelector("#createRoomButton"),
  joinRoomButton: document.querySelector("#joinRoomButton"),
  copyInviteButton: document.querySelector("#copyInviteButton"),
  backToLobbyButton: document.querySelector("#backToLobbyButton"),
  aboutButton: document.querySelector("#aboutButton"),
  videoUrlInput: document.querySelector("#videoUrlInput"),
  loadVideoButton: document.querySelector("#loadVideoButton"),
  sessionToolbar: document.querySelector(".session-toolbar"),
  workspace: document.querySelector('.o-workspace'),
  videoArea: document.querySelector('.o-video-area'),
  chatArea: document.querySelector(".chat-area"),
  playerFrame: document.querySelector("#playerFrame"),
  playerActions: document.querySelector('.player-frame__actions'),
  playerCenterActions: document.querySelector('.player-frame__center-actions'),
  playerBottomActions: document.querySelector('.player-frame__bottom-actions'),
  videoPlayer: document.querySelector("#videoPlayer"),
  playerLoadingOverlay: document.querySelector("#playerLoadingOverlay"),
  playbackGestureIndicator: document.querySelector("#playbackGestureIndicator"),
  emptyPlayer: document.querySelector("#emptyPlayer"),
  playerChatToggleButton: document.querySelector("#playerChatToggleButton"),
  playerBackButton: document.querySelector("#playerBackButton"),
  playerPlayButton: document.querySelector("#playerPlayButton"),
  playerForwardButton: document.querySelector("#playerForwardButton"),
  playerSeekInput: document.querySelector("#playerSeekInput"),
  playerCurrentTime: document.querySelector("#playerCurrentTime"),
  playerDuration: document.querySelector("#playerDuration"),
  playerMuteButton: document.querySelector("#playerMuteButton"),
  playerVolumeGroup: document.querySelector("#playerVolumeGroup"),
  playerVolumeInput: document.querySelector("#playerVolumeInput"),
  playerRateSelect: document.querySelector("#playerRateSelect"),
  playerMiniPlayerButton: document.querySelector("#playerMiniPlayerButton"),
  pageFullscreenButton: document.querySelector("#pageFullscreenButton"),
  closeInsideChatButton: document.querySelector("#closeInsideChatButton"),
  syncStatus: document.querySelector("#syncStatus"),
  videoStatusText: document.querySelector("#videoStatusText"),
  videoStatusIcon: document.querySelector("#videoStatusIcon"),
  playerChat: document.querySelector("#playerChat"),
  insideChatAutoExpandSwitch: document.querySelector("#insideChatAutoExpandSwitch"),
  chatStyleToggle: document.querySelector("#chatStyleToggle"),
  nameInput: document.querySelector("#nameInput"),
  dockChatButton: document.querySelector("#dockChatButton"),
  externalChatAutoExpandSwitch: document.querySelector("#externalChatAutoExpandSwitch"),
  collapseChatButton: document.querySelector("#collapseChatButton"),
  expandChatButton: document.querySelector("#expandChatButton"),
  presencePill: document.querySelector("#presencePill"),
  participantCount: document.querySelector("#participantCount"),
  overlayPresencePill: document.querySelector("#overlayPresencePill"),
  overlayParticipantCount: document.querySelector("#overlayParticipantCount"),
  chatNameField: document.querySelector("#chatNameField"),
  nameDisplay: document.querySelector("#nameDisplay"),
  messages: document.querySelector("#messages"),
  overlayMessages: document.querySelector("#overlayMessages"),
  messageForm: document.querySelector("#messageForm"),
  messageInput: document.querySelector("#messageInput"),
  mainMessageSend: document.querySelector("#mainMessageSend"),
  overlayMessageForm: document.querySelector("#overlayMessageForm"),
  overlayMessageInput: document.querySelector("#overlayMessageInput"),
  overlayMessageSend: document.querySelector("#overlayMessageSend"),
  replyPreview: document.querySelector("#replyPreview"),
  overlayReplyPreview: document.querySelector("#overlayReplyPreview"),
  messageMenu: document.querySelector("#messageMenu"),
  messageEmojiButton: document.querySelector("#messageEmojiButton"),
  overlayEmojiButton: document.querySelector("#overlayEmojiButton"),
  editNameButton: document.querySelector("#editNameButton"),
  confirmNameButton: document.querySelector("#confirmNameButton"),
  chatNameEditor: document.querySelector(".chat-name-editor"),
  emojiPopover: document.querySelector("#emojiPopover"),
  insideChatUnread: document.querySelector("#insideChatUnread"),
  tooltipLayer: document.querySelector("#tooltipLayer"),
  mobileDebugButton: document.querySelector("#mobileDebugButton"),
  mobileDebugDialog: document.querySelector("#mobileDebugDialog"),
  mobileDebugLog: document.querySelector("#mobileDebugLog"),
  mobileDebugFilter: document.querySelector("#mobileDebugFilter"),
  mobileDebugCopyButton: document.querySelector("#mobileDebugCopyButton"),
  mobileDebugClearButton: document.querySelector("#mobileDebugClearButton"),
  mobileDebugCloseButton: document.querySelector("#mobileDebugCloseButton"),
  imagePreview: document.querySelector("#imagePreview"),
  overlayImagePreview: document.querySelector("#overlayImagePreview"),
  mainScrollBottomBtn: document.querySelector("#mainScrollBottomBtn"),
  overlayScrollBottomBtn: document.querySelector("#overlayScrollBottomBtn"),
  mainScrollBadge: document.querySelector("#mainScrollBadge"),
  overlayScrollBadge: document.querySelector("#overlayScrollBadge"),
  mainCharCounter: document.querySelector("#mainCharCounter"),
  overlayCharCounter: document.querySelector("#overlayCharCounter"),
  errorDialog: document.querySelector("#errorDialog"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  closeDialogActionButton: document.querySelector("#closeDialogActionButton"),
  aboutDialog: document.querySelector("#aboutDialog"),
  closeAboutDialogButton: document.querySelector("#closeAboutDialogButton"),
  slowLoadDialog: document.querySelector("#slowLoadDialog"),
  slowLoadDialogMessage: document.querySelector("#slowLoadDialogMessage"),
  confirmSlowLoadDialogButton: document.querySelector("#confirmSlowLoadDialogButton"),
  cancelSlowLoadDialogButton: document.querySelector("#cancelSlowLoadDialogButton"),
  closeSlowLoadDialogButton: document.querySelector("#closeSlowLoadDialogButton"),
  resumeVideoPopup: document.querySelector("#resumeVideoPopup"),
  resumeVideoPopupMessage: document.querySelector("#resumeVideoPopupMessage"),
  confirmResumeVideoDialogButton: document.querySelector("#confirmResumeVideoDialogButton"),
  cancelResumeVideoDialogButton: document.querySelector("#cancelResumeVideoDialogButton"),
  closeResumeVideoDialogButton: document.querySelector("#closeResumeVideoDialogButton"),
  confirmLoadDialog: document.querySelector("#confirmLoadDialog"),
  closeConfirmLoadDialogButton: document.querySelector("#closeConfirmLoadDialogButton"),
  confirmLoadDialogTitle: document.querySelector("#confirmLoadDialogTitle"),
  confirmLoadDialogMessage: document.querySelector("#confirmLoadDialogMessage"),
  confirmLoadDialogButton: document.querySelector("#confirmLoadDialogButton"),
  cancelLoadDialogButton: document.querySelector("#cancelLoadDialogButton"),
  skipLoadConfirmCheckbox: document.querySelector("#skipLoadConfirmCheckbox"),
  videoDownloadDialog: document.querySelector("#videoDownloadDialog"),
  confirmVideoDownloadButton: document.querySelector("#confirmVideoDownloadButton"),
  cancelVideoDownloadButton: document.querySelector("#cancelVideoDownloadButton"),
  closeVideoDownloadDialogButton: document.querySelector("#closeVideoDownloadDialogButton"),
};

const playerVideoListenerRecords = [];
const instrumentedPlayerVideos = new WeakMap();

function getPlayerVideoListenerCapture(options) {
  return typeof options === "boolean" ? options : Boolean(options?.capture);
}

function removePlayerVideoListenerRecord(record) {
  if (!record.active) return;
  record.active = false;
  for (const [video, wrapper] of record.wrappers) {
    const methods = instrumentedPlayerVideos.get(video);
    methods?.remove(record.type, wrapper, record.capture);
  }
  record.wrappers.clear();
}

function addPlayerVideoListenerToTarget(record, video) {
  if (!record.active || record.wrappers.has(video) || record.options?.signal?.aborted) return;
  const methods = instrumentedPlayerVideos.get(video);
  if (!methods) return;
  const wrapper = function playerVideoListenerWrapper(event) {
    if (!record.active) return;
    if (record.once) removePlayerVideoListenerRecord(record);
    if (typeof record.listener === "function") {
      return record.listener.call(this, event);
    }
    return record.listener.handleEvent?.call(record.listener, event);
  };
  record.wrappers.set(video, wrapper);
  methods.add(record.type, wrapper, record.options);
}

function instrumentPlayerVideo(video) {
  if (!video || instrumentedPlayerVideos.has(video)) return;
  const add = (type, listener, options) => EventTarget.prototype.addEventListener.call(video, type, listener, options);
  const remove = (type, listener, options) => EventTarget.prototype.removeEventListener.call(video, type, listener, options);
  instrumentedPlayerVideos.set(video, { add, remove });

  video.addEventListener = (type, listener, options) => {
    if (!listener) return instrumentedPlayerVideos.get(dom.videoPlayer)?.add(type, listener, options);
    const capture = getPlayerVideoListenerCapture(options);
    const existing = playerVideoListenerRecords.find((record) => (
      record.active
      && record.type === type
      && record.listener === listener
      && record.capture === capture
    ));
    if (existing) return;

    const record = {
      type,
      listener,
      options,
      capture,
      once: typeof options === "object" && Boolean(options?.once),
      active: true,
      wrappers: new Map(),
    };
    playerVideoListenerRecords.push(record);
    addPlayerVideoListenerToTarget(record, dom.videoPlayer);
  };

  video.removeEventListener = (type, listener, options) => {
    const capture = getPlayerVideoListenerCapture(options);
    const matches = playerVideoListenerRecords.filter((record) => (
      record.active
      && record.type === type
      && record.listener === listener
      && record.capture === capture
    ));
    if (matches.length) {
      matches.forEach(removePlayerVideoListenerRecord);
      return;
    }
    const target = dom.videoPlayer;
    const methods = instrumentedPlayerVideos.get(target);
    methods?.remove(type, listener, options);
  };
}

export function replaceActiveVideoPlayer(video) {
  if (!video || video === dom.videoPlayer) return dom.videoPlayer;
  instrumentPlayerVideo(video);
  dom.videoPlayer = video;

  for (const record of playerVideoListenerRecords) {
    if (!record.active) continue;
    if (record.options?.signal?.aborted) {
      removePlayerVideoListenerRecord(record);
      continue;
    }
    for (const [target, wrapper] of record.wrappers) {
      const methods = instrumentedPlayerVideos.get(target);
      methods?.remove(record.type, wrapper, record.capture);
    }
    record.wrappers.clear();
    addPlayerVideoListenerToTarget(record, video);
  }

  return video;
}

instrumentPlayerVideo(dom.videoPlayer);
