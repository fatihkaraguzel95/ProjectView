# ProjectView · Projektbasiertes Ressourcenmanagement (Prototyp)

Ein Prototyp für ein **projektbasiertes Resource-Management / Resource-Mount-Chart**.
Jedes Projekt bekommt eine eigene Farbe, enthält Teilprojekte, und pro Teilprojekt wird
eine Excel-Vorlage (Gesamtkalkulation) hochgeladen. Aus den enthaltenen Positionen und
Stunden entsteht ein Ressourcen-Auslastungsdiagramm.

## Starten

```bash
npm install
npm run dev
```

Dann `http://localhost:5178` öffnen. Die App startet mit echten Demo-Daten
(VW386 0EU – HiSi & VoSi aus `docs/`).

## Seiten

- **Portfolio & Auslastung** – Projektverwaltung (anlegen, Farbe, Status) + Resource Mount Chart
- **Projektdaten** – Teilprojekt-Excel hochladen; zeigt je Teilprojekt die Positionen und den
  Stundenbedarf als Liste (nicht das Dokument selbst)
- **Personalkapazität** – feste Positions-Standardliste (aus den Referenz-Excels), monatliche
  Personenzahl je Position (Standard 5), Summe wird zur Kapazitätslinie im Chart

## Funktionen (auf die Anforderungen abgebildet)

| Anforderung | Umsetzung |
|---|---|
| Projekt anlegen, je Projekt eine Farbe | „+ Projekt", Farb-Picker je Projektkarte (12er-Palette + eigene Farbe) |
| Sub-Projekte je Projekt | Teilprojekte werden unter dem Projekt gruppiert |
| Excel-Vorlage je Teilprojekt hochladen | „Excel-Vorlage hochladen" → `.xlsx/.xlsm/.xls/.csv`, Mehrfach-Upload möglich |
| Positionen + Stundenbedarf auslesen | Parser liest **EKAS**-Blatt (Fachbereich → Umfang → Std pro Jahr); generischer Fallback |
| Diagramm daraus | **Resource Mount Chart**: gestapeltes Flächendiagramm („Bedarfsgebirge") pro Periode, gestapelt nach Projekt |
| Neue Projekte = neue Farbe, einstellbar | automatische Farbe, jederzeit änderbar |
| Iş-Grupları (Arbeitsgruppen) auflisten + Personenzahl eintragen | Tabelle „Personalkapazität je Arbeitsgruppe" mit Eingabefeld je Gruppe |
| Kapazität im Diagramm zeigen | Kapazitätslinie (amber, gestrichelt) + Diagramm „Bedarf vs. Verfügbarkeit" |
| Alınmış (beauftragt) vs. Planlanan (geplant) | Status-Umschalter je Projekt |
| Geplante Projekte zuletzt, schraffiert | geplante Projekte werden oben auf den Stapel gelegt und **schraffiert** dargestellt |

## Erwartetes Excel-Format

Der Parser erkennt automatisch das reale **„Gesamtkalkulation"**-Format über das
`EKAS`-Blatt:

- **Spalte B** – Fachbereich (Arbeitsgruppe), z. B. *Entwicklung*, *Versuch*
- **Spalte C** – Umfang (Position), z. B. *Projektsteuerung*, *Konstruktion*
- **Spalten D / G / J** – Stunden je Jahr (2022 / 2023 / 2024)

Fehlt ein `EKAS`-Blatt, greift ein generischer Parser: er sucht eine Kopfzeile mit
Perioden (Jahre oder Monate Jan–Dez) und liest die Positionen links davon.

## Technik

- **React + Vite + Tailwind CSS** – Data-Dense-Dashboard-Theme (Blau `#1e40af` / Amber `#d97706`)
- **Recharts** – gestapeltes Flächen-/Mountain-Chart (ComposedChart), Referenzlinie (Kapazität), SVG-Pattern-Schraffur
- **SheetJS (xlsx)** – Excel-Parsing im Browser
- **localStorage** – Persistenz (kein Backend nötig)

Zustand wird lokal im Browser gespeichert. „Zurücksetzen" oben rechts stellt die
Demo-Daten wieder her.

## Projektstruktur

```
src/
  App.jsx                     Layout, KPIs
  store.js                    State + localStorage + Aktionen
  lib/
    excelParser.js            EKAS-/generischer Parser
    resource.js               Aggregation für die Charts
    colors.js                 Projekt-Farbpalette
    seed.js / _seeddata.json  Demo-Daten (echte VW386-Werte)
  components/
    ProjectsPanel.jsx         Projekte, Farbe, Status, Upload
    ResourceMountChart.jsx    Resource-Mount-Chart
    WorkGroupCapacity.jsx     Arbeitsgruppen-Kapazität
```
