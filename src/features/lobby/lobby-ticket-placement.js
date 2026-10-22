const TITLE_ICON_SCALE = 0.95;
const TITLE_ICON_MIN_SIZE_PX = 56;
const TITLE_ICON_MAX_SIZE_PX = 160;
const LOBBY_TICKET_TOP_STUB_MAX_SIDE_WIDTH_PX = 260;

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
  document.body.removeAttribute("data-lobby-ticket-stub");
  ticket?.style.removeProperty("translate");
  screen?.style.removeProperty("--lobby-ticket-right-shift");
}

export function syncSingleColumnTicketStub(ticket) {
  if (!ticket) return;

  document.body.removeAttribute("data-lobby-ticket-stub");
  if (ticket.getBoundingClientRect().width <= LOBBY_TICKET_TOP_STUB_MAX_SIDE_WIDTH_PX) {
    document.body.dataset.lobbyTicketStub = "top";
  }
}

export function syncLobbyTicketPlacement(screen, ticket) {
  if (!screen || !ticket) return;

  const grid = screen.querySelector('.lobby-screen__grid');
  if (!grid) return;

  // El grid ya centra el boleto en su segunda pista. Quitar cualquier
  // desplazamiento antiguo evita que el boleto quede corrido al redimensionar.
  ticket.style.removeProperty("translate");

  const columns = getComputedStyle(grid).gridTemplateColumns
    .trim()
    .split(/\s+/)
    .map((track) => Number.parseFloat(track));
  const ticketTrackWidth = columns[1];
  if (!Number.isFinite(ticketTrackWidth)) return;

  // El modo horizontal reduce el ancho del boleto. Si el umbral se calcula
  // sobre el modo actualmente aplicado, el boleto entra y sale del umbral en
  // cada ciclo de ResizeObserver y parpadea entre ambas disposiciones.
  // Medir siempre el estado lateral hace que la decisión sea estable.
  document.body.removeAttribute("data-lobby-ticket-stub");
  const sideTicketRect = ticket.getBoundingClientRect();
  const sideNeedsTopStub = sideTicketRect.width > ticketTrackWidth;
  const stubMode = sideNeedsTopStub ? "top" : "side";
  document.body.dataset.lobbyTicketStub = stubMode;
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
