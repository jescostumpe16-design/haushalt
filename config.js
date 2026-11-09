// ============================================================
//  Hier trägst du deine eigenen Zugangsdaten ein (Anleitung Schritt 3 und 6).
//  Diese Werte sind keine Geheimnisse: Firebase schützt eure Daten über die
//  Sicherheitsregeln (firestore.rules), nicht über diesen Schlüssel.
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyCvo84BMchvQatvt56n45L-zDATkUYCMOI",
  authDomain: "unser-haushalt-52374.firebaseapp.com",
  projectId: "unser-haushalt-52374",
  storageBucket: "unser-haushalt-52374.firebasestorage.app",
  messagingSenderId: "498902229576",
  appId: "1:498902229576:web:f45f424d437638a4a92e7d"
};


// Adresse deines Scan-Servers (Cloudflare Worker), z. B.
// "https://haushalt-scan.deinname.workers.dev"
// Leer lassen, wenn du die Foto-Erkennung (Kassenzettel, Einkaufszettel) nicht nutzen willst.
export const SCAN_URL = "";
