# PER · Teoría y simulador

Sitio estático para preparar el examen teórico del Patrón de Embarcaciones de Recreo. Sin build, sin dependencias, sin backend: HTML, CSS y JavaScript de módulos nativos, con el contenido en ficheros de datos.

## Arrancar en local

Hace falta un servidor porque el temario y los bancos de preguntas se cargan con `fetch`. Con doble clic sobre el HTML no funciona.

```bash
cd per
python3 -m http.server 8000
# http://localhost:8000
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
assets/css/main.css   Tokens y componentes
assets/js/comun.js    Baremo oficial, corrección, progreso y navegación
content/utNN.html     Una unidad teórica por fichero
content/vela.html     Ampliación de vela
data/modelo-a.json    45 preguntas
data/modelo-b.json    45 preguntas
data/ejercicios-carta.json
sw.js                 Caché offline
```

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

El ejercicio de carta del examen se resuelve sobre la carta oficial de enseñanza del Instituto Hidrográfico de la Marina, que entrega el tribunal y que no puede reproducirse aquí por derechos. `carta.html` cubre los procedimientos de trazado paso a paso y plantea ejercicios numéricos autosuficientes que entrenan el mismo razonamiento; la parte de compás y transportador hay que practicarla sobre el ejemplar propio.

## Fuentes

- Real Decreto 875/2014, de 10 de octubre (texto consolidado), Anexo II.
- Reglamento internacional para prevenir abordajes, OMI.
- Sistema de balizamiento marítimo IALA, región A.

Contenido de elaboración propia. No reproduce exámenes oficiales. Verifica siempre la convocatoria y los criterios de corrección ante la administración que te examine.
