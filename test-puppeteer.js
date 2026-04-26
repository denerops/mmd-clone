import puppeteer from 'puppeteer';
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173');
await page.waitForSelector('.node');
const nodes = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.node')).map(n => ({id: n.id, class: n.className.baseVal}));
});
console.log(JSON.stringify(nodes, null, 2));
await browser.close();
