# Murk 3D — Handoff

30 Oct 2026 · anuvgupta (written by Claude at the end of the first build session)
Living copy: https://claude.ai/artifact/WfyERcS7grzanb3KJnACvt

## Overview

Murk is a browser open-world fantasy RPG (Three.js 0.186 + Vite 8) in which every mesh, texture and terrain is generated in code, so the whole game downloads as ~1 MB of JavaScript. As of 30 Oct 2026 the Vale (village, river, lake, castle, ruins, the Shelves, the Rift) and ten portal realms are built, deployed, and have been through about 25 measured visual-critique passes.

- Repo: https://github.com/anuvgupta/murk3d, branch `main` (work pushed straight to main, no PRs).
- Live build: https://github.anuv.me/murk3d/ (GitHub Pages, auto-deploys from `main`).
- Notes: `PROJECT_NOTES.md` on the orphan `notes` branch holds every prompt, reference and the full progress log; `HANDOFF.md` beside it is this document.
- Vision issue: https://github.com/anuvgupta/murk3d/issues/1
- Size: 74 commits, ~12,300 lines across 36 source files; 833 meshes and ~28 M triangles in the scene graph, 300–650 draw calls per frame after culling.

## How to run, develop and deploy

`npm install`, then `npm run dev` for Vite on :5173, or `npm run build && npm run preview` for the production bundle on :4173. Pushing to `main` deploys to Pages in about a minute via `.github/workflows/deploy.yml` (Claude cannot edit workflow files; the owner pushes those over SSH).

| Control | What it does |
| --- | --- |
| WASD, mouse, Shift, Space | Move, look, sprint, jump (drag-to-look fallback when pointer lock is refused) |
| `[` `]` and `T` | Step time of day by 30 min; pause the clock |
| `M` | Parchment map centred on the player, wheel to zoom |
| `C` | Cycle cloud style: realistic, Ghibli, painterly (remembered in localStorage) |
| `F` | Leave a note: screenshot + position filed as a GitHub issue labelled `feedback` |
| `F3` | Performance overlay (fps, draw calls, grass blades, tree instances) |
| Menu | Travel to a realm: lists the Vale and the ten realms |

URL options: `?at=x,z,yaw,pitch,time` drops you at a saved view (feedback notes link this way), `?quality=low|medium|high` picks a preset; the adaptive stepper remembers a lower preset in localStorage after ~3 s under 28 fps.

Process rules agreed with the owner: generation-first (no downloaded assets), few draw calls (merge per material, instance everything), look up how a thing looks in reality or in Oblivion before modelling it, read the `feedback` issues and fix them, keep `PROJECT_NOTES.md` on `notes` current whenever new direction arrives.

## Your prompts, in order

Condensed but faithful; the verbatim text of the long ones is in `PROJECT_NOTES.md` sections 1–15.

