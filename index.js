const express = require('express');
const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

app.post('/scrape', async (req, res) => {
  const { url, waitTime = 3000, timeout = 30000 } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'request_timeout', url });
    }
  }, timeout + 10000);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas','--no-first-run','--no-zygote',
        '--single-process','--disable-gpu'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout });
    await new Promise(r => setTimeout(r, waitTime));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1000));
    let html = await page.content();

    const linkCount = (html.match(/<a\s/gi) || []).length;
    if (linkCount <= 5) {
      try {
        html = await fetchHtml(url);
      } catch(e) {}
    }

    clearTimeout(requestTimeout);
    res.json({ html, url, status: 'success' });

  } catch (error) {
    try {
      const html = await fetchHtml(url);
      clearTimeout(requestTimeout);
      res.json({ html, url, status: 'success_fallback' });
    } catch(e) {
      clearTimeout(requestTimeout);
      res.status(500).json({ error: error.message, url });
    }
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Puppeteer API running on port ${PORT}`));
