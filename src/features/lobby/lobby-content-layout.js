let lobbyCenterFrame = 0;

import { resetTitleFit, syncLobbyTitleFit, syncSingleColumnTitleGroup, resetSingleColumnTitleLift, resetSingleColumnTitleGroup, resetSingleColumnDescriptionWidth, syncLobbyTextDensity, syncLobbyTicketInlinePadding } from "./lobby-title-layout.js";
import { syncSingleColumnDescriptionWidth, syncSingleColumnContentCenter, syncSingleColumnContentGap } from "./lobby-content-variants.js";
import { resetLobbyTicketFit, syncColumnsTicketFit, syncSingleColumnTicketPlacement } from "./lobby-ticket-fit.js";
import { resetLobbyTicketPlacement, syncLobbyTicketStubWidth, syncLobbyTitlePlacement } from "./lobby-ticket-placement.js";

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
