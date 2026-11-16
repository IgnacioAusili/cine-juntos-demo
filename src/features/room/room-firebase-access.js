import { firebaseConfig } from "../../core/state.js";
import { FIREBASE_VERSION, hasFirebaseConfig } from "../../core/utils.js";
import { hideTooltip } from "../icons-tooltips.js";
import { sanitizeRoomInput } from "./room-input.js";

const STORAGE_KEY = "cine-juntos-firebase-config";
const URL_PARAM = "fb";
const URL_CIPHER_PREFIX = "v1.";
const URL_OBFUSCATION_PREFIX = "o1.";
// La clave embebida en el código solo dificulta la lectura casual del enlace.
const URL_CIPHER_SECRET = "cine-juntos.firebase-invitation.v1";
const VERIFY_DEBOUNCE_MS = 900;
const MIN_CONFIG_LENGTH = 20;
const dialog = document.querySelector("#firebaseAccessDialog");
const tooltipLayer = document.querySelector("#tooltipLayer");
const tooltipLayerHome = tooltipLayer?.parentElement;
let tooltipChromeHome = null;
const input = document.querySelector("#firebaseAccessInput");
const status = document.querySelector("#firebaseAccessStatus");
const statusText = document.querySelector("#firebaseAccessStatusText");
const submitButton = document.querySelector("#firebaseAccessSubmit");
const localButton = document.querySelector("#firebaseAccessLocal");
const scrollBody = dialog?.querySelector("#firebaseAccessBody");
const scrollTrack = dialog?.querySelector("#firebaseAccessScrollbar");
const scrollThumb = scrollTrack?.querySelector(".room-firebase-access__scrollbar-thumb");
const baseConfig = window.CINE_JUNTOS_FIREBASE_CONFIG || {};
let pendingEntry = null;
let isVerifying = false;
let isConfigValid = false;
let verifiedConfig = null;
let validationTimer = 0;
let validationAttempt = 0;
let activeValidation = null;
let scrollbarFrame = 0;

function moveTooltipLayersIntoDialog() {
  if (tooltipLayer && tooltipLayer.parentElement !== dialog) dialog.append(tooltipLayer);

  const tooltipChrome = document.querySelector(".tooltip-layer__svg");
  if (!tooltipChrome) return;
  if (!tooltipChromeHome) tooltipChromeHome = tooltipChrome.parentElement;
  if (tooltipChrome.parentElement !== dialog) dialog.append(tooltipChrome);
}

function restoreTooltipLayers() {
  if (tooltipLayer && tooltipLayerHome && tooltipLayer.parentElement !== tooltipLayerHome) {
    tooltipLayerHome.append(tooltipLayer);
  }

  const tooltipChrome = document.querySelector(".tooltip-layer__svg");
  if (tooltipChrome && tooltipChromeHome && tooltipChrome.parentElement !== tooltipChromeHome) {
    tooltipChromeHome.append(tooltipChrome);
  }
}

function syncAccessScrollbar() {
  if (!dialog?.open || !scrollBody || !scrollTrack || !scrollThumb) {
    if (scrollTrack) scrollTrack.hidden = true;
    return;
  }

  const maxScroll = Math.max(0, scrollBody.scrollHeight - scrollBody.clientHeight);
  const bodyRect = scrollBody.getBoundingClientRect();
  const card = dialog.querySelector(".room-firebase-access__card");
  const cardRect = card.getBoundingClientRect();
  const borderTop = Number.parseFloat(getComputedStyle(card).borderTopWidth) || 0;
  scrollTrack.style.setProperty("--rf-scrollbar-top", `${bodyRect.top - cardRect.top - borderTop}px`);
  scrollTrack.style.setProperty("--rf-scrollbar-height", `${scrollBody.clientHeight}px`);

  if (maxScroll <= 1 || !scrollBody.clientHeight) {
    scrollTrack.hidden = true;
    return;
  }

  scrollTrack.hidden = false;
  const trackHeight = scrollTrack.clientHeight;
  const thumbHeight = Math.min(trackHeight, Math.max(28, trackHeight * scrollBody.clientHeight / scrollBody.scrollHeight));
  const travel = Math.max(0, trackHeight - thumbHeight);
  const progress = Math.min(1, Math.max(0, scrollBody.scrollTop / maxScroll));

  scrollThumb.style.height = `${thumbHeight}px`;
  scrollThumb.style.transform = `translate(-50%, ${travel * progress}px)`;
  scrollTrack.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
  scrollTrack.setAttribute("aria-valuetext", `${Math.round(progress * 100)}% desplazado`);
}

