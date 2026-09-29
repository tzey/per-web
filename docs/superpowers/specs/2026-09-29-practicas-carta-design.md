# Plan: módulo de prácticas PER (fases 1 y 2 del informe)

## Contexto

El repo es un sitio estático (HTML + CSS + JS de módulos nativos, sin build ni dependencias) para preparar el examen teórico del PER: temario, taller de carta numérico y simulador de test. Se despliega en Cloudflare Pages con service worker y progreso en `localStorage`.

El informe `informe_practicas_PER_aplicacion_web.md` (raíz del checkout principal, sin versionar) especifica una aplicación de entrenamiento de prácticas. Es demasiado amplio para una entrega y él mismo recomienda cuatro fases. Decisiones tomadas con el usuario:

| Decisión | Elección |
|---|---|
| Alcance | Fases 1 y 2: carta interactiva + sondas, mareas, GNSS y fondeo |
| Interacción | Instrumentos virtuales (compás de puntas y transportador arrastrables y giratorios); la app detecta errores de manipulación |
| Cartas | Dos sintéticas: costera tipo estrecho para UT11 y portulano a gran escala para fondeo y sondas |
| Motor | SVG nativo sin dependencias, proyección Mercator propia |

Requisitos heredados del informe: las cartas son ficticias y lo dicen de forma visible; nada acredita horas reglamentarias; el modo examen de UT11 va sin viento ni corriente y sin calculadora; las tolerancias dependen de la escala de la carta.

Fuera de alcance: instructor, radio, maniobras de dársena, tráfico/RIPA interactivo, vela, travesía, cuentas y backend.

## Decisiones transversales

