export const FORMATS = {
  quote: { label: "Cita", symbol: "❝ ❞" },
  bold: { label: "Negrita", symbol: "**" },
  italic: { label: "Cursiva", symbol: "*" },
  monospace: { label: "Monoespaciado", symbol: "`" },
  underline: { label: "Subrayado", symbol: "__" },
  strike: { label: "Tachado", symbol: "~~" },
  spoiler: { label: "Spoiler", symbol: "||" },
  link: { label: "Crear enlace", symbol: "[texto](url)" },
};

export function getFormatMenu(state) {
  if (state.menu) return state.menu;
  state.menu = document.createElement("div");
  state.menu.className = "chat-format-menu";
  state.menu.setAttribute("role", "menu");
  state.menu.setAttribute("aria-label", "Acciones del campo de mensaje");
  state.menu.hidden = true;
  state.menuActions = document.createElement("div");
  state.menuActions.className = "chat-format-menu__actions";
  state.formatActions = document.createElement("div");
  state.formatActions.className = "chat-format-menu__styles-submenu";
  state.formatActions.setAttribute("role", "menu");
  state.formatActions.setAttribute("aria-label", "Estilos de texto");
  state.formatActions.hidden = true;

  Object.entries(FORMATS).forEach(([action, format]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.formatAction = action;
    button.setAttribute("role", "menuitem");
    const label = document.createElement("span");
    label.className = "chat-format-menu__label";
    label.textContent = format.label;
    if (action === "link") state.linkFormatLabel = label;
    const symbol = document.createElement("span");
    symbol.className = "chat-format-menu__symbol";
    symbol.textContent = format.symbol;
    button.append(label, symbol);
    state.formatActions.append(button);
  });
  state.selectAllButton = createMenuButton("select-all", "Seleccionar todo");
  state.copyButton = createMenuButton("copy", "Copiar");
  state.cutButton = createMenuButton("cut", "Cortar");
  const pasteButton = createMenuButton("paste", "Pegar");
  state.stylesGroup = document.createElement("div");
  state.stylesGroup.className = "chat-format-menu__styles-group";
  state.stylesButton = createMenuButton("styles", "Estilos");
  state.stylesButton.setAttribute("aria-haspopup", "menu");
  state.stylesButton.setAttribute("aria-expanded", "false");
  const stylesArrow = document.createElement("span");
  stylesArrow.className = "chat-format-menu__submenu-arrow";
  stylesArrow.setAttribute("aria-hidden", "true");
  stylesArrow.textContent = "›";
  state.stylesButton.append(stylesArrow);
  state.stylesSubmenu = document.createElement("div");
  state.stylesSubmenu.className = "chat-format-menu__styles-submenu-wrap";
  state.stylesSubmenu.hidden = true;
  state.stylesSubmenu.append(state.formatActions);
  state.stylesGroup.append(state.stylesButton, state.stylesSubmenu);
  state.menuActions.append(state.selectAllButton, state.copyButton, state.cutButton, pasteButton, state.stylesGroup);
  state.clipboardStatus = document.createElement("div");
  state.clipboardStatus.className = "chat-format-menu__clipboard-status";
  state.clipboardStatus.setAttribute("role", "status");
  state.clipboardStatus.hidden = true;
  state.linkActions = document.createElement("div");
  state.linkActions.className = "chat-format-menu__link-actions-list";
  state.linkActions.hidden = true;
  const openLinkButton = document.createElement("button");
  openLinkButton.type = "button";
  openLinkButton.dataset.formatAction = "open-link";
  openLinkButton.setAttribute("role", "menuitem");
  openLinkButton.textContent = "Abrir en ventana nueva";
  state.selectAllLinkButton = createMenuButton("select-all", "Seleccionar todo");
  state.linkActions.append(state.selectAllLinkButton, openLinkButton);
  state.linkForm = document.createElement("form");
  state.linkForm.className = "chat-format-menu__link-form";
  state.linkForm.hidden = true;
  const label = document.createElement("label");
  label.className = "chat-format-menu__link-label";
  label.textContent = "Dirección del enlace";
  state.linkInput = document.createElement("input");
  state.linkInput.className = "chat-format-menu__url";
  state.linkInput.type = "text";
  state.linkInput.inputMode = "url";
  state.linkInput.placeholder = "https://ejemplo.com";
  state.linkInput.autocomplete = "url";
  state.linkInput.setAttribute("aria-label", "Dirección del enlace");
  state.linkInput.setAttribute("spellcheck", "false");
  label.append(state.linkInput);
  state.linkAliasLabel = document.createElement("label");
  state.linkAliasLabel.className = "chat-format-menu__link-label";
  state.linkAliasLabel.textContent = "Texto del alias";
  state.linkAliasLabel.hidden = true;
  state.linkAliasInput = document.createElement("input");
  state.linkAliasInput.className = "chat-format-menu__url";
  state.linkAliasInput.type = "text";
  state.linkAliasInput.autocomplete = "off";
  state.linkAliasInput.setAttribute("aria-label", "Texto del alias");
  state.linkAliasLabel.append(state.linkAliasInput);
  state.linkError = document.createElement("span");
  state.linkError.className = "chat-format-menu__link-error";
  state.linkError.setAttribute("role", "alert");
  state.linkError.textContent = "Ingresá una dirección http o https válida.";
  state.linkError.hidden = true;
  const actions = document.createElement("div");
  actions.className = "chat-format-menu__link-actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.formatCancel = "true";
  cancelButton.textContent = "Cancelar";
  const applyButton = document.createElement("button");
  applyButton.type = "submit";
  applyButton.textContent = "Aplicar";
  actions.append(cancelButton, applyButton);
  state.linkForm.append(label, state.linkAliasLabel, state.linkError, actions);
  state.menu.append(state.menuActions, state.linkActions, state.linkForm, state.clipboardStatus);
  document.body.append(state.menu);
  return state.menu;
}

function createMenuButton(action, labelText) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.formatAction = action;
  button.setAttribute("role", "menuitem");
  const label = document.createElement("span");
  label.className = "chat-format-menu__label";
  label.textContent = labelText;
  button.append(label);
  return button;
}
