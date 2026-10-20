#!/usr/bin/env node
'use strict';
/*
 * Serves the repository on http://127.0.0.1:<port> the way lib/server.js models Vercel (redirects, trailing slashes, headers,
 * .vercelignore). For looking at pages by hand; the checks start their own copy.
 *
 *   node serve.js            port 8080
 *   node serve.js 9000
 *
 * It is a simulation: see "What a local run cannot show" in README.md. Stop it with Ctrl+C.
 */
const path = require('path');
const server = require('./lib/server');

const port = Number(process.argv[2] || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('usage: node serve.js [port]'); process.exit(2); }

server.start({ root: path.resolve(__dirname, '..', '..'), port }).then((s) => console.log(`serving the site at ${s.url} (Ctrl+C to stop)`));
