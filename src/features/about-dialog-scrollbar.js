const TRACK_SELECTOR = '.about-dialog__scrollbar';
const THUMB_SELECTOR = '.about-dialog__scrollbar-thumb';
const HEADER_SELECTOR = '.about-dialog__fixed-header';

function syncScrollbar(dialog, card, header, track, thumb) {
  if (!dialog.open) {
    track.hidden = true;
    return;
  }

  const dialogTop = dialog.getBoundingClientRect().top;
  const headerBottom = header.getBoundingClientRect().bottom;
  const dialogBorderTop = Number.parseFloat(getComputedStyle(dialog).borderTopWidth) || 0;
  const trackTop = Math.max(0, headerBottom - dialogTop - dialogBorderTop + 2);
  track.style.setProperty('--about-dialog-scrollbar-top', `${trackTop}px`);

  const maxScroll = Math.max(0, card.scrollHeight - card.clientHeight);
  track.hidden = maxScroll <= 0;
  if (track.hidden) return;

  const trackHeight = track.clientHeight;
  const thumbHeight = Math.min(128, trackHeight);
  const travel = Math.max(0, trackHeight - thumbHeight);
  const progress = Math.min(1, Math.max(0, card.scrollTop / maxScroll));

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${travel * progress}px)`;
}

export function wireAboutDialogScrollbar() {
  const dialog = document.querySelector("#aboutDialog");
  const card = dialog?.querySelector('.about-dialog__card');
  const header = dialog?.querySelector(HEADER_SELECTOR);
  const track = dialog?.querySelector(TRACK_SELECTOR);
  const thumb = track?.querySelector(THUMB_SELECTOR);
  if (!dialog || !card || !header || !track || !thumb) return;

  let frame = 0;
  let hideTimer = 0;
  const scheduleSync = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      syncScrollbar(dialog, card, header, track, thumb);
    });
  };

  const showWhileScrolling = () => {
    track.classList.add('u-visible');
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      track.classList.remove('u-visible');
    }, 700);
  };

  card.addEventListener("scroll", () => {
    showWhileScrolling();
    scheduleSync();
  }, { passive: true });
  window.addEventListener("resize", scheduleSync, { passive: true });
  dialog.addEventListener("close", () => {
    window.clearTimeout(hideTimer);
    track.classList.remove('u-visible');
    track.hidden = true;
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#aboutButton")) scheduleSync();
  }, { passive: true });

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(scheduleSync);
    observer.observe(card);
    observer.observe(header);
  }

  scheduleSync();
}
