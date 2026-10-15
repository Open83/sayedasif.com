'use strict';
/*
 * Static server that behaves like the Vercel project for the rules this site uses:
 *   - vercel.json "redirects" (exact paths and "/prefix/:path*") with the status Vercel documents: "statusCode" if given,
 *     otherwise 308 for permanent (the default) and 307 for permanent:false. (Not 301/302: a rule that only says
 *     permanent:true is a 308 on the real host, so the checks must not be able to mistake it for a 301.)
 *   - "trailingSlash": true  (a directory without the slash gets a 308 to the slash)
 *   - vercel.json "headers" (source patterns are regular expressions)
 *   - .vercelignore: ignored paths are answered 404, as an upload would leave them out
 *   - gzip for text responses when the client accepts it (Vercel compresses text assets; keeps Lighthouse's transfer sizes realistic)
 * Any rule shape it does not understand throws at start-up, so a rule is never silently ignored.
 *
 * What it cannot show: Vercel's own rule order, whether Git deployments honour .vercelignore, edge caching.
 * That is what the optional preview-URL check is for.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COMPRESSIBLE = /^(text\/|application\/(json|xml)|image\/svg\+xml)/;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json',
};

function compileRedirect(rule) {
  const s = rule.source;
  if (/^\/[^:()*]*$/.test(s)) return { test: (p) => p === s, rule };
  const m = /^(\/[^:()*]*)\/:path\*$/.exec(s);
  if (m) return { test: (p) => p === m[1] || p.startsWith(m[1] + '/'), rule };
  throw new Error(`verify server: unsupported redirect source "${s}"`);
}

function redirectStatus(rule) {
  if (rule.statusCode !== undefined && rule.permanent !== undefined) throw new Error(`verify server: redirect "${rule.source}" sets both statusCode and permanent (Vercel rejects that)`);
  if (rule.statusCode !== undefined) return rule.statusCode;
  return rule.permanent === false ? 307 : 308;
}

function start({ root, port = 0, log = false }) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const redirects = (config.redirects || []).map(compileRedirect);
  const headerRules = (config.headers || []).map((h) => ({ re: new RegExp('^' + h.source + '$'), headers: h.headers }));
  const trailingSlash = config.trailingSlash === true;
  const ignore = fs.existsSync(path.join(root, '.vercelignore'))
    ? fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.replace(/^\//, ''))
    : [];
  const alwaysHidden = ['.git/', 'node_modules/', '.vercelignore', 'vercel.json'];
  const hidden = (rel) => [...ignore, ...alwaysHidden].some((i) => (i.endsWith('/') ? rel === i.slice(0, -1) || rel.startsWith(i) : rel === i));

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://local');
    let p;
    try { p = decodeURIComponent(u.pathname); } catch { res.writeHead(400); return res.end('bad path'); }

    const send = (status, headers, body) => {
      const extra = {};
      for (const h of headerRules) if (h.re.test(p)) for (const { key, value } of h.headers) extra[key] = value;
      res.writeHead(status, { ...extra, ...headers });
      res.end(req.method === 'HEAD' ? undefined : body);
    };

    for (const r of redirects) {
      if (r.test(p)) {
        const status = redirectStatus(r.rule);
        if (log) console.log(`  ${status} ${p} -> ${r.rule.destination}`);
        return send(status, { Location: r.rule.destination }, '');
      }
    }

    const abs = path.normalize(path.join(root, p));
    if (!abs.startsWith(path.normalize(root))) return send(403, {}, 'forbidden');
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (hidden(rel)) return send(404, { 'Content-Type': 'text/plain' }, '404 ' + p);

    let file = abs;
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      if (trailingSlash && !p.endsWith('/')) return send(308, { Location: p + '/' + u.search }, '');
      file = path.join(abs, 'index.html');
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, { 'Content-Type': 'text/plain' }, '404 ' + p);
    let body = fs.readFileSync(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type };
    if (COMPRESSIBLE.test(type)) {
      headers.Vary = 'Accept-Encoding';
      if (/gzip/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); headers['Content-Encoding'] = 'gzip'; }
    }
    headers['Content-Length'] = body.length;
    return send(200, headers, body);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: bound } = server.address();
      resolve({ url: `http://127.0.0.1:${bound}`, port: bound, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { start, redirectStatus };
