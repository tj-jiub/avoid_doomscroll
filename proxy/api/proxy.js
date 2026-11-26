'use strict';
/*
 * SocialLite — Vercel Serverless reverse proxy for Instagram Web.
 *
 *   /                     -> https://www.instagram.com/          (HTML rewritten + SocialLite injected)
 *   /direct/*, /accounts/*, /explore/*, /api/*, /static/*, ...
 *                         -> https://www.instagram.com/<same path>
 *   /sl-cdn/*             -> https://static.cdninstagram.com/*
 *   /reels, /reels/*      -> 302 back to / (server side; the SL cookie turns this off)
 *   /sl/manifest.webmanifest, /sl/icon-*.png, /sl/diag
 *
 * Everything the browser needs to stay on this host is rewritten here:
 * Location headers, Set-Cookie Domain/SameSite, CSP/XFO/COOP, and absolute
 * instagram origins inside the HTML.
 */

const https = require('https');
const zlib = require('zlib');
const { transformHtml, rewriteOrigins } = require('../lib/html');
const { ICONS, MANIFEST } = require('../lib/assets');

const UPSTREAM_HOST = 'www.instagram.com';
const CDN_HOST = 'static.cdninstagram.com';
const CDN_PREFIX = '/sl-cdn/';
const SL_PREFIX = '/sl/';
const UA_FALLBACK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

/* headers we never pass back: framing / isolation / reporting noise.
   content-encoding and content-length are handled per response type below. */
const DROP_RES_HEADERS = new Set([
  'connection', 'keep-alive', 'transfer-encoding',
  'x-frame-options', 'content-security-policy', 'content-security-policy-report-only',
  'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy',
  'permissions-policy', 'strict-transport-security', 'report-to', 'reporting-endpoints',
  'nel', 'alt-svc', 'server', 'x-fb-debug', 'x-fb-connection-quality', 'x-stack',
  'origin-agent-cluster', 'content-md5', 'expect-ct',
]);

/* ─────────────────────────── helpers ─────────────────────────── */

function parseTarget(req) {
  const raw = req.url || '/';
  const qi = raw.indexOf('?');
  let path = qi < 0 ? raw : raw.slice(0, qi);
  const qs = qi < 0 ? '' : raw.slice(qi + 1);
  const params = new URLSearchParams(qs);
  // Support both rewrite shapes:
  //   { "source": "/(.*)", "destination": "/api/proxy" }          -> req.url is the original path
  //   { "source": "/(.*)", "destination": "/api/proxy?__slp=$1" } -> path arrives as a param
  if (params.has('__slp')) {
    path = '/' + String(params.get('__slp') || '').replace(/^\/+/, '');
    params.delete('__slp');
  }
  // If Vercel handed us "/api/proxy" verbatim, the rewrite is not passing the
  // original path (it normally does). Flag it instead of pretending it is "/".
  const direct = path === '/api/proxy' || path === '/api/proxy/';
  const search = params.toString();
  return { path, search, raw, direct };
}

function readCookie(header, name) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const i = part.indexOf('=');
      if (i < 0) return;
      out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    });
  return out[name];
}

