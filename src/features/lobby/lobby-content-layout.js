let lobbyCenterFrame = 0;

import { resetTitleFit, syncLobbyTitleFit, syncSingleColumnTitleGroup, resetSingleColumnTitleLift, resetSingleColumnTitleGroup, resetSingleColumnDescriptionWidth, syncLobbyTextDensity, syncLobbyTicketInlinePadding } from "./lobby-title-layout.js";
import { syncSingleColumnDescriptionWidth, syncSingleColumnContentCenter, syncSingleColumnContentGap, syncSingleColumnTicketPlacement } from "./lobby-content-variants.js";
import { resetLobbyTicketPlacement, syncLobbyTicketPlacement, syncLobbyTitlePlacement, syncSingleColumnTicketStub } from "./lobby-ticket-placement.js";

export function syncLobbyContentCenter() {
  lobbyCenterFrame = 0;
  if (!document.body.classList.contains('page-context--lobby')) return;
  // El teclado de la barra de direcciones cambia el viewport del navegador,
  // pero no debe disparar la compresión dinámica del boleto ni del lobby.
  if (
    document.body.dataset.lobbyBrowserKeyboardOpen === "true"
    && document.body.dataset.lobbyBrowserKeyboardInitializing !== "true"
  ) return;

  const isColumns = document.body.dataset.lobbyLayout === "columns";
  const screen = document.querySelector("#lobbyScreen");
  const marquee = screen?.querySelector('.lobby-screen__marquee');
  const footer = screen?.querySelector('.lobby-screen__footer');
  const grid = screen?.querySelector('.lobby-screen__grid');
  const content = screen
    ? [...screen.querySelectorAll('.lobby-screen__hero, .lobby-screen__ticket')]
    : [];
  const hero = screen?.querySelector('.lobby-screen__hero');
  const ticket = screen?.querySelector('.lobby-screen__ticket');

  // Mide siempre la geometría candidata de columnas. La transición depende
  // del espacio mínimo de ambas áreas, no del recorte de un texto concreto.
  if (isColumns && grid) document.body.dataset.lobbyFlow = "columns";
  const gridStyle = grid ? getComputedStyle(grid) : null;
  const gridColumns = gridStyle?.gridTemplateColumns.trim().split(/\s+/) ?? [];
  const cssPixels = (value) => Number.parseFloat(value);
  const minHeroWidth = cssPixels(
    gridStyle?.getPropertyValue("--lobby-columns-min-hero-inline-size"),
  );
  const minTicketWidth = cssPixels(
    gridStyle?.getPropertyValue("--lobby-columns-min-ticket-inline-size"),
  );
  const columnGap = cssPixels(gridStyle?.columnGap);
  const paddingInline = gridStyle
    ? cssPixels(gridStyle.paddingLeft) + cssPixels(gridStyle.paddingRight)
    : Number.NaN;
  const borderInline = gridStyle
    ? cssPixels(gridStyle.borderLeftWidth) + cssPixels(gridStyle.borderRightWidth)
    : Number.NaN;
  const availableInlineSize = grid
    ? grid.getBoundingClientRect().width - paddingInline - borderInline
    : Number.NaN;
  const canMeasureColumns = [
    minHeroWidth,
    minTicketWidth,
    columnGap,
    availableInlineSize,
  ].every(Number.isFinite);
  const columnsHaveRoom = canMeasureColumns
    && availableInlineSize + 0.5 >= minHeroWidth + minTicketWidth + columnGap;
  const isSingleColumn = Boolean(grid) && (
    gridColumns.length < 2 || (isColumns && canMeasureColumns && !columnsHaveRoom)
  );
  document.body.dataset.lobbyFlow = isSingleColumn ? "single-column" : "columns";
  syncLobbyTitlePlacement(screen, isSingleColumn);

  if (!grid || content.length !== 2) {
    resetTitleFit(screen?.querySelector('.lobby-screen__title'));
    resetLobbyTicketPlacement(screen, ticket);
    resetSingleColumnTitleLift(hero);
    resetSingleColumnTitleGroup(hero);
    resetSingleColumnDescriptionWidth(hero);
    syncLobbyTextDensity(hero, footer);
    syncLobbyTicketInlinePadding(ticket);
    grid?.style.setProperty("--lobby-content-center-shift", "0px");
    return;
  }

  if (isSingleColumn) {
    resetLobbyTicketPlacement(screen, ticket);
    syncSingleColumnTicketStub(ticket);
    grid.style.setProperty("--lobby-content-center-shift", "0px");
    resetSingleColumnTitleLift(hero);
    resetSingleColumnTitleGroup(hero);
    grid.style.removeProperty("--lobby-vertical-content-gap");
    // En una sola columna el boleto está debajo; no debe limitar el título
    // como si ocupara una segunda columna lateral.
    if (window.matchMedia("(max-width: 680px)").matches) {
      resetTitleFit(screen.querySelector('.lobby-screen__title'));
    } else {
      syncLobbyTitleFit(screen, hero, null);
    }
    syncLobbyTitlePlacement(screen, true);
    syncSingleColumnTitleGroup(hero);
    syncSingleColumnDescriptionWidth(hero, ticket);
    syncLobbyTextDensity(hero, footer);
    syncLobbyTicketInlinePadding(ticket);
    syncSingleColumnContentGap(grid, ticket, footer);
    syncSingleColumnTicketPlacement(hero, ticket, footer);
    syncSingleColumnContentCenter(screen, grid, hero, ticket, footer);
    return;
  }

  resetSingleColumnDescriptionWidth(hero);
  resetSingleColumnTitleLift(hero);
  resetSingleColumnTitleGroup(hero);
  hero?.style.removeProperty("translate");

  if (!isColumns || !marquee || !footer) {
    resetTitleFit(screen?.querySelector('.lobby-screen__title'));
    resetLobbyTicketPlacement(screen, ticket);
    grid.style.setProperty("--lobby-content-center-shift", "0px");
    return;
  }

  // Medimos siempre desde la posición base para no acumular el desplazamiento
  // anterior al cambiar de viewport o al cambiar la variante.
  grid.style.setProperty("--lobby-content-center-shift", "0px");
  syncLobbyTicketPlacement(screen, ticket);
  syncLobbyTicketInlinePadding(ticket);
  syncLobbyTextDensity(hero, footer);
  syncLobbyTitleFit(screen, hero, ticket);
  syncLobbyTitlePlacement(screen, false);

  const marqueeRect = marquee.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const contentRects = content.map((element) => element.getBoundingClientRect());
  const contentTop = Math.min(...contentRects.map((rect) => rect.top));
  const contentBottom = Math.max(...contentRects.map((rect) => rect.bottom));
  const availableCenter = (marqueeRect.bottom + footerRect.top) / 2;
  const contentCenter = (contentTop + contentBottom) / 2;
  const contentShift = availableCenter - contentCenter;

  if (Number.isFinite(contentShift)) {
    grid.style.setProperty("--lobby-content-center-shift", `${contentShift.toFixed(2)}px`);

    // El hero puede tener un levantamiento visual propio; por eso centrar el
    // grupo completo deja el boleto bajo su centro disponible. Alineamos el
    // boleto con el punto medio real entre marquesina y pie, sin usar medidas
    // fijas del viewport.
    const centeredTicketRect = ticket.getBoundingClientRect();
    const centeredTicketMiddle = (centeredTicketRect.top + centeredTicketRect.bottom) / 2;
    const ticketShift = availableCenter - centeredTicketMiddle;
    if (Number.isFinite(ticketShift)) {
      ticket.style.setProperty("translate", `0px ${ticketShift.toFixed(2)}px`);
    }
  }
}

export function scheduleLobbyContentCenter() {
  if (lobbyCenterFrame) cancelAnimationFrame(lobbyCenterFrame);
  lobbyCenterFrame = requestAnimationFrame(syncLobbyContentCenter);
}
