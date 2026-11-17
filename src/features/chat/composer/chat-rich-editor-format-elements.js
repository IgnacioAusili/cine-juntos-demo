export function createFormatElement(documentRef, format, url = "") {
  const tags = { quote: "span", bold: "strong", italic: "em", monospace: "code", underline: "u", strike: "s", spoiler: "span", link: "a" };
  const tag = tags[format];
  if (!tag) return null;
  const element = documentRef.createElement(tag);
  element.dataset.chatFormat = format;
  if (format === "link") {
    let parsedUrl;
    try {
      const safeUrl = String(url).replace(/[()]/g, (character) => character === "(" ? "%28" : "%29");
      parsedUrl = new URL(safeUrl);
    } catch {
      return null;
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
    element.href = parsedUrl.href;
    element.className = "chat-rich-editor__link";
    element.dataset.tooltip = "Ctrl/Cmd + clic para abrir enlace";
    element.rel = "noreferrer";
  }
  if (format === "monospace") element.className = "message__monospace";
  if (format === "quote") element.className = "chat-rich-editor__quote";
  if (format === "italic") element.className = "chat-rich-editor__italic";
  if (format === "spoiler") {
    element.className = "chat-rich-editor__spoiler";
    element.dataset.tooltip = "Mostrar spoiler";
  }
  if (format === "strike") element.className = "chat-format-strike";
  return element;
}
