import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({headless: 'new'});
const page = await browser.newPage();
await page.goto('file://' + process.cwd() + '/test.html');
await new Promise(r => setTimeout(r, 2000));
await browser.close();
