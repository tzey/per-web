#!/usr/bin/env python3
"""Genera data/cartas/estrecho-didactico.json: carta costera sintética,
geografía ficticia. Determinista: misma salida en cada ejecución."""
import json, math, os

LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 35.75, 36.25, -13.0, -12.25
R = lambda v: round(v, 4)
RAD = math.pi / 180

def bump(lon, centro, ancho, alto):
    return alto * math.exp(-((lon - centro) / ancho) ** 2)

def lat_norte(lon):
    t = (lon - LON_MIN) / (LON_MAX - LON_MIN)
    base = 36.13 + 0.018 * math.sin(t * 2 * math.pi * 1.7 + 0.4) + 0.006 * math.sin(t * 2 * math.pi * 5.3)
    base -= bump(lon, -12.93, 0.03, 0.045)   # Punta Grulla
    base += bump(lon, -12.84, 0.035, 0.038)  # Bahía de la Grulla
    base -= bump(lon, -12.60, 0.03, 0.02)    # Punta Cormorán
    base -= bump(lon, -12.36, 0.04, 0.05)    # Cabo Alcotán
    return base

def lat_sur(lon):
    t = (lon - LON_MIN) / (LON_MAX - LON_MIN)
    base = 35.87 - 0.015 * math.sin(t * 2 * math.pi * 1.3 + 2.0) - 0.005 * math.sin(t * 2 * math.pi * 6.1)
    base += bump(lon, -12.80, 0.035, 0.045)  # Cabo Sisón
    base -= bump(lon, -12.62, 0.04, 0.03)    # Ensenada de Sisón
    base += bump(lon, -12.40, 0.04, 0.04)    # Punta Avutarda
    return base

LONS = [LON_MIN + i * 0.01 for i in range(76)]
LONS[-1] = LON_MAX

def poligono_norte(desplaz_min=0):
    d = desplaz_min / 60
    pts = [[LAT_MAX, LON_MIN]] + [[R(lat_norte(l) - d), R(l)] for l in LONS] + [[LAT_MAX, LON_MAX]]
    return pts + [pts[0]]

def poligono_sur(desplaz_min=0):
    d = desplaz_min / 60
    pts = [[LAT_MIN, LON_MIN]] + [[R(lat_sur(l) + d), R(l)] for l in LONS] + [[LAT_MIN, LON_MAX]]
    return pts + [pts[0]]

def circulo(centro, radio_min, n=24):
    lat0, lon0 = centro
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        pts.append([R(lat0 + radio_min / 60 * math.cos(a)), R(lon0 + radio_min / 60 * math.sin(a) / math.cos(lat0 * RAD))])
    return pts + [pts[0]]

def punto_desde(origen, rumbo, millas):
    dlat = millas * math.cos(rumbo * RAD) / 60
    apart = millas * math.sin(rumbo * RAD)
    return [R(origen[0] + dlat), R(origen[1] + apart / math.cos((origen[0] + dlat / 2) * RAD) / 60)]

# ---- profundidad modelo: interpolación por distancia a la costa (minutos) ----
PERFIL = [(0, 0), (0.35, 5), (0.9, 10), (2.0, 20), (4.0, 50), (8.0, 90)]
def prof_por_dist(d):
    for (d0, p0), (d1, p1) in zip(PERFIL, PERFIL[1:]):
        if d <= d1:
            return p0 + (p1 - p0) * (d - d0) / (d1 - d0)
    return 90

BAJO = [36.02, -12.50]
def profundidad(lat, lon):
    dn = (lat_norte(lon) - lat) * 60
    ds = (lat - lat_sur(lon)) * 60
    p = prof_por_dist(max(0, min(dn, ds)))
    # bajo del Alcotán: cono
    db = math.hypot((lat - BAJO[0]) * 60, (lon - BAJO[1]) * 60 * math.cos(lat * RAD))
    if db < 1.2:
        p = min(p, 1.8 + (p - 1.8) * (db / 1.2) ** 1.5)
    return p

# ---- sondas ----
sondas = []
semilla = 12345
def rnd():
    global semilla
    semilla = (semilla * 1103515245 + 12345) % 2**31
    return semilla / 2**31

lon = LON_MIN + 0.03
while lon < LON_MAX - 0.02:
    lat = lat_sur(lon) + 0.012
    while lat < lat_norte(lon) - 0.012:
        jl, jn = (rnd() - 0.5) * 0.015, (rnd() - 0.5) * 0.015
        la, lo = lat + jn, lon + jl
        if lat_sur(lo) + 0.006 < la < lat_norte(lo) - 0.006:
            p = profundidad(la, lo) * (1 + (rnd() - 0.5) * 0.12)
            p = round(p, 1) if p < 20 else round(p)
            fondo = 'A' if p < 8 else 'F' if p < 25 else 'A' if p < 45 else 'F'
            if abs(lo + 12.80) < 0.06 or abs(lo + 12.36) < 0.06: fondo = 'R'
            sondas.append({"pos": [R(la), R(lo)], "prof": p, "fondo": fondo})
        lat += 0.045
    lon += 0.05

