#!/usr/bin/env python3
"""Genera data/cartas/puerto-didactico.json: portulano sintético 1:10 000 del
Puerto de la Grulla (geografía ficticia). Determinista."""
import json, math, os

LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 36.140, 36.190, -12.870, -12.800
R = lambda v: round(v, 5)
RAD = math.pi / 180
COS = math.cos(36.165 * RAD)

def costa(lon):
    """Latitud de la línea de costa (tierra al norte)."""
    base = 36.172 + 0.0015 * math.sin((lon + 12.87) / 0.07 * 2 * math.pi * 1.3)
    base += 0.004 * math.exp(-((lon + 12.86) / 0.006) ** 2)     # Playa de la Grulla, ensenada
    return base

LONS = [LON_MIN + i * 0.0025 for i in range(29)]
LONS[-1] = LON_MAX

def poligono_tierra(desplaz_min=0):
    d = desplaz_min / 60
    pts = [[LAT_MAX, LON_MIN]] + [[R(costa(l) - d), R(l)] for l in LONS] + [[LAT_MAX, LON_MAX]]
    return pts + [pts[0]]

def rect(lat0, lat1, lon0, lon1):
    p = [[lat0, lon0], [lat1, lon0], [lat1, lon1], [lat0, lon1]]
    return [[R(a), R(b)] for a, b in p] + [[R(lat0), R(lon0)]]

def circulo(centro, radio_min, n=20):
    lat0, lon0 = centro
    pts = [[R(lat0 + radio_min / 60 * math.cos(2 * math.pi * i / n)), R(lon0 + radio_min / 60 * math.sin(2 * math.pi * i / n) / COS)] for i in range(n)]
    return pts + [pts[0]]

# Dique (oeste, en L) y contradique (este, en L)
dique = [[36.1735, -12.8465], [36.158, -12.8465], [36.158, -12.836], [36.160, -12.836], [36.160, -12.8445], [36.1735, -12.8445]]
dique = [[R(a), R(b)] for a, b in dique] + [dique[0]]
contra = [[36.1735, -12.825], [36.163, -12.825], [36.163, -12.8335], [36.165, -12.8335], [36.165, -12.827], [36.1735, -12.827]]
contra = [[R(a), R(b)] for a, b in contra] + [contra[0]]

def en_dique(lat, lon):
    return (-12.8465 <= lon <= -12.8445 and 36.158 <= lat <= 36.1735) or (-12.8465 <= lon <= -12.836 and 36.158 <= lat <= 36.160) \
        or (-12.827 <= lon <= -12.825 and 36.163 <= lat <= 36.1735) or (-12.8335 <= lon <= -12.825 and 36.163 <= lat <= 36.165)

def en_darsena(lat, lon):
    return -12.8445 < lon < -12.827 and 36.160 < lat < costa(lon)

def profundidad(lat, lon):
    if en_darsena(lat, lon):
        return 3.0 + 2.0 * (costa(lon) - lat) / 0.012
    d = (costa(lon) - lat) * 60           # minutos hacia el sur
    p = 1.2 + 9.5 * max(0, d) ** 0.95
    # bajo rocoso frente a la playa
    db = math.hypot((lat - 36.163) * 60, (lon + 12.862) * 60 * COS)
    if db < 0.25:
        p = min(p, 0.8 + (p - 0.8) * (db / 0.25) ** 1.5)
    return p

# sondas
sondas = []
semilla = 777
def rnd():
    global semilla
    semilla = (semilla * 1103515245 + 12345) % 2**31
    return semilla / 2**31
lat = LAT_MIN + 0.002
while lat < LAT_MAX - 0.002:
    lon = LON_MIN + 0.003
    while lon < LON_MAX - 0.002:
        la, lo = lat + (rnd() - 0.5) * 0.002, lon + (rnd() - 0.5) * 0.003
        if la < costa(lo) - 0.0015 and not en_dique(la, lo):
            p = profundidad(la, lo) * (1 + (rnd() - 0.5) * 0.1)
            p = round(p, 1) if p < 20 else round(p)
            fondo = 'F' if en_darsena(la, lo) else ('A' if p < 6 else 'F' if p < 12 else 'A')
            if abs(lo + 12.862) < 0.006 and la > 36.158: fondo = 'R'
            sondas.append({"pos": [R(la), R(lo)], "prof": p, "fondo": fondo})
        lon += 0.006
    lat += 0.004

veriles = []
for prof, d in [(10, 1.0), (5, 0.45), (2, 0.15)]:
    veriles.append({"prof": prof, "poligono": poligono_tierra(d)})
veriles.append({"prof": 2, "poligono": circulo([36.163, -12.862], 0.12)})
veriles.sort(key=lambda v: -v["prof"])

