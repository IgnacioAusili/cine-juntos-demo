export function syncSingleColumnDescriptionWidth(hero, ticket) {
  if (!hero || !ticket) return;

  const description = hero.querySelector('.lobby-screen__description');
  if (!description) return;

  const descriptionWidth = Math.max(hero.clientWidth, ticket.clientWidth);
  if (descriptionWidth > 0) {
    description.style.setProperty("--lobby-description-fit-width", `${descriptionWidth.toFixed(2)}px`);
  } else {
    description.style.removeProperty("--lobby-description-fit-width");
  }
}

export function syncSingleColumnContentGap(grid, ticket, footer) {
  if (!grid || !ticket || !footer) return;

  // Cada ciclo parte de la separación declarada por CSS y solo la reduce si
  // el contenido real invade el espacio ocupado por el footer fijo.
  grid.style.removeProperty("--lobby-vertical-content-gap");
  const baseGap = Number.parseFloat(getComputedStyle(grid).rowGap);
  if (!Number.isFinite(baseGap)) return;

  const ticketRect = ticket.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const overlap = ticketRect.bottom - footerRect.top;
  if (overlap <= 0) return;

  const gap = Math.max(0, baseGap - overlap);
  grid.style.setProperty("--lobby-vertical-content-gap", `${gap.toFixed(2)}px`);
}

function centerHeroInAvailableSpace(hero, availableTop, availableBottom) {
  const heroRect = hero.getBoundingClientRect();
  const availableHeight = availableBottom - availableTop;
  if (availableHeight < heroRect.height) return;

  const minimumShift = availableTop - heroRect.top;
  const maximumShift = availableBottom - heroRect.bottom;
  const centeredShift = (availableTop + availableBottom - heroRect.top - heroRect.bottom) / 2;
  const shift = Math.min(maximumShift, Math.max(minimumShift, centeredShift));

  if (Number.isFinite(shift)) {
    hero.style.setProperty("translate", `0px ${shift.toFixed(2)}px`);
  }
}

export function syncSingleColumnContentCenter(screen, grid, hero, ticket, footer) {
  if (!screen || !grid || !hero || !ticket || !footer) return;

  const appInvite = screen.querySelector('.lobby-screen__app-invite');
  const ticketWidth = ticket.getBoundingClientRect().width;
  if (appInvite && ticketWidth > 0) {
    const inviteWidth = `${ticketWidth.toFixed(2)}px`;
    if (appInvite.style.getPropertyValue("--lobby-app-invite-ticket-width") !== inviteWidth) {
      appInvite.style.setProperty("--lobby-app-invite-ticket-width", inviteWidth);
    }
  }
  appInvite?.style.removeProperty("--lobby-app-invite-center-shift");
  appInvite?.removeAttribute("data-density");
  grid.style.setProperty("--lobby-content-center-shift", "0px");
  if (
    document.body.dataset.lobbyInputFocused === "true"
    || document.body.dataset.lobbyKeyboardOpen === "true"
  ) return;

  hero.style.setProperty("translate", "0px 0px");
  const screenRect = screen.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const visualViewport = window.visualViewport;
  const viewportTop = visualViewport?.offsetTop ?? 0;
  const restingViewportHeight = document.body.dataset.lobbyBrowserKeyboardInitializing === "true"
    ? Number.parseFloat(document.body.style.getPropertyValue("--lobby-resting-viewport-height"))
    : 0;
  const viewportHeight = restingViewportHeight || visualViewport?.height || window.innerHeight;
  const viewportBottom = viewportTop + viewportHeight;
  const availableTop = Math.max(screenRect.top, viewportTop);
  const availableBottom = Math.min(screenRect.bottom, viewportBottom);
  const availableCenter = (availableTop + availableBottom) / 2;
  const footerLegal = footer.querySelector('.lobby-screen__disclaimer');
  const contentBottom = Math.min(
    availableBottom,
    footerLegal?.getBoundingClientRect().top ?? footerRect.top,
  );
  const inviteBottom = Math.min(contentBottom, footerRect.top);
  const heroRect = hero.getBoundingClientRect();
  const ticketRect = ticket.getBoundingClientRect();
  const heroTicketGap = Math.max(0, ticketRect.top - heroRect.bottom);
  const declaredGridGap = Number.parseFloat(getComputedStyle(grid).rowGap) || heroTicketGap;
  const minimumHeroTicketGap = Math.min(heroTicketGap, Math.max(8, declaredGridGap - 4));
  const minimumTop = heroRect.bottom + minimumHeroTicketGap;

  // El boleto conserva su centro vertical. El panel ocupa el hueco restante.
  const centeredTop = availableCenter - ticketRect.height / 2;
  const maximumTop = contentBottom - ticketRect.height;
  let targetTop = Math.min(maximumTop, Math.max(minimumTop, centeredTop));
  let inviteRect = null;
  let inviteRequiredHeight = 0;

  // La tarjeta conserva su densidad solo si mantiene espacio a ambos lados y
  // queda separada del pie completo, incluido su botón.
  const measureInviteRequiredHeight = () => {
    inviteRect = appInvite.getBoundingClientRect();
    const inviteStyle = getComputedStyle(appInvite);
    const topMargin = Math.max(0, Number.parseFloat(inviteStyle.marginBlockStart) || 0);
    const bottomMargin = Math.max(0, Number.parseFloat(inviteStyle.marginBlockEnd) || 0);
    const compactClearance = Math.max(
      0,
      Number.parseFloat(inviteStyle.getPropertyValue("--lobby-app-invite-compact-clearance")) || 0,
    );
    const minimumClearance = appInvite.dataset.density === "compact"
      ? compactClearance
      : appInvite.dataset.density === "minimal"
        ? 0
        : Math.max(topMargin, bottomMargin);
    inviteRequiredHeight = inviteRect.height + minimumClearance * 2;
  };

  if (appInvite?.getClientRects().length) {
    // Priorizamos la tarjeta más completa que quepa. Antes de bajar densidad,
    // usamos el espacio libre entre el título y el boleto para subir este último.
    for (const density of [null, "compact", "minimal"]) {
      if (density) appInvite.dataset.density = density;
      else appInvite.removeAttribute("data-density");

      measureInviteRequiredHeight();
      const ticketBottom = ticketRect.bottom + targetTop - ticketRect.top;
      const availableInviteHeight = Math.max(0, inviteBottom - ticketBottom);
      if (inviteRequiredHeight <= availableInviteHeight) break;

      const ticketTopWithInvite = inviteBottom - ticketRect.height - inviteRequiredHeight;
      if (ticketTopWithInvite >= minimumTop && ticketTopWithInvite < targetTop) {
        targetTop = ticketTopWithInvite;
        break;
      }
    }
  }

  const ticketShift = targetTop - ticketRect.top;
  if (Number.isFinite(ticketShift)) {
    ticket.style.setProperty("translate", `0px ${ticketShift.toFixed(2)}px`);
  }

  if (appInvite?.getClientRects().length && inviteRect) {
    const ticketBottom = ticketRect.bottom + ticketShift;
    const availableInviteCenter = (ticketBottom + inviteBottom) / 2;
    const currentInviteRect = appInvite.getBoundingClientRect();
    const currentInviteCenter = (currentInviteRect.top + currentInviteRect.bottom) / 2;
    const inviteShift = availableInviteCenter - currentInviteCenter;
    if (Number.isFinite(inviteShift)) {
      appInvite.style.setProperty("--lobby-app-invite-center-shift", `${inviteShift.toFixed(2)}px`);
    }
  }
  centerHeroInAvailableSpace(hero, availableTop, targetTop - heroTicketGap);
}
