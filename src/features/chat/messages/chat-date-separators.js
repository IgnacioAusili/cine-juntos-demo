function getMessageDate(message) {
  for (const value of [message?.createdAt, message?.serverTime]) {
    if (value == null) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
}

function getLocalDayKey(date) {
  return [date.getFullYear(), date.getMonth(), date.getDate()].join("-");
}

export function createChatDateSeparator(message, previousMessage) {
  const date = getMessageDate(message);
  if (!date) return null;

  const previousDate = getMessageDate(previousMessage);
  if (previousDate && getLocalDayKey(previousDate) === getLocalDayKey(date)) return null;

  const dayLabel = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const label = `${dayLabel} · ${timeLabel}`;

  const separator = document.createElement("div");
  separator.className = "chat-date-separator";
  separator.dataset.dateKey = getLocalDayKey(date);
  separator.setAttribute("role", "separator");
  separator.setAttribute("aria-label", label);
  separator.textContent = label;
  return separator;
}
