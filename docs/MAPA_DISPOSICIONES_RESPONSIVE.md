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

- [ ] **D3 — Chat inferior:** revisar la distribución de video y chat.
- [ ] **D4 — Móvil:** revisar orientación, barras y teclado.
