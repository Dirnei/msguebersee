<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/msg-logo-white.svg">
    <img src="brand/msg-logo.svg" alt="Logo der Modellsportgruppe Übersee" width="180">
  </picture>
</p>

<h1 align="center">Modellsportgruppe Übersee e. V.</h1>

<p align="center"><strong><a href="https://dirnei.github.io/msguebersee/">dirnei.github.io/msguebersee</a></strong></p>

Die MSG Übersee ist ein Modellflugverein am Chiemsee. Unser Platz liegt in Übersee im Ortsteil Luft,
mit Blick auf die Berge. Geflogen wird mit Flugzeugen, Seglern, Hubschraubern und Multikoptern.
Neue Gesichter sind jederzeit willkommen: Komm einfach vorbei.

## Dieses Repository

- `site/`: die Website (Astro), mit Live-Wetter, Webcam und Flugzeiten
- `relay/`: kleiner Dienst, der Wetterdaten und Webcam-Bilder der Station für die Website bereitstellt
- `brand/`: Vereinslogo als SVG

Lokal starten: `docker compose up --build`, danach läuft die Seite auf http://localhost:4321.
