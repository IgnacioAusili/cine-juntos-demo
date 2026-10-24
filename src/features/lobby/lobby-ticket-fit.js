import { isLobbySoftKeyboardFocusPending } from "./lobby-keyboard-state.js";

const TICKET_FIT_PROPERTIES = [
  "--lobby-ticket-fit-height",
  "--lobby-ticket-fit-padding-top",
  "--lobby-ticket-fit-padding-bottom",
  "--lobby-ticket-fit-body-gap",
  "--lobby-ticket-fit-head-padding",
  "--lobby-ticket-fit-fields-gap",
  "--lobby-ticket-fit-control-height",
  "--lobby-ticket-fit-action-height",
  "--lobby-ticket-fit-offset-y",
];

export function resetLobbyTicketFit(ticket) {
  TICKET_FIT_PROPERTIES.forEach((property) => ticket?.style.removeProperty(property));
  ticket?.removeAttribute("data-lobby-ticket-fit");
}

function canFitTicket() {
  // El teclado reduce el viewport visible, pero el boleto debe conservar su
  // tamaño. La página se desplaza hasta el campo enfocado en vez de comprimirlo.
  return !(
    isLobbySoftKeyboardFocusPending()
    || document.body.dataset.lobbyKeyboardOpen === "true"
    || document.body.dataset.lobbyBrowserKeyboardOpen === "true"
  );
}

function fitTicketToHeight(ticket, availableHeight) {
  const body = ticket.querySelector('.lobby-screen__ticket-body');
  const head = ticket.querySelector('.lobby-screen__ticket-head');
  const fields = ticket.querySelector('.lobby-screen__fields');
  const controls = [...(fields?.querySelectorAll('input[type="text"], input[type="search"]') || [])];
  const actionButtons = [...ticket.querySelectorAll('.lobby-screen__actions > .button')];
  const baseTicketHeight = ticket.getBoundingClientRect().height;
  const clearance = Math.min(18, Math.max(8, availableHeight * 0.05), availableHeight / 4);
  const targetTicketHeight = Math.min(
    baseTicketHeight,
    Math.max(0, availableHeight - clearance * 2),
  );
  let remainingCompression = Math.max(0, baseTicketHeight - targetTicketHeight);

  // Lee los valores antes de activar las reglas que aplican la compresión.
  const bodyStyle = body && getComputedStyle(body);
  const headStyle = head && getComputedStyle(head);
  const fieldsStyle = fields && getComputedStyle(fields);
  const controlStyle = controls.length ? getComputedStyle(controls[0]) : null;
  const actionStyle = actionButtons.length ? getComputedStyle(actionButtons[0]) : null;
  const baseFitStyles = {
    paddingTop: bodyStyle?.paddingTop,
    paddingBottom: bodyStyle?.paddingBottom,
    bodyGap: bodyStyle?.rowGap,
    headPadding: headStyle?.paddingBottom,
    fieldsGap: fieldsStyle?.rowGap,
    controlHeight: controlStyle?.height,
    actionHeight: actionStyle?.height,
  };

  // Guarda el estilo responsive actual para reutilizarlo al comprimir el
  // boleto, tanto en columnas como cuando el flujo pasa a una sola columna.
  ticket.dataset.lobbyTicketFit = "true";
  if (body) {
    ticket.style.setProperty("--lobby-ticket-fit-padding-top", baseFitStyles.paddingTop);
    ticket.style.setProperty("--lobby-ticket-fit-padding-bottom", baseFitStyles.paddingBottom);
    ticket.style.setProperty("--lobby-ticket-fit-body-gap", baseFitStyles.bodyGap);
  }
  if (head) {
    ticket.style.setProperty("--lobby-ticket-fit-head-padding", baseFitStyles.headPadding);
  }
  if (fields) {
    ticket.style.setProperty("--lobby-ticket-fit-fields-gap", baseFitStyles.fieldsGap);
  }
  if (controls.length) {
    ticket.style.setProperty("--lobby-ticket-fit-control-height", baseFitStyles.controlHeight);
  }
  if (actionButtons.length) {
    ticket.style.setProperty(
      "--lobby-ticket-fit-action-height",
      baseFitStyles.actionHeight,
    );
  }

  if (remainingCompression > 0) {
    // Primero reducimos el boleto completo, conservando la franja a todo su alto.
    ticket.style.setProperty("--lobby-ticket-fit-height", `${targetTicketHeight.toFixed(2)}px`);

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
      const paddingCapacity = topPaddingCapacity + bottomPaddingCapacity;
      const paddingReduction = Math.min(remainingCompression, paddingCapacity);
      if (paddingReduction > 0 && paddingCapacity > 0) {
        const topReduction = paddingReduction * (topPaddingCapacity / paddingCapacity);
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
      const controlCapacity = Math.max(0, controlHeight - Math.min(28, controlHeight)) * controls.length;
      const actionCapacity = Math.max(0, actionHeight - Math.min(34, actionHeight)) * actionButtons.length;
      const controlAndActionCapacity = controlCapacity + actionCapacity;
      const controlAndActionReduction = Math.min(remainingCompression, controlAndActionCapacity);
      if (controlAndActionReduction > 0 && controlAndActionCapacity > 0) {
        const controlReduction = controlAndActionReduction * (controlCapacity / controlAndActionCapacity);
        const actionReduction = controlAndActionReduction - controlReduction;
        if (controls.length > 0 && controlCapacity > 0) {
          ticket.style.setProperty(
            "--lobby-ticket-fit-control-height",
            `${(controlHeight - controlReduction / controls.length).toFixed(2)}px`,
          );
        }
        if (actionButtons.length > 0 && actionCapacity > 0) {
          ticket.style.setProperty(
            "--lobby-ticket-fit-action-height",
            `${(actionHeight - actionReduction / actionButtons.length).toFixed(2)}px`,
          );
        }
        remainingCompression -= controlAndActionReduction;
      }
    }

    // Las alturas de campos y botones no incluyen las etiquetas ni el espacio
    // entre botones. Medimos el borde real para corregir el excedente restante.
    if (body && actionButtons.length) {
      // Repite la medición porque el grid puede redistribuir el alto sobrante
      // entre sus filas cuando cambia la altura mínima de los botones.
      for (let pass = 0; pass < 4; pass += 1) {
        const bodyRect = body.getBoundingClientRect();
        const lastActionRect = actionButtons[actionButtons.length - 1].getBoundingClientRect();
        const paddingBottom = Number.parseFloat(getComputedStyle(body).paddingBottom) || 0;
        const contentBottom = bodyRect.bottom - paddingBottom;
        const overflow = lastActionRect.bottom - contentBottom;

        if (overflow <= 0.5) break;

        const currentActionHeight = Number.parseFloat(
          getComputedStyle(actionButtons[0]).height,
        ) || 0;
        const minimumActionHeight = Math.min(34, currentActionHeight);
        const reductionPerButton = Math.min(
          Math.max(0, currentActionHeight - minimumActionHeight),
          overflow / actionButtons.length,
        );

        if (reductionPerButton <= 0) break;
        ticket.style.setProperty(
          "--lobby-ticket-fit-action-height",
          `${(currentActionHeight - reductionPerButton).toFixed(2)}px`,
        );
      }
    }
  }

}

