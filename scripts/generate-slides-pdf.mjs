import puppeteer from 'puppeteer';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';

const BASE_URL = 'http://localhost:18666/user-guide';
const TOTAL_SLIDES = 13;
const OUTPUT = '/home/runner/workspace/GalaxyBots-New-User-Guide.pdf';

const SLIDE_W = 1920;
const SLIDE_H = 1080;

async function main() {
  console.log('Launching headless browser...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: SLIDE_W, height: SLIDE_H, deviceScaleFactor: 1 });

  const screenshots = [];

  for (let i = 1; i <= TOTAL_SLIDES; i++) {
    const url = `${BASE_URL}/slide${i}`;
    console.log(`Capturing slide ${i}/${TOTAL_SLIDES}...`);

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 800));

    const png = await page.screenshot({ type: 'png', fullPage: false });
    screenshots.push(png);
    console.log(`  Slide ${i} done (${(png.length / 1024).toFixed(0)} KB)`);
  }

  await browser.close();
  console.log(`\nAll ${TOTAL_SLIDES} slides captured. Assembling PDF...`);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [SLIDE_W, SLIDE_H],
      margin: 0,
      autoFirstPage: false,
    });

    const stream = createWriteStream(OUTPUT);
    doc.pipe(stream);

    for (const png of screenshots) {
      doc.addPage({ size: [SLIDE_W, SLIDE_H], margin: 0 });
      doc.image(png, 0, 0, { width: SLIDE_W, height: SLIDE_H });
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  console.log(`\nDone! PDF saved to: ${OUTPUT}`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
