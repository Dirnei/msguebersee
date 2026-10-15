# MSG Übersee – neue Website: Design-Spezifikation

Stand: 2026-10-15

## Ziel

Die Website der Modellsportgruppe Übersee e. V. (msg-übersee.de, bisher WordPress) wird neu gebaut, um neue, vor allem junge Mitglieder zu gewinnen. Der Verein ist klein, die meisten Mitglieder sind Rentner, und es werden kaum Inhalte produziert. Die Seite muss daher **ohne Pflege aktuell wirken**: Der lebendige Teil kommt aus der vorhandenen Wetterstation und Webcam am Flugplatz.

**Erfolg heißt:** Ein Interessent versteht in 10 Sekunden, was der Verein macht, sieht live, wie es am Platz aussieht, und hat einen einfachen Weg, Kontakt aufzunehmen (WhatsApp) oder vorbeizukommen.

## Rahmenbedingungen

- Statische Seite mit **Astro**, gehostet auf **GitHub Pages**, zunächst unter der Standard-Domain `*.github.io`. Die Domain msg-übersee.de wird später umgestellt (nicht Teil dieses Projekts).
- Wetterstation und Webcam laufen weiter auf dem alten PHP-Hoster unter `https://xn--msg-bersee-deb.de/Programme/`. Dort gibt es weder JSON noch CORS.
- Der Nutzer betreibt einen Docker-Host mit Reverse Proxy (HTTPS). Dort läuft ein kleines **Relay**.
- Es gibt **keine E-Mail-Adresse**. Kontakt läuft ausschließlich über WhatsApp.
- Inhalte, die vom Verein bestätigt werden müssen (Beitrag, Lehrer-Schüler-Betrieb, Ansprechperson, WhatsApp-Nummer, Fotos), sind als Platzhalter markiert.

## Nicht im Umfang

Digitales Flugbuch (An-/Abmelden am Platz, eigenes Folgeprojekt), Umbau von Webcam und Sensorik, Mitgliederbereich („Internes“), Domain-Umzug, News und Termine.

## Repo-Struktur

```
/site    Astro-Projekt → GitHub Pages
/relay   Node-Relay (Docker-Image → GHCR)
/brand   Logo: msg-logo.svg, msg-logo-white.svg, trace_logo.py (fertig)
/docs    Spezifikationen und Pläne
```

GitHub Actions:

- `site.yml`: Build und Deploy nach GitHub Pages bei jedem Push auf `main`, sobald sich etwas in `site/` oder `brand/` ändert.
- `relay.yml`: Tests und anschließend Build und Push des Images `ghcr.io/<owner>/msg-relay` bei Änderungen in `relay/`.

## Komponente 1: Relay (`/relay`)

Bewusst minimal: Node (aktuelle LTS), **keine Laufzeit-Abhängigkeiten**, keine Datenbank, ein Dockerfile.

### Endpunkte

| Endpunkt | Quelle | Antwort |
|---|---|---|
| `GET /weather` | `Programme/auslesen_tabelle.php` | JSON, siehe unten |
| `GET /webcam` | `Programme/Bildtest-email.php` | `{ images: [{ url, time }] }`, neuestes zuerst |
| `GET /webcam/latest.jpg` | wie `/webcam` | `302`-Weiterleitung auf das neueste Bild |
| `GET /health` | – | `200 ok` |

`/weather`-Antwort:

```json
{
  "updated": "2026-10-15T20:40:00+02:00",
  "current": { "time": "...", "windDir": "SW", "windDeg": 224, "windKmh": 8, "tempC": 14, "pressureHpa": 1032 },
  "today":   [ { "time": "...", "windDeg": 57, "windKmh": 2, "tempC": 12, "pressureHpa": 1032 } ]
}
```

- **Parsing:** Die HTML-Tabelle aus `auslesen_tabelle.php` hat die Spalten Datum/Uhrzeit, `Richtung/Grad` (z. B. `NO/57`), km/h, °C, mbar und Volt. Die Spannung wird ignoriert. Die Zeiten sind lokale Zeit (Europe/Berlin) und werden mit Offset ausgegeben. Bei `Bildtest-email.php` werden die Paare `<FONT>YYYY-MM-DD HH:MM -- name.jpg</FONT>` und `<img src=./bilder/name.jpg>` ausgelesen. Die Bild-URLs werden absolut ausgegeben.
- **Cache:** Jede Upstream-Seite wird höchstens alle 5 Minuten abgerufen. Ist der Upstream nicht erreichbar, liefert das Relay den letzten gültigen Stand mit `"stale": true`. Gibt es noch keinen Stand, antwortet es mit `503`.
- **CORS:** `Access-Control-Allow-Origin` aus der Umgebungsvariable `ALLOWED_ORIGINS` (kommagetrennt, z. B. die github.io-URL und später die eigene Domain).
- **Konfiguration per Umgebungsvariablen:** `PORT` (Standard 8080), `UPSTREAM_BASE`, `ALLOWED_ORIGINS`, `CACHE_SECONDS` (Standard 300).
- **Hinweis:** `auslesen_tabelle.php` löscht bei jedem Aufruf alte Datensätze. Das ist das bestehende Verhalten der Station. Durch den Cache wird die Seite höchstens 12-mal pro Stunde abgerufen.

