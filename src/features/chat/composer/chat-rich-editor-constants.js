export const BLOCK_TAGS = new Set(["DIV", "P"]);
export const RICH_FORMAT_MARKERS = {
  quote: ["❝", "❞"],
  bold: ["**", "**"],
  italic: ["*", "*"],
  monospace: ["\x60", "\x60"],
  underline: ["__", "__"],
  strike: ["~~", "~~"],
  spoiler: ["||", "||"],
};
export const RICH_EDITOR_CARET_MARKER = "\u200B";
export const AUTO_LINK_PATTERN = /https?:\/\/[^\s<>"'\x60]+/gi;
export const TYPED_MARKUP_FORMATS = [
  { format: "quote", pattern: /❝([^❝❞\n]+)❞$/ },
  { format: "quote", pattern: /‘([^‘’\n]+)’$/ },
  { format: "quote", pattern: /“([^“”\n]+)”$/ },
  { format: "bold", pattern: /\*\*([^*\n]+)\*\*$/ },
  { format: "italic", pattern: /\*([^*\n]+)\*$/ },
  { format: "italic", pattern: /_([^_\n]+)_$/ },
  { format: "monospace", pattern: /\x60([^\x60\n]+)\x60$/ },
  { format: "underline", pattern: /__([^_\n]+)__$/ },
  { format: "strike", pattern: /~~([^~\n]+)~~$/ },
  { format: "spoiler", pattern: /\|\|([^|\n]+)\|\|$/ },
  { format: "link", pattern: /\[([^\]\n]+)\]\(((?:https?:\/\/)?[^\s)]+)\)$/ },
];
