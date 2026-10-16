'use strict';
/* Loads every page once in Chromium and records what the content checks need. */

const COLLECT = () => {
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;
  const textNodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const tag = n.parentElement?.tagName;
      if (!tag || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(tag)) return NodeFilter.FILTER_REJECT;
      return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  while (walker.nextNode()) textNodes.push({ text: walker.currentNode.nodeValue.replace(/\s+/g, ' ').trim(), inFooter: !!walker.currentNode.parentElement.closest('footer.site-footer'), inMain: !!walker.currentNode.parentElement.closest('main') });
  return {
    title: document.title,
    lang: document.documentElement.lang,
    description: meta('meta[name="description"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogTitle: meta('meta[property="og:title"]'),
    ogImage: meta('meta[property="og:image"]'),
    ogImageAlt: meta('meta[property="og:image:alt"]'),
    ogImageWidth: meta('meta[property="og:image:width"]'),
    ogImageHeight: meta('meta[property="og:image:height"]'),
    ogImageType: meta('meta[property="og:image:type"]'),
    ogUrl: meta('meta[property="og:url"]'),
    twitterImage: meta('meta[name="twitter:image"]'),
    robots: meta('meta[name="robots"]'),
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
    textNodes,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  };
};

async function loadModels(browser, baseUrl, urls) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'mock' }));
  const models = {};
  try {
    for (const url of urls) {
      const response = await context.request.get(baseUrl + url);
      const raw = await response.text();
      const page = await context.newPage();
      await page.goto(baseUrl + url, { waitUntil: 'load' });
      const m = await page.evaluate(COLLECT);
      m.url = url;
      m.status = response.status();
      m.raw = raw;
      m.text = m.textNodes.map((n) => n.text).join('\n');
      m.footerText = m.textNodes.filter((n) => n.inFooter).map((n) => n.text).join('\n');
      m.bodyTextOutsideFooter = m.textNodes.filter((n) => !n.inFooter).map((n) => n.text).join('\n');
      models[url] = m;
      await page.close();
    }
  } finally {
    await context.close();
  }
  return models;
}

module.exports = { loadModels };
