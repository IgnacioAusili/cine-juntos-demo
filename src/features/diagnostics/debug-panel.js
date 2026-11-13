import { dom } from "../../core/dom.js";
import { isDebugMode } from "../../core/debug-mode.js";
import { clearClientLog, getClientLogText, logEvent } from "../../core/state.js";

const LOG_FILE_NAME = "cine-juntos-log.txt";
const SHARE_TITLE = "Log de diagnóstico de Cine Juntos";
const SHARE_TEXT_FALLBACK = "Log de diagnóstico de Cine Juntos";
const LOG_RENDER_CHUNK_SIZE = 24;
const LOG_RENDER_WINDOW_LIMIT = 96;
const LOG_RENDER_CHUNK_CHAR_BUDGET = 24000;
const LOG_RENDER_WINDOW_CHAR_LIMIT = 80000;
let debugPanelScrollPosition = null;
let consoleLogCaptureInstalled = false;
let debugPanelCopyFeedbackTimer = 0;
let debugPanelLogLines = [];
let filteredLogLines = [];
let renderedLogStart = 0;
let renderedLogEnd = 0;

function formatConsoleArgument(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

export function installConsoleLogCapture() {
  if (!isDebugMode() || consoleLogCaptureInstalled) return;
  consoleLogCaptureInstalled = true;

  const nativeConsoleLog = console.log.bind(console);
  console.log = (...args) => {
    logEvent("console.log", args.map(formatConsoleArgument).join(" "));
    nativeConsoleLog(...args);
  };

  nativeConsoleLog("[console-capture] enabled for the /console route");
}

function syncDebugButtonVisibility() {
  if (!dom.debugPanelButton) return;
  dom.debugPanelButton.hidden = !isDebugMode();
}

function getCurrentLogFilter() {
  return dom.debugPanelFilter?.value.trim().toLocaleLowerCase("es-AR") || "";
}

function matchesLogFilter(line, filter) {
  return !filter || line.toLocaleLowerCase("es-AR").includes(filter);
}

function getFilteredLog() {
  const filter = dom.debugPanelFilter?.value.trim().toLocaleLowerCase("es-AR") || "";
  const lines = getClientLogText().split("\n").filter(Boolean);
  const filteredLines = filter
    ? lines.filter((line) => matchesLogFilter(line, filter))
    : lines;
  return {
    filter,
    text: filteredLines.map(formatLogLine).join("\n\n"),
  };
}

function formatJsonInMessage(message) {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) return message;

  try {
    return JSON.stringify(JSON.parse(trimmedMessage), null, 2);
  } catch {
    // Diagnostic messages often include a label before their JSON payload.
  }

  for (let index = 0; index < message.length; index += 1) {
    if (message[index] !== "{" && message[index] !== "[") continue;
    try {
      const parsed = JSON.parse(message.slice(index));
      const prefix = message.slice(0, index).trimEnd();
      return `${prefix}${prefix ? "\n" : ""}${JSON.stringify(parsed, null, 2)}`;
    } catch {
      // Keep looking in case an earlier brace is part of the message text.
    }
  }

  return message;
}

function formatLogLine(line) {
  const match = line.match(/^(\[[^\]]+\]\s+\[[^\]]+\])\s*(.*)$/);
  if (!match) return line;
  const formattedMessage = formatJsonInMessage(match[2]);
  return formattedMessage ? `${match[1]} ${formattedMessage}` : match[1];
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function highlightLogLine(line, filter) {
  if (!filter) return escapeHtml(line);

  const normalizedLine = line.toLocaleLowerCase("es-AR");
  let searchStart = 0;
  let lastIndex = 0;
  let highlightedLine = "";

  while (searchStart < normalizedLine.length) {
    const matchIndex = normalizedLine.indexOf(filter, searchStart);
    if (matchIndex === -1) break;
    highlightedLine += escapeHtml(line.slice(lastIndex, matchIndex));
    highlightedLine += "<mark>" + escapeHtml(line.slice(matchIndex, matchIndex + filter.length)) + "</mark>";
    lastIndex = matchIndex + filter.length;
    searchStart = lastIndex;
  }

  return highlightedLine + escapeHtml(line.slice(lastIndex));
}

function createLogEntry(line, filter) {
  const entry = document.createElement("span");
  entry.className = "debug-panel__log-entry";
  entry.innerHTML = highlightLogLine(formatLogLine(line), filter);
  return entry;
}

function createLogEntryFragment(start, end, filter) {
  const fragment = document.createDocumentFragment();
  for (let index = start; index < end; index += 1) {
    fragment.append(createLogEntry(filteredLogLines[index], filter));
  }
  return fragment;
}