# ---- veriles ----
veriles = []
for prof, d in [(50, 4.0), (20, 2.0), (10, 0.9), (5, 0.35)]:
    veriles.append({"prof": prof, "poligono": poligono_norte(d)})
    veriles.append({"prof": prof, "poligono": poligono_sur(d)})
    if prof <= 20:
        veriles.append({"prof": prof, "poligono": circulo(BAJO, {20: 1.05, 10: 0.7, 5: 0.35}[prof])})
veriles.sort(key=lambda v: -v["prof"])

def n(lon, dentro=0.006): return [R(lat_norte(lon) + dentro), R(lon)]
def s(lon, dentro=0.006): return [R(lat_sur(lon) - dentro), R(lon)]
def aguaN(lon, fuera): return [R(lat_norte(lon) - fuera), R(lon)]
def aguaS(lon, fuera): return [R(lat_sur(lon) + fuera), R(lon)]

f_grulla = n(-12.93)
torre_grulla = punto_desde(f_grulla, 22, 1.1)

faros = [
    {"id": "f-grulla", "nombre": "Faro de Punta Grulla", "pos": f_grulla, "caracteristica": "Fl(2) W 10s 22M", "alturaFoco": 41, "alcance": 22, "conspicuo": True},
    {"id": "f-dique-grulla", "nombre": "Dique de la Grulla", "pos": n(-12.815, 0.004), "caracteristica": "Oc R 4s 10M", "alturaFoco": 12, "alcance": 10, "conspicuo": False},
    {"id": "f-cormoran", "nombre": "Faro de Punta Cormorán", "pos": n(-12.60), "caracteristica": "LFl W 8s 14M", "alturaFoco": 28, "alcance": 14, "conspicuo": True},
    {"id": "f-alcotan", "nombre": "Faro de Cabo Alcotán", "pos": n(-12.36), "caracteristica": "Fl W 5s 20M", "alturaFoco": 55, "alcance": 20, "conspicuo": True},
    {"id": "f-sison", "nombre": "Faro de Cabo Sisón", "pos": s(-12.80), "caracteristica": "Fl(3) W 15s 18M", "alturaFoco": 36, "alcance": 18, "conspicuo": True},
    {"id": "f-ensenada", "nombre": "Muelle de Sisón", "pos": s(-12.645, 0.004), "caracteristica": "Iso G 4s 9M", "alturaFoco": 9, "alcance": 9, "conspicuo": False},
    {"id": "f-avutarda", "nombre": "Faro de Punta Avutarda", "pos": s(-12.40), "caracteristica": "Fl(4) W 20s 16M", "alturaFoco": 30, "alcance": 16, "conspicuo": True},
]
marcas = [
    {"id": "m-torre-grulla", "tipo": "torre", "nombre": "Torre de la Grulla", "pos": torre_grulla, "conspicuo": True},
    {"id": "m-torre-sison", "tipo": "torre", "nombre": "Torre de Sisón", "pos": s(-12.70, 0.012), "conspicuo": True},
    {"id": "m-chimenea", "tipo": "chimenea", "nombre": "Chimenea de Cormorán", "pos": n(-12.52, 0.015), "conspicuo": True},
    {"id": "m-iglesia", "tipo": "iglesia", "nombre": "Iglesia de Avutarda", "pos": s(-12.45, 0.014), "conspicuo": False},
]
boyas = [
    {"id": "b-babor-grulla", "tipo": "lateral-babor", "pos": aguaN(-12.85, 0.018), "luz": "Fl R 3s", "nombre": "Bocana de la Grulla, babor"},
    {"id": "b-estribor-grulla", "tipo": "lateral-estribor", "pos": aguaN(-12.83, 0.018), "luz": "Fl G 3s", "nombre": "Bocana de la Grulla, estribor"},
    {"id": "b-cardinal-alcotan", "tipo": "cardinal-S", "pos": [R(BAJO[0] - 0.013), BAJO[1]], "luz": "Q(6)+LFl W 15s", "nombre": "Bajo del Alcotán"},
    {"id": "b-pecio", "tipo": "peligro-aislado", "pos": [35.95, -12.72], "luz": "Fl(2) W 5s", "nombre": "Pecio del Alcaraván"},
    {"id": "b-especial", "tipo": "especial", "pos": aguaS(-12.56, 0.02), "luz": "Fl Y 5s", "nombre": "Zona prohibida"},
]
peligros = [
    {"id": "p-alcotan", "tipo": "bajo", "nombre": "Bajo del Alcotán", "pos": BAJO, "prof": 1.8, "radioM": 0.3},
    {"id": "p-pecio", "tipo": "naufragio", "nombre": "Pecio del Alcaraván", "pos": [35.952, -12.722], "prof": 4},
    {"id": "p-laja-sison", "tipo": "roca", "nombre": "Laja de Sisón", "pos": aguaS(-12.775, 0.009), "prof": 0.6},
]
zona_prohibida = [aguaS(-12.55, 0.012), aguaS(-12.47, 0.012), aguaS(-12.47, 0.032), aguaS(-12.55, 0.032)]
zona_prohibida.append(zona_prohibida[0])
fondeadero = circulo(aguaS(-12.62, 0.016), 0.5, 16)
zonas = [
    {"id": "z-prohibida", "tipo": "prohibida", "etiqueta": "Zona prohibida", "poligono": zona_prohibida},
    {"id": "z-fondeadero", "tipo": "fondeadero", "etiqueta": "Fondeadero de Sisón", "poligono": fondeadero},
    {"id": "z-cable", "tipo": "cable", "etiqueta": "Cable submarino", "linea": [aguaN(-12.70, 0.002), [R((lat_norte(-12.70) + lat_sur(-12.70)) / 2), -12.705], aguaS(-12.70, 0.002)]},
]
puertos = [
    {"id": "pt-grulla", "nombre": "Puerto de la Grulla", "pos": aguaN(-12.84, 0.006), "puertoMareas": "grulla", "bocana": {"babor": "b-babor-grulla", "estribor": "b-estribor-grulla"}},
    {"id": "pt-sison", "nombre": "Ensenada de Sisón", "pos": aguaS(-12.63, 0.005), "puertoMareas": "sison"},
]
carta = {
    "id": "estrecho-didactico",
    "version": 1,
    "meta": {
        "nombre": "Estrecho de Alcaraván",
        "subtitulo": "De Punta Grulla a Cabo Alcotán",
        "sello": "CARTA DIDÁCTICA · GEOGRAFÍA FICTICIA",
        "tipo": "costera",
        "escala": 100000,
        "proyeccion": "Mercator",
        "datum": "WGS 84 (ficticio)",
        "edicion": "1.ª edición, 2026",
        "unidadSondas": "m",
        "ceroHidrografico": "Bajamar escorada",
        "limites": {"latMin": LAT_MIN, "latMax": LAT_MAX, "lonMin": LON_MIN, "lonMax": LON_MAX},
        "viewBox": {"ancho": 1400, "margen": 56},
        "cartucho": {"pos": [35.795, -12.985], "anchoPx": 270}
    },
    "rosa": {"centro": [36.03, -12.62], "radioPx": 110, "dm": -2.8333, "anyo": 2022, "variacionAnual": 7},
    "costa": [
        {"id": "costa-norte", "nombre": "Costa de Alcaraván", "poligono": poligono_norte()},
        {"id": "costa-sur", "nombre": "Costa de Sisón", "poligono": poligono_sur()},
    ],
    "veriles": veriles,
    "sondas": sondas,
    "faros": faros,
    "marcas": marcas,
    "boyas": boyas,
    "peligros": peligros,
    "enfilaciones": [
        {"id": "e-grulla", "objetos": ["f-grulla", "m-torre-grulla"], "descripcion": "Faro de Punta Grulla por la Torre de la Grulla"}
    ],
    "zonas": zonas,
    "puertos": puertos,
    "toponimos": [
        {"texto": "ESTRECHO DE ALCARAVÁN", "pos": [35.945, -12.47], "estilo": "mar"},
        {"texto": "Punta Grulla", "pos": aguaN(-12.93, 0.012), "estilo": "costa"},
        {"texto": "Cabo Alcotán", "pos": aguaN(-12.36, 0.012), "estilo": "costa"},
        {"texto": "Cabo Sisón", "pos": aguaS(-12.80, 0.012), "estilo": "costa"},
        {"texto": "Punta Avutarda", "pos": aguaS(-12.40, 0.012), "estilo": "costa"},
    ]
}
os.makedirs("data/cartas", exist_ok=True)
with open("data/cartas/estrecho-didactico.json", "w", encoding="utf-8") as f:
    json.dump(carta, f, ensure_ascii=False, separators=(",", ":"))
print("sondas", len(sondas), "bytes", os.path.getsize("data/cartas/estrecho-didactico.json"))
