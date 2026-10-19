# Disposiciones responsive

## Contrato temporal

- Mantener exactamente la apariencia actual; mejorar las decisiones de diseño responsive cuando sea necesario.
- Razonar la mejor opción con una mirada profesional; priorizar decisiones de diseño generales y centralizadas, robustas ante cambios dinámicos, sobre reglas específicas o lógica mezclada.

## Análisis: qué hace hoy / qué sería ideal

Hoy, CSS y JavaScript deciden la composición desde criterios repartidos entre dimensiones, media queries, puntero y estados especiales. La intención visual no siempre queda clara en un solo lugar. En teoría, la disposición debería conservar la elección de dock y adaptarse al espacio útil y a las dimensiones de sus componentes. La tabla resume el análisis; lo ideal aún requiere pruebas.

| Zona | Qué hace hoy | Qué sería ideal — hipótesis a probar |
|---|---|---|
| Lobby | JavaScript compara el espacio útil del grid con mínimos del hero y boleto; apila si no alcanzan. También ajusta el boleto. | Mantener columnas si ambas áreas caben; apilar si no, conservando la apariencia de cada disposición. |
| Chat lateral | Mide si video y chat caben en fila; el puntero táctil fuerza apilado y hasta 680 px el chat puede cubrir el reproductor. | Mantener el dock lateral elegido y decidir entre paralelo, apilado o superpuesto según el espacio. El puntero ajusta controles, no determina por sí solo la composición. |
| Chat inferior | Un resolver compara las dimensiones mínimas del video y chat con el espacio compartido; CSS aplica el reparto o la secuencia con scroll. | Decidir con las restricciones útiles de cada componente y el espacio del contenedor. Si no caben juntos, mantener video seguido de chat con scroll; no superponerlo sobre la línea de tiempo. |
| Móvil | Reglas de CSS y JavaScript varían por orientación, teclado y barras del navegador. | Tratar esos cambios como variaciones del espacio visible y mantener una composición que no comprima video ni chat. |

## Seguimiento

- [x] **D1 — Lobby:** selección entre columnas y apilado según el espacio útil; apariencia preservada.
- [x] **D2 — Chat lateral:**
  - [x] Separar el dock elegido, la composición visible y el chat abierto/contraído.
  - [x] Representar claramente las tres composiciones: paralelo (video y chat lado a lado), apilado (video arriba y chat abajo) y overlay (chat sobre el video).
  - [x] Elegir la composición con el ancho útil del workspace y mínimos del reproductor y del chat, incluido el compositor; el puntero no decide la composición.
  - [x] Mantener el overlay móvil como estado explícito y conservar su apariencia actual.
  - [x] Calcular el estado contraído desde las dimensiones configuradas, sin alterar temporalmente los estilos del chat real.
  - [x] Usar la misma composición en CSS y al elegir la transición entre docks; un chat contraído cambia de dock sin animar contenido oculto.
  - [x] Unificar el cambio de dock abierto: contraer el actual, cambiar el dock en estado contraído y expandir el destino con su mecanismo normal.
  - [x] Conservar scroll, foco y controles al cambiar la composición o el dock.

- [x] **D3 — Chat inferior:**
  - [x] Resolver con la proporción del video y los mínimos de controles, historial y compositor del chat.
  - [x] Comparar con el espacio útil definido por el layout; el puntero no elige la composición.
  - [x] Usar un resolver y dejar a CSS repartir tamaños mínimos o presentar los paneles en secuencia con scroll.
  - [x] Calcular sin modificar temporalmente el layout visible; agrupar recálculos ante cambios relevantes.
  - [x] Conservar el orden video/chat y la apariencia actual.
  - [x] Mantener el cálculo independiente de que el chat esté expandido o contraído.
  - [x] Revisar ambos modos en más tamaños.
  - [x] Extender 1 px el alto máximo de la fila para alinear el header al final del scroll.
  - [x] Coordinar la animación de las filas con la contracción y expansión del chat.
- [x] **D4 — Móvil (sala):**
  - [x] Separar viewport estructural estable (`100lvh`/métrica bloqueada) del área visible que puede reducir el teclado; cambios de barras no deben alterar la sala.
  - [x] Quitar orientación ancho/alto como selector de composición; decidir por el espacio útil del workspace y las restricciones de video/chat.
  - [x] Auditar clases y media queries de orientación para que una deformación de panel o viewport no active una composición apaisada.
  - [x] Centralizar la detección del teclado: foco en el campo y reducción dinámica desde la referencia estable, excluyendo las barras del navegador.
  - [x] Mantener los ajustes geométricos propios de cada dock como consumidores del estado común, sin duplicar la detección.
  - [x] Concentrar 80 px como tolerancia provisional de fallback, no como tamaño del teclado; ajustar mediante pruebas.
  - [x] No activar `VirtualKeyboard.overlaysContent`; evaluar su geometría solo si puede conservarse el comportamiento actual.
  - [x] Verificar barras sin teclado, apertura/cierre en ambos docks y rotación real; lobby queda fuera de D4.