function appendLogEntries(start, end, filter) {
  dom.debugPanelLog.append(createLogEntryFragment(start, end, filter));
}

function getPreviousLogChunkStart(end) {
  let start = end;
  let characters = 0;
  while (start > 0 && end - start < LOG_RENDER_CHUNK_SIZE) {
    const nextCharacters = filteredLogLines[start - 1].length + 2;
    if (start < end && characters + nextCharacters > LOG_RENDER_CHUNK_CHAR_BUDGET) break;
    characters += nextCharacters;
    start -= 1;
  }
  return start;
}

function getNextLogChunkEnd(start) {
  let end = start;
  let characters = 0;
  while (end < filteredLogLines.length && end - start < LOG_RENDER_CHUNK_SIZE) {
    const nextCharacters = filteredLogLines[end].length + 2;
    if (end > start && characters + nextCharacters > LOG_RENDER_CHUNK_CHAR_BUDGET) break;
    characters += nextCharacters;
    end += 1;
  }
  return end;
}

function getRenderedLogCharacterCount() {
  let characters = 0;
  for (let index = renderedLogStart; index < renderedLogEnd; index += 1) {
    characters += filteredLogLines[index].length;
  }
  return characters;
}

function renderLogWindow(filter = getCurrentLogFilter()) {
  const fragment = document.createDocumentFragment();
  for (let index = renderedLogStart; index < renderedLogEnd; index += 1) {
    fragment.append(createLogEntry(filteredLogLines[index], filter));
  }
  dom.debugPanelLog.replaceChildren(fragment);
}

function refreshLogViewer(startAtEnd = false) {
  if (!dom.debugPanelLog) return "";
  const filter = getCurrentLogFilter();
  filteredLogLines = debugPanelLogLines.filter((line) => matchesLogFilter(line, filter));
  renderedLogEnd = filteredLogLines.length;
  renderedLogStart = startAtEnd
    ? getPreviousLogChunkStart(renderedLogEnd)
    : 0;
  renderLogWindow(filter);
  const filterClearButton = document.querySelector("#debugPanelFilterClearButton");
  if (filterClearButton) filterClearButton.hidden = !dom.debugPanelFilter?.value;
}

function clearLogs() {
  clearClientLog();
  debugPanelLogLines = [];
  refreshLogViewer();
}

function startLiveLogViewer() {
  if (!debugPanelScrollPosition) {
    debugPanelScrollPosition = { left: window.scrollX, top: window.scrollY };
  }
  document.documentElement.classList.add("debug-panel-open");
  document.body.classList.add("debug-panel-open");
  debugPanelLogLines = getClientLogText().split("\n").filter(Boolean);
  refreshLogViewer(true);
  requestAnimationFrame(() => dom.debugPanelLog?.scrollTo(0, dom.debugPanelLog.scrollHeight));
}

function stopLiveLogViewer() {
  document.documentElement.classList.remove("debug-panel-open");
  document.body.classList.remove("debug-panel-open");
  debugPanelLogLines = [];
  filteredLogLines = [];
  renderedLogStart = 0;
  renderedLogEnd = 0;
  dom.debugPanelLog?.replaceChildren();
}

function handleClientLog(event) {
  if (!dom.debugPanelDialog.open || typeof event.detail?.line !== "string") return;
  const { line, droppedOldest = false } = event.detail;
  const filter = getCurrentLogFilter();
  const logPanel = dom.debugPanelLog;
  const wasAtBottom = logPanel.scrollHeight - logPanel.scrollTop - logPanel.clientHeight < 36;
  const wasShowingNewest = renderedLogEnd === filteredLogLines.length;
  let droppedVisibleLog = false;

  if (droppedOldest && debugPanelLogLines.length) {
    const removedLine = debugPanelLogLines.shift();
    if (matchesLogFilter(removedLine, filter)) {
      filteredLogLines.shift();
      if (renderedLogStart === 0) logPanel.firstElementChild?.remove();
      else renderedLogStart -= 1;
      renderedLogEnd = Math.max(renderedLogStart, renderedLogEnd - 1);
      droppedVisibleLog = true;
    }
  }

  debugPanelLogLines.push(line);
  if (!matchesLogFilter(line, filter)) {
    return;
  }
  filteredLogLines.push(line);

  if (droppedVisibleLog) {
    if (wasShowingNewest && wasAtBottom) {
      appendLogEntries(renderedLogEnd, renderedLogEnd + 1, filter);
      renderedLogEnd += 1;
    } else {
      logPanel.scrollTop = Math.min(logPanel.scrollTop, logPanel.scrollHeight - logPanel.clientHeight);
      return;
    }
  } else {
    if (!wasShowingNewest || !wasAtBottom) return;
    appendLogEntries(renderedLogEnd, renderedLogEnd + 1, filter);
    renderedLogEnd += 1;
  }

  while (
    renderedLogEnd - renderedLogStart > LOG_RENDER_WINDOW_LIMIT
    || getRenderedLogCharacterCount() > LOG_RENDER_WINDOW_CHAR_LIMIT
  ) {
    logPanel.firstElementChild?.remove();
    renderedLogStart += 1;
  }
  logPanel.scrollTop = logPanel.scrollHeight;
}

