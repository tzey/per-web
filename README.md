# PER · Teoría y simulador

Sitio estático para preparar el examen teórico del Patrón de Embarcaciones de Recreo. Sin build, sin dependencias, sin backend: HTML, CSS y JavaScript de módulos nativos, con el contenido en ficheros de datos. Incluye una mesa de carta interactiva con instrumentos virtuales y ejercicios generados con semilla sobre cartas didácticas de geografía ficticia.

## Arrancar en local

Hace falta un servidor porque el temario y los bancos de preguntas se cargan con `fetch`. Con doble clic sobre el HTML no funciona.

```bash
python3 -m http.server 8000
# http://localhost:8000
```

O, sin Python, con el servidor mínimo incluido:

```bash
node tools/servir.js 8000
```

## Desplegar en Cloudflare Pages

Sin comando de build. En la configuración del proyecto:

- Build command: *vacío*
- Build output directory: `/` (o la carpeta del repo donde esté `index.html`)

Cada push a la rama conectada publica. Al cambiar contenido, **sube `VERSION` en `sw.js`** o el service worker seguirá sirviendo la copia anterior a quien ya haya visitado el sitio.

## Estructura

```
index.html            Portada, rosa de compás interactiva y panel de progreso
temario.html          Shell que ensambla los fragmentos de content/
carta.html            Técnicas del ejercicio de carta y ejercicios autocorregibles
test.html             Simulador: modelo A/B, modo examen o repaso
practicas.html        Portada de prácticas: bloques de ejercicios y simulacro de carta
mesa.html             Mesa de carta: carta SVG, instrumentos, ejercicio y panel
assets/css/main.css   Tokens y componentes
assets/css/practicas.css  Mesa, simbología de carta e instrumentos
assets/js/comun.js    Baremo oficial, corrección, progreso y navegación
assets/js/practicas/  geo (cálculo náutico), mercator (proyección), carta (dibujo SVG),
                      instrumentos (compás, transportador, lápiz), ejercicios (generadores),
                      sesion (persistencia) y mesa (controlador)
content/utNN.html     Una unidad teórica por fichero
content/vela.html     Ampliación de vela
data/modelo-a.json    45 preguntas
data/modelo-b.json    45 preguntas
data/ejercicios-carta.json
data/cartas/*.json    Cartas didácticas sintéticas (esquema más abajo)
data/tablilla-desvios.json
tests/                Pruebas con el runner nativo de Node
tools/                Generador de cartas y servidor estático de desarrollo
sw.js                 Caché offline
```

## Pruebas

Sin dependencias, con el runner de Node (22.7 o superior):

```bash
node --test tests/
```

Cubren el cálculo náutico, la proyección, el esquema de las cartas, los generadores (mil semillas por tipo sin casos degenerados), los instrumentos y la lista de recursos del service worker.

## Baremo implementado

Está en `assets/js/comun.js`, en las constantes `UNIDADES` y `BAREMO`. Es el único sitio donde tocar si cambia la normativa.

| | |
|---|---|
| Preguntas | 45, cuatro opciones, sin penalización |
| Tiempo | 90 minutos |
| Aciertos mínimos | 32 |
| Errores máximos | 13 |
| Balizamiento | 5 preguntas, mínimo 3 aciertos |
| RIPA | 10 preguntas, mínimo 5 aciertos |
| Carta de navegación | 4 preguntas, mínimo 2 aciertos |

Las preguntas en blanco cuentan como error, y así las trata `corregir()`.

## Ampliar el banco de preguntas

Formato de cada pregunta:

```json
{
  "id": "a01",
  "ut": "ut05",
  "p": "Enunciado",
  "o": ["opción 0", "opción 1", "opción 2", "opción 3"],
  "correcta": 2,
  "e": "Por qué esa es la correcta y dónde está la trampa",
  "ref": "UT5 · Marcas laterales"
}
```

`correcta` es el **índice** dentro de `o`, no la letra: el simulador baraja las opciones en cada intento, así que la letra cambia. `ut` debe coincidir con un `id` de `UNIDADES`.

Para añadir un modelo C: crea `data/modelo-c.json`, añade un botón `data-modelo="c"` en `test.html` e inclúyelo en `RECURSOS` de `sw.js`.

Validador rápido de distribución:

