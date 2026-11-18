import { dom } from "../../../core/dom.js";
import {
  animateMiniSystemGroupTransition,
  captureMiniEmojiSelection,
  handleMiniChatInteraction,
  isOverlayEmojiButton,
  isOverlayMessageInput,
  isOverlayMessageSubmit,
  setMiniSystemGroupVisibility,
  submitMirrorChat,
  toggleMiniChatOverlay,
  toggleMiniEmojiPicker,
} from "./mini-player-chat-mirror.js";
import { traceMiniPlayer, describeTraceTarget } from "./mini-player-debug.js";
import { seekVideoBy, togglePlaybackFromControls } from "../controls/player-control-actions.js";
import { wireMiniPlayerMirrorPointerEvents } from "./mini-player-interface-mirror-pointer.js";
import { getSourceControl } from "./mini-player-interface-mirror-sync.js";

export function wireMiniPlayerMirrorInteractions({ source, element, sync, syncState }) {
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

  const pointerEvents = wireMiniPlayerMirrorPointerEvents({
    source,
    element,
    syncState,
    getMiniPlayerControlAction,
    runMiniPlayerControlAction,
  });
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
    if (event.detail > 0 && pointerEvents.consumeClickAfterPointer(mappedTarget)) {
      traceMiniPlayer("mirror-click-skipped-after-pointer-action", {
        controlId: mappedTarget?.id || null,
      });
      return;
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

  return () => pointerEvents.dispose();
}
