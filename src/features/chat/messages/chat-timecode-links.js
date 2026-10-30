import { dom } from "../../../core/dom.js";
import { formatClockTime } from "../../../core/utils.js";
import { scrollToVideoPosition } from "../chat-layout.js";

const TIMECODE_PATTERN = /(?<![\d:])(?:(\d+):)?(\d+):(\d{2})(?![\d:])/g;

export function getValidVideoTimecodeMatches(value) {
  const duration = Number(dom.videoPlayer?.duration);
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const text = String(value ?? "");
  const matches = [];
  TIMECODE_PATTERN.lastIndex = 0;
  let match;
  while ((match = TIMECODE_PATTERN.exec(text))) {
    const seconds = parseTimecode(match);
    if (seconds == null || seconds > duration) continue;
    matches.push({ label: match[0], index: match.index, end: TIMECODE_PATTERN.lastIndex, seconds });
  }
  return matches;
}

export function getLeadingTimecodeSeconds(text) {
  const match = String(text ?? "").trimStart().match(/^(?:(\d+):)?(\d+):(\d{2})(?=\s|$)/);
  return match ? parseTimecode(match) : null;
}

export function seekVideoToSeconds(seconds) {
  if (!dom.videoPlayer || !Number.isFinite(seconds)) return;
  if (!isPlayerFrameVisible()) scrollToVideoPosition("smooth");
  dom.videoPlayer.currentTime = seconds;
}

function isPlayerFrameVisible() {
  const playerFrame = dom.playerFrame;
  if (!playerFrame || !playerFrame.getClientRects().length) return false;

  const rect = playerFrame.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  return rect.width > 0
    && rect.height > 0
    && rect.right > 0
    && rect.left < viewportWidth
    && rect.bottom > 0
    && rect.top < viewportHeight;
}

export function appendTextWithTimecodes(container, text, appendPlainText) {
  const value = String(text ?? "");
  if (container.closest?.("a, code")) {
    appendPlainText(container, value);
    return;
  }

  let cursor = 0;
  for (const match of getValidVideoTimecodeMatches(value)) {
    appendPlainText(container, value.slice(cursor, match.index));
    container.append(createTimecodeButton(match.label, match.seconds, container.ownerDocument));
    cursor = match.end;
  }
  appendPlainText(container, value.slice(cursor));
}

function parseTimecode(match) {
  const hours = match[1] == null ? 0 : Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (seconds > 59 || (match[1] != null && minutes > 59)) return null;

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return Number.isSafeInteger(totalSeconds) ? totalSeconds : null;
}

function createTimecodeButton(label, seconds, documentRef) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "message__video-ts message__video-ts--inline";
  button.dataset.tooltip = `Ir al minuto ${formatClockTime(seconds)} del video`;
  button.setAttribute("aria-label", `Saltar a ${formatClockTime(seconds)} en el video`);

  const visual = documentRef.createElement("span");
  visual.className = "message-video-ts__visual";
  const icon = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "8");
  icon.setAttribute("height", "8");
  icon.setAttribute("fill", "currentColor");
  icon.setAttribute("aria-hidden", "true");
  const triangle = documentRef.createElementNS("http://www.w3.org/2000/svg", "polygon");
  triangle.setAttribute("points", "5,3 19,12 5,21");
  icon.append(triangle);

  const time = documentRef.createElement("span");
  time.className = "message-video-ts__time";
  time.textContent = label;
  visual.append(icon, time);
  button.append(visual);
  button.addEventListener("click", () => seekVideoToSeconds(seconds));
  return button;
}