```bash
python3 - <<'EOF'
import json, collections
esperado = {'ut01':4,'ut02':2,'ut03':4,'ut04':2,'ut05':5,'ut06':10,
            'ut07':2,'ut08':3,'ut09':4,'ut10':5,'ut11':4}
for m in ('a','b'):
    ps = json.load(open(f'data/modelo-{m}.json'))['preguntas']
    c = collections.Counter(p['ut'] for p in ps)
    print(m, len(ps), 'OK' if c == collections.Counter(esperado) else dict(c))
EOF
```

## Sobre la carta de navegación

El ejercicio de carta del examen se resuelve sobre la carta oficial de enseñanza del Instituto Hidrográfico de la Marina, que entrega el tribunal y que no puede reproducirse aquí por derechos. `carta.html` cubre los procedimientos de trazado paso a paso y plantea ejercicios numéricos autosuficientes que entrenan el mismo razonamiento.

La mesa de carta (`mesa.html`) trabaja sobre **cartas didácticas sintéticas**: costa, sondas, faros y topónimos inventados, situados en una zona del Atlántico sin tierra real y con el sello «CARTA DIDÁCTICA · GEOGRAFÍA FICTICIA» en el cartucho, el margen y el título accesible del SVG. La proyección es Mercator real (escala de latitudes variable), así que medir en la escala de longitudes o lejos de la latitud navegada da un resultado distinto, y el compás virtual lo detecta. La carta costera se genera con `python3 tools/generar-carta-costera.py`; el JSON resultante es lo que se versiona.

### Esquema de una carta

```json
{
  "id": "estrecho-didactico", "version": 1,
  "meta": { "nombre", "subtitulo", "sello", "tipo": "costera|portulano", "escala", "datum", "edicion",
            "unidadSondas", "ceroHidrografico", "limites": {"latMin","latMax","lonMin","lonMax"},
            "viewBox": {"ancho", "margen"}, "cartucho": {"pos", "anchoPx"} },
  "rosa": { "centro": [lat, lon], "radioPx", "dm", "anyo", "variacionAnual" },
  "costa": [{ "id", "nombre", "poligono": [[lat, lon], ...] }],
  "veriles": [{ "prof", "poligono" }],
  "sondas": [{ "pos", "prof", "fondo" }],
  "faros": [{ "id", "nombre", "pos", "caracteristica": "Fl(2) W 10s 22M", "alturaFoco", "alcance", "conspicuo" }],
  "marcas": [{ "id", "tipo", "nombre", "pos" }],
  "boyas": [{ "id", "tipo": "lateral-babor|lateral-estribor|cardinal-N|S|E|W|peligro-aislado|aguas-navegables|especial", "pos", "luz" }],
  "peligros": [{ "id", "tipo": "bajo|naufragio|roca", "nombre", "pos", "prof", "radioM" }],
  "enfilaciones": [{ "id", "objetos": ["anterior", "posterior"], "descripcion" }],
  "zonas": [{ "id", "tipo": "prohibida|fondeadero|cable|banistas", "etiqueta", "poligono" | "linea" }],
  "puertos": [{ "id", "nombre", "pos", "puertoMareas", "bocana": {"babor", "estribor"} }],
  "toponimos": [{ "texto", "pos", "estilo" }]
}
```

Coordenadas en grados decimales con signo (N y E positivos); `dm` en grados con signo (E positivo) y `variacionAnual` en minutos por año. Los polígonos se cierran repitiendo el primer vértice; los veriles se listan de profundo a somero y pueden invadir tierra, porque la tierra se pinta encima. `node --test tests/cartas.test.js` valida todo esto, incluida una lista negra de topónimos reales.

### Añadir un tipo de ejercicio

En `assets/js/practicas/ejercicios.js`: una entrada en `TIPOS` y una función en `GENERADORES` que reciba el contexto (carta, tablilla, año, opciones, `fijar`) y el PRNG, y devuelva `enunciado`, `visibles`, `real` (con `respuesta` por campo), `solucion` (pasos con `trazo` opcional) y `campos`. Si el caso sale mal (objeto no visible, corte estrecho, punto en tierra), devuelve `real.degenerado` y el generador reintenta con otra semilla derivada. Añade el tipo al barrido de mil semillas en `tests/ejercicios.test.js`.

## Fuentes

- Real Decreto 875/2014, de 10 de octubre (texto consolidado), Anexo II.
- Reglamento internacional para prevenir abordajes, OMI.
- Sistema de balizamiento marítimo IALA, región A.

Contenido de elaboración propia. No reproduce exámenes oficiales. Verifica siempre la convocatoria y los criterios de corrección ante la administración que te examine.
