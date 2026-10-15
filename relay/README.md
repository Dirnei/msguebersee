# msg-relay

Kleiner Dienst, der die alte Wetterstation und Webcam (`Programme/*.php` auf msg-übersee.de)
als JSON für die neue Website bereitstellt. Keine Datenbank, keine Abhängigkeiten.

## Endpunkte

| Pfad | Inhalt |
|---|---|
| `/weather` | aktuelle Werte + Tagesverlauf (`stale: true` = Station gerade nicht erreichbar, letzter Stand) |
| `/webcam` | letzte Webcam-Bilder, neuestes zuerst |
| `/webcam/latest.jpg` | Weiterleitung auf das neueste Bild |
| `/health` | `ok` |

## Betrieb

```yaml
# docker-compose.yml
services:
  msg-relay:
    image: ghcr.io/<owner>/msg-relay:latest
    restart: unless-stopped
    environment:
      ALLOWED_ORIGINS: https://<owner>.github.io
    ports:
      - "127.0.0.1:8089:8080"
```

HTTPS übernimmt der Reverse Proxy (z. B. `wetter.example.de` → `127.0.0.1:8089`).
Die öffentliche HTTPS-URL im GitHub-Repo unter *Settings → Secrets and variables → Actions → Variables*
als `RELAY_URL` eintragen; die Website wird beim nächsten Build damit gebaut.

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `8080` | Port im Container |
| `UPSTREAM_BASE` | `https://xn--msg-bersee-deb.de/Programme/` | alte Station |
| `ALLOWED_ORIGINS` | – | erlaubte Website-Origins, kommagetrennt |
| `CACHE_SECONDS` | `300` | so lange werden Upstream-Antworten wiederverwendet |

Hinweis: `auslesen_tabelle.php` löscht bei jedem Aufruf alte Datensätze (Verhalten der Station).
Durch den Cache wird sie höchstens alle 5 Minuten aufgerufen.

## Entwicklung

```bash
npm test
ALLOWED_ORIGINS=http://localhost:4321 PORT=8089 npm start
```
