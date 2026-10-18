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
| Chat inferior | Conserva el orden video/chat; JavaScript considera proporción del video, altura de paneles y scroll. | Compartir el espacio solo si video y chat siguen siendo utilizables; si no, usar paneles secuenciales con scroll o chat superpuesto. |
| Móvil / fullscreen | Reglas de CSS y JavaScript varían por orientación, teclado, barras del navegador y fullscreen. | Tratar esos estados como cambios del espacio visible y mantener una composición que no comprima video ni chat. |

## Seguimiento

- [x] **D1 — Lobby:** selección entre columnas y apilado según el espacio útil; apariencia preservada.
- [ ] **D2 — Chat lateral:**
  - [ ] Mantener independiente el dock elegido de la composición responsive y del estado abierto/contraído.
  - [ ] Definir como estados distintos: paralelo, apilado (video arriba/chat abajo) y overlay (chat sobre video).
  - [ ] Sustituir la detección por `chatRect.top` y el apilado forzado por puntero táctil por una decisión basada en espacio útil y mínimos de video, chat y escritura.
  - [ ] Tratar el overlay móvil como un estado de composición explícito, conservando su apariencia actual.
  - [ ] Resolver la composición con el chat contraído sin cambiar temporalmente los estilos del panel real.
  - [ ] Hacer que CSS y transiciones consuman la misma composición calculada, con la animación adecuada al cambio geométrico.
  - [ ] Conservar el scroll, el foco y los controles al cambiar de composición o dock.

- [ ] **D3 — Chat inferior:** revisar la distribución de video y chat.
- [ ] **D4 — Móvil:** revisar orientación, barras y teclado.
