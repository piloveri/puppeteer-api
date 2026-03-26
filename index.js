const express = require('express');
const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 일반 HTTP fetch 함수
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
  const { url, waitTime = 5000 } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
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
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, waitTime));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 2000));
    let html = await page.content();

    // 링크가 5개 이하면 일반 fetch로 재시도
    const linkCount = (html.match(/<a\s/gi) || []).length;
    if (linkCount <= 5) {
      try {
        html = await fetchHtml(url);
      } catch(e) {
        // fallback 실패시 puppeteer 결과 사용
      }
    }

    res.json({ html, url, status: 'success' });
  } catch (error) {
    // Puppeteer 실패시 일반 fetch로 시도
    try {
      const html = await fetchHtml(url);
      res.json({ html, url, status: 'success_fallback' });
    } catch(e) {
      res.status(500).json({ error: error.message, url });
    }
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Puppeteer API running on port ${PORT}`));
