import { logEvent } from "../../core/state.js";
import { showErrorDialog, showVideoDownloadDialog } from "../session/session-dialogs.js";

const DOWNLOAD_COOLDOWN_MS = 30_000;
const DOWNLOAD_COOLDOWN_KEY = "cine-juntos-video-download-next-at";
const MAX_IN_MEMORY_DOWNLOAD_BYTES = 512 * 1024 * 1024;
const OBJECT_URL_REVOKE_DELAY_MS = 60_000;

let downloadInProgress = false;
let downloadPromptOpen = false;
let memoryCooldownUntil = 0;

export async function requestVideoDownload(source) {
  if (!source) return;
  if (downloadInProgress || downloadPromptOpen) {
    showErrorDialog("Ya hay una descarga de video en curso en esta pestaña.");
    return;
  }

  const remainingMs = getCooldownRemainingMs();
  if (remainingMs > 0) {
    showErrorDialog(`Esperá ${Math.ceil(remainingMs / 1000)} segundos antes de iniciar otra descarga.`);
    return;
  }

  downloadPromptOpen = true;
  let filename = getVideoFilename(source);
  let downloadStarted = false;

  try {
    const confirmation = await showVideoDownloadDialog(filename);
    if (!confirmation.confirmed) return;

    let fileHandle = null;
    if (confirmation.saveFileHandlePromise) {
      try {
        fileHandle = await confirmation.saveFileHandlePromise;
      } catch (error) {
        if (error?.name === "AbortError") return;
        logEvent("video", `No se pudo abrir el selector de descarga: ${error?.message || "error desconocido"}.`);
      }
    }
    const cooldownRemainingMs = getCooldownRemainingMs();
    if (cooldownRemainingMs > 0) {
      showErrorDialog(`Esperá ${Math.ceil(cooldownRemainingMs / 1000)} segundos antes de iniciar otra descarga.`);
      return;
    }

    startCooldown();
    downloadInProgress = true;
    downloadPromptOpen = false;
    downloadStarted = true;

    const response = await fetch(source);
    if (!response.ok) throw new Error(`El servidor respondió ${response.status}.`);

    if (fileHandle && response.body) {
      const writable = await fileHandle.createWritable();
      await response.body.pipeTo(writable);
    } else if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(await readResponseBlob(response));
      await writable.close();
    } else {
      const blob = await readResponseBlob(response);
      if (!blob.size) throw new Error("El archivo descargado está vacío.");
      saveBlob(blob, filename);
    }
    logEvent("video", `${fileHandle ? "Descarga completada" : "Descarga solicitada"}: ${filename}.`);
  } catch (error) {
    if (!downloadStarted) {
      showErrorDialog("No se pudo iniciar el guardado del archivo.");
      return;
    }

    logEvent("video", `Falló la descarga forzada: ${error?.message || "error desconocido"}.`);
    if (error?.name === "DownloadTooLargeError" || error instanceof TypeError) {
      startNativeDownload(source, filename);
      const message = error?.name === "DownloadTooLargeError"
        ? "El video supera los 512 MB que esta descarga puede preparar en memoria. Abrimos la dirección original para que el navegador pruebe su descarga nativa; si se reproduce en otra pestaña, usá allí «Guardar video como…»."
        : "El servidor no permitió preparar la descarga desde esta página (puede ser una restricción CORS o un corte de conexión). Intentamos abrir la dirección original para que el navegador pruebe su descarga nativa; si se reproduce en otra pestaña, usá allí «Guardar video como…».";
      showErrorDialog(message);
      return;
    }
    showErrorDialog("No se pudo descargar este video. El servidor puede bloquear las descargas desde esta página o la conexión pudo interrumpirse.");
  } finally {
    downloadPromptOpen = false;
    downloadInProgress = false;
  }
}

function getCooldownRemainingMs() {
  let storedCooldownUntil = memoryCooldownUntil;
  try {
    storedCooldownUntil = Math.max(storedCooldownUntil, Number(localStorage.getItem(DOWNLOAD_COOLDOWN_KEY)) || 0);
  } catch {
    // El límite en memoria sigue activo si el navegador bloquea el almacenamiento.
  }
  return Math.max(0, storedCooldownUntil - Date.now());
}

function startCooldown() {
  memoryCooldownUntil = Date.now() + DOWNLOAD_COOLDOWN_MS;
  try {
    localStorage.setItem(DOWNLOAD_COOLDOWN_KEY, String(memoryCooldownUntil));
  } catch {
    // El límite en memoria sigue activo si el navegador bloquea el almacenamiento.
  }
}

function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
}

async function readResponseBlob(response) {
  const reader = response.body?.getReader();
  if (!reader) {
    const blob = await response.blob();
    if (blob.size > MAX_IN_MEMORY_DOWNLOAD_BYTES) throw createDownloadTooLargeError();
    return blob;
  }

  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_IN_MEMORY_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw createDownloadTooLargeError();
    }
    chunks.push(value);
  }
  return new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
}

function createDownloadTooLargeError() {
  const error = new Error("El archivo supera el límite de preparación en memoria.");
  error.name = "DownloadTooLargeError";
  return error;
}

function startNativeDownload(source, filename) {
  const anchor = document.createElement("a");
  anchor.href = source;
  anchor.download = filename;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function getVideoFilename(source) {
  try {
    const filename = decodeURIComponent(new URL(source, window.location.href).pathname.split("/").pop() || "");
    return filename || "video";
  } catch {
    return "video";
  }
}