function fixSetCookie(value) {
  const parts = String(value || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const kept = [];
  let hasPath = false;
  let secure = false;
  for (const part of parts) {
    const low = part.toLowerCase();
    if (low.startsWith('domain=')) continue;          // stay host-only on the proxy host
    if (low.startsWith('samesite=')) continue;        // rewritten below
    if (low.startsWith('path=')) hasPath = true;
    if (low === 'secure') secure = true;
    kept.push(part);
  }
  // SameSite=None needs a third-party context: fall back to Lax so the cookie
  // is still sent on top-level navigations in standalone (Home Screen) mode.
  kept.push('SameSite=Lax');
  if (!hasPath) kept.push('Path=/');
  if (!secure) kept.push('Secure');
  return kept.join('; ');
}

function fixLocation(loc) {
  if (!loc) return loc;
  let out = String(loc)
    .replace(/^https?:\/\/(www\.)?instagram\.com/i, '')
    .replace(/^\/\//, '');
  if (!out.startsWith('/')) out = '/' + out;
  return out;
}

function upstreamHeaders(req, target, host, upstreamPath) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v) continue;
    if (HOP_BY_HOP.has(k)) continue;
    if (k === 'host' || k === 'expect' || k === 'content-length') continue;
    if (k.startsWith('x-forwarded') || k === 'x-real-ip' || k === 'forwarded') continue;
    if (k === 'x-vercel-id' || k.startsWith('x-vercel-')) continue;
    /* client hints would contradict the iPhone Safari UA we forward (and
       headless/lab clients get a 500 from Meta's bot check when they leak) */
    if (k.startsWith('sec-ch-')) continue;
    headers[k] = v;
  }
  headers.host = host;
  /* referer/origin must keep pointing at "instagram" but with the page the user
     is really on — instagram 500s a login POST whose referer is the endpoint
     itself. Any other origin is dropped rather than forwarded. */
  const ourHosts = [req.headers['x-forwarded-host'], req.headers.host].filter(Boolean);
  const isInsta = (h) => /(^|\.)instagram\.com$/i.test(h);
  for (const key of ['referer', 'origin']) {
    const value = headers[key];
    if (!value) continue;
    try {
      const u = new URL(value);
      if (isInsta(u.hostname) || ourHosts.includes(u.host)) {
        headers[key] = key === 'origin' ? 'https://' + host : 'https://' + host + u.pathname + u.search;
      } else {
        delete headers[key];
      }
    } catch (e) {
      delete headers[key];
    }
  }
  // cookies: ours first, instagram's after
  const cookie = String(req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !/^sl_(off|debug)=/.test(s))
    .join('; ');
  if (cookie) headers.cookie = cookie;
  else delete headers.cookie;
  if (!headers['user-agent']) headers['user-agent'] = UA_FALLBACK;
  headers['accept-encoding'] = 'gzip, deflate, br';
  return Object.assign(headers, {});
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const err = new Error('request body too large');
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function upstreamRequest({ method, host, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      { host, port: 443, method, path, headers, servername: host },
      resolve
    );
    request.setTimeout(25000, () => request.destroy(new Error('upstream timeout')));
    request.on('error', reject);
    if (body && body.length) request.end(body);
    else request.end();
  });
}

function decodeBody(buf, encoding) {
  const enc = String(encoding || '').toLowerCase();
  try {
    if (enc === 'gzip' || enc === 'x-gzip') return zlib.gunzipSync(buf);
    if (enc === 'deflate') {
      try {
        return zlib.inflateSync(buf);
      } catch (e) {
        return zlib.inflateRawSync(buf);
      }
    }
    if (enc === 'br') return zlib.brotliDecompressSync(buf);
  } catch (e) {
    return null;
  }
  return buf;
}

function sendJson(res, status, obj, extra) {
  const body = Buffer.from(JSON.stringify(obj, null, 2));
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-length', String(body.length));
  if (extra) for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(body);
}

/* ───────────────────────── internal routes ───────────────────────── */

function handleInternal(req, res, target) {
  const p = target.path;
  if (target.direct) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(
      '<meta name=viewport content="width=device-width">' +
        '<h1 style="font:700 18px system-ui">SocialLite: rewrite가 경로를 전달하지 않았습니다</h1>' +
        '<p style="font:400 14px/1.5 system-ui">함수가 받은 URL이 <code>' + String(target.raw) + '</code> 입니다. ' +
        'vercel.json의 rewrite를 아래처럼 바꿔 주세요.<br><br>' +
        '<code>{ "source": "/(.*)", "destination": "/api/proxy?__slp=$1" }</code></p>'
    );
    return true;
  }
  if (p === '/sl/manifest.webmanifest' || p === '/sl/manifest.json') {
    const body = Buffer.from(JSON.stringify(MANIFEST));
    res.statusCode = 200;
    res.setHeader('content-type', 'application/manifest+json; charset=utf-8');
    res.setHeader('content-length', String(body.length));
    res.setHeader('cache-control', 'public, max-age=3600');
    res.end(body);
    return true;
  }
  const iconMatch = /^\/sl\/(apple-touch-icon-180|icon-180|icon-192|icon-512|icon-maskable-512)\.png$/.exec(p);
  if (iconMatch) {
    const name = iconMatch[1] === 'icon-180' ? 'apple-touch-icon-180' : iconMatch[1];
    const file = ICONS[name + '.png'] || ICONS['icon-192.png'];
    const body = Buffer.from(file, 'base64');
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    res.setHeader('content-length', String(body.length));
    res.setHeader('cache-control', 'public, max-age=86400');
    res.end(body);
    return true;
  }
  if (p === '/sl/diag') {
    sendJson(res, 200, {
      ok: true,
      version: 3,
      seenUrl: target.raw,
      resolvedPath: target.path,
      search: target.search,
      host: req.headers['x-forwarded-host'] || req.headers.host || null,
      method: req.method,
      cookieNames: String(req.headers.cookie || '')
        .split(';')
        .map((s) => s.split('=')[0].trim())
        .filter(Boolean),
      hint:
        'resolvedPath must equal the path you typed. If it shows "/" the rewrite is not passing req.url.',
    });
    return true;
  }
  if (p === '/sl/health') {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('SocialLite proxy ok');
    return true;
  }
  if (p === '/sl' || p === '/sl/') {
    res.statusCode = 302;
    res.setHeader('location', '/');
    res.end();
    return true;
  }
  if (p.startsWith(SL_PREFIX)) {
    sendJson(res, 404, { ok: false, error: 'unknown SocialLite route', path: p });
    return true;
  }
  return false;
}

