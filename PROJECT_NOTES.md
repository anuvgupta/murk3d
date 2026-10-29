# Murk — project notes (prompts, feedback, context)

Kept on the `notes` branch so it survives context loss. Update it whenever the
owner gives new direction. Everything below is from the owner (anuvgupta)
unless marked *(claude)*.

## 1. The vision (first prompt, 2026-10-29)

> i want to make a game that works in browser. needs to be like a high fantasy
> style game with beautiful scenery, magic, swords, creatures like elves and
> goblins, villages, villagers, castles, beautiful high fantasy scenery like
> massive jagged cliffs, remarkable waterfalls, huge stone arches, hills,
> beautiful grass, incredible sunsets, large trees, vivid flora and fauna, and a
> poignant storyline. think a mix of elder scrolls skyrim, oblivion, breath of
> the wild, morrowind. should look as good as the recent elder scrolls oblivion
> remaster. the thing is, while its open world, we dont want to make it so
> overcomplicated that you can do anything, but rather still have a relatively
> guided storyline that you gotta follow. that said you should be able to run
> around and do things on your own time like in skyrim. we need a very similar
> questing system since we want main story quests, side quests, and faction
> storyline quests. dont do all of this in one go, but lets get started.

Vision issue: https://github.com/anuvgupta/murk3d/issues/1

## 2. Process decisions

- Push straight to `main` (no PRs). Live build: https://github.anuv.me/murk3d/
  (GitHub Pages, deploys on every push to main via `.github/workflows/deploy.yml`;
  Claude cannot edit workflow files — the owner pushes those over SSH).
- Generation-first: everything is generated in code (meshes, textures, terrain)
  for tiny download size. Characters may later be authored models. Keep draw
  calls low (merge by material, instance), prefer shader-computed materials,
  measure performance.
- Owner's feedback tool: press **F** in game → note + screenshot + position
  filed as a GitHub issue labelled `feedback` (screenshot on the `feedback`
  branch). Needs a fine-grained token (Contents + Issues on murk3d) saved in
  the browser. Claude reads those issues and fixes things.
- Claude should **look up how things look in reality or in other games before
  modelling/texturing them, and revise meshes/textures accordingly.** Be
  extremely self-critical when reviewing screenshots: judge honestly whether
  things look realistic/fantasy or "generated and bullshit".

## 3. Goal list A (big list)

- generated meshes: 5 different houses; 3 kinds of barrels; 10 tree species ×
  5 unique trees each (one normal species usable anywhere e.g. village; one
  giant species for a forest; one colourful one; rest up to Claude). Also
  **purple trees**.
- really nice, dense, lush, flowy green grass that moves apart as you walk
  through it but reacts to wind; wind semi-random (when it blows and stops).
- whole landscape covered with this grass, efficient, no framerate drop; simple
  blade shape ok; use tricks to make it realistic without blocking other things.
- semi-realistic water, same efficiency principle; can be slightly cartoony /
  BotW if hyper-real is too hard, but as realistic as possible; ripples, wind
  effects, flow direction, mini waves; rivers and lakes; reflections only if cheap.
- wood or stone bridge over the river.
- textures must look better: less pixelated/blocky; consistent fantasy art
  theme if hyper-realism is too hard.
- cobblestones on the house wall shouldn't be one consistent shape; randomised
  like real rocks in a cobblestone wall.
- trees react to wind.
- dirt road through the grass (no grass on road) through the middle of the
  map, over the river, into the village; river runs through the village; road
  splits to run between each house.
- several houses arranged into a village with other scenery; a well in the
  middle; some trees in the village.
- road branches off up to the top of a hill / exposed small cliff overlooking
  the village.
- in-game comments with screenshot + coordinates auto-published somewhere
  Claude can read (done: GitHub issues).

## 4. Goal list B

- clouds: 3 options — hyper-realistic fluffy; cartoonish anime / Studio Ghibli;
  a third of Claude's choice.
- sun lighting: daytime looks washed out; sunrise/sunset good. Make daylight
  beautiful and nostalgic/dreamy like a Ghibli film: volumetric light, colour
  grading, saturation, purple/orange tints, filters (ENB-style inspiration).
- 3 treasure chests; coin purses.
- weapons: swords, daggers, greatswords × 4 materials (wooden, steel,
  obsidian, emerald).
- map on **M**: top-down view of houses, roads, objects, areas, player position.
- more buildings: windmill, larger town-centre cabin, small lumber mill, both
  one- and two-storey houses.