1. **Vision.** A browser game, high fantasy: scenery, magic, swords, elves and goblins, villages, castles, jagged cliffs, waterfalls, stone arches, hills, grass, sunsets, big trees, flora and fauna, a poignant storyline. Mix of Skyrim, Oblivion, Breath of the Wild, Morrowind; should look as good as Oblivion Remastered. Open world but a guided storyline; Skyrim-style main/side/faction quests. Don't do it all at once. Record the vision as a GitHub issue; start with page setup, a simple 3D scene, terrain, a house, walking.
2. **Process.** Push straight to main. Set up GitHub Pages so the owner can play the cloud build (owner fixed the default branch, switched Pages to Actions, added an SSH key for the workflow push). Make the cottage a few draw calls first.
3. **Goal list A.** 5 houses, 3 barrel kinds, 10 tree species x 5 variants (one everyday, one giant forest species, one colourful) plus purple trees; dense lush flowy grass that parts around you and reacts to semi-random wind, covering the whole landscape efficiently; semi-realistic water (ripples, wind, flow, mini waves, rivers and lakes, cheap reflections only); a bridge; better, non-blocky textures; cobbles randomised like real walls; trees that move in wind; a dirt road through the map, over the river, into the village, splitting between houses; a village with a well and trees; a branch road up to a clifftop overlook; an in-game comment tool that posts screenshot + coordinates somewhere Claude can read.
4. "Maybe we should try to get as far as we can with generation" — everything procedural, downloaded assets only if generation fails.
5. **Goal list B.** Three cloud styles (hyper-real, Ghibli, one of Claude's choice); fix washed-out daytime with dreamy, nostalgic Ghibli/ENB-style light (volumetrics, grading, saturation, purple/orange tints); 3 treasure chests and coin purses; swords/daggers/greatswords in wood, steel, obsidian, emerald; a map on M; windmill, town hall, lumber mill, one- and two-storey houses; a white Minas-Tirith castle on a tall plateau reached by a winding hill road and stone bridge, with courtyards, stairs and room for shops; a region of tilted grassy rock plates with cave undersides; terrain never geometric or blocky.
6. **Goal list C.** A large library of generated fantasy items: buckets, coins, gems, ingots, furniture, smithing (forge, smelter, grindstone, anvil), alchemy lab, potions, food, tables, chairs, boats, canoes, staffs; look up what fantasy games need; review each for beauty.
7. **Ten reference worlds**, one per image, reachable through Oblivion-gate portals and from the menu; "I really like these five so do these for sure"; "remember we need some purple trees"; design as much of each in real 3D as possible so they can be walked.
8. **Harsh review of the first build.** Everything sharp, blocky, geometric; trees are sticks; grass is random spikes; neon acid greens; fat spiky grass instead of BotW's flowing sheet; stuck on the bridge; cobbles wrong (rounded rectangles, gently jagged at fine scale — look up references); "do that for everything: look up how things look in reality or other games and revise". Switch to Fable and be EXTREMELY self-critical.
9. Save all prompts and feedback to a file on a separate branch and push it (done: `notes` branch).
10. Volumetric wind-driven mist; ambient dust and spark particles.
11. Grass must be a dense carpet, cleverly engineered; 3–4 LOD versions of every object; leaves lush and soft with 3D body; trunks and branches never straight, joints smoothly blended.
12. **/goal.** Finish every listed task, then review that nothing was missed, then screenshot the world at many times and places and critique as a visual designer against Oblivion Remastered and BotW; do 10–30 improvement passes on lighting, meshes, textures and blending until it looks "fucking beautiful, like a fantasy dream land, super nostalgic" without being impossible to run.
13. Grass still 2D and spiky: thin but extremely dense, a bit taller, not so curved; BotW references and a Unity thread on its shading; "I never said perfectly vertical". Oblivion tree and rock references.
14. **Sun and lighting references** (forest god rays; overcast river with bridge; sunrise over a lake with a soft white sun, pink-amber mist, sepia tones): spend 10–20 rounds to match them. Recreate the lakeside scene with a jetty and gothic ruins on islets plus an interior entrance; add ruins in the forest, by the castle, on a hill, and in a huge grassy crevasse. Update the goal to include every prompt. Compare screenshots directly against the references.
15. More Oblivion references: sunset lake, the original jetty, a gatehouse on a hill, the Imperial City lake view; "use Oblivion to reference how to shape and texture rocks, the road textures, imitate its style".
16. "Did you finish everything?" and this handoff request.

## Features built, by system

Every item on goal lists A, B and C, the later additions, and the ten realms exists in a first-pass-or-better state; the table says what each does and where it lives.

| System | What exists | Key files |
| --- | --- | --- |
| Terrain | 1600 m world on a sinh-warped 512² grid (fine near the centre, coarse at the rim); hills, rolling noise, a domain-warped mountain ring, mesas (overlook, castle knoll, castle plateau, realm mesas), tilted plates, a crevasse, lake islets, sunken/raised plots, gate pads; roads and river carved with banks; terraced castle wards clamped to one absolute level | `world/Terrain.js`, `world/plan.js` |
| Ground shading | Per-pixel procedural albedo (no tiled textures): meadow with 20–60 m straw/rich sweeps, dirt roads, cobbles as rounded-rectangle setts with jagged edges, riverbed, triplanar rock with strata/cracks/lichen/moss, snow above 150 m; rock classified by the true face normal; realm tints and snow via uniforms | `world/groundShading.js`, `rockShading.js`, `TerrainMaterial.js`, `GroundMask.js` |
| Grass | GPU-instanced tiled carpet: 420 blades/m² near, rank-sorted thinning with distance, 3 geometry LODs, 135 m reach; curved thin blades leaning as a sheet, wind waves and gust fronts, parts around the player, translucency and tip sheen; culled by baked and local slope; olive-matched to the ground beneath | `world/Grass.js`, `world/Wind.js` |
| Water | River ribbon following the plan with per-vertex flow speed, lakes as polar meshes (several, incl. a moat), depth-tinted colour, shore and rapid foam, two normal layers plus wind chop, Fresnel, sky env-map reflection; waterfalls as streaked ribbons; swimming and an underwater murk | `world/Water.js`, `world/Falls.js`, `player/Player.js` |
| Sky and lighting | Preetham sky with a soft sun orb and hue-preserving HDR clip, three cloud styles, 14-hour day with long twilight, moon and stars at night, directional sun + hemisphere + PMREM sky probe; AtmospherePass: depth-based aerial haze, ray-marched wind-driven mist, sun disc/corona/radial shafts, contrast, saturation, lift, vignette; realm palettes override haze and grade | `world/Environment.js`, `world/clouds.js`, `world/AtmospherePass.js` |
| Trees | 11 species x 5 variants (oak, giant, blossom, pine, birch, willow, maple, silverleaf, purple duskwood, dead, juniper) grown Weber–Penn style with curved collared stems, sprig-clump leaves near, cards mid, big cards far; wind sway and flutter; leaf normals lean skyward | `world/trees/{species,TreeGen,Forest}.js` |
| Rocks and landforms | 10 instanced rock variants (fractured facets, rumpled, bedding steps), overlook cliff slabs, boulders, scree, realm rocks; the Shelves (7 tilted plates with ragged turf-topped rock lips); natural rock arches; floating islands with ribbed cones and rope bridges; glowing crystal clusters | `world/Rocks.js`, `Plates.js`, `Arches.js`, `SkyIslands.js`, `Crystals.js` |
| Buildings | 8 house designs incl. windmill (turning sails), town hall, sawmill (water wheel on a river pier); 3 barrels, crates, well, stone bridge, lanterns, chimney smoke; a white town on a moated island with a causeway | `buildings/{houses,landmarks,props,Bridge,Village,Smoke}.js` |
| Castle | Minas-Tirith style: four terraces, curtain walls with 9 m foundations, towers, two gatehouses, stairs, ward buildings, keep with great hall and rose window, long arched bridge from the knoll; a dark-stone twin in the citadel realm | `buildings/Castle.js` |
| Items | 3 chests, coin purses, swords/daggers/greatswords in 4 materials, display table, weapon rack; furniture library: bucket, ingots, gems, bottles/potions, books, candles, loaf, cheese, apples, ham, pie, skewers, fish, mushrooms, mugs, bench/stool/chair/table/bed/bookshelf/cupboard, anvil/hammer/tongs/forge/bellows/smelter/grindstone, cauldron, mortar, scales, herbs, staffs, shields, bow and quiver, rowboat, canoe; composed as smithy, alchemist, armoury, tavern tables | `buildings/items.js`, `buildings/furniture.js` |
| Ruins | Gothic arches, columns, ragged walls, fallen mossy blocks, flagstones, plank jetty with mooring posts and lantern; drowned temple on the lake with islet arches and boats, barrow crypt with walkable interior and reliquary, standing stones, watchtower, roofless chapel, sunken arcade in the Rift | `buildings/Ruins.js` |
| Realms | Ten regions ringed 585 m out, each a crater bowl with its own landform, palette, flora, lakes, rocks, ruins and set pieces (karst spires, floating isles over a cloud sea, dark citadel, granite valley with falls, jungle, white river town, moonlit teal night, crystal tundra, overgrown cliffs, canyon with ring shrine) | `world/regions.js` + the systems above |
| Portals | A glade east of the village with ten Oblivion-style gates (black stone, ember seams, swirling fire); each realm has a gate home (stone ring in the canyon and moonlit realms); walking into a gate teleports with a flash; the menu lists realms | `world/Portals.js`, `main.js` |
| Player and UI | First-person walk/sprint/jump, oriented-box collision, walkable surfaces (bridges, decks, lips, stairs), swimming; HUD compass/clock/toasts; map; feedback tool; perf overlay; adaptive quality | `player/*`, `ui/*`, `core/Game.js`, `core/settings.js` |

## Meshes and generators: how they are built

Everything is generated at load from seeded noise; the whole world builds in ~12 s on a laptop and ~24 s under swiftshader.

- **Kit pattern** (`buildings/Kit.js`): builders push boxes, cylinders and extruded shapes into a kit inside nested local frames; `kit.build()` merges everything per material, so a house is 8–12 draw calls and the entire village plus ruins is a few dozen. UVs are scaled in metres so textures tile consistently; every builder returns colliders, walkable decks, chimney and lamp positions.
- **Procedural textures** (`buildings/textures.js`): canvas-painted rubble, ashlar (now weathered: per-block tint, rain streaks, dirt blotches, soft mortar, a pale limestone variant), cobbles as staggered rounded-rectangle setts, plaster, timber, planks, bark, shingles, slate, clay, thatch; each gives a colour map and a bump map.
- **Trees** (`world/trees/TreeGen.js`): Weber–Penn style recursive stems with per-level counts, down-angles, curve/curveBack, wander and tropism; trunks flare and split into leaders; branch collars blend junctions. Leaves are sprig clumps (near), leaf cards (mid), big cards (far); each species paints its own bark and leaf textures. Placement runs zone-by-zone with spacing grids, clearings, and exclusions for roads, water, buildings, ruins, gates and viewpoints.
- **Rocks** (`world/Rocks.js`): an icosphere cut by 3–7 fracture planes, rumpled by fbm, long edges wobbled sideways, bedding steps, flattened base; 10 variants instanced hundreds of times. Shading is in `rockShading.js`: triplanar height field (strata, lumps, grit, macro buttresses, zoned cracks) driving both albedo (cavities dark, ridges lit, lichen, moss on level faces) and a bump normal.
- **Terrain** is a height function stack: `baseHeight` (hills + mountains + mesas + plates + realm bowls + castle terraces) → `plottedHeight` (levelled plots, pits) → `cutHeight` (roads, river, lakes, crevasses) → `shapedHeight` (gate pads). The same function is mirrored in GLSL through a float height texture (R = height, G = baked slope) so grass and turf sit exactly on the mesh.
- **Plates** (`world/Plates.js`): the grassy wedge is terrain; the overhang is a box whose side and under faces are pushed about by position-pure noise (so shared edges stay joined), with a level undulating top that `surfaceAt` mirrors for walking; faces split into rock and turf material groups.
- **Castle** (`buildings/Castle.js`): terraces are data (`TERRACES`); the terrain flattens each ward to the plateau's averaged natural height, the kit builds polygonal curtain walls that follow the rim, round towers with foundations, gatehouses with extruded pointed arches and banners, stairs between wards, a keep; the bridge is a sloped frame with piers to the gorge floor and arch rings extruded across it.
- **Ruins** (`buildings/Ruins.js`): a vocabulary (gothic arch rings from a closed shape, columns with entasis and chipped tops, ragged walls as uneven slices, fallen blocks, flagstones, jetty) composed per site; monoliths are noise-displaced boxes in the rock material.
- **Water meshes**: the river is a ribbon of rows across the plan path carrying flow direction and speed per vertex; lakes are polar fans whose rings crowd toward the shore; depth is baked per vertex from the terrain.
- **Realms** (`world/regions.js`): pure data plus a height function per region; the terrain blends each bowl in by distance weight and raises a crater rim so the mountain ring hides it from the Vale.

## Issues found and fixed

The pattern that worked: isolate with renders (group hidden, terrain-only, atmosphere off), probe with a raycast or a CPU height sample, then fix the cause rather than the symptom. Newest first.

| When | Symptom | Root cause | Fix |
| --- | --- | --- | --- |
| 30 Oct | Masonry reads as flat bathroom tile up close | Ashlar texture had hard black joints and almost no per-block variance | Weathered ashlar: streaks, blotches, tint range, soft mortar; finer repeat for houses (verified: gate and town street fixed; crypt and ward still tile-like, see open items) |
| 30 Oct | Acid-green strip at cliff feet and sunlit banks | Ground under the grass rendered (110,155,3) in sun; blades also stood at full density on 60° faces where the baked slope texel was a flat vertex | Under-grass colour desaturated to olive; blades and terrain cull by min(baked slope, local 0.6 m gradient / face normal) |
| 30 Oct | Lime-green bands on steep rock | `rockAlbedo` moss term used the smoothed normal | Moss keyed to the face normal, only above ny 0.82 |
| 30 Oct | Mountain faces showed flat triangle facets | Triplanar weights taken from the per-triangle face normal | Smooth normal for projection, face normal only for classification |
| 30 Oct | Three Shelves plates read as hillside bumps | They sat on the 50–75 m mountain apron | Moved north onto 5–25 m ground; plates tilted 1.5x steeper |
| 30 Oct | Rock cracks looked like a contour map | Continuous iso-lines of one noise field | Cracks confined to zones of a second noise; weight 0.45 → 0.28 |
| 30 Oct | Plate lips were concrete boxes | Displaced box with mergeVertices split its edges; too little displacement | Position-pure noise displacement, rock sides + turf top material groups |
| 29 Oct | Green camo blotches on cliffs | Terrain classified rock by smoothed vertex normals, which blur a 2-cell cliff toward flat | Classify by `dFdx/dFdy` face normal |
| 29 Oct | Shader compile failure for 10 min | `patch` is a GLSL reserved word | Renamed; ship script now refuses on any shader error |
| 29 Oct | Ruins looked like dark mud | Rubble/ashlar textures are intrinsically dark (0.3–0.6) | Pale ashlar variant for every ruin material |
| 29 Oct | Standing stones were black boxes | Plain boxes in dark rubble | Noise-displaced monoliths in the procedural rock material |
| 29 Oct | Canyon ring gate hung 4 m over the gorge | Gate placed on uncut terrain | `PADS`: flat levelled pads applied after every cut, under every gate |
| 29 Oct | Karst lake a flat cyan sheet | Over-strong tint on colour and reflection | Gentler tint, reflection tint 0.3 |
| 29 Oct | Far peaks floating as slabs above the haze | AtmospherePass treated depth > 0.9999 as sky; with near 0.1 everything past ~1 km was painted sky | Only cleared depth (≥ 0.9999995) is sky; also fog mostly distance-based, snow kept on steep faces |
| 29 Oct | Whole frame white whenever the sun was in view | `applyCloudStyle` spliced the sky shader tail and dropped the HDR soft clip; raw in-scatter hit bloom | `finishSkyFragment` applied after the splice; NaN guards; later a hue-preserving luminance clip so noon stays blue |
| 29 Oct | Night fell abruptly at 20:00; no golden hour | 12-hour day, narrow twilight curves | 14-hour day (05:30–19:30), longer twilight, wider warmer golden hour, moon disc |
| 29 Oct | Walking into the river made the water vanish | Single-sided water, no underwater state | Double-sided water, `levelAt`, underwater murk, swimming |
| 29 Oct | Build broke for 5 min | A `//` comment ate the template-literal backtick | Fixed; `ship.sh` gates commit+push on build and headless load |
| 29 Oct | Realm bowls showed as notches in the mountain ring | Bowls cut straight through the ring | Crater rims per realm, karst rim above its spires |
| 29 Oct | Headless renders hung for 5+ min | 1280x720 under swiftshader with 28 M tris | 800x450, background queue, long timeouts, one Chromium at a time |
| 29 Oct | Castle wards undulating, bridge not level, knoll skirt overlapping plateau | Terraces relative to noisy terrain; mesas too close | Absolute ward level, knoll cliff facing the plateau, road rerouted, bridge landing |
| 29 Oct | Sawmill apron a bare cut above the river | Plot levelling fought the river banks | Mill on a stone pier with the wheel in the water; plots ease into banks |
| 29 Oct | Stuck on the bridge | Slope test used the riverbed normal under the deck | Skip the slope test while on a surface |
| 29 Oct | Spiky grass, stick trees, neon greens, Voronoi cobbles (owner feedback) | First-pass generators | Grass carpet rewrite, Weber–Penn trees with collars and sprig clumps, rounded-sett cobbles, muted palette, atmosphere pass |

## How quality was measured and improved

Every visual change went through the same loop: render the exact spot headlessly, measure, fix the cause, re-render. The scripts lived in the session scratchpad (`/tmp/claude-0/.../scratchpad`), not the repo; recreate them from this description.

1. **Headless screenshots** (`view2.cjs`). Playwright drives the pre-installed Chromium with `--use-gl=angle --use-angle=swiftshader`, loads `vite preview` on :4173, waits for `window.game.player`, then for each shot: hides the menu, pauses the clock at the requested hour, spawns the player (or sets a free camera), runs one `frame()`, renders once and screenshots. Shots are given as JSON: `{name, time, pos:[x,z], yaw, pitch}`, `{top:[x,z,height], fov}` or `{cam, look}`. A frame takes ~5 min in software GL, so batches run detached (`setsid nohup batchNN.sh`), strictly one Chromium at a time (a second one killed a batch's screenshots), at 800x450, with a 1500 s screenshot timeout and an `until grep` watcher per batch.
2. **Measuring, not eyeballing** (PIL). `ImageStat` means over fixed boxes gave numbers for every lighting claim: near grass vs far meadow, sky at the horizon vs zenith, before/after diffs (`ImageChops.difference`). Example: the acid-green fix was judged by the ground under grass going from (110,155,3) to (120,144,72) against blades at (115,140,65).
3. **Isolation renders**. The same camera with a group hidden (`g.grass.group.visible=false`), terrain only, atmosphere pass off, sky off, or every terrain chunk in a normal/wireframe material. This is how the floating slabs were traced to the depth threshold and the bank strip to the ground, not the blades.
4. **In-page probes**. Playwright `page.evaluate` with `window.THREE` exposed: raycasts from screen points to find what object, face normal, baked slope and mask value sit under a pixel; frustum and instance-count checks per grass tile; portal travel and swimming simulated by stepping `player.update`.
5. **Offline terrain probe** (`probe.mjs`). `Terrain` runs in plain Node, so heights, normals and whole grids print in two seconds; used to place ruins, gates, waterfalls and arches, to find the ground under the Shelves, and to CPU-ray-cast a camera view before rendering it.
6. **Ship gate** (`ship.sh`). Build → headless load with page-error and `Shader Error` capture → only then `git add/commit/push`. Added after a GLSL reserved-word compile failure reached `main` for ten minutes.
7. **Smoke test** (`smoke.cjs`). Loads the build, reports build timings, mesh and triangle counts, and any page or console error; run after every shader change.
8. **Critique against references**. Each round picked 3–7 spots and times, read the frames as a visual designer against the Oblivion Remastered and BotW references (haze, colour, how meshes sit in terrain, texture scale), wrote the finding and the fix into `PROJECT_NOTES.md` with a timestamp, shipped, and queued the verification batch before moving on.
9. **Performance**. F3 overlay (fps, calls, blades, tree instances), three quality presets, LOD tiers for trees (65/230/800 m) and grass (3 geometries + rank thinning), one draw call per material per structure, and the adaptive stepper that lowers resolution, grass reach and bloom when under 28 fps.

## Lighting and critique rounds

About 25 passes from the first lighting batch to this handoff; the first two found the bugs that mattered most, the rest were measured tuning. Each row is one pass; verification renders followed every one.

| Pass | Found | Changed |
| --- | --- | --- |
| 1 | 09:00 frame pure white | Sky soft clip restored after the cloud splice (root cause above) |
| 2 | Golden hour cool and grey, night abrupt | Longer twilight, golden factor wider, warm horizon band in the sky shader, moon disc, navy night floor |
| 3 | Notch in the mountain ring, pale noon sky | Crater rims, turbidity 2.0, rayleigh 1.9, mie 0.0022 |
| 4 | Fog ate slopes under crisp peaks; far slabs | Distance haze (70/30), then the depth-threshold root cause; snow dusting on steep faces |
| 5 | Castle dull grey in shadow | Pale limestone texture, envMapIntensity 1.6–2.0 on white stone, cooler ground bounce |
| 6 | Noon flat and veiled | Day fog 0.00075, contrast 1.14 about mid grey, brighter hemisphere and probe |
| 7 | Near grass a lime band against the meadow | Tips less yellow, sheen softer, under-grass colour matched to lit blades, blades eased toward olive |
| 8 | Sky still white at the zenith | Hue-preserving luminance clip; zenith deepened 189,197,210 → 172,185,208; horizon 213,226,232 → 161,210,230 |
| 9 | Lake pale at sunset, water mirror-white | Green-grey reflection tint, less env map, more lake ripple |
| 10–12 | Far canopies as dark blobs, maroon giant bark, black monoliths, brown ruins | Leaf normals lean skyward, sky ambient on leaves, pale ruin stone, rock-material monoliths |
| 13–16 | Camo blotches and lime bands on cliffs | Face-normal classification, moss on level faces only, local-gradient blade cull, olive under-grass |
| 17–20 | Flat rock up close, contour-map cracks, boxy plate lips, drowned Shelves | Cavity shading and bump, zoned cracks, position-pure lip displacement, plates relocated and steepened |
| 21–25 | Realm re-checks under the new light | Lake tints, tundra straw, cloud-sea mist floor, gate pads, obsidian texture, weathered ashlar, finer town stone, ribbed island cones |

Keeper frames (reproduce with `?at=`): overlook at 18:30 (`-86,-86,-2.36,0.05,18.5`), bridge at 08:30 (`22,40,-0.33,0.03,8.5`), lake from the jetty at 18:24, village at 22:30 with moon and lit windows, castle at 19:00, portal glade at 19:12, forest sun at 18:18 (`-200,120,1.6,0.12,18.3`), karst lake from the air, citadel at 16:00, castle gate from the bridge at 16:00 (`156,-162,-0.635,0.1,16`).

## Code map

| File | Owns |
| --- | --- |
| `src/main.js` | Boot, menu, realm list, `window.game` / `window.THREE` for probes |
| `src/core/Game.js` | Renderer, build order, composer (RenderPass → AtmospherePass → Bloom → Output), keys, `updateWorld`, portal travel, adaptive quality, resize |
| `src/core/settings.js` | Presets low/medium/high, remembered preset |
| `src/world/plan.js` | All layout data: Path, RIVER, LAKE/LAKES, PLAZA, HOUSES, MESAS, CASTLE/CASTLES, ROADS, BRIDGE, SPAWN, PLATES, CREVASSES, ISLETS, RUINS, PITS, PADS, GLADE |
| `src/world/regions.js` | The ten realms: bowls, palettes, flora, lakes, falls, arches, crystals, gates; `regionAt` |
| `src/world/Terrain.js` | Height stack, chunks, height+slope texture, `TERRAIN_HEIGHT_GLSL` |
| `src/world/GroundMask.js` | RGBA mask: grass, road, water bed, cobbles; cutouts |
| `src/world/groundShading.js`, `rockShading.js`, `TerrainMaterial.js` | Ground and rock GLSL, turf material, realm uniforms |
| `src/world/Grass.js`, `Wind.js` | Blade carpet and the wind model |
| `src/world/Water.js`, `Falls.js` | River, lakes, waterfalls, `levelAt` |
| `src/world/Environment.js`, `clouds.js`, `AtmospherePass.js` | Sun/moon, sky, cloud styles, probe, haze/mist/sun/grade pass |
| `src/world/Rocks.js`, `Plates.js`, `Arches.js`, `SkyIslands.js`, `Crystals.js`, `Motes.js` | Landform meshes and particles |
| `src/world/trees/species.js`, `TreeGen.js`, `Forest.js` | Species data, growth, placement, LOD, wind |
| `src/world/Portals.js` | Gates, swirl shader, travel targets |
| `src/buildings/Kit.js`, `materials.js`, `textures.js` | Merge-by-material kit, material set, painted textures |
| `src/buildings/houses.js`, `landmarks.js`, `props.js`, `Bridge.js`, `Village.js`, `Smoke.js` | Buildings and the village assembly |
| `src/buildings/Castle.js`, `Ruins.js` | Castle and every ruin site |
| `src/buildings/items.js`, `furniture.js` | Chests, weapons, purses; the item and furniture library |
| `src/player/Player.js`, `Input.js` | Movement, collision, surfaces, swimming |
| `src/ui/HUD.js`, `MapScreen.js`, `Feedback.js` | Overlay, map, feedback issues |
| `src/util/noise.js`, `noiseTexture.js` | Noise, fbm, ridged, smoothstep, mulberry32, the shared noise texture |

## Open items and where to pick up

The world is complete to first pass and the big visual bugs are root-caused; what remains is polish and the game layer the vision issue lists.

- Last verification batch (BL) result: castle gate from the bridge and the river-town street now read well; the crypt interior and castle ward walls still read tile-like at arm's length (the ashlar block scale is too regular for a 2 m view — try larger, more varied courses or a stone-count noise); the floating-island cone is still too smooth (the ribbing is lost under the triplanar rock shading at that size).
- Soft spots: rock still a little flat at under 10 m; Preetham horizon pale at noon; the sky-isle cloud sea faint; jungle floor monotone; one per-triangle facet at a plate face; far tree cards still simple.
- Not started from the vision: third-person camera and character, NPCs and dialogue, quests and journal, combat, inventory and saving, audio, the storyline.
- Working habits that paid off: measure with PIL before and after; isolate with group-hidden renders; probe heights in Node before placing anything; one Chromium at a time; ship only through the build + shader gate; log every finding in `PROJECT_NOTES.md` with a time.
- Feedback loop: open issues labelled `feedback` carry a screenshot and an `?at=` link; none were open at handoff.
