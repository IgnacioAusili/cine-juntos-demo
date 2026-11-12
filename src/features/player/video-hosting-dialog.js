import { dom } from "../../core/dom.js";

export function wireVideoHostingDialog() {
  const dialog = dom.videoHostingDialog;
  if (!dialog || !dom.videoHostingHelpButton) return;

  dom.videoHostingHelpButton.addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    dom.closeVideoHostingDialogButton?.focus();
  });

  const closeDialog = () => {
    if (dialog.open) dialog.close();
  };

  dom.closeVideoHostingDialogButton?.addEventListener("click", closeDialog);
  dom.closeVideoHostingDialogActionButton?.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
}
