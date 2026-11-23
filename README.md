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

## Aufbau

- `index.html` ist der Einstiegspunkt der App (aktuell eine Platzhalterseite).
- `.github/workflows/pages.yml` veröffentlicht den Inhalt des Repos bei jedem Push auf `main` automatisch auf GitHub Pages.

## Lokal ansehen

Einfach `index.html` im Browser öffnen, oder einen kleinen Webserver starten:

```bash
python3 -m http.server 8000
```

und dann http://localhost:8000 aufrufen.