- castles/fortresses on crazy terrain, part of the terrain: start with one —
  winding steep hill road, a stone bridge to a castle on a tall steep plateau;
  glimmering white / bright grey stone / marble; spires, towers, turrets;
  curving windy walkway from the bridge up through multiple courtyards with
  stairs to the inner gates; cobblestone / white stone; Minas Tirith feel;
  room for several shops/buildings but not a full city.
- a region of big jagged cliff-like rocky plates jutting diagonally out of the
  ground, grass on top, climbable from base to top, cave-like rocky underside.
- terrain and natural features must not look geometric or blocky: natural,
  random, curving, realistic, with fine detail (rocks, cliff edges, rivers…).

## 5. Goal list C (after the above)

Build out a large library of generated fantasy items (inspired by Skyrim and
other fantasy games, not limited): buckets, coins, gems, ingots, furniture,
smithing tools (forge, smelter, sharpening bench, anvil…), alchemy lab, potion
and poison bottles, food (meat on a stick, pies, bread, fish, mushrooms, exotic
fruit, cheeses), tables, chairs, small fishing boats, canoes, staffs, etc.
Expand the list by looking up what fantasy games normally need. Everything
fantasy themed, beautiful, dreamy; after creating something, review it
objectively for beauty and fantasy feel.

## 6. Reference worlds (10 images; one world per image)

Separate worlds reachable through massive portals (like Oblivion gates) and
from the game menu. Design as much of each as possible in real 3D so the owner
can walk through each. The owner "really likes" the second five.

1. **Karst spire lake** — towering misty limestone pinnacles from a calm lake,
   green ledges, many waterfalls, a natural stone arch, small boat, birds,
   warm hazy golden backlight.
2. **Floating sky islands** — grassy islands with jagged rocky undersides,
   waterfalls pouring into a sea of cloud, hilltop village on the main island,
   drifting rocks, rainbow, teal dreamy sky.
3. **Mountain citadel** (pixel-art ref) — dark stone castle city with spires on
   a ridge, huge snowy horn peak behind, towering cumulus, pine forests, river,
   dirt path in grassy foreground.
4. **Alpine granite valley** (painterly) — warm-lit granite cliff face with snow
   streaks and fractures, misty peaks, pine slopes, meadow with winding path,
   flat stones, white wildflowers.
5. **Ancient jungle** — colossal gnarled trees with buttress/strangler roots,
   dense canopy, ferns, mossy ground, glowing green haze and light shafts.
6. **White river citadel** — gleaming white gothic towers on misty cliffs,
   rose-window chapel, long mossy cobbled causeway bridge over rapids,
   waterfalls, cloud breaks with light shafts, pebble shores.
7. **Moonlit teal ruins** — stylised teal night; ruined tower-castle on a
   wind-carved sloping ridge; curved horn-like rock spikes; braided glowing
   streams on a flat plain; two crescent moons; streaky clouds; sparks.
8. **Crystal tundra** — huge glowing violet/blue crystal spires on a snowy
   plain with red rock outcrops; purple-pink sunset cumulus; mountains.
9. **Overgrown cliff ruins** — massive mossy overhanging cliff crowned with
   ruined pillars, curtains of waterfalls, hanging vines, lush meadow with path
   and stream, painterly sky.
10. **Canyon ring-portal shrine** — deep misty canyon, giant ornate ring portal
    on a stepped stair with jade/orange mosaic inlay, plaza with robed figures
    and banners. Use the ring as the portal gate design.

## 7. Feedback on the first big build (2026-10-29, after switching to Fable)

> this doesnt look good at all, everything looks sharp and blocky and
> geometric, and none of it looks realistic. you know what a tree should be
> right? a sort of random bent line shape thats not a fucking stick, but
> rather more like actual branches

> the grass looks absolutely terrible, its not dense or lush, its just random
> spikes

> review the images in game and be EXTREMELY self critical about how it
> looks. analyze honestly how fantasy themed or realistic it looks vs how
> generated and bullshit it looks. for example the blocky trees with basically
> no leaves, the extremely neon acid green colors used in all the greenery
> textures, the fat, spiky grass rather than the smooth, breath of the wild
> style flowing grass that parts as you walk thru. before you even work on
> anything else, you gotta fix this shit first

> when i walk onto the bridge over the river, i get stuck on it and cant leave
> *(claude: fixed — slope check used the riverbed normal under the deck)*

