'use strict';
/*
 * SocialLite proxy — HTML rewriting.
 *   1. absolute instagram origins -> paths on this host (so links / fetch / XHR
 *      stay inside the proxy and keep the login cookies on the .vercel.app host)
 *   2. drop Instagram's own web manifest, add ours + apple-touch-icon + meta
 *   3. inject the SocialLite CSS (before paint) and blocker JS at the end of <head>
 */

const { CSS, JS } = require('./blocker');

const HEAD_MARK = '<!-- socialite:head -->';
const SL_HEAD = `${HEAD_MARK}
<meta name="sl-proxy" content="3.0.0">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="SocialLite">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#0b0c12">
<link rel="manifest" href="/sl/manifest.webmanifest">
<link rel="apple-touch-icon" sizes="180x180" href="/sl/icon-180.png">
<link rel="icon" type="image/png" href="/sl/icon-192.png">
<style id="sl-css">${CSS}</style>
<script id="sl-boot">${JS}</script>
`;

function rewriteOrigins(html) {
  return html
    // static.cdninstagram.com -> our own /sl-cdn/ path (kept same-origin so
    // crossorigin/module scripts keep their CORS guarantees)
    .replace(/https:\/\/static\.cdninstagram\.com\//g, '/sl-cdn/')
    .replace(/https:\/\/static\.cdninstagram\.com(?=["'\\ ])/g, '/sl-cdn')
    // the app itself
    .replace(/https:\/\/www\.instagram\.com\//g, '/')
    .replace(/https:\/\/www\.instagram\.com(?=["'\\ ,}])/g, '')
    .replace(/https:\/\/instagram\.com\//g, '/')
    .replace(/https:\/\/instagram\.com(?=["'\\ ,}])/g, '');
}

function injectHead(html) {
  if (html.includes(HEAD_MARK)) return html;
  // Instagram's manifest would point at /data/manifest.json and override ours
  let out = html.replace(/<link[^>]+rel=["']?manifest["']?[^>]*>/gi, '');
  const i = out.search(/<\/head\s*>/i);
  if (i >= 0) {
    out = out.slice(0, i) + SL_HEAD + out.slice(i);
  } else {
    const j = out.search(/<body[^>]*>/i);
    out = j >= 0 ? out.slice(0, j) + SL_HEAD + out.slice(j) : SL_HEAD + out;
  }
  return out;
}

function transformHtml(html) {
  return injectHead(rewriteOrigins(html));
}

module.exports = { transformHtml, rewriteOrigins, injectHead, SL_HEAD };
