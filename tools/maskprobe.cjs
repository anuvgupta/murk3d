const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
  await page.goto('http://localhost:4173/', { timeout: 240000 });
  await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 900000 });
  const out = await page.evaluate(() => {
    const g = window.game;
    const m = g.groundMask;
    const pts = { townC: [-585, 0], town10: [-575, 0], town20: [-565, 0], town26: [-559, 0], plaza: [0, 0], plaza8: [8, 0] };
    const r = {};
    for (const [k, [x, z]] of Object.entries(pts)) r[k] = { grass: +m.sample(x, z, 0).toFixed(2), road: +m.sample(x, z, 1).toFixed(2), water: +m.sample(x, z, 2).toFixed(2), cobble: +m.sample(x, z, 3).toFixed(2), h: +g.terrain.heightAt(x, z).toFixed(2) };
    return r;
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