> cobblestone looks like shit, i didnt mean make it totally random shapes,
> cobblestones are generally a rounded rectangle, but not made of straight
> lines, its supposed to be a bit jagged, gently, and at fine level, not just
> a random shape with random size and sharp huge jagged edges. look up what
> building cobblestones look like and revise. in fact do that for everything:
> look up how things look in reality or in other games, and revise your mesh
> and texture accordingly

*(claude's own honest assessment of the build at that point)*: grass = fat
triangular spikes in one flat neon green, no bend/base shading/dry blades;
trees = smooth cylinders with stamped bark, straight-rod branches, a few flat
clip-art leaf squares, no crown volume; house stone = white Voronoi mosaic of
big sharp polygons like stained glass; plaza = huge flat grey polygons;
mountains = grey noise spikes with green splotches, no haze; whole image
saturated green + blue with no atmosphere. Looks like a 2005 tech demo.

## 8. Code map (as of this note)

- `src/core/Game.js` — renderer, build order, main loop, perf overlay (F3),
  `?at=x,z,yaw,pitch,time` view links, feedback hook (F).
- `src/core/settings.js` — `?quality=low|medium|high`.
- `src/world/plan.js` — world layout: Path class, RIVER, LAKE, PLAZA/WELL,
  HOUSES, ROADS (main, overlook, lanes), HILL (overlook cliff), BRIDGE, SPAWN.
- `src/world/Terrain.js` — sinh-warped 512² grid, base/hill/plotted/shaped
  heights (plots, roads, river, lake carved), chunks, height texture, GLSL
  mirror of heightAt.
- `src/world/GroundMask.js` — RGBA mask (grass density, road, water bed,
  cobbles) rasterised from the plan + slope/altitude.
- `src/world/groundShading.js`, `TerrainMaterial.js`, `rockShading.js` —
  per-pixel ground/rock shading.
- `src/world/Wind.js` — calm/breeze/gust phases, gust fronts; `WIND_GLSL`.
- `src/world/Grass.js` — tiled GPU grass (needs the rewrite from §7).
- `src/world/Water.js` — river ribbon + lake with flow/wind/foam shader.
- `src/world/Rocks.js` — fractured rock variants, cliff slabs, boulders.
- `src/world/trees/{species,TreeGen,Forest}.js` — 11 species × 5 variants,
  instanced with LOD and wind (needs the rewrite from §7).
- `src/buildings/{Kit,materials,textures,houses,props,Bridge,Village,Smoke}.js`
  — kit-built houses/props/well/bridge merged per material.
- `src/player/{Input,Player}.js`, `src/ui/{HUD,Feedback}.js`.

## 9. Task status (see TaskList in session; mirror here)

Done: world plan/terrain, wind, GPU grass v1, water, textures v1, houses /
barrels / well / bridge, village, trees v1, feedback tool.
In progress: visual overhaul (grass, trees, stone/cobble textures, colour and
atmosphere, mountains), perf pass.
Pending: clouds ×3, dreamy daylight grading, chests/purses/weapons, map (M),
windmill / town hall / lumber mill, white castle plateau, tilted rock plates,
item library, portals + world select, the 10 reference worlds.

## 10. Later additions

- Volumetric fog / mist that moves and responds to the random wind, so distant
  things are easier to draw and the air doesn't feel lifeless. Ambient
  particles always around the player: very light sparks and dust motes.
- Grass must be much denser, a giant carpet of blades close together, but
  engineered so it runs efficiently.
- LOD everywhere: 3–4 versions of each object (nearby / toward edge of draw
  distance / far / in the distance). Grass far away still rendered but in
  greatly reduced detail.

## 11. Standing goal (set with /goal)

Finish all existing tasks first (water, grass, textures, meshes, castles,
buildings, foods, weapons, map, feedback system, clouds, lighting, grading,
potions, fantasy items, coins, chests, …). Then review that every instruction
was actually done. Then take screenshots at different times of day and places
(water, rivers, lakes, mountains, hills, buildings, castle, trees, all meshes)
and critique as a visual designer: does it look like Oblivion Remastered / AAA
(lighting, colours, meshes sitting and blending with terrain, textures) or a
cheap 2000s game? Do 10–30 passes of improving the look; revise lighting,
meshes, textures, blending as needed, creating new options and replacing
things. Target: beautiful, fantasy dreamland, super nostalgic, without being
impossible to run. Grass: a dense carpet, not rough thin spiky blades.
