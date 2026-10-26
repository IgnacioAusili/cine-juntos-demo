const BLOCK_TAGS = new Set(["DIV", "P"]);

export function buildTextModel(editor) {
  const points = [{ node: editor, offset: 0 }];
  const boundaries = new Map();
  let text = "";
  const rememberBoundary = (node, offset) => {
    if (!boundaries.has(node)) boundaries.set(node, new Map());
    boundaries.get(node).set(offset, text.length);
  };
  rememberBoundary(editor, 0);
  const appendNewline = (node, offset) => {
    if (text.endsWith("\n")) return;
    text += "\n";
    points.push({ node, offset });
    rememberBoundary(node, offset);
  };
  const walk = (parent) => {
    const children = [...parent.childNodes];
    children.forEach((child, index) => {
      rememberBoundary(parent, index);
      if (child.nodeType === Node.TEXT_NODE) {
        const isPlainBoundary = parent.dataset?.richEditorPlainBoundary === "true";
        for (let offset = 0; offset <= child.nodeValue.length; offset += 1) {
          rememberBoundary(child, offset);
          if (offset < child.nodeValue.length) {
            if (isPlainBoundary && child.nodeValue[offset] === "\u200B") {
              points[text.length] = { node: child, offset: offset + 1 };
              continue;
            }
            text += child.nodeValue[offset];
            points.push({ node: child, offset: offset + 1 });
          }
        }
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === "BR") {
        appendNewline(parent, index + 1);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (BLOCK_TAGS.has(child.tagName) && text && !text.endsWith("\n")) appendNewline(parent, index);
        walk(child);
        if (BLOCK_TAGS.has(child.tagName) && index < children.length - 1) appendNewline(parent, index + 1);
      }
      rememberBoundary(parent, index + 1);
    });
  };
  walk(editor);
  return { text, points, boundaries };
}

export function findPointIndex(model, node, offset) {
  const exact = model.boundaries.get(node)?.get(offset);
  if (exact != null) return exact;
  let ancestor = node.parentNode;
  while (ancestor && !model.boundaries.has(ancestor)) ancestor = ancestor.parentNode;
  if (!ancestor) return model.text.length;
  const childIndex = [...ancestor.childNodes].indexOf(node);
  return model.boundaries.get(ancestor)?.get(Math.max(0, childIndex)) ?? 0;
}