- Coordenadas en JSON como `[lat, lon]` decimales con signo (N+, E+). `dm` en grados con signo (E+), `variacionAnual` en minutos/año con signo.
- Geografía ficticia en ~36° N y 12–13° O (Atlántico abierto, sin tierra real). Topónimos de aves y flora ibéricas (Grulla, Alcotán, Alcaraván, Sisón). Prueba con lista negra de topónimos reales del Estrecho.
- Módulos de cálculo (`geo`, `mercator`, `ejercicios`, puras de `carta` e `instrumentos`) sin `document` en la carga, para `node --test` (Node 26 disponible, sin package.json).
- CSS propio en `assets/css/practicas.css`, cargado solo por las dos páginas nuevas. `main.css` se toca en una línea.
- Persistencia: se guarda `{tipo, semilla, cartaId, versionCarta}` y se regenera; nunca el objeto ejercicio (lleva funciones). Clave `per.practicas.v1`. Constante `VERSION_GENERADORES`; si no coincide, la sesión se muestra archivada.
- Zoom y pan en un único `<g id="mundo" transform>`; instrumentos y trazos son hijos, así todas las medidas van en unidades viewBox e ignoran el zoom. Eventos convertidos con `getScreenCTM().inverse()`, `setPointerCapture`, `touch-action: none`, `vector-effect="non-scaling-stroke"`.
- Proyección de dibujo con latitud creciente real (escala lateral variable de verdad); cálculo numérico con plano de latitud media, como en el examen (< 0,05 M de diferencia en 30'). Una prueba fija esa coherencia.
- PRNG mulberry32; semilla efectiva `hash(tipo + ':' + semilla)`.

## Páginas y navegación

- `practicas.html`: portada del módulo. Tarjetas por bloque (Carta UT11, Mareas y sonda, GNSS, Fondeo) con estado del historial, botón "Simulacro de carta" con selector de reloj, panel de progreso.
- `mesa.html`: mesa de carta. Escritorio: SVG a la izquierda, panel derecho con enunciado, herramientas, campos y pistas. Móvil: panel debajo en `<details>`. Parámetros de URL: `?tipo=&semilla=&carta=&modo=`.
- Rail: grupo "Prácticas" en `pintarRail` (comun.js, tras el grupo "Estudio", línea 117). Cuarta tarjeta en `index.html` (líneas 69-82). `sw.js`: `VERSION = 'per-v2'` y recursos nuevos.

## Módulos JS (`assets/js/practicas/`)

- `geo.js` (puro): `normalizar`, `diferenciaAngular`, `reciproco`, `parsearGrados` (acepta `36° 12,5' N`, `36 12.5 N`, `-12,3`), `formatearGrados`, `formatearAngulo`, `parsearHora`/`formatearHora`, `rumboDistancia(a,b)`, `puntoDesde`, `correccionTotal`, `rumboVerdadero`, `rumboAguja`, `demoraVerdadera`, `marcacionADemora`, `declinacionActualizada`, `desvioPorTablilla` (interpolación circular), `estima`, `tiempoParaDistancia`, `eta`, `cortarRectas` (null si paralelas, devuelve ángulo de corte), `calidadCorte` (≥60 buena, ≥30 aceptable, <30 baja), `situacionDemoraDistancia`, `alturaMarea` (interpolación y doceavos), `horaParaAltura`, `eventosAlrededor`, `sondaReal`, `resguardo`, `radioBorneo`, `hayGarreo`.
- `mercator.js` (puro): `latitudCreciente`, `crearProyeccion(meta)` → `{ aPx, aGeo, pxPorMinutoLat(lat), pxPorMinutoLon, marco, enEscalaLateral(p), millasEntrePx(p1,p2), graduacion(eje, paso) }`.
- `carta.js`: `pintarCarta(svg, carta, proyeccion)` → capas; `fichaObjeto(id)`; puras exportadas `descomponerCaracteristica('Fl(2) W 10s 22M')`, `estiloBoya(tipo)` (región A), `textoRosa(rosa, anyo)`. Dibuja marco graduado con minutos y décimas, veriles 50→5 como polígonos que invaden tierra y tierra encima, sondas con decimal en subíndice, faros, boyas, peligros, enfilaciones, zonas, rosa, cartucho de metadatos y sello en cartucho, esquina y `<title>` del SVG. Zoom con rueda sobre el cursor, pan por arrastre, doble clic reinicia. Ficha ENC al tocar objeto.
- `instrumentos.js`: puras `puntoSvg`, `evaluarLecturaCompas(p1,p2,proy)` → `{ millas|null, motivo: ok|no-en-escala|en-longitudes|latitud-alejada }`, `evaluarTransportador(leido, esperado)` → `{ ok, reciproco, error }`. Con DOM: `crearZoomPan`, `crearCompasPuntas`, `crearTransportador` (grupo `tabindex=0 role=slider`, flechas 0,5°, Mayús 5°, regla hija del mismo grupo), `crearLapiz` (modos recta, punto, estima, observada, borrar; deshacer/rehacer con Ctrl+Z / Ctrl+Mayús+Z; trazos con timestamp).
- `ejercicios.js` (puro): `crearPrng`, `entero`, `decimal`, `elegir`, `TOLERANCIAS` por escala (1:100 000 → ±0,5' lat, ±1°, ±0,3 M; 1:10 000 → ±0,05', ±1°, ±0,03 M, ±0,1 m), `TIPOS`, `generar(tipo, ctx)`, `generarSimulacro(ctx)` (4 encadenados sobre la costera, sin viento ni corriente), `esDegenerado(ej)`, `puntuar(respuestas)`. Cada `gen_<tipo>(ctx, prng)` reintenta hasta 50 veces mientras sea degenerado. Objeto devuelto: `{ id, tipo, bloque, titulo, semilla, cartaId, versionCarta, enunciado, visibles, real, solucion[{texto, valor?, trazo?}], campos[{id, etiqueta, tipo, eje?}], tolerancia, opciones{viento, corriente}, validar(respuesta) → {correcto, detalle[], avisos[]} }`.
- `sesion.js`: `crearSesion({modo, cartaId, ejercicios, errores})` con estado real frente a percibido (`errores.desvioExtra`, `dmExtra` solo en aprendizaje), `registrarTrazo`, `registrarRespuesta`, `guardar`; `leerHistorial`; `registrarResultado` que también llama a `progreso.registrarIntento({ modelo: 'Carta', modo, aciertos, total: 4, apto })` para que encaje con el panel de `index.html:171`.
- `mesa.js`: controlador de `mesa.html`; modos aprendizaje y examen.

## Datos (`data/`)

- `cartas/estrecho-didactico.json`: `{ id, version, meta{nombre, subtitulo, sello, tipo, escala, proyeccion, datum, edicion, unidadSondas, ceroHidrografico, limites{latMin..lonMax}, viewBox{ancho, alto, margen}, cartucho}, rosa{centro, radioPx, dm, anyo, variacionAnual}, costa[{id, nombre, poligono}], veriles[{prof, poligono}], sondas[{pos, prof, fondo}], faros[{id, nombre, pos, caracteristica, alturaFoco, alcance, conspicuo}], marcas[], boyas[{id, tipo, pos, luz, nombre}], peligros[{id, tipo, pos, prof, radioM}], enfilaciones[{id, objetos[2], descripcion}], zonas[{id, tipo, poligono|linea, etiqueta}], puertos[{id, nombre, pos, puertoMareas, bocana}], toponimos[] }`. Costera ~1:100 000, límites 35,75–36,25 N y 13,0–12,25 O, dos costas, dos puertos, 6–8 faros, boyas laterales, cardinal, peligro aislado, 2–3 bajos, veriles 5/10/20/50, ~60 sondas, una enfilación, zona prohibida. Vértices con 4 decimales, ~80 por costa y ~40 por veril (25–35 KB).
- `cartas/puerto-didactico.json`: mismo esquema, `tipo: portulano`, escala 10 000, ~3'×4', bocana con laterales, dársena, fondeadero con sondas densas y fondo, cable, bañistas.
- `mareas-didacticas.json`: `{ anyo, ceroHidrografico, puertos{ id: {nombre, patron, referencia?, diferencias?} }, anuario{ puerto: { 'AAAA-MM-DD': [['BM','03:12',0.6], ['PM','09:25',3.4], ...] } } }`. 14–30 días generados con senoide semidiurna (12 h 25 min), carrera 1,8–3,6 m.
- `tablilla-desvios.json`: `{ compas, fecha, paso: 15, filas[{ra, desvio}] }`, 24 filas.

## Modos

- Aprendizaje: lecturas numéricas activables (lat/lon bajo el cursor, millas del compás, ángulo del transportador), pistas de una en una revelando `solucion[i]` y su trazo en la capa solución, solución completa superpuesta, avisos de manipulación, deshacer ilimitado, viento y corriente opcionales, errores de instrumento configurables, deslizador de hora de marea.
- Examen: `generarSimulacro` con semilla fija, reloj 20 min por defecto (`hhmmss`, `.reloj`, `.test-cab` reutilizados), sin lecturas, pistas ni calculadora, sin viento ni corriente, entrega al agotar, veredicto con mínimo 2/4 en `.veredicto`, registrado en el progreso.

## Fases de ejecución (TDD: prueba antes que código)

Servidor local para comprobar: `python3 -m http.server 8000`. Pruebas: `node --test tests/`.

- **F0 Spec y arnés.** Copiar este diseño a `docs/superpowers/specs/2026-09-29-practicas-carta-design.md` y commit. Crear `tests/geo.test.js` con importación trivial y `geo.js` vacío.
- **F1 geo.js.** Pruebas: normalizar(−10)=350; parsear/formatear ida y vuelta; `rumboDistancia` reproduce c9/c10 de `data/ejercicios-carta.json` (20,1 M, 053°); `puntoDesde` inversa ±0,01'; c1 (127, dm −2, Δ +3 → 128); c2 (310, Ct +3 → 307); c3 (−3,333, 2018, 7', 2026 → −2,4); paralelas → null, 71° → buena; c11 marea 09:00 → 2,0 m; c12 hora para 1,9 m; `radioBorneo(10,30,8)=38,9`; garreo con 4° → true.
- **F2 mercator.js.** Pruebas: `aGeo(aPx(p))≈p` en 200 puntos; esquinas del marco; `pxPorMinutoLat(36,25) > pxPorMinutoLat(35,75)`; `millasEntrePx` coincide con `geo.rumboDistancia` ±0,05 M; `graduacion('lat',1)` con décimas.
- **F3 Datos costera + tablilla.** `tests/cartas.test.js`: polígonos cerrados con ≥3 vértices, `pos` dentro de límites, ids únicos, enfilaciones válidas, veriles ordenados, características casan con la regex, sello exacto, lista negra de topónimos, tablilla de 24 filas.
- **F4 carta.js + practicas.css + mesa.html mínima.** Pruebas de las puras. Navegador: marco legible a zoom 1 y 4, tierra/veriles con `--tierra`/`--sonda`, rosa, sello, zoom/pan, ficha ENC.
- **F5 ejercicios.js fase 1.** Tipos: `coordenadas-objeto`, `distancia-tiempo-eta`, `rumbo-verdadero-aguja`, `declinacion-ct-enfilacion`, `estima`, `situacion-dos-demoras`, `situacion-enfilacion-demora`, `situacion-demora-distancia`, `derrota-resguardo-peligro`. Pruebas: determinismo por semilla; 1000 semillas × 9 tipos nunca degenerados y situación en agua (punto en polígono contra `costa`); `validar(real)` correcto y `validar(real ± 2×tol)` incorrecto; cambiar dm/desvío cambia `visibles.ra` y no `real.rv`; enfilación conserva demora verdadera geométrica; corte < 30° rechazado; simulacro de 4 con `viento === null && corriente === null` y encadenado.
- **F6 mesa.js aprendizaje sin instrumentos.** Comprobación en navegador: `mesa.html?tipo=estima&semilla=7`; campos con coma decimal; Comprobar, Pista, Solución, Otro; lecturas numéricas.
- **F7 instrumentos.js.** Pruebas de puras: ok / no-en-escala / en-longitudes / latitud-alejada (> 8'); invariancia al zoom (escalas 1, 2, 4); `evaluarTransportador(226, 46)` → recíproco. Navegador: ratón y teclado, misma lectura a zoom 1 y 3, lápiz con deshacer/rehacer.
- **F8 sesion.js + errores + viento/corriente.** Pruebas: `percibido` con desvío extra; guardar/leer con `localStorage` inyectado; `registrarResultado` llama a `progreso.registrarIntento` con la forma acordada. Navegador: trazos persisten al recargar; viento/corriente desplazan la estima con explicación.
- **F9 Modo examen.** Prueba de `puntuar`. Navegador: `mesa.html?modo=examen`, reloj, sin ayudas, entrega, veredicto, aparece como "Carta" en el panel de `index.html`.
- **F10 practicas.html, rail, index, sw, README.** `tests/sw.test.js`: extrae `RECURSOS` de `sw.js` y comprueba que todos los ficheros existen y `VERSION !== 'per-v1'`. Cambios: comun.js grupo "Prácticas"; sw.js versión y recursos; index.html tarjeta y `meta description`; main.css línea 118 rejilla de 2/4 columnas; carta.html enlace a la mesa en la nota de aviso; README estructura, sección "Pruebas" (Node ≥ 22.7), carta didáctica ficticia, esquema de carta y cómo añadir un tipo de ejercicio.
- **F11 Fase 2: mareas, sonda, GNSS.** `mareas-didacticas.json`; tipos `marea-altura-hora`, `marea-resguardo-paso`, `marea-hora-minima`, `gnss-vs-estima`, `gnss-waypoint-mob`. Pruebas de anuario (alternancia BM/PM, horas crecientes, carrera 1,5–3,8 m) y de generadores; bajar la marea dispara la alerta de resguardo con sonda, altura y calado. Navegador: deslizador de hora y ficha de sonda real.
- **F12 Fase 2: portulano y fondeo.** `puerto-didactico.json`; tipos `fondeo-borneo-bajamar`, `fondeo-garreo`; mismas pruebas de esquema y 1000 semillas; `TOLERANCIAS[10000]`. Navegador: `mesa.html?carta=puerto-didactico`, círculo de borneo y colisión con cable/bañistas.

Cada fase termina con `node --test tests/` en verde y un commit.

## Riesgos y mitigación

- `cache.addAll` es atómico: un recurso mal escrito bloquea `per-v2`. Cubierto por `tests/sw.test.js`. `tests/` no va en `RECURSOS`.
- Panel de `index.html` imprime `modelo ${ult.modelo}`: los intentos de prácticas llevan `modelo: 'Carta'` y `total: 4`.
- Recíproco del transportador detectado por `|diferenciaAngular| > 170`.
- Autoría de JSON a mano: dibujar en cuadrícula de 45'×30' y validar con `tests/cartas.test.js` antes de pintar.

## Verificación final

1. `node --test tests/` todo en verde.
2. Servidor local y recorrido completo: índice → Prácticas → mesa en aprendizaje (estima, dos demoras, marea) → simulacro de examen entregado → veredicto en el panel del índice.
3. Misma medida del compás a zoom 1 y 3; cambiar la fecha cambia `Ra` y no la derrota trazada.
4. DevTools → Application: service worker `per-v2` instalado; `mesa.html` carga sin red.
5. Vista móvil (375 px): panel plegable, sin desplazamiento horizontal, instrumentos manejables con puntero táctil.
