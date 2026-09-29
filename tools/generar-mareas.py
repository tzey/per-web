#!/usr/bin/env python3
"""Genera data/mareas-didacticas.json: anuario sintético semidiurno para los
puertos ficticios de la carta costera. Determinista."""
import json, math, datetime as dt

ANYO, MES, DIAS = 2026, 3, 30
PERIODO_MIN = 12 * 60 + 25          # M2
MEDIO = 2.0                          # nivel medio sobre el cero hidrográfico
inicio = dt.datetime(ANYO, MES, 1, 3, 12)   # primera bajamar

def amplitud(t):
    dias = (t - inicio).total_seconds() / 86400
    return 1.35 + 0.45 * math.cos(2 * math.pi * dias / 14.77)

anuario = {}
t = inicio
k = 0
fin = dt.datetime(ANYO, MES, 1) + dt.timedelta(days=DIAS)
while t < fin:
    tipo = 'BM' if k % 2 == 0 else 'PM'
    a = amplitud(t)
    altura = round(MEDIO - a if tipo == 'BM' else MEDIO + a, 1)
    fecha = t.strftime('%Y-%m-%d')
    anuario.setdefault(fecha, []).append([tipo, t.strftime('%H:%M'), altura])
    t += dt.timedelta(minutes=PERIODO_MIN / 2)
    k += 1

datos = {
    "anyo": ANYO,
    "ceroHidrografico": "Bajamar escorada",
    "horaReferencia": "hora local del escenario (sin cambio horario)",
    "puertos": {
        "grulla": {"nombre": "Puerto de la Grulla", "patron": True},
        "sison": {"nombre": "Ensenada de Sisón", "patron": False, "referencia": "grulla",
                  "diferencias": {"horaPM": 25, "horaBM": 15, "alturaPM": -0.4, "alturaBM": -0.1}}
    },
    "anuario": {"grulla": anuario}
}
with open("data/mareas-didacticas.json", "w", encoding="utf-8") as f:
    json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))
print("días", len(anuario))