/* ─────────────────────────── the proxy ─────────────────────────── */

async function proxy(req, res, target) {
  let host = UPSTREAM_HOST;
  let path = target.path;
  if (path.startsWith(CDN_PREFIX)) {
    host = CDN_HOST;
    path = '/' + path.slice(CDN_PREFIX.length);
  }
  if (target.search) path += '?' + target.search;

  const method = (req.method || 'GET').toUpperCase();
  const hasBody = !(method === 'GET' || method === 'HEAD');

  let body = null;
  if (hasBody) body = await readBody(req, 24 * 1024 * 1024);

  const headers = upstreamHeaders(req, target, host, path);
  if (body) headers['content-length'] = String(body.length);

  const up = await upstreamRequest({ method, host, path, headers, body });

  const status = up.statusCode || 502;
  const resHeaders = up.headers || {};
  const contentType = String(resHeaders['content-type'] || '');
  const isHtml = /text\/html/i.test(contentType);
  const isJs = /(javascript|ecmascript)/i.test(contentType) && !isHtml;

  /* pass through the status and the headers we allow */
  res.statusCode = status;
  if (up.statusMessage) res.statusMessage = up.statusMessage;

  const drop = new Set(DROP_RES_HEADERS);
  if (isHtml || isJs) {
    drop.add('content-encoding');
    drop.add('content-length');
  }

  for (const [k, v] of Object.entries(resHeaders)) {
    if (drop.has(k)) continue;
    if (k === 'set-cookie' || k === 'location') continue;
    if (v === undefined) continue;
    try {
      res.setHeader(k, v);
    } catch (e) {
      /* ignore invalid header */
    }
  }

  const cookies = resHeaders['set-cookie'];
  if (cookies) {
    const list = Array.isArray(cookies) ? cookies : [cookies];
    res.setHeader('set-cookie', list.map(fixSetCookie));
  }
  if (resHeaders.location) res.setHeader('location', fixLocation(resHeaders.location));

  if (!isHtml && !isJs) {
    /* binary / CSS / JSON: stream untouched */
    res.setHeader('x-sl-proxy', 'stream');
    up.pipe(res);
    return;
  }
  if (method === 'HEAD') {
    res.end();
    return;
  }

  /* HTML and JS: decompress, rewrite, send (JS keeps the login flow on this host:
     instagram builds a few absolute URLs in its bundles, which would otherwise
     become cross-origin CORS failures) */
  const chunks = [];
  await new Promise((resolve, reject) => {
    up.on('data', (c) => chunks.push(c));
    up.on('end', resolve);
    up.on('error', reject);
  });
  let buf = Buffer.concat(chunks);
  const decoded = decodeBody(buf, resHeaders['content-encoding']);
  if (decoded) buf = decoded;

  const text = rewriteOrigins(buf.toString('utf8'));
  const out = Buffer.from(isHtml ? transformHtml(text) : text, 'utf8');
  if (isHtml) res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('content-length', String(out.length));
  res.setHeader('x-sl-proxy', isHtml ? 'html' : 'js');
  if (isHtml) res.setHeader('cache-control', 'no-store');
  res.end(out);
}

/* ─────────────────────────── entry ─────────────────────────── */

module.exports = async function handler(req, res) {
  let target;
  try {
    target = parseTarget(req);
  } catch (e) {
    sendJson(res, 400, { ok: false, error: 'bad request url' });
    return;
  }

  if (handleInternal(req, res, target)) return;

  /* server-side /reels block (the SL pill clears it with the sl_off cookie) */
  const off = readCookie(req.headers.cookie, 'sl_off') === '1';
  if (!off && /^\/(?:[^/]+\/)?reels(\/|$)/.test(target.path)) {
    res.statusCode = 302;
    res.setHeader('location', '/');
    res.setHeader('cache-control', 'no-store');
    res.end();
    return;
  }

  try {
    await proxy(req, res, target);
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, err.statusCode || 502, {
        ok: false,
        error: String((err && err.message) || err),
        path: target.path,
      });
    } else {
      try {
        res.end();
      } catch (e) {
        /* noop */
      }
    }
  }
};

module.exports.config = { maxDuration: 30 };
