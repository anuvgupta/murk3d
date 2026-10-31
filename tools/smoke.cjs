// Load the game headlessly and report page errors + build timings (no screenshots).
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error ' + m.text().slice(0, 300)); });
  await page.goto('http://localhost:4173/', { timeout: 120000 });
  try {
    await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 420000 });
    console.log('OK timings', JSON.stringify(await page.evaluate(() => window.game.timings)));
    console.log('scene', JSON.stringify(await page.evaluate(() => { let n = 0, tris = 0; window.game.scene.traverse(o => { if (o.isMesh) { n++; const g = o.geometry; const c = g.index ? g.index.count : g.attributes.position.count; tris += (c / 3) * (o.isInstancedMesh ? o.count : 1); } }); return { meshes: n, tris: Math.round(tris) }; })));
  } catch (e) { console.log('LOAD FAILED'); }
  console.log(errs.join('\n') || 'no page errors');
  await browser.close();
})();
