let lobbyCenterFrame = 0;

import { resetTitleFit, syncLobbyTitleFit, syncSingleColumnTitleGroup, resetSingleColumnTitleLift, resetSingleColumnTitleGroup, resetSingleColumnDescriptionWidth, syncLobbyTextDensity, syncLobbyTicketInlinePadding } from "./lobby-title-layout.js";
import { syncSingleColumnDescriptionWidth, syncSingleColumnContentCenter, syncSingleColumnContentGap } from "./lobby-content-variants.js";
import {
  getLobbyColumnsAvailableHeight,
  resetLobbyTicketFit,
  syncColumnsTicketFit,
  syncSingleColumnTicketPlacement,
} from "./lobby-ticket-fit.js";
import { resetLobbyTicketPlacement, syncLobbyTicketStubWidth, syncLobbyTitlePlacement } from "./lobby-ticket-placement.js";
import { isLobbySoftKeyboardFocusPending } from "./lobby-keyboard-state.js";

function syncLobbyTicketTrackSize(screen, grid, ticket, marquee, footer, isColumns) {
  if (!grid) return;

  if (
    document.body.dataset.lobbyKeyboardOpen === "true"
    || document.body.dataset.lobbyBrowserKeyboardOpen === "true"
    || isLobbySoftKeyboardFocusPending()
  ) return;

  grid.style.removeProperty("--lobby-ticket-adaptive-track-size");
  grid.style.removeProperty("--lobby-ticket-adaptive-scale");
  if (
    !isColumns
    || !ticket
    || !window.matchMedia("(min-width: 981px) and (min-height: 501px)").matches
  ) return;

  resetLobbyTicketFit(ticket);

  const gridStyle = getComputedStyle(grid);
  const cssPixels = (value) => Number.parseFloat(value);
  const baseTrackSize = cssPixels(
    gridStyle.getPropertyValue("--lobby-ticket-base-track-size"),
  ) || 404;
  const maxTrackSize = cssPixels(
    gridStyle.getPropertyValue("--lobby-ticket-max-track-size"),
  ) || 460;
  const ticketShare = cssPixels(
    gridStyle.getPropertyValue("--lobby-ticket-track-share"),
  ) || 0.42;
  const minHeroWidth = cssPixels(
    gridStyle.getPropertyValue("--lobby-columns-min-hero-inline-size"),
  ) || 540;
  const columnGap = cssPixels(gridStyle.columnGap);
  const paddingInline = cssPixels(gridStyle.paddingLeft) + cssPixels(gridStyle.paddingRight);
  const borderInline = cssPixels(gridStyle.borderLeftWidth) + cssPixels(gridStyle.borderRightWidth);
  const availableInlineSize = grid.getBoundingClientRect().width - paddingInline - borderInline;
  const availableTrackSize = availableInlineSize - columnGap;
  const ticketHeight = ticket.getBoundingClientRect().height;
  const availableHeight = getLobbyColumnsAvailableHeight(screen, grid, marquee, footer);
  const clearance = Math.min(18, Math.max(8, availableHeight * 0.05), availableHeight / 4);
  const heightForGrowth = Math.max(0, availableHeight - clearance * 2);
  const heightLimitedWidth = ticketHeight > 0
    ? baseTrackSize * heightForGrowth / ticketHeight
    : baseTrackSize;
  const widthLimitedWidth = Math.min(
    maxTrackSize,
    availableTrackSize * ticketShare,
    availableTrackSize - minHeroWidth,
  );
  const targetTrackSize = Math.min(
    Math.max(baseTrackSize, widthLimitedWidth),
    Math.max(baseTrackSize, heightLimitedWidth),
  );

  if (targetTrackSize > baseTrackSize + 0.5) {
    grid.style.setProperty(
      "--lobby-ticket-adaptive-track-size",
      `${targetTrackSize.toFixed(2)}px`,
    );
    grid.style.setProperty(
      "--lobby-ticket-adaptive-scale",
      (targetTrackSize / baseTrackSize).toFixed(4),
    );
  }
}

export function syncLobbyContentCenter() {
  lobbyCenterFrame = 0;
  if (!document.body.classList.contains('page-context--lobby')) return;
  // El teclado virtual reduce el viewport y puede activar reglas de poca
  // altura. Durante ese estado, el contenido vuelve al flujo natural en vez
  // de recentrarse contra el espacio que deja el teclado.
  if (document.body.dataset.lobbyKeyboardOpen === "true") {
    const screen = document.querySelector("#lobbyScreen");
    screen?.querySelector(".lobby-screen__hero")?.style.removeProperty("translate");
    screen?.querySelector(".lobby-screen__ticket")?.style.removeProperty("translate");
    screen?.querySelector(".lobby-screen__app-invite")?.style.removeProperty(
      "--lobby-app-invite-center-shift",
    );
    return;
  }

  // El teclado de la barra de direcciones no debe comprimir el lienzo.
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

  syncLobbyTicketTrackSize(screen, grid, ticket, marquee, footer, isColumns);

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
  if (!isSingleColumn) resetLobbyTicketFit(ticket);
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
    syncLobbyTicketStubWidth(ticket);
    grid.style.setProperty("--lobby-content-center-shift", "0px");
    resetSingleColumnTitleLift(hero);
    resetSingleColumnTitleGroup(hero);
    grid.style.removeProperty("--lobby-vertical-content-gap");
    // En una sola columna el boleto está debajo: no debe reducir el título.
    // El ancho disponible ya se controla desde la escala del hero.
    resetTitleFit(screen.querySelector('.lobby-screen__title'));
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

  if (!isColumns || !footer) {
    resetTitleFit(screen?.querySelector('.lobby-screen__title'));
    resetLobbyTicketPlacement(screen, ticket);
    grid.style.setProperty("--lobby-content-center-shift", "0px");
    return;
  }

  // En dos columnas el centro vertical lo determina la pista disponible de la
  // grilla, que ya reserva espacio para el pie en el layout apaisado.
  grid.style.removeProperty("--lobby-content-center-shift");
  syncColumnsTicketFit(screen, grid, ticket, marquee, footer);
  syncLobbyTicketStubWidth(ticket);
  syncLobbyTicketInlinePadding(ticket);
  syncLobbyTextDensity(hero, footer);
  syncLobbyTitleFit(screen, hero, ticket);
  syncLobbyTitlePlacement(screen, false);
}

export function scheduleLobbyContentCenter() {
  if (lobbyCenterFrame) cancelAnimationFrame(lobbyCenterFrame);
  lobbyCenterFrame = requestAnimationFrame(syncLobbyContentCenter);
}