function handleLogPanelScroll() {
  const logPanel = dom.debugPanelLog;
  if (!logPanel) return;
  const filter = getCurrentLogFilter();

  if (logPanel.scrollTop < 48 && renderedLogStart > 0) {
    const previousScrollTop = logPanel.scrollTop;
    const previousScrollHeight = logPanel.scrollHeight;
    const previousStart = renderedLogStart;
    const nextStart = getPreviousLogChunkStart(renderedLogStart);
    logPanel.insertBefore(createLogEntryFragment(nextStart, previousStart, filter), logPanel.firstChild);
    renderedLogStart = nextStart;
    const heightAfterPrepend = logPanel.scrollHeight;
    while (
      renderedLogEnd - renderedLogStart > LOG_RENDER_WINDOW_LIMIT
      || getRenderedLogCharacterCount() > LOG_RENDER_WINDOW_CHAR_LIMIT
    ) {
      logPanel.lastElementChild?.remove();
      renderedLogEnd -= 1;
    }
    logPanel.scrollTop = previousScrollTop + heightAfterPrepend - previousScrollHeight;
    return;
  }

  const distanceFromBottom = logPanel.scrollHeight - logPanel.scrollTop - logPanel.clientHeight;
  if (distanceFromBottom < 48 && renderedLogEnd < filteredLogLines.length) {
    const previousScrollTop = logPanel.scrollTop;
    const previousScrollHeight = logPanel.scrollHeight;
    const previousEnd = renderedLogEnd;
    renderedLogEnd = getNextLogChunkEnd(renderedLogEnd);
    appendLogEntries(previousEnd, renderedLogEnd, filter);
    const heightAfterAppend = logPanel.scrollHeight;
    while (
      renderedLogEnd - renderedLogStart > LOG_RENDER_WINDOW_LIMIT
      || getRenderedLogCharacterCount() > LOG_RENDER_WINDOW_CHAR_LIMIT
    ) {
      logPanel.firstElementChild?.remove();
      renderedLogStart += 1;
    }
    const removedHeight = heightAfterAppend - logPanel.scrollHeight;
    logPanel.scrollTop = previousScrollTop + heightAfterAppend - previousScrollHeight - removedHeight;
  }
}

function setCopyFeedback(state) {
  const button = dom.debugPanelCopyButton;
  if (!button) return;

  window.clearTimeout(debugPanelCopyFeedbackTimer);
  button.dataset.copyState = state;
  button.setAttribute(
    "aria-label",
    state === "success" ? "Copiado" : state === "error" ? "Error al copiar" : "Copiar",
  );

  if (state !== "idle") {
    debugPanelCopyFeedbackTimer = window.setTimeout(() => {
      button.dataset.copyState = "idle";
      button.setAttribute("aria-label", "Copiar");
    }, 2200);
  }
}

function restoreMobileDebugScroll() {
  if (!debugPanelScrollPosition) return;
  window.scrollTo(debugPanelScrollPosition.left, debugPanelScrollPosition.top);
}

function wirePanelSwipeToScroll() {
  const logPanel = dom.debugPanelLog;
  if (!logPanel) return;

  let previousY = null;
  let startY = null;
  let isLogSwipe = false;
  const resetSwipe = () => {
    previousY = null;
    startY = null;
    isLogSwipe = false;
  };

  logPanel.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) {
      resetSwipe();
      return;
    }
    previousY = event.touches[0].clientY;
    startY = previousY;
    isLogSwipe = false;
  }, { passive: true });

  logPanel.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 1 || previousY === null || startY === null) return;
    const currentY = event.touches[0].clientY;
    if (!isLogSwipe && Math.abs(currentY - startY) < 4) return;
    isLogSwipe = true;
    dom.debugPanelLog.scrollTop += previousY - currentY;
    previousY = currentY;
    if (event.cancelable) event.preventDefault();
  }, { passive: false });

  logPanel.addEventListener("touchend", resetSwipe, { passive: true });
  logPanel.addEventListener("touchcancel", resetSwipe, { passive: true });
}

function closeDebugPanelDialog() {
  dom.debugPanelDialog.close();
  restoreMobileDebugScroll();
  requestAnimationFrame(() => {
    restoreMobileDebugScroll();
    debugPanelScrollPosition = null;
  });
}

