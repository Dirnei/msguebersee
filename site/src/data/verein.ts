// Alle Angaben des Vereins an einer Stelle. Direkt auf GitHub bearbeitbar.
// Offene Punkte sind mit TODO(Verein) markiert – leere Werte werden auf der Seite ausgeblendet.

export const verein = {
  name: 'Modellsportgruppe Übersee e. V.',
  ort: 'Übersee, Ortsteil Luft',
  lage: 'Der Platz liegt in Übersee im Ortsteil Luft, direkt an der Bahnlinie München–Salzburg.',

  // TODO(Verein): Koordinaten des Flugplatzes (Dezimalgrad), z. B. { lat: 47.81, lon: 12.48 }.
  // Solange null, wird keine Karte angezeigt.
  koordinaten: null as { lat: number; lon: number } | null,

  whatsapp: {
    // TODO(Verein): Handynummer international ohne + und Leerzeichen, z. B. '4915112345678'.
    // Solange leer, wird statt des Buttons ein neutraler Hinweis gezeigt.
    nummer: '',
    // TODO(Verein): Vorname der Ansprechperson, z. B. 'Christian'.
    ansprechperson: '',
    text: 'Hallo, ich interessiere mich für Modellflug bei der MSG Übersee und würde gern mal vorbeikommen.',
  },

  // TODO(Verein): Grenzwerte mit dem Vorstand abstimmen (km/h).
  ampel: { gruenBisKmh: 15, gelbBisKmh: 25 },

  flugzeiten: [
    { was: 'Elektromodelle', zeiten: ['Mo–So: Sonnenaufgang bis Sonnenuntergang'] },
    { was: 'Verbrennermodelle', zeiten: ['Mo–Sa: 10–12, 14–16 und 17:30–19 Uhr', 'So & Feiertag: 10–12 und 14–17:30 Uhr'] },
    { was: 'Verbrenner-Hubschrauber', zeiten: ['Mo–Fr: 10–12 und 14–15:30 Uhr', 'Sa: 10–12 Uhr', 'So: kein Flugbetrieb'] },
  ],

  gutZuWissen: [
    { icon: '👋', titel: 'Einfach vorbeikommen', text: 'Zuschauen und fachsimpeln geht immer – ohne Termin. Schau vorher auf die Webcam, ob jemand am Platz ist.' },
    // TODO(Verein): Lehrer-Schüler-Betrieb bestätigen
    { icon: '🎮', titel: 'Mitfliegen auf Anfrage', text: 'Am Lehrer-Schüler-Sender fliegst du zusammen mit einem erfahrenen Piloten. Sag Bescheid, dann organisieren wir das.' },
    { icon: '🛠️', titel: 'Hilfe beim ersten Modell', text: 'Kaufen oder selber bauen? Wir beraten dich – im Winter wird gemeinsam gebaut.' },
    // TODO(Verein): Beitragshöhe ergänzen, sobald bekannt
    { icon: '🪪', titel: 'Mitglied werden', text: 'Selbst fliegen darfst du auf dem Platz als Mitglied oder mit Erlaubnis des Vorstands. Den Beitrag nennen wir dir gern.' },
  ],

  impressum: {
    // TODO(Verein): ladungsfähige Vereinsanschrift bestätigen (bisher nur die des Verantwortlichen bekannt)
    anschrift: ['Lindenstraße 10', '83233 Bernau'],
    // TODO(Verein): Namen des vertretungsberechtigten Vorstands (1. und 2. Vorsitzende/r)
    vorstand: [] as string[],
    email: 'vorstand@msg-übersee.de',
    emailHref: 'mailto:vorstand@xn--msg-bersee-deb.de',
    registergericht: 'Amtsgericht Traunstein',
    registernummer: 'VR 1083',
    verantwortlich: { name: 'Stefan Ueing', anschrift: ['Lindenstraße 10', '83233 Bernau'] },
  },
};
