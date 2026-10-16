import type { Flugzeit } from '../lib/flugzeiten';

// Alle Angaben des Vereins an einer Stelle. Direkt auf GitHub bearbeitbar.
// Offene Punkte sind mit TODO(Verein) markiert - leere Werte werden auf der Seite ausgeblendet.

export const verein = {
  name: 'Modellsportgruppe Übersee e. V.',
  ort: 'Übersee, Ortsteil Luft',
  lage: 'Der Platz liegt in Übersee im Ortsteil Luft, direkt an der Bahnlinie München-Salzburg.',

  // Koordinaten des Flugplatzes (Dezimalgrad); null blendet die Karte aus
  koordinaten: { lat: 47.822016, lon: 12.463561 } as { lat: number; lon: number } | null,

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

  // Zeiten 'HH:MM' als [von, bis]; 'sonne' = Sonnenaufgang bis Sonnenuntergang; [] = kein Flugbetrieb.
  // Feiertage (Bayern) gelten wie Sonntag. Daraus entstehen Text und Diagramm-Zeilen.
  // TODO(Verein): bestätigen, dass Hubschrauber auch an Feiertagen nicht fliegen.
  flugzeiten: [
    { was: 'Elektromodelle', kurz: 'Elektro', werktags: 'sonne', samstag: 'sonne', sonntag: 'sonne' },
    {
      was: 'Verbrennermodelle', kurz: 'Verbrenner',
      werktags: [['10:00', '12:00'], ['14:00', '16:00'], ['17:30', '19:00']],
      samstag: [['10:00', '12:00'], ['14:00', '16:00'], ['17:30', '19:00']],
      sonntag: [['10:00', '12:00'], ['14:00', '17:30']],
    },
    {
      was: 'Verbrenner-Hubschrauber', kurz: 'Hubschrauber',
      werktags: [['10:00', '12:00'], ['14:00', '15:30']],
      samstag: [['10:00', '12:00']],
      sonntag: [],
    },
  ] satisfies Flugzeit[] as Flugzeit[],

  gutZuWissen: [
    { icon: 'hand', titel: 'Einfach vorbeikommen', text: 'Zuschauen und fachsimpeln geht immer - ohne Termin. Schau vorher auf die Webcam, ob jemand am Platz ist.' },
    // TODO(Verein): Lehrer-Schüler-Betrieb bestätigen
    { icon: 'gamepad', titel: 'Mitfliegen auf Anfrage', text: 'Am Lehrer-Schüler-Sender fliegst du zusammen mit einem erfahrenen Piloten. Sag Bescheid, dann organisieren wir das.' },
    { icon: 'wrench', titel: 'Hilfe beim ersten Modell', text: 'Kaufen oder selber bauen? Wir beraten dich - im Winter wird gemeinsam gebaut.' },
    // TODO(Verein): Beitragshöhe ergänzen, sobald bekannt
    { icon: 'id-card', titel: 'Mitglied werden', text: 'Selbst fliegen darfst du auf dem Platz als Mitglied oder mit Erlaubnis des Vorstands. Den Beitrag nennen wir dir gern.' },
  ],

  impressum: {
    // ladungsfähige Anschrift (§ 5 DDG): der Verein hat keine eigene, Post geht an den 1. Vorsitzenden
    anschrift: ['c/o Stefan Ueing', 'Lindenstraße 10', '83233 Bernau'],
    // Satzung § 8: 1. und 2. Vorsitzender vertreten jeweils allein; Namen von der alten Vorstandsseite
    vorstand: ['Stefan Ueing (1. Vorsitzender)', 'Markus Meißner (2. Vorsitzender)'],
    email: 'vorstand@msg-übersee.de',
    emailHref: 'mailto:vorstand@xn--msg-bersee-deb.de',
    registergericht: 'Amtsgericht Traunstein',
    registernummer: 'VR 1083',
    verantwortlich: { name: 'Stefan Ueing', anschrift: ['Lindenstraße 10', '83233 Bernau'] },
  },
};
