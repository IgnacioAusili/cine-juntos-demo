const FORMAT_MARKERS = [
  { format: "quote", marker: "❝", closingMarker: "❞" },
  { format: "quote", marker: "‘", closingMarker: "’" },
  { format: "quote", marker: "“", closingMarker: "”" },
  { format: "bold", marker: "**" },
  { format: "underline", marker: "__" },
  { format: "strike", marker: "~~" },
  { format: "spoiler", marker: "||" },
  { format: "monospace", marker: "`" },
  { format: "italic", marker: "*" },
  { format: "italic", marker: "_" },
];

export function parseInlineFormatting(value) {
  const text = String(value ?? "");
  const budget = { remaining: Math.max(512, text.length * 16) };
  const parsed = parseSequence(text, 0, null, 0, budget);
  return parsed.exhausted ? [{ type: "text", value: text }] : parsed.nodes;
}

export function hasInlineFormatting(value) {
  const containsFormat = (nodes) => nodes.some((node) => (
    node.type === "format" || containsFormat(node.children || [])
  ));
  return containsFormat(parseInlineFormatting(value));
}

function parseSequence(text, start, closing, depth, budget) {
  const nodes = [];
  let plain = "";
  let index = start;

  const flushPlain = () => {
    if (!plain) return;
    nodes.push({ type: "text", value: plain });
    plain = "";
  };

  while (index < text.length) {
    budget.remaining -= 1;
    if (budget.remaining < 0) {
      flushPlain();
      return { nodes, end: text.length, closed: false, exhausted: true };
    }
    const closingLength = getClosingLength(text, index, closing);
    if (closingLength) {
      flushPlain();
      return { nodes, end: index + closingLength, closed: true };
    }

    if (text[index] === "\\" && index + 1 < text.length && isEscapable(text[index + 1])) {
      plain += text[index + 1];
      index += 2;
      continue;
    }

    const link = readLink(text, index);
    if (link) {
      flushPlain();
      nodes.push({
        type: "format",
        format: "link",
        url: link.url,
        children: parseInlineFormatting(link.label),
      });
      index += link.length;
      continue;
    }

    const token = readOpeningMarker(text, index, closing);
    if (token && depth < 8) {
      const inner = parseSequence(text, index + token.marker.length, token, depth + 1, budget);
      if (inner.exhausted) return inner;
      if (inner.closed && inner.nodes.length) {
        flushPlain();
        nodes.push({ type: "format", format: token.format, children: inner.nodes });
        index = inner.end;
        continue;
      }
      if (
        inner.closed === false
        && closing
        && ((closing.marker === "*" && token.marker === "**")
          || (closing.marker === "_" && token.marker === "__"))
        && countMarkerRun(text, index, closing.marker) === 2
      ) {
        flushPlain();
        return { nodes, end: index + 1, closed: true };
      }
    }

    plain += text[index];
    index += 1;
  }

  flushPlain();
  return { nodes, end: text.length, closed: closing == null };
}

function readOpeningMarker(text, index, closing) {
  for (const token of FORMAT_MARKERS) {
    if (!text.startsWith(token.marker, index)) continue;
    if (token.marker === "*") {
      const runLength = countMarkerRun(text, index, "*");
      if (runLength > 1) continue;
    }
    if (token.marker === "_") {
      const runLength = countMarkerRun(text, index, "_");
      if (runLength > 1) continue;
    }
    if (closing && token.marker === closing.marker) continue;
    return token;
  }
  return null;
}

function getClosingLength(text, index, closing) {
  const closingMarker = closing?.closingMarker || closing?.marker;
  if (!closingMarker || !text.startsWith(closingMarker, index)) return 0;
  if (closing.marker === "*") {
    const runLength = countMarkerRun(text, index, "*");
    return runLength === 1 || runLength >= 3 ? 1 : 0;
  }
  if (closing.marker === "_") {
    const runLength = countMarkerRun(text, index, "_");
    return runLength === 1 || runLength >= 3 ? 1 : 0;
  }
  return closingMarker.length;
}

function countMarkerRun(text, index, marker) {
  let end = index;
  while (text[end] === marker) end += 1;
  return end - index;
}

function readLink(text, index) {
  if (text[index] !== "[") return null;
  const match = text.slice(index).match(/^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/i);
  if (!match) return null;
  try {
    const url = new URL(match[2]);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { label: match[1], url: url.href, length: match[0].length };
  } catch {
    return null;
  }
}

function isEscapable(character) {
  return "\\`*_~|[]()".includes(character);
}
