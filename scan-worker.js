// ============================================================
//  Scan-Server für "Unser Haushalt" (Cloudflare Worker)
//  Liest Fotos von Kassenzetteln und Einkaufszetteln mit der Claude-API.
//
//  Einstellungen im Cloudflare-Dashboard (Worker -> Settings -> Variables and Secrets):
//    ANTHROPIC_API_KEY   (Secret)  dein API-Schlüssel von console.anthropic.com
//    FIREBASE_PROJECT_ID (Text)    z. B. "unser-haushalt-1a2b3"
//    ALLOWED_EMAILS      (Text)    z. B. "jesco@beispiel.de,elena@beispiel.de"
//    ALLOWED_ORIGIN      (Text)    z. B. "https://deinname.github.io"
//    MODEL               (Text, optional) Standard: "claude-sonnet-5-5"
//
//  Nur angemeldete Haushaltsmitglieder mit bestätigter E-Mail aus ALLOWED_EMAILS
//  dürfen scannen. Der API-Schlüssel bleibt hier auf dem Server und nie auf dem Handy.
// ============================================================

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_BODY = 6 * 1024 * 1024; // 6 MB, die App schickt verkleinerte Fotos (meist < 1 MB)
let jwksCache = { keys: null, until: 0 };

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const reply = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }
    });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'Nur POST erlaubt.' });

    // 1) Wer fragt? Firebase-Anmeldung prüfen.
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    let claims;
    try { claims = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID); }
    catch (e) { return reply(401, { error: 'Nicht angemeldet: ' + e.message }); }
    const allowed = String(env.ALLOWED_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    const email = String(claims.email || '').toLowerCase();
    if (!claims.email_verified || !allowed.includes(email)) {
      return reply(403, { error: 'Diese E-Mail darf den Scan-Dienst nicht nutzen.' });
    }

    // 2) Anfrage lesen.
    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_BODY) return reply(413, { error: 'Bild zu groß.' });
    let body;
    try { body = await request.json(); } catch { return reply(400, { error: 'Ungültige Anfrage.' }); }
    const { prompt, image, mediaType } = body || {};
    if (typeof prompt !== 'string' || !prompt || prompt.length > 8000) return reply(400, { error: 'Prompt fehlt.' });
    if (typeof image !== 'string' || !image || image.length > MAX_BODY) return reply(400, { error: 'Bild fehlt.' });
    const type = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType) ? mediaType : 'image/jpeg';

    // 3) Claude fragen.
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: env.MODEL || 'claude-sonnet-5-5',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: type, data: image } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (res.status === 429 || res.status === 529) return reply(429, { error: 'Claude ist gerade ausgelastet oder das Limit ist erreicht.' });
    if (!res.ok) {
      const detail = await res.text();
      // 400 mit "credit balance" heißt: Guthaben aufgebraucht
      if (/credit balance/i.test(detail)) return reply(402, { error: 'Das API-Guthaben ist aufgebraucht.' });
      return reply(502, { error: 'Claude-API-Fehler ' + res.status, detail: detail.slice(0, 500) });
    }
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return reply(200, { text });
  }
};

// ---------- Firebase-ID-Token prüfen (RS256, ohne Zusatzbibliotheken) ----------
function b64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function b64urlJson(s) { return JSON.parse(new TextDecoder().decode(b64urlBytes(s))); }

async function signingKey(kid) {
  if (!jwksCache.keys || Date.now() > jwksCache.until) {
    const r = await fetch(JWKS_URL);
    if (!r.ok) throw new Error('Schlüssel nicht abrufbar');
    jwksCache = { keys: (await r.json()).keys, until: Date.now() + 3600 * 1000 };
  }
  const jwk = jwksCache.keys.find(k => k.kid === kid);
  if (!jwk) { jwksCache.until = 0; throw new Error('Unbekannter Schlüssel'); }
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function verifyFirebaseToken(token, projectId) {
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID fehlt');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token fehlt');
  const [h, p, sig] = parts;
  const header = b64urlJson(h), claims = b64urlJson(p);
  if (header.alg !== 'RS256') throw new Error('Falscher Algorithmus');
  const key = await signingKey(header.kid);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(sig), new TextEncoder().encode(h + '.' + p));
  if (!ok) throw new Error('Signatur ungültig');
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== projectId) throw new Error('Falsches Projekt');
  if (claims.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('Falscher Aussteller');
  if (!(claims.exp > now)) throw new Error('Token abgelaufen');
  if (claims.iat > now + 300) throw new Error('Token aus der Zukunft');
  if (!claims.sub) throw new Error('Kein Nutzer');
  return claims;
}
