const wheelScrollableContainers = new WeakSet();
const horizontalScrollIndicators = new Set();
const windowsWithIndicatorRefresh = new WeakSet();

function updateHorizontalScrollIndicator(container, shell) {
  const track = shell?.querySelector(".composer-scrollbar--horizontal");
  const thumb = track?.querySelector(".composer-scrollbar__thumb");
  if (!container || !shell || !track || !thumb) return;

  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  if (maxScroll <= 1) {
    container.removeAttribute("data-horizontal-overflow");
    shell.removeAttribute("data-scrollbar-visible");
    thumb.style.width = "";
    thumb.style.transform = "";
    return;
  }

  container.setAttribute("data-horizontal-overflow", "true");
  shell.setAttribute("data-scrollbar-visible", "true");

  const trackWidth = track.clientWidth;
  if (trackWidth <= 0) return;

  const thumbWidth = Math.max(10, Math.min(
    trackWidth,
    Math.round(trackWidth * container.clientWidth / container.scrollWidth),
  ));
  const maxOffset = Math.max(0, trackWidth - thumbWidth);
  const scrollRatio = container.scrollLeft / maxScroll;
  const offset = Math.round(maxOffset * scrollRatio);

  thumb.style.width = `${thumbWidth}px`;
  thumb.style.transform = `translateX(${offset}px)`;
}

function refreshHorizontalScrollIndicators() {
  horizontalScrollIndicators.forEach((entry) => {
    const container = entry.container.deref();
    const shell = entry.shell.deref();
    if (!container || !shell) {
      horizontalScrollIndicators.delete(entry);
      return;
    }

    updateHorizontalScrollIndicator(container, shell);
  });
}

function registerHorizontalScrollIndicator(container, shell) {
  const view = container.ownerDocument.defaultView;
  if (!view || typeof WeakRef !== "function") return;

  const entry = {
    container: new WeakRef(container),
    shell: new WeakRef(shell),
  };
  horizontalScrollIndicators.add(entry);
  if (!windowsWithIndicatorRefresh.has(view)) {
    windowsWithIndicatorRefresh.add(view);
    view.addEventListener("resize", refreshHorizontalScrollIndicators, { passive: true });
    view.addEventListener("chat-layout-settled", refreshHorizontalScrollIndicators, { passive: true });
  }
  view.requestAnimationFrame(() => updateHorizontalScrollIndicator(container, shell));
}

export function enableHorizontalWheelScroll(container, indicatorShell = null) {
  if (!container || wheelScrollableContainers.has(container)) return;

  wheelScrollableContainers.add(container);
  if (indicatorShell) {
    const updateIndicator = () => updateHorizontalScrollIndicator(container, indicatorShell);
    container.addEventListener("scroll", updateIndicator, { passive: true });
    registerHorizontalScrollIndicator(container, indicatorShell);
  }

  container.addEventListener("wheel", (event) => {
    if (event.ctrlKey) return;

    const delta = event.deltaX || event.deltaY;
    if (!delta) return;

    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll <= 1) return;

    const lineHeight = Number.parseFloat(
      container.ownerDocument.defaultView?.getComputedStyle(container).lineHeight,
    ) || 16;
    const multiplier = event.deltaMode === 1
      ? lineHeight
      : event.deltaMode === 2
        ? container.clientWidth
        : 1;
    const currentScroll = container.scrollLeft;
    const nextScroll = Math.max(0, Math.min(maxScroll, currentScroll + (delta * multiplier)));

    event.preventDefault();
    event.stopPropagation();
    container.scrollLeft = nextScroll;
  }, { passive: false });
}
