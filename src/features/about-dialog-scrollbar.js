const TRACK_SELECTOR = '.about-dialog__scrollbar';
const THUMB_SELECTOR = '.about-dialog__scrollbar-thumb';
const HEADER_SELECTOR = '.about-dialog__fixed-header';
const CONTENT_SELECTOR = '.about-dialog__content';
const MOBILE_LAYOUT_QUERY = '(max-width: 680px)';
const SCROLL_RANGE_TOLERANCE = 1;

function syncScrollArea(card, content) {
  const isMobileLayout = window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
  const scrollArea = isMobileLayout ? card : content;
  const inactiveScrollArea = isMobileLayout ? content : card;
  inactiveScrollArea.scrollTop = 0;
  inactiveScrollArea.style.removeProperty('overflow-y');

  const maxScroll = Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
  const scrollAreaRect = scrollArea.getBoundingClientRect();
  const visibleTop = scrollAreaRect.top + scrollArea.clientTop;
  const visibleBottom = visibleTop + scrollArea.clientHeight;
  const contentElements = isMobileLayout ? card.children : content.children;
  const contentExtendsPastVisibleArea = [...contentElements].some((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top < visibleTop - SCROLL_RANGE_TOLERANCE
      || rect.bottom > visibleBottom + SCROLL_RANGE_TOLERANCE;
  });
  const canScroll = maxScroll > SCROLL_RANGE_TOLERANCE && contentExtendsPastVisibleArea;

  if (canScroll) {
    scrollArea.style.removeProperty('overflow-y');
  } else {
    scrollArea.scrollTop = 0;
    scrollArea.style.overflowY = 'hidden';
  }

  return { isMobileLayout, canScroll, maxScroll };
}

function syncScrollbar(dialog, card, content, header, track, thumb) {
  if (!dialog.open) {
    track.hidden = true;
    return;
  }

  const scrollState = syncScrollArea(card, content);
  const dialogTop = dialog.getBoundingClientRect().top;
  const headerBottom = header.getBoundingClientRect().bottom;
  const dialogBorderTop = Number.parseFloat(getComputedStyle(dialog).borderTopWidth) || 0;
  const trackTop = Math.max(0, headerBottom - dialogTop - dialogBorderTop + 2);
  track.style.setProperty('--about-dialog-scrollbar-top', `${trackTop}px`);

  track.hidden = !scrollState.isMobileLayout || !scrollState.canScroll;
  if (track.hidden) return;

  const trackHeight = track.clientHeight;
  const thumbHeight = Math.min(128, trackHeight);
  const travel = Math.max(0, trackHeight - thumbHeight);
  const progress = Math.min(1, Math.max(0, card.scrollTop / scrollState.maxScroll));

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${travel * progress}px)`;
}

export function wireAboutDialogScrollbar() {
  const dialog = document.querySelector("#aboutDialog");
  const card = dialog?.querySelector('.about-dialog__card');
  const content = dialog?.querySelector(CONTENT_SELECTOR);
  const header = dialog?.querySelector(HEADER_SELECTOR);
  const track = dialog?.querySelector(TRACK_SELECTOR);
  const thumb = track?.querySelector(THUMB_SELECTOR);
  if (!dialog || !card || !content || !header || !track || !thumb) return;

  let frame = 0;
  let hideTimer = 0;
  const scheduleSync = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      syncScrollbar(dialog, card, content, header, track, thumb);
    });
  };

  const showWhileScrolling = () => {
    track.classList.add('u-visible');
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      track.classList.remove('u-visible');
    }, 700);
  };

  const handleScroll = () => {
    if (window.matchMedia(MOBILE_LAYOUT_QUERY).matches) showWhileScrolling();
    scheduleSync();
  };

  card.addEventListener("scroll", handleScroll, { passive: true });
  content.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", scheduleSync, { passive: true });
  dialog.addEventListener("close", () => {
    window.clearTimeout(hideTimer);
    track.classList.remove('u-visible');
    track.hidden = true;
    card.style.removeProperty('overflow-y');
    content.style.removeProperty('overflow-y');
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#aboutButton")) scheduleSync();
  }, { passive: true });

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(scheduleSync);
    [card, header, content, ...content.children].forEach((element) => observer.observe(element));
  }

  scheduleSync();
}
