import type { Flugzeit } from '../lib/flugzeiten';

// Alle Angaben des Vereins an einer Stelle. Direkt auf GitHub bearbeitbar.
// Offene Punkte sind mit TODO(Verein) markiert - leere Werte werden auf der Seite ausgeblendet.

// Eigene Exporte für WhatsApp und Impressum: so landen Nummer, Adresse und E-Mail nicht im
// JavaScript der Seite. Im HTML stehen Nummer und E-Mail nur verschlüsselt (siehe lib/obfuscate.ts).
export const whatsapp = {
  // Die Nummer steht absichtlich nicht hier im öffentlichen Code. Sie kommt beim Bauen aus der
  // Umgebungsvariable WHATSAPP_NUMMER (GitHub: Repo-Variable, lokal: Datei .env neben docker-compose.yml).
  // Ohne Nummer zeigt die Seite statt des Buttons einen neutralen Hinweis.
  nummer: String(import.meta.env.WHATSAPP_NUMMER ?? '').replace(/\D/g, ''),
  // Erstkontakt für Interessierte (Stefan Ueing hat zugesagt)
  ansprechperson: 'Stefan',
  text: 'Hallo, ich interessiere mich für Modellflug bei der MSG Übersee und würde gern mal vorbeikommen.',
};

export const verein = {
  name: 'Modellsportgruppe Übersee e. V.',
  ort: 'Übersee, Ortsteil Luft',
  lage: 'Der Platz liegt in Übersee im Ortsteil Luft, direkt an der Bahnlinie München-Salzburg.',

  // Koordinaten des Flugplatzes (Dezimalgrad); null blendet die Karte aus
  koordinaten: { lat: 47.822016, lon: 12.463561 } as { lat: number; lon: number } | null,

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
    { icon: 'gamepad', titel: 'Mitfliegen auf Anfrage', text: 'Am Lehrer-Schüler-Sender fliegst du zusammen mit einem erfahrenen Piloten. Sag Bescheid, dann organisieren wir das.' },
    { icon: 'wrench', titel: 'Hilfe beim ersten Modell', text: 'Kaufen oder selber bauen? Wir beraten dich gerne und helfen auch gerne beim Aufbau.' },
    // TODO(Verein): Beitragshöhe ergänzen, sobald bekannt
    { icon: 'id-card', titel: 'Mitglied werden', text: 'Selbst fliegen darfst du auf dem Platz als Mitglied oder mit Erlaubnis des Vorstands. Den Beitrag nennen wir dir gern.' },
  ],
};

export const impressum = {
  anschrift: ['c/o Stefan Ueing', 'Lindenstraße 10', '83233 Bernau'],
  vorstand: ['Stefan Ueing (1. Vorsitzender)', 'Markus Meißner (2. Vorsitzender)'],
  email: 'vorstand@msg-übersee.de',
  emailHref: 'mailto:vorstand@xn--msg-bersee-deb.de',
  registergericht: 'Amtsgericht Traunstein',
  registernummer: 'VR 1083',
  verantwortlich: { name: 'Stefan Ueing', anschrift: ['Lindenstraße 10', '83233 Bernau'] },
};
