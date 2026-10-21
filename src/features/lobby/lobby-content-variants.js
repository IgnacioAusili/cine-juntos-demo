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
    measureInviteRequiredHeight();
    let ticketBottom = ticketRect.bottom + targetTop - ticketRect.top;
    const availableInviteHeight = Math.max(0, inviteBottom - ticketBottom);

    if (inviteRequiredHeight > availableInviteHeight) {
      appInvite.dataset.density = "compact";
      measureInviteRequiredHeight();

      // El espacio amplio sirve para salir del diseño grande; para bajar otra
      // vez, debe faltar incluso el margen mínimo del diseño compacto.
      if (inviteRequiredHeight > availableInviteHeight) {
        appInvite.dataset.density = "minimal";
        measureInviteRequiredHeight();
      }
    }

    if (inviteRequiredHeight > availableInviteHeight) {
      const ticketTopWithInvite = inviteBottom - ticketRect.height - inviteRequiredHeight;
      if (ticketTopWithInvite >= minimumTop && ticketTopWithInvite < targetTop) {
        targetTop = ticketTopWithInvite;
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

export function syncSingleColumnTicketPlacement(hero, ticket, footer) {
  if (!hero || !ticket || !footer) return;

  // En una columna, el boleto se centra por separado. Cada ciclo limpia el
  // desplazamiento previo para medirlo desde la posición natural del flujo.
  ticket.style.removeProperty("translate");

  const fitProperties = [
    "--lobby-ticket-fit-height",
    "--lobby-ticket-fit-stub-height",
    "--lobby-ticket-fit-padding-top",
    "--lobby-ticket-fit-padding-bottom",
    "--lobby-ticket-fit-body-gap",
    "--lobby-ticket-fit-head-padding",
    "--lobby-ticket-fit-fields-gap",
    "--lobby-ticket-fit-control-height",
    "--lobby-ticket-fit-action-height",
    "--lobby-ticket-fit-stub-inset",
  ];
  fitProperties.forEach((property) => ticket.style.removeProperty(property));

  // El teclado reduce el viewport visible, pero el boleto debe conservar su
  // tamaño. La página se desplaza hasta el campo enfocado en vez de comprimirlo.
  if (
    document.body.dataset.lobbyInputFocused === "true"
    || document.body.dataset.lobbyKeyboardOpen === "true"
    || document.body.dataset.lobbyBrowserKeyboardOpen === "true"
  ) return;

  const body = ticket.querySelector('.lobby-screen__ticket-body');
  const stub = ticket.querySelector('.lobby-screen__ticket-stub');
  const head = ticket.querySelector('.lobby-screen__ticket-head');
  const fields = ticket.querySelector('.lobby-screen__fields');
  const controls = [...(fields?.querySelectorAll('input[type="text"], input[type="search"]') || [])];
  const actionButtons = [...ticket.querySelectorAll('.lobby-screen__actions > .button')];
  const stubRect = stub?.getBoundingClientRect();
  const hasTopStub = Boolean(stubRect && stubRect.width > stubRect.height);
  if (body && hasTopStub) {
    const sidePadding = Number.parseFloat(getComputedStyle(body).paddingInlineStart);
    if (Number.isFinite(sidePadding)) {
      ticket.style.setProperty("--lobby-ticket-fit-padding-top", `${sidePadding.toFixed(2)}px`);
    }
  }
  const heroRect = hero.getBoundingClientRect();
  const baseTicketHeight = ticket.getBoundingClientRect().height;
  const footerRect = footer.getBoundingClientRect();
  const legalText = footer.querySelector('.lobby-screen__disclaimer');
  const lowerVisibleBoundary = legalText?.getBoundingClientRect().top ?? footerRect.top;
  const availableHeight = Math.max(0, lowerVisibleBoundary - heroRect.bottom);
  const minimumGap = Math.min(9, availableHeight / 4);
  const targetTicketHeight = Math.min(
    baseTicketHeight,
    Math.max(0, availableHeight - minimumGap * 2),
  );
  let remainingCompression = Math.max(0, baseTicketHeight - targetTicketHeight);

  if (remainingCompression > 0) {
    // Primero reducimos el boleto completo (la franja naranja se acorta con él).
    ticket.style.setProperty("--lobby-ticket-fit-height", `${targetTicketHeight.toFixed(2)}px`);
    if (hasTopStub && stubRect) {
      const stubReduction = Math.min(6, remainingCompression * 0.18);
      ticket.style.setProperty(
        "--lobby-ticket-fit-stub-height",
        `${Math.max(28, stubRect.height - stubReduction).toFixed(2)}px`,
      );
      remainingCompression -= stubReduction;
    }
    const stubInset = Math.min(10, (baseTicketHeight - targetTicketHeight) / 2);
    if (stubInset > 0) {
      ticket.style.setProperty("--lobby-ticket-fit-stub-inset", `${stubInset.toFixed(2)}px`);
    }

    if (body && head && fields && controls.length) {
      const bodyStyle = getComputedStyle(body);
      const headStyle = getComputedStyle(head);
      const fieldsStyle = getComputedStyle(fields);
      const topPadding = Number.parseFloat(bodyStyle.paddingTop) || 0;
      const bottomPadding = Number.parseFloat(bodyStyle.paddingBottom) || 0;
      const bodyGap = Number.parseFloat(bodyStyle.rowGap) || 0;
      const headPadding = Number.parseFloat(headStyle.paddingBottom) || 0;
      const fieldsGap = Number.parseFloat(fieldsStyle.rowGap) || 0;
      const controlHeight = Number.parseFloat(getComputedStyle(controls[0]).height) || 0;
      const actionHeight = Number.parseFloat(getComputedStyle(actionButtons[0]).height) || 0;
      const fieldsGapCount = Math.max(0, fields.children.length - 1);

      // Después del alto exterior, quitamos relleno vertical y solo luego
      // reducimos separaciones y controles si todavía no alcanza.
      const topPaddingCapacity = Math.max(0, topPadding - Math.min(4, topPadding));
      const bottomPaddingCapacity = Math.max(0, bottomPadding - Math.min(4, bottomPadding));
      const paddingCapacity = (hasTopStub ? 0 : topPaddingCapacity) + bottomPaddingCapacity;
      const paddingReduction = Math.min(remainingCompression, paddingCapacity);
      if (paddingReduction > 0 && paddingCapacity > 0) {
        const effectiveTopPaddingCapacity = hasTopStub ? 0 : topPaddingCapacity;
        const topReduction = paddingReduction * (effectiveTopPaddingCapacity / paddingCapacity);
        const bottomReduction = paddingReduction - topReduction;
        ticket.style.setProperty(
          "--lobby-ticket-fit-padding-top",
          `${(topPadding - topReduction).toFixed(2)}px`,
        );
        ticket.style.setProperty(
          "--lobby-ticket-fit-padding-bottom",
          `${(bottomPadding - bottomReduction).toFixed(2)}px`,
        );
        remainingCompression -= paddingReduction;
      }

      const reduceRepeatedSpace = (property, base, minimum, count = 1) => {
        if (remainingCompression <= 0 || count <= 0) return;
        const perItemCapacity = Math.max(0, base - minimum);
        const perItemReduction = Math.min(perItemCapacity, remainingCompression / count);
        if (perItemReduction <= 0) return;
        ticket.style.setProperty(property, `${(base - perItemReduction).toFixed(2)}px`);
        remainingCompression -= perItemReduction * count;
      };

      reduceRepeatedSpace(
        "--lobby-ticket-fit-body-gap",
        bodyGap,
        Math.min(2, bodyGap),
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-head-padding",
        headPadding,
        Math.min(0, headPadding),
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-fields-gap",
        fieldsGap,
        Math.min(2, fieldsGap),
        fieldsGapCount,
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-control-height",
        controlHeight,
        Math.min(28, controlHeight),
        controls.length,
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-action-height",
        actionHeight,
        Math.min(34, actionHeight),
        actionButtons.length,
      );
    }
  }

}
