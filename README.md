# Murk

A browser-based high fantasy open-world RPG, built with [Three.js](https://threejs.org/).
See [the vision issue](https://github.com/anuvgupta/murk3d/issues/1) for where it's headed.

## Playing

The latest `main` is deployed to GitHub Pages: https://anuvgupta.github.io/murk3d/

## Running locally

```bash
npm install
npm run dev
```

Then open the printed URL (usually http://localhost:5173) and click **Click to begin**.

For weaker GPUs, append `?quality=low` (or `?quality=medium`) to the URL.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move |
| Mouse | Look |
| Shift | Sprint |
| Space | Jump |
| `[` / `]` | Move time of day back / forward by 30 minutes |
| T | Pause / resume the day cycle |
| Esc | Release the mouse and open the menu |

## Layout

```
src/
  main.js              entry point; menu and pointer-lock wiring
  core/Game.js         renderer, post-processing, main loop
  core/settings.js     graphics quality presets
  world/layout.js      where things sit in the starting vale (spawn, cottage, path)
  world/Terrain.js     heightfield terrain: hills, mountain ring, vertex colouring
  world/Grass.js       instanced, wind-swept grass tufts with distance LOD
  world/House.js       the timber-framed cottage, built from primitives
  world/textures.js    procedurally painted canvas textures (stone, plaster, wood, shingles)
  world/Rocks.js       scattered boulders
  world/Environment.js sky, sun/moon, day–night cycle, fog, stars, image-based lighting
  player/Input.js      keyboard and pointer-lock mouse input
  player/Player.js     first-person controller with terrain following and collision
  ui/HUD.js            compass and time-of-day display
```

All content is generated in code; there are no external asset files yet.
