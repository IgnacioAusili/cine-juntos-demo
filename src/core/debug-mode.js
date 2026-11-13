// Cambiar a true para habilitar las rutas de prueba y las herramientas de diagnóstico.
export const DEBUG_MODE = true;

export function isDebugMode() {
  return DEBUG_MODE;
}

export function initializeDebugMode() {
  document.documentElement.dataset.debugMode = String(DEBUG_MODE);
  return DEBUG_MODE;
}
