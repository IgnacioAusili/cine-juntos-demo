import { dom } from "../../../core/dom.js";
import { state } from "../../../core/state.js";
import {
  getMirrorChatDraft,
  handleMiniChatInteraction,
  isOverlayEmojiButton,
  isOverlayMessageInput,
  isOverlayMessageSubmit,
  restoreMirrorChatDraft,
  submitMirrorChat,
  syncMirroredChatMessages,
  setMiniSystemGroupVisibility,
  animateMiniSystemGroupTransition,
  normalizeMiniSystemGroupState,
  syncMiniChatAutoExpand,
  wireMiniMessageReplies,
  toggleMiniEmojiPicker,
  toggleMiniChatOverlay,
  wireMirrorChatScrollbar,
  captureMiniEmojiSelection,
} from "./mini-player-chat-mirror.js";
import { setInsideChatAutoExpandEnabled } from "../../chat/chat-layout.js";
import { wireMiniPlayerShortcuts } from "./mini-player-shortcuts.js";
import { wireTouchHover } from "../../../core/touch-interactions.js";
import { installRichEditor } from "../../chat/composer/chat-rich-editor.js";
import { seekVideoBy, togglePlaybackFromControls } from "../controls/player-control-actions.js";
import { traceMiniPlayer, getMiniPlayerVideoSnapshot } from "./mini-player-debug.js";

const VIDEO_EVENTS = ["play", "pause", "ended", "timeupdate", "seeked", "ratechange", "volumechange"];
const TRACE_VIDEO_EVENTS = ["play", "playing", "pause", "waiting", "stalled", "canplay", "seeking", "seeked", "ended", "error", "timeupdate"];
const TRACE_SURFACE_DOM_EVENTS = ["pointerdown", "pointerup", "pointercancel", "click"];
const PROXY_CONTROL_SELECTOR = "button, input:not([data-player-scroll-indicator]), select, textarea, [contenteditable='true']";

