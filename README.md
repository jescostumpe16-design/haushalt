# Unser Haushalt – Einrichtung als iPhone-App

Die App läuft danach ohne Claude: Ihr installiert sie über Safari auf dem Home-Bildschirm, sie startet im Vollbild, funktioniert auch offline und gleicht sich automatisch zwischen euren beiden iPhones ab.

**Zeitbedarf:** etwa 30 bis 45 Minuten, einmalig. Am besten am Laptop.
**Kosten:** 0 € für App, Datenbank und Hosting. Nur die Foto-Erkennung (Kassenzettel, Einkaufszettel) kostet über die Claude-API ein paar Cent pro Foto.

## Was in diesem Ordner liegt

| Datei | Wofür |
|---|---|
| `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/` | Die App selbst |
| `config.js` | **Hier trägst du deine Zugangsdaten ein** (Schritt 3 und 6) |
| `firestore.rules` | Sicherheitsregeln für die Datenbank (Schritt 2) |
| `scan-worker.js` | Scan-Server für die Foto-Erkennung (Schritt 6, optional) |

## Wie die Teile zusammenspielen

- **GitHub Pages** liefert die App-Dateien aus (wie eine Webseite).
- **Firebase** (von Google) übernimmt Anmeldung und speichert eure gemeinsamen Daten. Jedes iPhone hat zusätzlich eine eigene Kopie, deshalb geht alles auch ohne Netz.
- **Cloudflare Worker** (optional) schickt Fotos an Claude und gibt die erkannten Artikel zurück. Dein API-Schlüssel liegt nur dort, nie auf dem Handy.

---

## Schritt 1: Firebase-Projekt anlegen