## Komponente 2: Website (`/site`)

### Gestaltung

- Variante „A“: weiße Kopfleiste mit dem neuen Logo, darunter das Webcam-Bild über die volle Breite mit Headline und Live-Kachel.
- Akzentfarbe ist das Logo-Blau `#0090DA`, Text dunkel `#14212C`, Flächen hell `#F4F7FA`. Keine Orange-Töne.
- Fotos im Polaroid-Stil: weißer Rahmen, breiter unterer Rand mit Bildunterschrift, leicht gedreht.
- Mobil zuerst. Auf dem Handy liegt alles untereinander, die Navigation wird zum Menü-Button.
- Systemschrift-Stack oder eine selbst gehostete Variable-Font, kein Google-Fonts-CDN (Datenschutz).

### Seiten

**`/` (Startseite), von oben nach unten:**

1. **Kopfleiste:** Logo, Anker-Navigation (Wetter & Webcam, Was wir machen, Flugplatz) und der Button „Mitmachen“.
2. **Hero:** Das neueste Webcam-Bild (`/webcam/latest.jpg`; als Fallback ein festes Vereinsfoto), dazu die Headline „Selber fliegen. Am Chiemsee.“, eine Unterzeile, der Button „So kommst du zu uns“ und die Live-Kachel mit Uhrzeit, Wind (km/h und Richtung), Temperatur und Ampel.
3. **Wetter & Webcam:** Windverlauf von heute als Balkendiagramm (inline-SVG aus `today`), aktuelle Werte (Temperatur, Luftdruck, Windrichtung) und die letzten 6 Webcam-Bilder. Zusätzlich werden `Programme/wind.jpg` und die Windrose direkt vom alten Server eingebunden. Diese Bilder funktionieren auch ohne Relay.
4. **Was wir machen:** Kurzer Text und 3–4 Polaroid-Fotos.
5. **Gut zu wissen:** Vier gleichwertige Kacheln **ohne Reihenfolge**: Einfach vorbeikommen · Mitfliegen auf Anfrage (Lehrer-Schüler) · Hilfe beim ersten Modell · Mitglied werden (Beitrag).
6. **Flugplatz:** Adresse (Übersee, Ortsteil Luft), eine statische OpenStreetMap-Karte ohne Cookies bzw. Tracking und der Button „Route planen“ (Link mit Koordinaten).
7. **Mitmachen:** Dunkler Block mit dem Button „Auf WhatsApp schreiben“ (`https://wa.me/<nummer>?text=<vorbefüllt>`) und dem Namen der Ansprechperson.
8. **Fußzeile:** Satzung (PDF), Impressum, Datenschutz.

**`/impressum` und `/datenschutz`:** Inhalte von der alten Seite übernommen und angepasst. Die Datenschutzerklärung muss das Relay, die OSM-Karte und die WhatsApp-Verlinkung abdecken. Der Vorstand prüft sie.

### Vereinsdaten

Alle vereinsspezifischen Angaben stehen in **`site/src/data/verein.ts`**: Name, Adresse, Koordinaten, WhatsApp-Nummer, Ansprechperson, Beitragstext, Ampel-Grenzwerte, Relay-URL und Texte der Kacheln. Die Datei ist kommentiert und für Nicht-Entwickler direkt auf GitHub bearbeitbar. Platzhalter sind mit `TODO(Verein)` markiert.

### Live-Daten im Browser

- Ein kleines Client-Skript (Astro-Island ohne Framework, reines TS) ruft beim Laden `/weather` und `/webcam` ab und danach alle 5 Minuten erneut.
- **Ampel:** Grün unter 15 km/h, gelb von 15 bis 25 km/h, rot darüber. Die Werte stehen in `verein.ts` und werden mit dem Vorstand abgestimmt. Der Text lautet „Gutes Flugwetter“, „Böig – nur für Erfahrene“ bzw. „Zu windig“.
- **Fehlerfall:** Ist das Relay nicht erreichbar oder antwortet mit `stale`, zeigt die Kachel „Wetterdaten gerade nicht verfügbar“ bzw. „Stand: HH:MM“. Das Layout springt nicht, und die Bilder vom alten Server bleiben sichtbar.

## Tests

- **Relay:** Unit-Tests (`node --test`) für beide Parser mit den echten HTML-Antworten vom 2026-10-15 als Testdaten, dazu Tests für Cache und Stale-Verhalten mit gemocktem `fetch`.
- **Site:** `astro check` und `astro build` in der CI. Außerdem ein Playwright-Smoke-Test, der die Startseite einmal mit gemocktem Relay rendert und einmal mit nicht erreichbarem Relay. Erwartet wird jeweils kein JS-Fehler, die Fallback-Texte sind sichtbar und es gibt kein horizontales Scrollen bei 375 px Breite.

## Offene Punkte (Verein)

WhatsApp-Nummer und Ansprechperson · Beitragshöhe · Bestätigung Lehrer-Schüler-Betrieb · Ampel-Grenzwerte · 3–4 Fotos (Werkstatt, Flugtag, Modelle) · Prüfung von Impressum und Datenschutz.
