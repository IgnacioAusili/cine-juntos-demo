import { state } from "../../../core/state.js";
import { dom } from "../../../core/dom.js";
import { traceMiniPlayer, describeTraceTarget } from "./mini-player-debug.js";
import { getSourceControl } from "./mini-player-interface-mirror-sync.js";

export function wireMiniPlayerMirrorPointerEvents({
  source,
  element,
  syncState,
  getMiniPlayerControlAction,
  runMiniPlayerControlAction,
}) {
  const ownerWindow = element.ownerDocument.defaultView;
  let seekDragPointerId = null;
  const pendingControlPointers = new Map();
  let lastHandledPointerAction = null;

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

  element.addEventListener("pointerdown", handleMiniSeekPointerDown);
  ownerWindow?.addEventListener("pointerup", handleMiniSeekPointerEnd);
  ownerWindow?.addEventListener("pointercancel", handleMiniSeekPointerEnd);

  return {
    consumeClickAfterPointer(target) {
      if (!lastHandledPointerAction) return false;
      const wasHandledByPointer = target === lastHandledPointerAction.target
        && Date.now() - lastHandledPointerAction.timestamp <= 750;
      lastHandledPointerAction = null;
      return wasHandledByPointer;
    },
    dispose() {
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
    },
  };
}
