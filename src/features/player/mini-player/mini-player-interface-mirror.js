import { dom } from "../../../core/dom.js";
import { wireTouchHover } from "../../../core/touch-interactions.js";
import {
  getMirrorChatDraft,
  normalizeMiniSystemGroupState,
  restoreMirrorChatDraft,
  syncMiniChatAutoExpand,
  syncMirroredChatMessages,
  toggleMiniChatOverlay,
  wireMiniMessageReplies,
  wireMirrorChatScrollbar,
} from "./mini-player-chat-mirror.js";
import { wireMiniPlayerMirrorInteractions } from "./mini-player-interface-mirror-interactions.js";
import {
  copyControlState,
  copyDynamicButtonPresentation,
  copyPlayerTimeLabels,
  copySeekProgressPresentation,
  copyVolumeProgressPresentation,
  isRangeBeingDragged,
  markProxyControls,
  syncMirrorComposerState,
} from "./mini-player-interface-mirror-sync.js";

export function createInteractiveMirror(source, targetDocument) {
  const keepIds = targetDocument !== source.ownerDocument;
  const element = targetDocument.importNode(source, true);
  let isSyncing = false;
  let initialMiniSystemStateNormalized = false;
  let removeTouchVolumeHovers = [];

  const observer = new MutationObserver((records) => {
    if (source === dom.playerChat) {
      if (records.some((record) => record.target.closest?.('.chat-message-list.chat-message-list--overlay'))) {
        syncMirroredChatMessages(source, element);
      } else if (records.some((record) => record.target.closest?.('.message-form.message-form--overlay'))) {
        syncMirrorComposerState(source, element);
      }
      return;
    }
    if (source === dom.playerBottomActions || source === dom.playerCenterActions) {
      syncState();
      return;
    }
    sync();
  });

  function sync() {
    if (isSyncing || isRangeBeingDragged(element)) return;
    isSyncing = true;
    const draft = getMirrorChatDraft(source, element);
    element.className = source.className;
    element.innerHTML = source.innerHTML;
    element.hidden = source.hidden;
    if (source.hasAttribute("aria-hidden")) {
      element.setAttribute("aria-hidden", source.getAttribute("aria-hidden"));
    } else {
      element.removeAttribute("aria-hidden");
    }
    if (source === dom.playerChat && !initialMiniSystemStateNormalized) {
      normalizeMiniSystemGroupState(element);
      initialMiniSystemStateNormalized = true;
    }
    markProxyControls(element, keepIds);
    copyControlState(source, element);
    copyVolumeProgressPresentation(source, element);
    if (source === dom.playerBottomActions || source === dom.playerCenterActions) {
      copyDynamicButtonPresentation(source, element);
    }
    removeTouchVolumeHovers.forEach((removeTouchHover) => removeTouchHover());
    removeTouchVolumeHovers = source === dom.playerBottomActions
      ? Array.from(element.querySelectorAll(".player-volume-group"), (volumeGroup) => (
        wireTouchHover(volumeGroup, { activeClass: "volume-hovered" })
      ))
      : [];
    if (source === dom.playerActions) {
      const surface = element.closest(".mini-player-surface");
      if (surface) {
        toggleMiniChatOverlay(surface, surface.classList.contains('u-chat-inside-open'));
      }
    }
    restoreMirrorChatDraft(source, element, draft);
    wireMirrorChatScrollbar(element);
    if (source === dom.playerChat) {
      const sourceMessages = source.querySelector('.chat-message-list.chat-message-list--overlay');
      const mirrorMessages = element.querySelector('.chat-message-list.chat-message-list--overlay');
      if (sourceMessages && mirrorMessages) wireMiniMessageReplies(sourceMessages, mirrorMessages, element);
      syncMiniChatAutoExpand(element.closest(".mini-player-surface"));
    }
    isSyncing = false;
  }

  function syncState() {
    copyControlState(source, element);
    copyPlayerTimeLabels(source, element);
    copySeekProgressPresentation(source, element);
    copyVolumeProgressPresentation(source, element);
    if (source === dom.playerBottomActions || source === dom.playerCenterActions) {
      copyDynamicButtonPresentation(source, element);
    }
  }

  const removeInteractions = wireMiniPlayerMirrorInteractions({
    source,
    element,
    sync,
    syncState,
  });
  observer.observe(source, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  sync();

  return {
    element,
    source,
    sync,
    syncState,
    restore() {
      observer.disconnect();
      removeTouchVolumeHovers.forEach((removeTouchHover) => removeTouchHover());
      removeInteractions();
      element.remove();
    },
  };
}