function scheduleAccessScrollbarSync() {
  if (scrollbarFrame) return;
  scrollbarFrame = window.requestAnimationFrame(() => {
    scrollbarFrame = 0;
    syncAccessScrollbar();
  });
}

function scrollAccessBodyFromPointer(event) {
  const maxScroll = Math.max(0, scrollBody.scrollHeight - scrollBody.clientHeight);
  const rect = scrollTrack.getBoundingClientRect();
  const thumbHeight = scrollThumb.getBoundingClientRect().height;
  const travel = rect.height - thumbHeight;
  if (maxScroll <= 0 || travel <= 0) return;

  const thumbTop = Math.min(travel, Math.max(0, event.clientY - rect.top - thumbHeight / 2));
  scrollBody.scrollTop = (thumbTop / travel) * maxScroll;
}

if (scrollBody && scrollTrack && scrollThumb) {
  scrollBody.addEventListener("scroll", scheduleAccessScrollbarSync, { passive: true });
  scrollTrack.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    scrollTrack.setPointerCapture(event.pointerId);
    scrollAccessBodyFromPointer(event);
  });
  scrollTrack.addEventListener("pointermove", (event) => {
    if (scrollTrack.hasPointerCapture(event.pointerId)) scrollAccessBodyFromPointer(event);
  });
  scrollTrack.addEventListener("keydown", (event) => {
    const page = scrollBody.clientHeight;
    const steps = {
      ArrowDown: 40,
      ArrowUp: -40,
      PageDown: page,
      PageUp: -page,
      Home: -scrollBody.scrollTop,
      End: scrollBody.scrollHeight - scrollBody.scrollTop,
    };
    if (!(event.key in steps)) return;
    event.preventDefault();
    scrollBody.scrollTop += steps[event.key];
  });
  window.addEventListener("resize", scheduleAccessScrollbarSync, { passive: true });
  dialog.addEventListener("close", () => { scrollTrack.hidden = true; });

  if (window.ResizeObserver) {
    const scrollbarObserver = new ResizeObserver(scheduleAccessScrollbarSync);
    [dialog.querySelector(".room-firebase-access__card"), scrollBody, ...scrollBody.children]
      .forEach((element) => scrollbarObserver.observe(element));
  }
}

function setFirebaseConfig(config) {
  Object.keys(firebaseConfig).forEach((key) => delete firebaseConfig[key]);
  Object.assign(firebaseConfig, config || {});
}

function updateSubmitButton() {
  submitButton.disabled = !pendingEntry || !isConfigValid || isVerifying;
}

function setValidationStatus(stateName, message) {
  status.dataset.state = stateName;
  statusText.textContent = message;
  updateSubmitButton();
}

function cancelValidation() {
  window.clearTimeout(validationTimer);
  validationTimer = 0;
  validationAttempt += 1;
  isVerifying = false;
  isConfigValid = false;
  verifiedConfig = null;
  updateSubmitButton();
}

function parseConfig(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) throw new Error("Pegá una apiKey o el JSON de configuración completo de Firebase.");

  let config;
  if (trimmed.startsWith("{")) {
    try {
      config = JSON.parse(trimmed);
    } catch {
      throw new Error("La configuración JSON no tiene un formato válido.");
    }
  } else {
    config = { ...baseConfig, apiKey: trimmed };
  }

  if (!hasFirebaseConfig(config)) {
    throw new Error("Faltan apiKey, authDomain, databaseURL, projectId o appId.");
  }
  return config;
}

function encodeBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBytes(encoded) {
  const normalized = String(encoded || "").replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function xorUrlBytes(bytes) {
  const secret = new TextEncoder().encode(URL_CIPHER_SECRET);
  return Uint8Array.from(bytes, (byte, index) => byte ^ secret[index % secret.length]);
}

async function getUrlCipherKey() {
  const material = new TextEncoder().encode(URL_CIPHER_SECRET);
  const digest = await window.crypto.subtle.digest("SHA-256", material);
  return window.crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encodeConfig(config) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  if (window.crypto?.subtle && window.crypto?.getRandomValues) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await getUrlCipherKey();
    const ciphertext = new Uint8Array(await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
    const payload = new Uint8Array(iv.length + ciphertext.length);
    payload.set(iv);
    payload.set(ciphertext, iv.length);
    return URL_CIPHER_PREFIX + encodeBytes(payload);
  }

  return URL_OBFUSCATION_PREFIX + encodeBytes(xorUrlBytes(bytes));
}

async function decodeConfig(encoded) {
  const value = String(encoded || "");
  let config;
  try {
    if (value.startsWith(URL_CIPHER_PREFIX)) {
      const payload = decodeBytes(value.slice(URL_CIPHER_PREFIX.length));
      const iv = payload.slice(0, 12);
      const ciphertext = payload.slice(12);
      const key = await getUrlCipherKey();
      const plaintext = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      config = JSON.parse(new TextDecoder().decode(plaintext));
    } else if (value.startsWith(URL_OBFUSCATION_PREFIX)) {
      config = JSON.parse(new TextDecoder().decode(xorUrlBytes(decodeBytes(value.slice(URL_OBFUSCATION_PREFIX.length)))));
    } else {
      // Aceptar enlaces antiguos para que las invitaciones ya compartidas sigan funcionando.
      config = JSON.parse(new TextDecoder().decode(decodeBytes(value)));
    }
  } catch {
    throw new Error("El enlace no incluye una configuración Firebase válida.");
  }
  if (!hasFirebaseConfig(config)) throw new Error("El enlace no incluye una configuración Firebase válida.");
  return config;
}

export async function encodeFirebaseConfig(config = firebaseConfig) {
  return hasFirebaseConfig(config) ? encodeConfig(config) : "";
}

async function updateFirebaseUrl(config) {
  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM, await encodeConfig(config));
  window.history.replaceState({}, "", url);
}

function removeFirebaseUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(URL_PARAM);
  window.history.replaceState({}, "", url);
}

function openAccessDialog(entry, { initialConfig = null, message = "" } = {}) {
  cancelValidation();
  pendingEntry = entry;
  input.value = initialConfig ? JSON.stringify(initialConfig, null, 2) : "";
  setValidationStatus(message ? "invalid" : "idle", message || "Pegá una apiKey o el JSON de configuración completo para comprobar la conexión.");
  if (scrollBody) scrollBody.scrollTop = 0;
  hideTooltip(true);
  if (!dialog.open) dialog.showModal();
  moveTooltipLayersIntoDialog();
  scheduleAccessScrollbarSync();
  window.setTimeout(() => input.focus({ preventScroll: true }), 0);
  if (!message && input.value.trim()) scheduleConfigVerification({ immediate: true });
}

async function getConfigFromInvite(value) {
  const text = String(value || "").trim();
  if (!text.includes("room=") && !text.includes(`${URL_PARAM}=`) && !text.includes("://")) return null;
  const url = new URL(text, window.location.href);
  const encoded = url.searchParams.get(URL_PARAM);
  return encoded ? decodeConfig(encoded) : null;
}

function formatValidationError(error) {
  const code = error?.code || "";
  if (code.startsWith("auth/api-key-not-valid") || code === "auth/invalid-api-key") {
    return "La apiKey no es válida. Revisá que esté completa y pertenezca al proyecto indicado.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Activá el inicio de sesión anónimo en Firebase Authentication y volvé a verificar.";
  }
  if (code === "auth/unauthorized-domain") {
    return "Agregá el dominio de esta página a los dominios autorizados de Firebase Authentication.";
  }
  if (code.startsWith("auth/")) return `Firebase Authentication rechazó la configuración (${code}).`;
  if (code.startsWith("database/")) return `No se pudo conectar con Realtime Database (${code}).`;
  return error?.message || "No se pudo verificar la conexión con Firebase.";
}

async function waitForDatabase(databaseModule, database) {
  await new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("Se agotó el tiempo para conectar con Realtime Database."));
    }, 8000);
    unsubscribe = databaseModule.onValue(
      databaseModule.ref(database, ".info/connected"),
      (snapshot) => {
        if (!snapshot.val()) return;
        window.clearTimeout(timeout);
        unsubscribe();
        resolve();
      },
      (error) => {
        window.clearTimeout(timeout);
        unsubscribe();
        reject(error);
      },
    );
  });
}

async function verifyFirebaseConfig(config) {
  const [appModule, authModule, databaseModule] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`),
  ]);
  const appName = `cine-juntos-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const app = appModule.initializeApp(config, appName);
  const auth = authModule.getAuth(app);
  let verificationUser = null;
  try {
    const credential = await authModule.signInAnonymously(auth);
    verificationUser = credential.user;
    await waitForDatabase(databaseModule, databaseModule.getDatabase(app));
  } finally {
    if (verificationUser) await authModule.deleteUser(verificationUser).catch(() => {});
    await appModule.deleteApp(app).catch(() => {});
  }
}

