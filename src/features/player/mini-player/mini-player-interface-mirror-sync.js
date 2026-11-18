import { installRichEditor } from "../../chat/composer/chat-rich-editor.js";

export const PROXY_CONTROL_SELECTOR = "button, input:not([data-player-scroll-indicator]), select, textarea, [contenteditable='true']";

export function syncMirrorComposerState(source, element) {
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

export function markProxyControls(element, keepIds) {
  element.querySelectorAll(PROXY_CONTROL_SELECTOR).forEach((control, index) => {
    control.dataset.proxyIndex = String(index);
    if (keepIds || !control.id) return;
    control.dataset.proxyFor = control.id;
    control.removeAttribute("id");
  });
  if (!keepIds) element.querySelectorAll("[for]").forEach((label) => label.removeAttribute("for"));
}

export function copyControlState(source, element) {
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

export function copyPlayerTimeLabels(source, element) {
  ["playerCurrentTime", "playerDuration"].forEach((id) => {
    const sourceLabel = source.querySelector(`#${id}`);
    const mirrorLabel = element.querySelector(`#${id}, [data-proxy-for="${id}"]`);
    if (sourceLabel && mirrorLabel) mirrorLabel.textContent = sourceLabel.textContent;
  });
}

export function copySeekProgressPresentation(source, element) {
  const sourceGroup = source.querySelector(".player-progress-group");
  const mirrorGroup = element.querySelector(".player-progress-group");
  if (!sourceGroup || !mirrorGroup) return;
  mirrorGroup.style.setProperty(
    "--player-progress",
    sourceGroup.style.getPropertyValue("--player-progress") || "0%",
  );
}

export function copyVolumeProgressPresentation(source, element) {
  const sourceSlider = source.querySelector(".player-volume-group__slider");
  const mirrorSlider = element.querySelector(".player-volume-group__slider");
  if (!sourceSlider || !mirrorSlider) return;

  const sourceInput = sourceSlider.querySelector(".player-volume-group__input");
  const progress = sourceSlider.style.getPropertyValue("--volume-progress")
    || sourceInput?.style.getPropertyValue("--volume-progress")
    || `${Math.max(0, Math.min(1, Number(sourceInput?.value) || 0)) * 100}%`;
  mirrorSlider.style.setProperty("--volume-progress", progress);
}

export function copyDynamicButtonPresentation(source, element) {
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

export function getSourceControl(source, target) {
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

export function isRangeBeingDragged(element) {
  const activeElement = element.ownerDocument.activeElement;
  return activeElement?.matches?.('input[type="range"]')
    && element.contains(activeElement);
}