export function movePlayerInterface(surface, options = {}) {
  const {
    includeChat = true,
    includeChatToggle = true,
  } = options;
  const videoAnchor = document.createComment("mini-player-video-origin");
  const gestureAnchor = document.createComment("mini-player-gesture-origin");
  dom.videoPlayer.parentNode?.insertBefore(videoAnchor, dom.videoPlayer);
  dom.playbackGestureIndicator?.parentNode?.insertBefore(
    gestureAnchor,
    dom.playbackGestureIndicator,
  );
  surface.append(dom.videoPlayer);
  if (dom.playbackGestureIndicator) surface.append(dom.playbackGestureIndicator);

  const mirrors = [
    includeChatToggle ? dom.playerActions : null,
    dom.playerBottomActions,
    dom.playerCenterActions,
    dom.resumeVideoPopup,
    includeChat ? dom.playerChat : null,
  ].filter(Boolean).map((source) => createInteractiveMirror(source, surface.ownerDocument));
  mirrors.forEach(({ element }) => surface.append(element));
  traceMiniPlayer("surface-open", {
    includeChat,
    includeChatToggle,
    pictureInPictureDocument: surface.ownerDocument !== document,
    mirrorSources: mirrors.map(({ source }) => source.id || source.className),
  });
  const traceSurfaceDomEvent = (event) => {
    if (!surface.contains(event.target)) return;
    const interactiveTarget = event.target.closest?.("button, input, select, textarea, [contenteditable='true']");
    traceMiniPlayer("surface-event-capture", {
      event: event.type,
      isTrusted: event.isTrusted,
      target: describeTraceTarget(event.target),
      interactiveTarget: describeTraceTarget(interactiveTarget),
      defaultPrevented: event.defaultPrevented,
      eventPhase: event.eventPhase,
      button: event.button ?? null,
      buttons: event.buttons ?? null,
      pointerId: event.pointerId ?? null,
      pointerType: event.pointerType ?? null,
    });
  };
  TRACE_SURFACE_DOM_EVENTS.forEach((eventName) => (
    surface.ownerDocument.addEventListener(eventName, traceSurfaceDomEvent, true)
  ));
  // Los espejos se sincronizan una primera vez antes de insertarse. Repetir
  // el de acciones después de anexarlo permite aplicar el estado propio del
  // mini reproductor al botón de chat (sin copiar el estado del principal).
  mirrors
    .filter(({ source }) => source === dom.playerActions)
    .forEach(({ sync }) => sync());
  const playerChatMirror = mirrors.find(({ source }) => source === dom.playerChat)?.element;
  const handleMiniAutoExpandClick = (event) => {
    const target = event.target.closest?.(
      "#insideChatAutoExpandSwitch, [data-proxy-for=\"insideChatAutoExpandSwitch\"]",
    );
    if (!target || !playerChatMirror?.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const enabled = target.getAttribute("aria-checked") !== "true";
    syncMiniChatAutoExpand(surface, enabled);
    setInsideChatAutoExpandEnabled(enabled);
  };
  playerChatMirror?.addEventListener("click", handleMiniAutoExpandClick);
  const removeShortcuts = wireMiniPlayerShortcuts(surface.ownerDocument, surface);

  const syncMirrors = () => mirrors
    .filter(({ source }) => source !== dom.playerChat)
    .forEach(({ syncState }) => syncState());
  VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.addEventListener(eventName, syncMirrors));
  let lastTimeUpdateTraceAt = 0;
  const traceVideoEvent = (event) => {
    if (event.type === "timeupdate") {
      const now = Date.now();
      if (now - lastTimeUpdateTraceAt < 1000) return;
      lastTimeUpdateTraceAt = now;
    }
    traceMiniPlayer("video-event", {
      event: event.type,
      mediaErrorCode: dom.videoPlayer.error?.code ?? null,
      ...getMiniPlayerVideoSnapshot(),
    });
  };
  TRACE_VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.addEventListener(eventName, traceVideoEvent));

  return {
    restore() {
      traceMiniPlayer("surface-close");
      TRACE_SURFACE_DOM_EVENTS.forEach((eventName) => (
        surface.ownerDocument.removeEventListener(eventName, traceSurfaceDomEvent, true)
      ));
      VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.removeEventListener(eventName, syncMirrors));
      TRACE_VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.removeEventListener(eventName, traceVideoEvent));
      mirrors.forEach(({ restore }) => restore());
      playerChatMirror?.removeEventListener("click", handleMiniAutoExpandClick);
      removeShortcuts();
      gestureAnchor.parentNode?.insertBefore(dom.playbackGestureIndicator, gestureAnchor);
      videoAnchor.parentNode?.insertBefore(dom.videoPlayer, videoAnchor);
      gestureAnchor.remove();
      videoAnchor.remove();
    },
  };
}

