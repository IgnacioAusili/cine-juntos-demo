const TITLE_ICON_SCALE = 0.95;
const TITLE_ICON_MIN_SIZE_PX = 56;
const TITLE_ICON_MAX_SIZE_PX = 160;
const LOBBY_TICKET_COMPACT_STUB_MAX_WIDTH_PX = 320;
const LOBBY_TICKET_COMPACT_STUB_WIDTH_PX = 28;

function syncLobbyTitleIconSize(title, icon) {
  const fontSize = Number.parseFloat(getComputedStyle(title).fontSize);
  const iconStyle = getComputedStyle(icon);
  const configuredScale = Number.parseFloat(
    iconStyle.getPropertyValue("--lobby-title-icon-scale"),
  );
  const configuredMinimum = Number.parseFloat(
    iconStyle.getPropertyValue("--lobby-title-icon-min-size-px"),
  );
  if (!Number.isFinite(fontSize)) return;

  const scale = Number.isFinite(configuredScale) && configuredScale > 0
    ? configuredScale
    : TITLE_ICON_SCALE;
  const minimum = Number.isFinite(configuredMinimum) && configuredMinimum >= 0
    ? configuredMinimum
    : TITLE_ICON_MIN_SIZE_PX;
  const size = Math.min(
    TITLE_ICON_MAX_SIZE_PX,
    Math.max(minimum, fontSize * scale),
  );
  const sizeValue = `${size.toFixed(2)}px`;
  icon.style.setProperty("width", sizeValue);
  icon.style.setProperty("height", sizeValue);
}

export function resetLobbyTicketPlacement(screen, ticket) {
  ticket?.style.removeProperty("--lobby-ticket-stub-width");
  ticket?.style.removeProperty("translate");
  screen?.style.removeProperty("--lobby-ticket-right-shift");
}

export function syncLobbyTicketStubWidth(ticket) {
  if (!ticket) return;

  const ticketWidth = ticket.getBoundingClientRect().width;
  if (ticketWidth <= LOBBY_TICKET_COMPACT_STUB_MAX_WIDTH_PX) {
    ticket.style.setProperty(
      "--lobby-ticket-stub-width",
      `${LOBBY_TICKET_COMPACT_STUB_WIDTH_PX}px`,
    );
  } else {
    ticket.style.removeProperty("--lobby-ticket-stub-width");
  }
}

export function syncLobbyTitlePlacement(screen, isSingleColumn) {
  const hero = screen?.querySelector('.lobby-screen__hero');
  const title = hero?.querySelector('.lobby-screen__title');
  const icon = hero?.querySelector('.lobby-screen__title-icon');
  if (!hero) return;

  // El grid alinea el ícono con el título; acá solo se sincroniza su tamaño.
  icon?.style.removeProperty("transform");
  if (!title || !icon) {
    delete hero.dataset.titlePlacement;
    icon?.style.removeProperty("position");
    icon?.style.removeProperty("left");
    icon?.style.removeProperty("top");
    return;
  }

  if (!isSingleColumn) {
    delete hero.dataset.titlePlacement;
    icon.style.removeProperty("position");
    icon.style.removeProperty("left");
    icon.style.removeProperty("top");
    syncLobbyTitleIconSize(title, icon);

    return;
  }

  hero.dataset.titlePlacement = "centered";
  hero.style.removeProperty("--lobby-title-group-shift");
  icon.style.removeProperty("width");
  icon.style.removeProperty("height");
  icon.style.removeProperty("position");
  icon.style.removeProperty("left");
  icon.style.removeProperty("top");
  icon.style.removeProperty("transform");
}