function copyTextFallback(text) {
  const fallbackInput = document.createElement("textarea");
  fallbackInput.value = text;
  fallbackInput.setAttribute("readonly", "");
  fallbackInput.style.position = "fixed";
  fallbackInput.style.opacity = "0";
  document.body.appendChild(fallbackInput);
  fallbackInput.select();
  let copied;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  fallbackInput.remove();
  return copied;
}

async function copyLogs() {
  const { text } = getFilteredLog();
  let copied;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    } else {
      copied = copyTextFallback(text);
    }
  } catch {
    copied = copyTextFallback(text);
  }
  setCopyFeedback(copied ? "success" : "error");
  logEvent("mobile-keyboard-debug", copied ? "test-ui:log-copied" : "test-ui:log-copy-failed");
}

function downloadLogs(text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = LOG_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
}

async function shareLogs() {
  const { text } = getFilteredLog();
  const file = typeof File === "function"
    ? new File([text], LOG_FILE_NAME, { type: "text/plain" })
    : null;

  if (typeof navigator.share !== "function") {
    downloadLogs(text);
    logEvent("mobile-keyboard-debug", "test-ui:log-share-fallback-download");
    return;
  }

  let canShareFiles = Boolean(file) && typeof navigator.canShare !== "function";
  if (file && typeof navigator.canShare === "function") {
    try {
      canShareFiles = navigator.canShare({ files: [file] });
    } catch {
      canShareFiles = false;
    }
  }

  try {
    if (canShareFiles) {
      await navigator.share({
        title: SHARE_TITLE,
        text: SHARE_TEXT_FALLBACK,
        files: [file],
      });
      logEvent("mobile-keyboard-debug", "test-ui:log-shared-file");
    } else {
      await navigator.share({
        title: SHARE_TITLE,
        text,
      });
      logEvent("mobile-keyboard-debug", "test-ui:log-shared-text-fallback");
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      logEvent("mobile-keyboard-debug", "test-ui:log-share-cancelled");
      return;
    }
    downloadLogs(text);
    logEvent("mobile-keyboard-debug", `test-ui:log-share-fallback-download (${error?.message || "error desconocido"}).`);
  }
}

export function wireDebugPanelTools() {
  if (!isDebugMode() || !dom.debugPanelButton || !dom.debugPanelDialog) return;
  const debugPanelShareButton = document.querySelector("#debugPanelShareButton");

  syncDebugButtonVisibility();
  wirePanelSwipeToScroll();
  window.addEventListener("cine:client-log", handleClientLog);
  dom.debugPanelLog?.addEventListener("scroll", handleLogPanelScroll, { passive: true });
  const dialogOpenObserver = new MutationObserver(() => {
    if (dom.debugPanelDialog.open) startLiveLogViewer();
  });
  dialogOpenObserver.observe(dom.debugPanelDialog, { attributes: true, attributeFilter: ["open"] });

  dom.debugPanelButton.addEventListener("click", () => {
    debugPanelScrollPosition = { left: window.scrollX, top: window.scrollY };
    dom.debugPanelDialog.showModal();
    dom.debugPanelCloseButton?.focus({ preventScroll: true });
    restoreMobileDebugScroll();
    requestAnimationFrame(restoreMobileDebugScroll);
  });
  dom.debugPanelCloseButton?.addEventListener("click", closeDebugPanelDialog);
  dom.debugPanelCopyButton?.addEventListener("click", copyLogs);
  debugPanelShareButton?.addEventListener("click", shareLogs);
  dom.debugPanelClearButton?.addEventListener("click", clearLogs);
  dom.debugPanelFilter?.addEventListener("input", () => {
    refreshLogViewer(true);
    dom.debugPanelLog?.scrollTo(0, dom.debugPanelLog.scrollHeight);
  });
  document.querySelector("#debugPanelFilterClearButton")?.addEventListener("click", () => {
    if (!dom.debugPanelFilter) return;
    dom.debugPanelFilter.value = "";
    refreshLogViewer(true);
    dom.debugPanelLog?.scrollTo(0, dom.debugPanelLog.scrollHeight);
    dom.debugPanelFilter.focus();
  });
  dom.debugPanelDialog.addEventListener("close", () => {
    stopLiveLogViewer();
    restoreMobileDebugScroll();
    requestAnimationFrame(() => {
      restoreMobileDebugScroll();
      debugPanelScrollPosition = null;
    });
  });
  dom.debugPanelDialog.addEventListener("click", (event) => {
    if (event.target === dom.debugPanelDialog) closeDebugPanelDialog();
  });
}
