const SINGLE_COLUMN_TICKET_FIT_PROPERTIES = [
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

export function resetSingleColumnTicketFit(ticket) {
  SINGLE_COLUMN_TICKET_FIT_PROPERTIES.forEach((property) => ticket?.style.removeProperty(property));
}

export function syncSingleColumnTicketPlacement(hero, ticket, footer) {
  if (!hero || !ticket || !footer) return;

  // En una columna, el boleto se centra por separado. Cada ciclo limpia el
  // desplazamiento previo para medirlo desde la posición natural del flujo.
  ticket.style.removeProperty("translate");

  resetSingleColumnTicketFit(ticket);

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
