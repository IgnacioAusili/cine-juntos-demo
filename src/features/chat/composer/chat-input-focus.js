const MOBILE_LAYOUT_QUERY = "(max-width: 980px)";

function isMobileLayout() {
  return Boolean(
    window.matchMedia
    && window.matchMedia(MOBILE_LAYOUT_QUERY).matches,
  );
}

export function focusChatInput(input, selectionStart, selectionEnd) {
  if (!input) return;

  const isMobile = isMobileLayout();
  const isRichEditor = input.isContentEditable || input.hasAttribute("contenteditable");
  const selection = isRichEditor ? input.ownerDocument.getSelection() : null;
  const currentRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const savedRange = currentRange
    && input.contains(currentRange.startContainer)
    && input.contains(currentRange.endContainer)
    ? currentRange.cloneRange()
    : null;
  const wasReadOnly = input.readOnly;
  if (isMobile && !isRichEditor) input.readOnly = true;
  input.focus({ preventScroll: true });
  if (isMobile && !isRichEditor) input.readOnly = wasReadOnly;

  if (isRichEditor && selectionStart == null && selectionEnd == null) {
    if (savedRange) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    return;
  }

  if (typeof input.setSelectionRange !== "function") return;
  const start = selectionStart ?? input.selectionStart ?? input.value.length;
  const end = selectionEnd ?? input.selectionEnd ?? start;
  input.setSelectionRange(start, end);
}

export function wireChatInputCorrections(inputs) {
  inputs.forEach((input) => {
    if (!input) return;
    input.setAttribute("autocapitalize", "sentences");
    input.setAttribute("autocorrect", "on");
    input.setAttribute("spellcheck", "true");
  });
}
