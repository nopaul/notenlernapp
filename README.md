# NotenLernApp 🎸

Eine kleine Web-App, mit der ich Gitarre spielen und das dafür nötige Notenlesen lernen möchte.

## Ziele

- Noten im Violinschlüssel lesen lernen (die Gitarre klingt eine Oktave tiefer als notiert)
- Noten den Saiten und Bünden auf dem Griffbrett zuordnen
- Rhythmus und Notenwerte verstehen
- Mit kurzen Übungen und Quizzen regelmäßig trainieren

## Live-Version

Die App wird automatisch über **GitHub Pages** veröffentlicht:
https://nopaul.github.io/notenlernapp/

## Was die App kann (Etappe 1)

- **Grundlagen (T0):** Notensystem, Linien und Zwischenräume, Violinschlüssel, Notennamen, Hilfslinien, mit kurzem Check.
- **Stufe T1:** die sechs Leersaiten E A D G H E als Leitnoten. **Stufe T2:** Saiten 1 und 2 in der 1. Lage (E F G, H C D).
- **Lernkarten mit Bildern:** jede neue Note als Notenbild (ganze Note, Viertel, Halbe) mit Namen, Griffbrett und Klang. Bildergalerie zu Beginn jeder Stufe.
- **Abfrage:** Karte A „Note → Name“ (Tastenfeld oder Tastatur), Karte B „Note setzen“ (Linie oder Zwischenraum antippen).
- **Feedback:** richtige Note grün, deine Antwort als gestrichelte „Geist“-Note daneben, Erklärung („einen Zwischenraum zu hoch“), Griffbrett und Ton, danach sofort ein Korrektur-Versuch.
- **Wiederholungsplan:** FSRS (ts-fsrs). Bewertet wird automatisch aus Richtigkeit und Antwortzeit, nicht per Selbsteinschätzung.
- **Heute-Seite:** fällige Karten, neue Noten, 3-Minuten-Modus, Wochenübersicht ohne Streak-Druck, Lernpfad mit Freischaltung.
- **Speichern:** alles bleibt im Browser (IndexedDB), mit Export und Import als JSON-Backup.

## Aufbau

- `index.html` ist der Einstiegspunkt, ohne Build-Schritt.
- `js/` enthält die App als JavaScript-Module: `app.js` (Oberfläche), `session.js` (Tagessitzung), `srs.js` (FSRS und Bewertung), `notation.js` und `fretboard.js` (SVG-Bilder), `audio.js` (Zupfklang), `music.js` (Noten und Lernpfad), `store.js` (Speichern).
- `vendor/ts-fsrs.mjs` ist die Bibliothek ts-fsrs 5.4.2 (MIT). Notenglyphen stammen aus der Schrift Bravura (SIL Open Font License).
- `.github/workflows/pages.yml` veröffentlicht den Inhalt des Repos bei jedem Push auf `main` automatisch auf GitHub Pages.

## Lokal ansehen

Einfach `index.html` im Browser öffnen, oder einen kleinen Webserver starten:

```bash
python3 -m http.server 8000
```

und dann http://localhost:8000 aufrufen.