fondeadero = circulo([36.151, -12.821], 0.32, 24)
faros = [
    {"id": "f-dique", "nombre": "Dique de la Grulla, extremo", "pos": [36.159, -12.8375], "caracteristica": "Fl R 4s 7M", "alturaFoco": 9, "alcance": 7, "conspicuo": True},
    {"id": "f-contradique", "nombre": "Contradique, extremo", "pos": [36.164, -12.8325], "caracteristica": "Fl G 4s 6M", "alturaFoco": 7, "alcance": 6, "conspicuo": True},
    {"id": "f-punta-playa", "nombre": "Baliza de la Playa", "pos": [R(costa(-12.855) + 0.001), -12.855], "caracteristica": "Q W 5M", "alturaFoco": 6, "alcance": 5, "conspicuo": False},
]
marcas = [
    {"id": "m-torre-senales", "tipo": "torre", "nombre": "Torre de señales", "pos": [36.1765, -12.835], "conspicuo": True},
    {"id": "m-iglesia", "tipo": "iglesia", "nombre": "Iglesia de la Grulla", "pos": [36.184, -12.835], "conspicuo": True},
    {"id": "m-chimenea", "tipo": "chimenea", "nombre": "Chimenea del varadero", "pos": [36.180, -12.812], "conspicuo": True},
]
boyas = [
    {"id": "b-babor", "tipo": "lateral-babor", "pos": [36.1565, -12.838], "luz": "Fl R 3s", "nombre": "Bocana, babor"},
    {"id": "b-estribor", "tipo": "lateral-estribor", "pos": [36.1595, -12.831], "luz": "Fl G 3s", "nombre": "Bocana, estribor"},
    {"id": "b-especial-playa", "tipo": "especial", "pos": [36.166, -12.8585], "luz": "Fl Y 5s", "nombre": "Límite de bañistas"},
    {"id": "b-cardinal-bajo", "tipo": "cardinal-S", "pos": [36.1605, -12.862], "luz": "Q(6)+LFl W 15s", "nombre": "Bajo de la Playa"},
]
peligros = [
    {"id": "p-bajo-playa", "tipo": "roca", "nombre": "Bajo de la Playa", "pos": [36.163, -12.862], "prof": 0.8},
    {"id": "p-pecio-darsena", "tipo": "naufragio", "nombre": "Pecio del antepuerto", "pos": [36.1545, -12.8455], "prof": 2.5},
]
zonas = [
    {"id": "z-fondeadero", "tipo": "fondeadero", "etiqueta": "Fondeadero", "poligono": fondeadero},
    {"id": "z-cable", "tipo": "cable", "etiqueta": "Cable submarino", "linea": [[R(costa(-12.812) - 0.001), -12.812], [36.155, -12.8135], [36.141, -12.816]]},
    {"id": "z-banistas", "tipo": "banistas", "etiqueta": "Zona de bañistas", "poligono": rect(R(costa(-12.86) - 0.006), R(costa(-12.86) - 0.0012), -12.866, -12.8535)},
]
carta = {
    "id": "puerto-didactico",
    "version": 1,
    "meta": {
        "nombre": "Puerto de la Grulla",
        "subtitulo": "Plano del puerto y fondeadero",
        "sello": "CARTA DIDÁCTICA · GEOGRAFÍA FICTICIA",
        "tipo": "portulano",
        "escala": 10000,
        "proyeccion": "Mercator",
        "datum": "WGS 84 (ficticio)",
        "edicion": "1.ª edición, 2026",
        "unidadSondas": "m",
        "ceroHidrografico": "Bajamar escorada",
        "limites": {"latMin": LAT_MIN, "latMax": LAT_MAX, "lonMin": LON_MIN, "lonMax": LON_MAX},
        "viewBox": {"ancho": 1400, "margen": 56},
        "cartucho": {"pos": [36.1415, -12.8685], "anchoPx": 260}
    },
    "rosa": {"centro": [36.147, -12.852], "radioPx": 70, "dm": -2.8333, "anyo": 2022, "variacionAnual": 7},
    "costa": [
        {"id": "costa-grulla", "nombre": "Costa de la Grulla", "poligono": poligono_tierra()},
        {"id": "dique", "nombre": "Dique de la Grulla", "poligono": dique},
        {"id": "contradique", "nombre": "Contradique", "poligono": contra},
    ],
    "veriles": veriles,
    "sondas": sondas,
    "faros": faros,
    "marcas": marcas,
    "boyas": boyas,
    "peligros": peligros,
    "enfilaciones": [{"id": "e-bocana", "objetos": ["m-torre-senales", "m-iglesia"], "descripcion": "Torre de señales por la Iglesia de la Grulla"}],
    "zonas": zonas,
    "puertos": [{"id": "pt-grulla", "nombre": "Puerto de la Grulla", "pos": [36.1665, -12.836], "puertoMareas": "grulla", "bocana": {"babor": "b-babor", "estribor": "b-estribor"}}],
    "toponimos": [
        {"texto": "Dársena", "pos": [36.169, -12.8385], "estilo": "costa"},
        {"texto": "Playa de la Grulla", "pos": [R(costa(-12.86) - 0.0075), -12.86], "estilo": "costa"},
        {"texto": "ANTEPUERTO", "pos": [36.1525, -12.838], "estilo": "mar"},
    ]
}
os.makedirs("data/cartas", exist_ok=True)
with open("data/cartas/puerto-didactico.json", "w", encoding="utf-8") as f:
    json.dump(carta, f, ensure_ascii=False, separators=(",", ":"))
print("sondas", len(sondas), "bytes", os.path.getsize("data/cartas/puerto-didactico.json"))