function createInteractiveMirror(source, targetDocument) {
  const keepIds = targetDocument !== source.ownerDocument;
  const element = targetDocument.importNode(source, true);
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
  let isSyncing = false;
  let initialMiniSystemStateNormalized = false;
  let seekDragPointerId = null;
  const pendingControlPointers = new Map();
  let lastHandledPointerAction = null;
  const ownerWindow = element.ownerDocument.defaultView;

  // En la ventana PiP observada llegan pointerdown/up de los botones, pero no
  // se genera click; activar en pointerup y deduplicar click cuando sí aparezca.
  const handleMiniControlPointerDown = (event) => {
    if (!event.isTrusted || event.button !== 0 || event.isPrimary === false) return;
    if (!element.contains(event.target)) return;
    const target = getSourceControl(source, event.target);
    const action = getMiniPlayerControlAction(target);
    if (!action || target.disabled) return;
    pendingControlPointers.set(event.pointerId, { target, action });
    traceMiniPlayer("mini-control-pointerdown", {
      action,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      controlId: target.id,
      target: describeTraceTarget(event.target),
    });
  };

  const handleMiniControlPointerUp = (event) => {
    const pending = pendingControlPointers.get(event.pointerId);
    if (!pending) return;
    pendingControlPointers.delete(event.pointerId);
    const releasedTarget = getSourceControl(source, event.target);
    if (!event.isTrusted || releasedTarget !== pending.target || pending.target.disabled) {
      traceMiniPlayer("mini-control-pointerup-cancelled", {
        action: pending.action,
        pointerId: event.pointerId,
        isTrusted: event.isTrusted,
        releasedControlId: releasedTarget?.id || null,
        expectedControlId: pending.target.id,
      });
      return;
    }

    lastHandledPointerAction = {
      target: pending.target,
      timestamp: Date.now(),
      pointerId: event.pointerId,
    };
    traceMiniPlayer("mini-control-pointerup-action", {
      action: pending.action,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      controlId: pending.target.id,
      defaultPrevented: event.defaultPrevented,
    });
    runMiniPlayerControlAction(pending.target, "pointerup");
    requestAnimationFrame(() => {
      syncState();
      traceMiniPlayer("control-sync-after-pointerup", {
        controlId: pending.target.id,
        mirrorSeekValue: element.querySelector('[data-proxy-for="playerSeekInput"], #playerSeekInput')?.value ?? null,
        mirrorTimeLabel: element.querySelector('[data-proxy-for="playerCurrentTime"], #playerCurrentTime')?.textContent ?? null,
      });
    });
  };

  const handleMiniControlPointerCancel = (event) => {
    const pending = pendingControlPointers.get(event.pointerId);
    if (!pending) return;
    pendingControlPointers.delete(event.pointerId);
    traceMiniPlayer("mini-control-pointer-cancel", {
      action: pending.action,
      pointerId: event.pointerId,
      controlId: pending.target.id,
    });
  };

  ownerWindow?.addEventListener("pointerdown", handleMiniControlPointerDown, true);
  ownerWindow?.addEventListener("pointerup", handleMiniControlPointerUp, true);
  ownerWindow?.addEventListener("pointercancel", handleMiniControlPointerCancel, true);

  const handleMiniSeekPointerDown = (event) => {
    if (source !== dom.playerBottomActions) return;
    const target = getSourceControl(source, event.target);
    traceMiniPlayer("seek-pointer-down", {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      target: describeTraceTarget(event.target),
      mappedControl: describeTraceTarget(target),
      disabled: target?.disabled ?? null,
    });
    if (target !== dom.playerSeekInput || target.disabled) return;
    seekDragPointerId = event.pointerId;
    state.ui.seekDragActive = true;
    dom.playerFrame?.classList.add("player-frame--seek-control-dragging");
    traceMiniPlayer("seek-drag-start", { pointerId: event.pointerId });
  };

  const handleMiniSeekPointerEnd = (event) => {
    if (
      source !== dom.playerBottomActions
      || seekDragPointerId === null
      || event.pointerId !== seekDragPointerId
    ) return;

    traceMiniPlayer("seek-drag-end", { pointerId: event.pointerId, event: event.type });
    seekDragPointerId = null;
    state.ui.seekDragActive = false;
    dom.playerFrame?.classList.remove("player-frame--seek-control-dragging");
    syncState();
  };

  // El overlay del mini reproductor es una superficie independiente. Se
  // clona al abrirse, pero no vuelve a copiar cambios del reproductor normal.
  const observesSource = true;
  let removeTouchVolumeHovers = [];

  const handleMirrorClickCapture = (event) => {
    const proxy = event.target.closest?.("[data-proxy-index], [data-proxy-for]");
    traceMiniPlayer("mirror-click-capture", {
      source: source.id || source.className,
      isTrusted: event.isTrusted,
      target: describeTraceTarget(event.target),
      proxyIndex: proxy?.dataset.proxyIndex ?? null,
      proxyFor: proxy?.dataset.proxyFor ?? null,
      mappedControl: describeTraceTarget(getSourceControl(source, event.target)),
      defaultPrevented: event.defaultPrevented,
    });
  };
  element.addEventListener("click", handleMirrorClickCapture, true);

  element.addEventListener("click", (event) => {
    const mappedTarget = getSourceControl(source, event.target);
    const proxy = event.target.closest?.("[data-proxy-index], [data-proxy-for]");
    traceMiniPlayer("mirror-click", {
      source: source.id || source.className,
      isTrusted: event.isTrusted,
      eventTarget: describeTraceTarget(event.target),
      proxyIndex: proxy?.dataset.proxyIndex ?? null,
      proxyFor: proxy?.dataset.proxyFor ?? null,
      mappedControl: describeTraceTarget(mappedTarget),
      mappedControlDisabled: mappedTarget?.disabled ?? null,
      clickDetail: event.detail,
    });
    if (event.detail > 0 && lastHandledPointerAction) {
      const wasHandledByPointer = getSourceControl(source, event.target) === lastHandledPointerAction.target
        && Date.now() - lastHandledPointerAction.timestamp <= 750;
      lastHandledPointerAction = null;
      if (wasHandledByPointer) {
        traceMiniPlayer("mirror-click-skipped-after-pointer-action", {
          controlId: mappedTarget?.id || null,
        });
        return;
      }
    }
    if (event.target.matches?.("input, select, textarea, [contenteditable='true']")) {
      traceMiniPlayer("mirror-click-ignored", { reason: "direct-input-target", source: source.id || source.className });
      return;
    }
    if (
      source === dom.playerChat
      && event.target.closest?.("#insideChatAutoExpandSwitch, [data-proxy-for=\"insideChatAutoExpandSwitch\"]")
    ) {
      traceMiniPlayer("mirror-click-ignored", { reason: "chat-auto-expand-handled-elsewhere" });
      return;
    }
    if (source === dom.playerChat && event.target.closest?.('.message__system-group-toggle')) {
      const mirrorToggle = event.target.closest('.message__system-group-toggle');
      const expanded = mirrorToggle.getAttribute("aria-expanded") !== "true";
      mirrorToggle.setAttribute("aria-expanded", String(expanded));
      setMiniSystemGroupVisibility(mirrorToggle, expanded);
      animateMiniSystemGroupTransition(mirrorToggle, expanded);
      traceMiniPlayer("system-group-toggle", { expanded });
      return;
    }
    const target = mappedTarget;
    if (!target || target.disabled) {
      traceMiniPlayer("mirror-click-ignored", {
        reason: !target ? "source-control-not-found" : "source-control-disabled",
        source: source.id || source.className,
      });
      return;
    }
    event.preventDefault();
    if (target.id === "playerChatToggleButton") {
      traceMiniPlayer("chat-overlay-toggle", { activeBefore: element.closest(".mini-player-surface")?.classList.contains("u-chat-inside-open") ?? null });
      toggleMiniChatOverlay(element.closest(".mini-player-surface"));
      return;
    }
    if (isOverlayEmojiButton(source, target)) {
      traceMiniPlayer("emoji-button-route", { controlId: target.id });
      toggleMiniEmojiPicker(element);
      return;
    }
    if (isOverlayMessageSubmit(source, target)) {
      traceMiniPlayer("chat-send-button-route", { controlId: target.id });
      submitMirrorChat(source, element);
      return;
    }
    if (source === dom.playerChat) {
      traceMiniPlayer("chat-control-route", { controlId: target.id || target.tagName });
      handleMiniChatInteraction(element, event.target);
      return;
    }
    // Ejecutar la reproducción desde el clic de PiP conserva la activación del
    // usuario; reenviar un `.click()` al documento principal la vuelve sintética.
    if (getMiniPlayerControlAction(target)) {
      runMiniPlayerControlAction(target, "click");
    } else {
      traceMiniPlayer("control-route", { action: "forward-click", controlId: target.id || target.tagName });
      target.click();
    }
    requestAnimationFrame(() => {
      if (source === dom.playerBottomActions || source === dom.playerCenterActions) syncState();
      else sync();
      traceMiniPlayer("control-sync-after-click", {
        controlId: target.id || target.tagName,
        mirrorSeekValue: element.querySelector('[data-proxy-for="playerSeekInput"], #playerSeekInput')?.value ?? null,
        mirrorTimeLabel: element.querySelector('[data-proxy-for="playerCurrentTime"], #playerCurrentTime')?.textContent ?? null,
      });
    });
  });

  element.addEventListener("pointerdown", handleMiniSeekPointerDown);
  ownerWindow?.addEventListener("pointerup", handleMiniSeekPointerEnd);
  ownerWindow?.addEventListener("pointercancel", handleMiniSeekPointerEnd);

  element.addEventListener("submit", (event) => {
    if (source !== dom.playerChat) return;
    event.preventDefault();
    traceMiniPlayer("chat-form-submit-event", { isTrusted: event.isTrusted, source: source.id });
    submitMirrorChat(source, element);
  });

  ["input", "change"].forEach((eventName) => {
    element.addEventListener(eventName, (event) => {
      const target = getSourceControl(source, event.target);
      if (!target) return;
      traceMiniPlayer("mirror-value-forward", {
        event: eventName,
        source: source.id || source.className,
        controlId: target.id || target.tagName,
        valueLength: isOverlayMessageInput(source, target) ? String(event.target.value || "").length : null,
        value: target.type === "range" ? event.target.value : undefined,
      });
      if (isOverlayMessageInput(source, target)) {
        target.value = event.target.value;
        target.dispatchEvent(new Event(eventName, { bubbles: true }));
        return;
      }
      target.value = event.target.value;
      target.dispatchEvent(new Event(eventName, { bubbles: true }));
      if (eventName === "change") {
        if (source === dom.playerBottomActions || source === dom.playerCenterActions) syncState();
        else sync();
      }
    });
  });

  element.addEventListener("pointerout", (event) => {
    if (source !== dom.playerBottomActions) return;
    const volumeGroup = event.target.closest?.(".player-volume-group");
    if (!volumeGroup || volumeGroup.contains(event.relatedTarget)) return;
    volumeGroup.classList.remove('player-volume-group--hovered');
  }, { passive: true });

  element.addEventListener("wheel", (event) => {
    if (source !== dom.playerBottomActions) return;
    const volumeGroup = event.target?.closest?.(".player-volume-group");
    if (!volumeGroup || !element.contains(volumeGroup)) return;

    event.preventDefault();
    event.stopPropagation();
    const step = 0.05;
    const delta = event.deltaY < 0 ? step : -step;
    const currentVolume = dom.videoPlayer.muted ? 0 : dom.videoPlayer.volume;
    const nextVolume = Math.min(1, Math.max(0, currentVolume + delta));
    volumeGroup.classList.add('player-volume-group--hovered');
    dom.videoPlayer.volume = nextVolume;
    if (nextVolume > 0 && dom.videoPlayer.muted) dom.videoPlayer.muted = false;
    syncState();
  }, { passive: false });

  if (observesSource) {
    observer.observe(source, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  }
  sync();

  if (source === dom.playerChat) {
    element.addEventListener("pointerdown", (event) => {
      const emojiButton = event.target.closest?.(
        "#overlayEmojiButton, [data-proxy-for=\"overlayEmojiButton\"]",
      );
      if (emojiButton) captureMiniEmojiSelection(element);
    });
    const preventMirrorComposerFocus = (event) => {
      if (!window.matchMedia?.("(max-width: 980px)").matches) return;

      const button = event.target.closest?.(
        "#overlayEmojiButton, #overlayMessageSend, [data-proxy-for=\"overlayEmojiButton\"], [data-proxy-for=\"overlayMessageSend\"]",
      );
      if (!button) return;

      const input = element.querySelector(
        "#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]",
      );
      const isSendButton = button.matches(
        "#overlayMessageSend, [data-proxy-for=\"overlayMessageSend\"]",
      );
      if (isSendButton || document.activeElement === input) event.preventDefault();
    };
    element.addEventListener("pointerdown", preventMirrorComposerFocus);
    element.addEventListener("mousedown", preventMirrorComposerFocus);
  }

  return {
    element,
    source,
    sync,
    syncState,
    restore() {
      observer.disconnect();
      removeTouchVolumeHovers.forEach((removeTouchHover) => removeTouchHover());
      element.removeEventListener("click", handleMirrorClickCapture, true);
      element.removeEventListener("pointerdown", handleMiniSeekPointerDown);
      ownerWindow?.removeEventListener("pointerdown", handleMiniControlPointerDown, true);
      ownerWindow?.removeEventListener("pointerup", handleMiniControlPointerUp, true);
      ownerWindow?.removeEventListener("pointercancel", handleMiniControlPointerCancel, true);
      pendingControlPointers.clear();
      lastHandledPointerAction = null;
      ownerWindow?.removeEventListener("pointerup", handleMiniSeekPointerEnd);
      ownerWindow?.removeEventListener("pointercancel", handleMiniSeekPointerEnd);
      if (seekDragPointerId !== null) {
        seekDragPointerId = null;
        state.ui.seekDragActive = false;
        dom.playerFrame?.classList.remove("player-frame--seek-control-dragging");
      }
      element.remove();
    },
  };

  function getMiniPlayerControlAction(target) {
    if (target === dom.playerPlayButton) return "toggle-playback";
    if (target === dom.playerBackButton) return "seek-back";
    if (target === dom.playerForwardButton) return "seek-forward";
    return null;
  }

  function runMiniPlayerControlAction(target, trigger) {
    const action = getMiniPlayerControlAction(target);
    if (!action) return;
    traceMiniPlayer("control-route", { action, controlId: target.id, trigger });
    if (action === "toggle-playback") togglePlaybackFromControls("mini-player");
    else if (action === "seek-back") seekVideoBy(-10, "mini-player");
    else seekVideoBy(10, "mini-player");
  }

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
}

function syncMirrorComposerState(source, element) {
  const sourceWrapper = source.querySelector('.message-form.message-form--overlay .message-form__input-wrapper');
  const mirrorWrapper = element.querySelector('.message-form.message-form--overlay .message-form__input-wrapper');
  const sourceInput = source.querySelector("#overlayMessageInput");
  const mirrorInput = element.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
  if (!sourceWrapper || !mirrorWrapper) return;

  mirrorWrapper.dataset.expanded = sourceWrapper.dataset.expanded || "false";
  if (sourceInput && mirrorInput && mirrorInput !== element.ownerDocument.activeElement) {
    mirrorInput.style.cssText = sourceInput.style.cssText;
  }
}

function markProxyControls(element, keepIds) {
  element.querySelectorAll(PROXY_CONTROL_SELECTOR).forEach((control, index) => {
    control.dataset.proxyIndex = String(index);
    if (keepIds || !control.id) return;
    control.dataset.proxyFor = control.id;
    control.removeAttribute("id");
  });
  if (!keepIds) element.querySelectorAll("[for]").forEach((label) => label.removeAttribute("for"));
}

function copyControlState(source, element) {
  source.querySelectorAll(PROXY_CONTROL_SELECTOR).forEach((sourceControl, index) => {
    const proxy = element.querySelector(`[data-proxy-index="${index}"]`);
    if (!proxy) return;
    if (proxy.isContentEditable) installRichEditor(proxy);
    proxy.disabled = sourceControl.disabled;
    proxy.value = sourceControl.value;
    proxy.checked = sourceControl.checked;
    proxy.style.cssText = sourceControl.style.cssText;
    proxy.setAttribute("aria-label", sourceControl.getAttribute("aria-label") || "");
    proxy.dataset.tooltip = sourceControl.dataset.tooltip || "";
  });
}

function copyPlayerTimeLabels(source, element) {
  ["playerCurrentTime", "playerDuration"].forEach((id) => {
    const sourceLabel = source.querySelector(`#${id}`);
    const mirrorLabel = element.querySelector(`#${id}, [data-proxy-for="${id}"]`);
    if (sourceLabel && mirrorLabel) mirrorLabel.textContent = sourceLabel.textContent;
  });
}

function copySeekProgressPresentation(source, element) {
  const sourceGroup = source.querySelector(".player-progress-group");
  const mirrorGroup = element.querySelector(".player-progress-group");
  if (!sourceGroup || !mirrorGroup) return;
  mirrorGroup.style.setProperty(
    "--player-progress",
    sourceGroup.style.getPropertyValue("--player-progress") || "0%",
  );
}

function copyVolumeProgressPresentation(source, element) {
  const sourceSlider = source.querySelector(".player-volume-group__slider");
  const mirrorSlider = element.querySelector(".player-volume-group__slider");
  if (!sourceSlider || !mirrorSlider) return;

  const sourceInput = sourceSlider.querySelector(".player-volume-group__input");
  const progress = sourceSlider.style.getPropertyValue("--volume-progress")
    || sourceInput?.style.getPropertyValue("--volume-progress")
    || `${Math.max(0, Math.min(1, Number(sourceInput?.value) || 0)) * 100}%`;
  mirrorSlider.style.setProperty("--volume-progress", progress);
}

function copyDynamicButtonPresentation(source, element) {
  [
    "playerBackButton",
    "playerPlayButton",
    "playerForwardButton",
    "playerMuteButton",
    "playerMiniPlayerButton",
  ].forEach((id) => {
    const sourceButton = source.querySelector(`#${id}`);
    const mirrorButton = element.querySelector(`#${id}, [data-proxy-for="${id}"]`);
    if (!sourceButton || !mirrorButton) return;
    mirrorButton.className = sourceButton.className;
    mirrorButton.innerHTML = sourceButton.innerHTML;
    mirrorButton.setAttribute("aria-label", sourceButton.getAttribute("aria-label") || "");
    if (sourceButton.dataset.tooltip) {
      mirrorButton.dataset.tooltip = sourceButton.dataset.tooltip;
    } else {
      mirrorButton.removeAttribute("data-tooltip");
    }
  });

}

function getSourceControl(source, target) {
  if (!target?.closest) return null;
  const proxy = target.closest("[data-proxy-index], [data-proxy-for]");
  if (!proxy) return null;

  const sourceId = proxy.dataset.proxyFor || proxy.id;
  if (sourceId) {
    const identifiedControl = [...source.querySelectorAll(PROXY_CONTROL_SELECTOR)]
      .find((control) => control.id === sourceId);
    if (identifiedControl) return identifiedControl;
  }

  const proxyIndex = Number(proxy.dataset.proxyIndex);
  if (!Number.isInteger(proxyIndex) || proxyIndex < 0) return null;
  return source.querySelectorAll(PROXY_CONTROL_SELECTOR)[proxyIndex] || null;
}

function describeTraceTarget(target) {
  if (!target) return null;
  return {
    tag: target.tagName?.toLowerCase() || null,
    id: target.id || null,
    className: typeof target.className === "string" ? target.className : null,
    type: target.type || null,
    disabled: typeof target.disabled === "boolean" ? target.disabled : null,
  };
}

function isRangeBeingDragged(element) {
  const activeElement = element.ownerDocument.activeElement;
  return activeElement?.matches?.('input[type="range"]')
    && element.contains(activeElement);
}
