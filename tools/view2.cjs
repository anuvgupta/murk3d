// Usage: node view.cjs '<json shots>' [query]
// shot: {name, time, pos:[x,z], yaw, pitch}  first person
//       {name, time, top:[x,z,height], fov}  looking straight down
//       {name, time, cam:[x,y,z], look:[x,y,z]} free camera
const { chromium } = require('playwright');
(async () => {
  const shots = JSON.parse(process.argv[2]);
  const query = process.argv[3] || '';
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (['error','warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  await page.goto('http://localhost:4173/' + query, { timeout: 240000 });
  try {
    await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 900000 });
  } catch (e) { console.log(errs.join('\n')); throw e; }
  console.log('timings', JSON.stringify(await page.evaluate(() => window.game.timings)));
  if (process.env.PROBE) {
    const pts = JSON.parse(process.env.PROBE);
    console.log('probe', JSON.stringify(await page.evaluate((pts) => pts.map(([x, z]) => [x, z, +window.game.terrain.heightAt(x, z).toFixed(1), +window.game.terrain.normalAt(x, z).y.toFixed(2)]), pts)));
    console.log('lake', await page.evaluate(() => window.game.terrain && JSON.stringify({ level: window.LAKE_LEVEL })));
  }
  for (const s of shots) {
    const info = await page.evaluate((s) => {
      const g = window.game; g.renderer.setAnimationLoop(null);
      document.getElementById('menu').classList.add('hidden'); g.setActive(true);
      g.environment.paused = true; g.environment.setTime(s.time ?? 15);
      if (s.sky !== undefined) g.environment.skyTime = s.sky;
      if (s.noShadow) g.renderer.shadowMap.enabled = false;
      g.terrainDebug = s.tdebug || 0; // cloud phase (headless runs otherwise sit at ~0)
      g.setPixelLevel(s.px ?? 0, { quiet: true }); // never let one shot's level leak into the next
      if (s.clouds) g.environment.setCloudStyle(s.clouds);
      g.environment.envTimer = 0; g.environment.lastEnvSunDir.set(0, -5, 0);
      if (s.pos) { g.player.spawn(s.pos[0], s.pos[1], s.yaw ?? 0); g.player.pitch = s.pitch ?? 0; }
      if (s.cam) g.player.spawn(s.cam[0], s.cam[2], 0); // realm palette/mist follow the player, so stand him under the camera
      if (s.top) g.player.spawn(s.top[0], s.top[1], 0);
      // A free camera's first frame in a batch renders with stale atmosphere
      // state (the sky realm came out as a white-out); settle a few frames.
      const warm = s.warm ?? (s.cam || s.top ? 3 : 0);
      for (let i = 0; i < warm; i++) g.frame(performance.now());
      g.frame(performance.now());
      const cam = g.camera;
      if (s.top) {
        cam.position.set(s.top[0], s.top[2], s.top[1]);
        cam.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
      } else if (s.cam) {
        // Never put the camera inside the ground: the realms' rims are tall.
        const th = g.terrain.heightAt(s.cam[0], s.cam[2]);
        cam.position.set(s.cam[0], Math.max(s.cam[1], th + 3), s.cam[2]); cam.lookAt(...s.look);
      }
      if (s.fov) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
      if (s.top || s.cam) { g.environment.update(0, g.player.position); g.updateWorld(0); g.grass.update(cam, g.player.position); }
      g.renderer.info.autoReset = false; g.renderer.info.reset();
      g.render();
      const i = g.renderer.info.render;
      let inst = 0; if (g.grass) for (const sl of g.grass.slots) if (sl.mesh.visible) inst += sl.mesh.count;
      const th = g.terrain.heightAt(cam.position.x, cam.position.z);
      return { calls: i.calls, tris: i.triangles, grassInstances: inst, cam: cam.position.toArray().map((v) => Math.round(v * 10) / 10), th: Math.round(th * 10) / 10, player: g.player.position.toArray().map((v) => Math.round(v * 10) / 10) };
    }, s);
    await page.screenshot({ path: `${s.name}.png`, timeout: 1500000 });
    console.log(s.name, JSON.stringify(info));
  }
  console.log(errs.slice(0, 20).join('\n'));
  await browser.close();
})();
