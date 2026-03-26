app.post('/scrape', async (req, res) => {
  const { url, waitTime = 3000, timeout = 30000 } = req.body;  // timeout 파라미터 추가
  if (!url) return res.status(400).json({ error: 'URL is required' });
  
  // ✅ 전체 요청에 타임아웃 걸기
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

    // ✅ networkidle0 → domcontentloaded 로 변경 + timeout 적용
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout });

    await new Promise(r => setTimeout(r, waitTime));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1000));  // 2000 → 1000으로 단축
    let html = await page.content();

    const linkCount = (html.match(/<a\s/gi) || []).length;
    if (linkCount <= 5) {
      try {
        html = await fetchHtml(url);
      } catch(e) {}
    }

    clearTimeout(requestTimeout);  // ✅ 타임아웃 해제
    res.json({ html, url, status: 'success' });

  } catch (error) {
    try {
      const html = await fetchHtml(url);
      clearTimeout(requestTimeout);  // ✅ 타임아웃 해제
      res.json({ html, url, status: 'success_fallback' });
    } catch(e) {
      clearTimeout(requestTimeout);  // ✅ 타임아웃 해제
      res.status(500).json({ error: error.message, url });
    }
  } finally {
    if (browser) await browser.close();
  }
});