1. Öffne [console.firebase.google.com](https://console.firebase.google.com) und melde dich mit deinem Google-Konto an.
2. **Projekt erstellen** → Name z. B. `unser-haushalt` → Google Analytics **ausschalten** → Projekt erstellen.

## Schritt 2: Anmeldung und Datenbank einschalten

**Anmeldung:**
1. Links **Build → Authentication** → **Jetzt starten**.
2. Reiter **Sign-in method** → **E-Mail/Passwort** → aktivieren (nur den ersten Schalter) → Speichern.
3. Optional: Reiter **Templates** → unten die Sprache auf **Deutsch** stellen, damit die Bestätigungs-Mails deutsch sind.

**Datenbank:**
1. Links **Build → Firestore Database** → **Datenbank erstellen**.
2. Standort **europe-west3 (Frankfurt)** wählen. Das lässt sich später nicht mehr ändern.
3. **Im Produktionsmodus starten** → Erstellen.
4. Reiter **Regeln**: Den Inhalt dort komplett löschen, den Inhalt der Datei `firestore.rules` einfügen → **Veröffentlichen**.

Diese Regeln sorgen dafür, dass nur Personen mit bestätigter E-Mail, die in eurem Haushalt eingetragen sind, eure Daten sehen können.

## Schritt 3: Zugangsdaten in `config.js` eintragen

1. In Firebase oben links auf das Zahnrad → **Projekteinstellungen**.
2. Unten bei „Meine Apps“ auf das Symbol **`</>`** (Web) klicken.
3. App-Spitzname z. B. `Haushalt` → Firebase Hosting **nicht** ankreuzen → App registrieren.
4. Du siehst einen Block `const firebaseConfig = { ... }`. Übertrage die sechs Werte (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) in die Datei `config.js` und speichere sie.

Die Werte sind keine Geheimnisse. Sie dürfen öffentlich sein, geschützt wird über die Regeln aus Schritt 2.

## Schritt 4: App bei GitHub Pages veröffentlichen

1. Konto anlegen auf [github.com](https://github.com), falls du noch keins hast. Merk dir deinen Benutzernamen.
2. Oben rechts **+** → **New repository** → Name `haushalt` → **Public** → Create repository.
3. Auf der leeren Repository-Seite: **uploading an existing file** → alle Dateien aus diesem Ordner **inklusive des Ordners `icons`** hineinziehen → **Commit changes**.
4. Reiter **Settings** → links **Pages** → bei „Branch“ **main** und **/(root)** wählen → Save.
5. Nach ein bis zwei Minuten ist die App erreichbar unter
   `https://DEIN-BENUTZERNAME.github.io/haushalt/`

## Schritt 5: Domain in Firebase freigeben

Firebase → **Authentication** → Reiter **Settings** → **Autorisierte Domains** → **Domain hinzufügen** → `DEIN-BENUTZERNAME.github.io`

Teste jetzt am Laptop: Die Adresse aus Schritt 4 öffnen. Du solltest die Anmeldeseite sehen. Siehst du „Die App ist noch nicht verbunden“, ist `config.js` noch leer oder nicht hochgeladen.

## Schritt 6 (optional): Foto-Erkennung einrichten

Ohne diesen Schritt funktioniert alles außer „Kassenzettel scannen“ und „Foto vom Zettel“. Die beiden Knöpfe sind dann ausgeblendet.

**a) Claude-API-Schlüssel**
1. [console.anthropic.com](https://console.anthropic.com) → Konto anlegen.
2. Unter **Billing** Guthaben aufladen (der Mindestbetrag reicht für sehr viele Bons).
3. Unter **API Keys** → **Create Key** → Schlüssel kopieren. Er wird nur einmal angezeigt.

**b) Scan-Server bei Cloudflare**
1. Konto anlegen auf [dash.cloudflare.com](https://dash.cloudflare.com).
2. Links **Workers & Pages** → **Erstellen** → **Worker erstellen** → Name `haushalt-scan` → **Deploy**.
3. **Code bearbeiten** → den vorhandenen Code komplett ersetzen durch den Inhalt von `scan-worker.js` → **Deploy**.
4. Zurück zum Worker → **Settings** → **Variables and Secrets** → diese Einträge hinzufügen:

| Name | Typ | Wert |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Secret** | dein API-Schlüssel aus a) |
| `FIREBASE_PROJECT_ID` | Text | die `projectId` aus `config.js` |
| `ALLOWED_EMAILS` | Text | eure beiden E-Mails, mit Komma getrennt, z. B. `jesco@beispiel.de,elena@beispiel.de` |
| `ALLOWED_ORIGIN` | Text | `https://DEIN-BENUTZERNAME.github.io` (ohne `/haushalt` am Ende) |

5. Oben steht die Adresse des Workers, z. B. `https://haushalt-scan.deinname.workers.dev`. Trag sie in `config.js` bei `SCAN_URL` ein.
6. Die geänderte `config.js` bei GitHub hochladen: im Repository **Add file → Upload files** → `config.js` hineinziehen → Commit. Die alte wird ersetzt.

`ALLOWED_EMAILS` sorgt dafür, dass niemand sonst über deinen Schlüssel scannen kann, auch wenn er die Adresse kennt.

## Schritt 7: Auf den iPhones installieren

Für **jedes** iPhone:

1. **Safari** öffnen und `https://DEIN-BENUTZERNAME.github.io/haushalt/` aufrufen.
2. Unten auf **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Die App **über das neue Symbol** öffnen, nicht in Safari. Die installierte App hat ihren eigenen Speicher, du meldest dich also dort an.

**Du (zuerst):**
1. **Neues Konto erstellen** → E-Mail und Passwort → Bestätigungs-Mail öffnen und auf den Link tippen → zurück in die App → **Ich habe bestätigt**.
2. Haushalt anlegen: Name, dein Name, Elenas Name und **Elenas E-Mail-Adresse**.

**Elena (danach):**
1. **Neues Konto erstellen** mit **genau der E-Mail**, die du eingetragen hast → bestätigen → **Ich habe bestätigt**.
2. Sie landet direkt in eurem Haushalt und tippt auf „Elena“ bei „Wer bist du?“.

---

## Gut zu wissen

- **Offline:** Einkaufsliste abhaken, Ausgaben eintragen usw. geht auch ohne Netz. Die Änderungen werden übertragen, sobald das Handy wieder online ist. Nur die erste Anmeldung und die Foto-Erkennung brauchen Internet.
- **Daueraufträge** werden eingetragen, sobald einer von euch die App am Fälligkeitstag oder danach öffnet.
- **Weitere Personen:** Oben rechts auf deinen Namen → Mitbewohner hinzufügen und unter „Zugang per E-Mail“ ihre Adresse eintragen.
- **Abmelden** findest du ebenfalls dort.
- **Kostenlose Grenzen:** Firebase erlaubt im kostenlosen Tarif 50.000 Lesevorgänge und 20.000 Schreibvorgänge pro Tag, Cloudflare 100.000 Scans pro Tag. Für einen Haushalt reicht das um ein Vielfaches.

## Updates einspielen

Wenn ich dir eine neue Version gebe:
1. Die geänderten Dateien bei GitHub hochladen (**Add file → Upload files**). Deine `config.js` **nicht** überschreiben, außer du hast sie neu ausgefüllt.
2. In `sw.js` die Zeile `const VERSION = 'haushalt-v1';` auf die nächste Nummer setzen (`v2`, `v3`, …) und ebenfalls hochladen.
3. App auf dem iPhone schließen und zweimal öffnen. Beim ersten Start lädt sie die neue Version im Hintergrund, beim zweiten ist sie aktiv.

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| „Die App ist noch nicht verbunden“ | `config.js` ausgefüllt und bei GitHub hochgeladen? Danach App zweimal öffnen. |
| Keine Bestätigungs-Mail | Spam-Ordner prüfen, dann **Erneut senden**. |
| Elena sieht den Haushalt nicht | Hat sie sich mit genau der eingetragenen E-Mail registriert? Unter deinem Namen → „Zugang per E-Mail“ prüfen. Dann bei ihr **erneut suchen**. |
| „Der Scan-Dienst kennt deine E-Mail nicht“ | E-Mail in `ALLOWED_EMAILS` beim Worker eintragen. |
| Scan schlägt immer fehl | Im Worker unter **Logs** nachsehen. Häufig: `ALLOWED_ORIGIN` passt nicht oder das API-Guthaben ist leer. |
| GitHub-Seite zeigt 404 | Ein paar Minuten warten. Prüfen, ob `index.html` direkt im Repository liegt und nicht in einem Unterordner. |