export function syncSingleColumnTicketPlacement(hero, ticket, footer) {
  if (!hero || !ticket || !footer) return;

  // En una columna, el boleto se mide en su posición natural antes del ajuste.
  resetLobbyTicketFit(ticket);
  if (!canFitTicket()) return;

  const heroRect = hero.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const legalText = footer.querySelector('.lobby-screen__disclaimer');
  const lowerVisibleBoundary = legalText?.getBoundingClientRect().top ?? footerRect.top;
  const availableHeight = Math.max(0, lowerVisibleBoundary - heroRect.bottom);
  fitTicketToHeight(ticket, availableHeight);
}

export function syncColumnsTicketFit(screen, grid, ticket, marquee, footer) {
  if (!screen || !grid || !ticket || !footer) return;

  resetLobbyTicketFit(ticket);
  if (!canFitTicket()) return;

  const screenRect = screen.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const screenContentTop = screenRect.top + screen.clientTop;
  const screenContentBottom = screenContentTop + screen.clientHeight;
  const upperVisibleBoundary = marquee?.getClientRects().length
    ? marquee.getBoundingClientRect().bottom
    : Math.max(screenContentTop, gridRect.top);
  const lowerVisibleBoundary = Math.min(
    screenContentBottom,
    footerRect.top,
  );
  const availableHeight = Math.max(0, lowerVisibleBoundary - upperVisibleBoundary);

  // La fila del grid puede extenderse detrás del pie en pantallas bajas. Por
  // eso medimos el espacio visible entre la marquesina y el inicio del pie.
  fitTicketToHeight(ticket, availableHeight);

  const fittedTicketRect = ticket.getBoundingClientRect();
  const targetTop = upperVisibleBoundary + Math.max(0, (availableHeight - fittedTicketRect.height) / 2);
  const verticalShift = targetTop - fittedTicketRect.top;
  if (Number.isFinite(verticalShift)) {
    ticket.style.setProperty("--lobby-ticket-fit-offset-y", `${verticalShift.toFixed(2)}px`);
  }
}