async function verifyInputValue(attempt, value) {
  if (activeValidation) {
    await activeValidation.catch(() => {});
    if (attempt !== validationAttempt) return;
  }

  let config;
  try {
    config = parseConfig(value);
  } catch (error) {
    if (attempt === validationAttempt) {
      isVerifying = false;
      setValidationStatus("invalid", error.message);
    }
    return;
  }

  const validation = verifyFirebaseConfig(config);
  activeValidation = validation;
  try {
    await validation;
    if (attempt !== validationAttempt || !dialog.open || input.value.trim() !== value) return;
    verifiedConfig = config;
    isConfigValid = true;
    setValidationStatus("valid", "Conexión verificada. Ya podés entrar y compartir la sala.");
  } catch (error) {
    if (attempt === validationAttempt && dialog.open && input.value.trim() === value) {
      setValidationStatus("invalid", formatValidationError(error));
    }
  } finally {
    if (activeValidation === validation) activeValidation = null;
    if (attempt === validationAttempt) {
      isVerifying = false;
      updateSubmitButton();
    }
  }
}

function scheduleConfigVerification({ immediate = false } = {}) {
  if (!pendingEntry || !dialog.open) return;
  cancelValidation();
  const value = input.value.trim();
  if (!value) {
    setValidationStatus("idle", "Pegá una apiKey o el JSON de configuración completo para comprobar la conexión.");
    return;
  }
  if (value.length < MIN_CONFIG_LENGTH) {
    setValidationStatus("idle", "Seguí escribiendo o pegá la configuración; la vamos a comprobar automáticamente.");
    return;
  }

  const attempt = validationAttempt;
  isVerifying = true;
  setValidationStatus("checking", "Verificando acceso a Firebase y a Realtime Database…");
  validationTimer = window.setTimeout(() => {
    validationTimer = 0;
    void verifyInputValue(attempt, value);
  }, immediate ? 0 : VERIFY_DEBOUNCE_MS);
}

async function runEntry(config, mode) {
  if (!pendingEntry) return;
  const entry = pendingEntry;
  pendingEntry = null;
  cancelValidation();
  if (mode === "firebase") {
    setFirebaseConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    await updateFirebaseUrl(config);
  } else {
    setFirebaseConfig(null);
    removeFirebaseUrl();
  }
  dialog.close();
  await entry.start();
}

async function submitFirebaseAccess() {
  if (isVerifying || !pendingEntry || !isConfigValid || !verifiedConfig) return;
  await runEntry(verifiedConfig, "firebase");
}

export async function requestRoomEntry(rawRoomCode, sourceButton, joinRoom) {
  const roomCode = sanitizeRoomInput(rawRoomCode);
  if (!roomCode) {
    await joinRoom(rawRoomCode, sourceButton);
    return;
  }

  const entry = { start: () => joinRoom(roomCode, sourceButton) };
  let config;
  try {
    const inviteConfig = await getConfigFromInvite(rawRoomCode);
    const currentUrl = new URL(window.location.href);
    config = inviteConfig || (currentUrl.searchParams.has(URL_PARAM)
      ? await decodeConfig(currentUrl.searchParams.get(URL_PARAM))
      : null);
  } catch (error) {
    openAccessDialog(entry, { message: error?.message || "El enlace Firebase no es válido." });
    return;
  }

  if (!config) {
    setFirebaseConfig(null);
    openAccessDialog(entry);
    return;
  }

  try {
    await verifyFirebaseConfig(config);
    setFirebaseConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    await updateFirebaseUrl(config);
    await entry.start();
  } catch (error) {
    openAccessDialog(entry, { initialConfig: config, message: formatValidationError(error) });
  }
}

input?.addEventListener("input", () => scheduleConfigVerification());
submitButton?.addEventListener("click", () => { void submitFirebaseAccess(); });
localButton?.addEventListener("click", () => { void runEntry(null, "local"); });
document.querySelector("#firebaseAccessClose")?.addEventListener("click", () => dialog.close());
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog?.addEventListener("close", () => {
  hideTooltip(true);
  restoreTooltipLayers();
  pendingEntry = null;
  cancelValidation();
  setValidationStatus("idle", "Pegá una apiKey o el JSON de configuración completo para comprobar la conexión.");
});
