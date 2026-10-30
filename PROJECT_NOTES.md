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
- Tree leaves must look lush, soft and leafy with 3D depth/body, not razors or
  paper; grass ideally not 2D either.
- Trunks and branches must not be straight lines; joints between trunk and
  branches must be smoothly joined, not overlapping glitchy meshes.
- Grass (again): still looks 2D and spiky. It should be THIN but EXTREMELY
  dense, a bit TALLER, and NOT curved so much. Look up Breath of the Wild grass.
- Clarification: grass was never meant to be perfectly vertical, just not
  curved spikes. BotW reference: long blades leaning together as a sheet in
  the wind, gentle curve, pale yellow-green tips, bright warm field where the
  light hits (almost glowing), ground never visible. Unity thread on BotW
  grass shading: https://discussions.unity.com/t/kinda-solved-stylized-grass-shading-like-in-zelda-botw/759214
- Tree/nature references (Oblivion Remastered screenshots): oak with heavy
  smooth-forking limbs and a crown of distinct leaf clusters with sky gaps;
  long drooping needle boughs on conifers; deep brown bark with pale ridges;
  soft warm hazy lighting; mossy rocks sitting in grass.

## 12. Sun and lighting references (Oblivion Remastered)

Three screenshots: (a) forest with warm god rays through tree canopy,
hazy golden air, soft contact shadows; (b) daytime river with stone bridge,
thatched timber house, bright overcast-white sky, soft diffuse light, pale
atmospheric haze toward distance; (c) late sunrise over a lake: big soft
white-gold sun disc with wide glow and visible rays, pink-amber mist, lake
reflecting the sky, everything in warm sepia tones with dark silhouettes.
Instruction: spend concentrated effort, 10–20 rounds of review and
refinement, to get the sun and lighting looking like this.

## 13. Ruins (scene (c) and more)

Recreate scene (c) specifically: a large river/lake with a small wooden jetty
on one side, and on the other side ruins with gothic arches, fallen mossy
stones, columns, on little islands/headlands, plus an entrance that can load
an interior. Absolutely picturesque. Then add: a ruin in the forest, a ruin
next to the castle, a ruin on its own hill, a ruin inside a massive rocky and
grassy crevasse/canyon (with enough walking area).

## 14. Review method

When reviewing screenshots, compare directly against the Oblivion Remastered
and Breath of the Wild screenshots provided (and the fantasy landscape refs)
and match their lighting, realism, art style and beauty, so nothing looks
computer generated, blocky or geometric, but natural and fantastical.

The /goal for this chat is the standing goal in §11 plus every prompt in this
file.

## 15. More Oblivion references

- Sunset over a lake: soft white sun disc with big warm glow, pink-amber
  haze, rays, dark silhouetted treelines, rocks on a shoreline.
- Original Oblivion jetty: weathered grey plank dock, mooring posts with
  coiled rope, broken crate, lantern post; ruins behind with pale limestone
  gothic arches on a pebbly shore; green-grey water.
- Castle gatehouse on a hill against a low sun; stone bridge with tower
  over a lake at sunset, warm amber water reflecting the sky.
- Imperial City view across the lake with distant snowy peaks; cobbled road
  (flat irregular flagstones with grass in joints), mossy rounded boulders
  with lichen, pines with sparse crowns, dirt and leaf litter.
- Instruction: use Oblivion to reference how rocks are shaped and textured,
  the road textures, and anything else; imitate its style so our own
  interpretation holds up to the same standard of quality and audience.

## 16. Progress log (2026-10-29, later)

Done and pushed to main: visual overhaul (grass carpet, grown trees, stone
and bark textures), atmosphere pass (aerial perspective, sun disc + corona +
light shafts, grade), drifting mist, ambient motes, three cloud styles (C),
map (M), bridge fix, perf overlay (F3), items (3 chests, purses, 12 weapons
on a plaza display), landmarks (windmill with turning sails, town hall,
lumber mill with water wheel). Still to do, in order: castle on a plateau,
tilted rock plates, lakeside ruins + jetty + other ruins, item library,
portals + 10 reference worlds, then the long screenshot-critique loop.
Known open issues: dusk mist still a touch bright toward the sun; ghibli
clouds sparse; chests placed at (4.5,14.5), (-86,-88), (-210,122) not yet
screenshot-checked.
- Castle in progress: `src/buildings/Castle.js` (terraced wards, gatehouses,
  towers with spires, keep with great tower and rose window, long arched
  bridge from the knoll). Plan: MESAS/CASTLE in plan.js, castle road spirals
  the knoll; Terrain.castleHeight terraces the plateau top.
- Castle geometry fixed: wards clamped to one absolute level (Terrain
  castleHeight(x,z,natural) with plateauTop averaged), knoll gets a cliff
  facing the plateau so the bridge is level over a ~40 m gorge, castle road
  climbs the knoll's far side. Sawmill now on a stone pier at the river
  with the wheel in the water; plots ease into riverbanks (plotWeight).
- The Shelves (tilted rock plates, SW at ~(-160,295)): Terrain.plateHeight
  wedges + Plates.js overhanging rock lips (walkable, surfaceAt) + scree.
- Ruins (Ruins.js): gothic-arch / column / ragged-wall / fallen-block /
  flagstone / jetty vocabulary. Sites: drowned temple on the lake's SW shore
  (quay plot, jetty, islet arches via ISLETS terrain bumps), barrow crypt
  (sunken PIT, vault + turf, stair, reliquary, torch light), standing stones
  in the Elder Wood, watchtower stump on the overlook top, roofless chapel
  below the castle, sunken arcade on the floor of The Rift (CREVASSE: deep
  gash SW of the village with a 75 m entry ramp).
- Grass slope cull now reads a baked slope channel (height texture is RG)
  instead of four extra height lookups per vertex.
- Headless renders are now ~3-5 min per frame in this container; batches
  run in the background at 800x450 while coding continues.
- Realms: the ten reference worlds are regions (regions.js) ringed ~585 m
  out beyond the mountains, each a bowl with its own landform/palette/
  flora/set pieces: karst spire lake, floating isles (SkyIslands.js),
  mountain citadel (dark Castle variant via CASTLES), granite valley,
  ancient jungle, white river citadel (moated island town + causeway),
  moonlit ruins (forced night, teal crystals), crystal tundra (snow tint,
  ice crystals), overgrown cliffs (mesa with ruins), canyon shrine (ring
  gate on the canyon floor). Portals.js: glade at (92,34) with ten
  Oblivion-style gates; each realm has a gate home. Menu lists realms.
- Verified by render: castle bridge/arches, drowned temple + jetty, crypt
  interior, the Rift arcade. Pending: realm renders, plate lips up close.
- furniture.js: item/furniture library (bucket, ingots, gems, bottles/
  potions, books, candles, food, mugs, bench/stool/chair/table/bed/
  bookshelf/cupboard, anvil/hammer/tongs/forge/bellows/grindstone, cauldron,
  mortar, scales, herbs, staffs, shields, bow+quiver, rowboat). Composed as
  the smithy (-40,40), alchemist + armoury on the plaza's east edge, tavern
  tables (74,-30), rowboat at the temple jetty.
- Falls.js waterfalls (alpine valley, overgrown cliffs); Arches.js natural
  rock arches (Vale (-122,206), karst, cliffs, two spanning the canyon).
- Offline terrain probe: node scratchpad/probe.mjs (Terrain runs in node),
  used to place things without renders.
- Render review (14:00): glade gates good; karst spires ok (made taller/
  more); citadel reads well; floating isles ok but cloud sea faint; tundra
  snow ok (rocks now snow-dusted); moonlit night works (haze fixed); rift
  arcade good; temple/jetty/crypt interior good; waterfalls thin (widened).
  Portal travel verified headlessly for every realm (#19 done).
- 14:25 Review pass over every prompt (§3–§15): all build items exist in a
  first pass (houses, barrels, 10 species + purple, grass, water, bridge,
  cobbles, roads, village/well, overlook, feedback, clouds, chests, purses,
  weapons, map, windmill/town hall/mill, castle, plates, items library incl.
  smelter/food/mushrooms/boats/canoe/staffs, mist+motes, LOD tiers, ruins
  incl. jetty per Oblivion ref, ten realms + portals). Verified by render:
  karst lake (turquoise, spires), river town island, citadel, glade gates,
  smithy, temple/jetty, crypt, rift. Now entering the lighting/beauty
  critique loop (batch L: overlook view at 7 times of day + castle, river,
  lake).
- 15:30 Lighting round 1 found a WHITE-OUT whenever the sun was in view
  (09:00 frame pure white). Root cause: applyCloudStyle() splices the sky
  fragment from '// Clouds' to gl_FragColor, which discarded the HDR soft
  clip; raw in-scatter (thousands) hit bloom. Fix: finishSkyFragment()
  applied after the splice (+ NaN guards, horizon UV guard). Day now
  05:30–19:30 so golden hour/sunset exist at 18:30–19:30.
- Lighting round 2 (16:00): after the white-out fix the dawn (06:00) view
  is warm and misty — good; 09:00/12:30 clear. Problems: golden hour too
  cool/white with a heavy grey mist band; sunset sky grey; night came
  abruptly at 20:00; realm bowls showed as notches in the mountain ring
  (floating isles visible from the Vale). Changes: longer twilight (day =
  smoothstep(-0.2,0.1)), golden factor wider, warmer sun earlier, fog →
  fogGolden 0.85, mist lower, saturation +golden, warm horizon band in the
  sky shader at low sun, moon disc + navy night floor, crater rims round
  every realm. River/bridge morning view is the best shot so far.
- Lighting round 3 (16:50): sunset west view through the blossom tree and
  the forest-sun shot at 18:17 are the dreamiest frames yet. Night now has
  a moon; realm spire tips no longer poke over the mountains (karst rim).
  Daytime sky still pale near horizon → lowered turbidity, softer HDR knee
  (verify in batch Q). Open: a tall thin white column north of the plaza
  at noon (chimney smoke?), willow branches read black, lake water milky.
- 17:10 "Floating slabs" seen SE from the overlook were NOT geometry: the
  height fog (falloff 0.025, 35/65 split) fogged the low slopes of a far
  massif into the sky while its 200 m peak stayed crisp, so the peak read
  as a floating plate. Proven by terrain-only renders + per-chunk raycast.
  Fog is now mostly distance haze (70/30, falloff 0.015, cap 0.9) and a
  touch bluer by day. Round 3/4 also: brighter hemi/env light, deeper blue
  sky (turbidity 2.2), night desaturated, lighter willow bark.
- 17:40 Correction: the slabs were bare-rock streaks on a distant SNOW peak
  (telephoto renders tele_full/tele_noatmo proved it); the snow fogged to
  sky colour, leaving the dark streaks "floating". Fix: snow dusting kept
  on steep faces, snow colour cooler, fog capped at 0.82.
- 17:35 REAL root cause of the "floating slabs": AtmospherePass treated
  depth > 0.9999 as sky; with near=0.1 everything beyond ~1 km crossed
  that and was painted sky colour, leaving the nearer parts of far peaks
  hanging. Now only cleared depth (>= 0.9999995) is sky. (Proved with
  terrain-only renders: atmosphere off → whole ridge; sky off + atmosphere
  on → black holes where the far terrain was.) Earlier fog/snow changes
  stay; they're improvements anyway.
- 17:50 Depth-threshold fix verified: far ridge continuous from the
  overlook at noon and golden hour; no floating slabs. Golden hour now a
  warm sepia haze over a lit village (closest yet to the Oblivion refs).
  Noon still veiled → fog 0.00075 by day, bluer fogDay. White castle gets
  a pale limestone texture (verify in U4/V4).
- 18:00 Round 6: noon veil thinner (good); lake morning shot is strong.
  Castle shadow side read dull grey → white materials envMapIntensity
  1.6–2.0 + pale limestone texture. Horizon still milky → mie 0.0022,
  rayleigh 1.9. Near grass was a yellow band vs the far meadow → tips
  less yellow. Verifying in batches W (castle) and X (overlook/road/forest).
- 18:10 Castle now pale white at noon (good). Found: wading into the river
  made the water vanish (single-sided) with no underwater look → water
  DoubleSide + Water.levelAt() + uUnderwater murk in the atmosphere pass.
- 18:25 Round 7: castle verified white at 10:00 and 16:00. Noon still
  flat → uContrast (1.14 by day, pivot 0.18, pre-tonemap); far meadow
  under grass mask 0.72→0.84 and grass sheen 0.08→0.05 to kill the
  near/far grass band. Pending verify (Z). Still open: milky horizon at
  noon (Preetham), wading render (Y).
- 18:40 Wading render verified (teal murk, surface seen from below). Added
  swimming: Player floats with feet 1.25 m under the surface in deep
  water (waterLevelAt from Water.levelAt), 45% speed. Village-from-hill
  17:30 frame has good depth and birch/purple accents.
- 18:50 Measured (PIL region means) rather than eyeballed: near grass
  (153,175,72) vs far meadow (93,124,45) = 1.6x step at the grass draw
  distance; noon sky (213,226,232) ≈ white. Fixes: terrain under grass
  mask ×(1.22,1.2,1.0) to match lit blades; sky shader deepens blue toward
  the zenith by day (×(0.6,0.76,1.04) up to 0.8). Verify AA batch.
  Method note: measure regions with PIL to confirm each lighting change.
- 18:55 Golden-hour lake (Z3) and overlook (Z4) are the best frames so
  far: rose-amber haze, lit village, castle on the hill — close to the
  Oblivion sunset refs. Lake surface too pale/grey at sunset → water
  reflection tint eased 0.6→0.3. Batches AA (sky/grass) and AB (water)
  pending.
- 19:05 Sky deepening had no effect (zenith 189,197,210): per-channel
  soft clip + clamp 2.0 bleached the bright noon sky to white before
  the tint. Now a luminance-based hue-preserving clip (l/(1+0.7l)) and
  clamp 1.6. Far meadow 93→102 after the 1.22 lift; pushed to 1.36.
  Verify AC (noon overlook, sky-up, golden, dawn) — the clip change
  touches every time of day.
- 19:15 AB: river-bridge at dusk is a keeper frame (warm light on the
  tavern and castle hill). Lake at golden hour looking NE reflects the
  pale east sky — correct, if not dramatic. Willow bark read concrete-grey
  → warm grey-brown.
- 19:25 Hue-preserving sky clip verified: noon sky region 200,221,233 →
  161,210,230 (blue at last); sky-up frame reads as a real noon sky with
  clouds. Near grass still lime (143,167,71) vs meadow (101,131,47) →
  blade tip/tuft brightness trimmed. Verify AD.
- 19:35 Lighting checkpoint after ~10 measured rounds: dawn (golden glow,
  valley mist, long shadows), morning (clear, blue sky, bright meadow),
  noon (blue sky, punchier contrast, no white-out), golden hour (rose-
  amber haze, lit lamps), dusk/night (moon, navy sky, stars) all verified
  from the overlook; lake/bridge/castle/forest frames verified. Keeper
  frames: Z3_lake_golden, Z4_overlook_golden, AB3_bridge_golden,
  X3_forest_sun, AC4_dawn. Remaining nits: near grass still slightly
  lime (AD pending), Preetham horizon pale at noon, distant tree cards
  read as dark blobs at 300 m+.
- 19:50 AD: near grass 143,167,71 → 135,162,64 (meadow 100,130,46);
  leaving the remaining gap as the lit-carpet-vs-ground difference.
  Plaza afternoon frame (well, stalls, cherry, castle on the hill) is
  solid. Leaf normals now lean upward (0.55) so far canopies stop reading
  as dark blobs — verify AE.
- 20:00 AE: leaf-normal lean works (village canopies show lit tops).
  Forest noon: giant trunks flat maroon, canopy undersides black →
  bark [0.52,0.4,0.3], +sky ambient on leaves. Verify AF (forest, forest
  edge, standing stones at dusk).
- 20:10 Pushed a broken build for ~5 min (template literal eaten by a
  comment line in the leaf-shader patch); fixed in 16f9f0e. Lesson: run
  the build check BEFORE commit in the one-liner (it was in the same
  chain but the commit didn't gate on it). AF renders the pre-fix build;
  AG re-verifies forest + night village + castle dusk.
- 20:25 AF (pre-fix build): forest edge shows giant bark too orange (fix
  in flight); standing stones were literally black boxes → roughBlock()
  noise-displaced monoliths in m.ruin (pale) with tapered tops; lintels
  and altar too. ship.sh now gates commit+push on a clean build.
- 20:40 AG: giant bark brown (fixed); village night = moon + stars + lit
  windows over navy hills (good); castle at 19:00 in warm side light is
  a keeper frame. Realms haven't been re-rendered since the lighting
  overhaul → batch AI (karst, moonlit, tundra, canyon, floating isles).
- 20:55 AH: monoliths read as brick (ashlar courses) → procedural rock
  material (createRockMaterial) for standing stones/lintels/altar.
  AH2/AH3 cameras were mis-aimed; AJ re-shoots stones (dusk, noon),
  chapel, watchtower.
- 21:20 Realm re-check under new lighting (AI): karst lake read as a white
  band (reflection untinted) → reflection takes the lake tint; tundra
  grass was white spikes → grassTint straw + density 0.1; floating-isle
  tops flat green (blades follow terrain height) → turf tuft noise;
  canyon: the ring gate's dais hung 4 m over the gorge floor → PADS
  (levelled after every cut) under every gate + the glade; rock strata
  weight 0.2→0.1 (contour-line look on big walls). Verify AK.
- 21:40 AJ: standing stones now pale weathered rock at dusk and noon
  (good). Chapel shot showed green camo blotches on the castle plateau
  cliff → rock band starts at slope 0.36 (was 0.42) with less noise
  jitter. Watchtower shot mis-aimed (nice purple-duskwood frame anyway);
  AL re-shoots chapel, tower, overlook cliff, castle cliff.
- 22:00 AK: canyon ring gate now sits on a flat pad in the gorge (good);
  tundra snowfield with straw tufts + ice crystals reads right; karst
  lake overshot into an opaque pastel-cyan sheet → tint 0.55/1.5/1.35,
  reflection tint mix 0.3; Oblivion gate blocks were featureless black
  → obsidian 0x3a3230. Verify AM (karst ground + aerial, glade gate,
  moonlit lake).
- 22:20 AL: cliff camo blotches gone (overlook + castle plateau); white
  castle frame good. Chapel/watchtower masonry read as dark mud → ruin
  0xd2cec4 / ruinDark 0xcfc9bc with env 1.3–1.4 (Ayleid-pale). Overlook
  cliff slabs had razor-straight facet edges → post-cut fbm rumple 5%.
  Verify AN (tower, overlook cliff, chapel, temple).
- 22:40 AM: karst lake from the air = vivid turquoise with depth
  gradient (keeper, matches ref 1); green ledges on the spires are right
  for karst (Guilin towers are vegetated). Glade gates now textured black
  stone with ember seams. Moonlit lake good. Lakes at eye level still a
  flat band → lake normal strength 0.3→0.5. AO: Shelves, smithy,
  alchemist, alpine falls, jungle, river town under final lighting.
- 23:00 Container restarted mid-render (AN3/AN4 + AO batch lost; repo,
  dist, scratchpad scripts and 373 renders survived). Preview server
  relaunched; AN3/AN4 + AO re-queued as batch35.
- 23:10 Measured AL→AN: tower (65,78,51)→(72,84,55) only; cliff unchanged.
  Rubble texture is intrinsically dark (~0.3 albedo), so colour multipliers
  can't rescue it → ruinDark now ashlar-based 0xbdb7ab. Rock rumple
  0.05@2.8 → 0.14@1.6, slab fracture planes 7–10 → 5–7. Verify AP.
- 23:25 AN3/AN4: chapel and temple still brown even at noon — the
  standard ashlar texture base is ~0.6 brown; multipliers can't make
  limestone. Both ruin materials now use ashlarStone(5, pale) with
  weathered-grey multipliers. Verify AQ (temple noon/golden, chapel,
  tower) after AO/AP.
- 23:45 AO: smithy, alchemist stall (with portals in the distance),
  alpine waterfall into a blue lake, river-town island + causeway all
  read well; jungle floor dark and lush. Shelves: mid-distance slopes
  were one flat saturated green beyond the blade draw distance →
  meadowColor gains 20–60 m straw/rich patchiness. Verify AR.
- 00:05 Shipped a shader that failed to compile for ~10 min: `patch` is a
  GLSL reserved word (terrain/grass/turf fell back to magenta-less
  default). Caught by the smoke test, fixed as `sweep`. ship.sh now also
  runs smoke.cjs and refuses to push on any "Shader Error".
- 00:30 AQ: ruins verified pale limestone (temple noon + dusk, chapel,
  watchtower) — matches the Ayleid-stone refs. Adaptive quality shipped
  (Game.adaptQuality: resolution → grass reach → bloom → remembered
  lower preset after ~3 s under 28 fps); #10 closed. AP (rock rumple)
  running, AS (meadow sweeps) and AT (cliff/rift/boulders) queued.
- 00:50 AP: rift arcade good; cliff slabs unchanged (diff 5/255) because
  radial rumple bows faces but not the ruled long edges → post-stretch
  lateral wobble (11% of extent) + slabs 0.8–1.2 thick. Verify AU.
- 01:05 AT: meadow sweeps show as natural straw/rich patches on the far
  hills (good); forest edge with oaks + giants good; rift arcade pale.
  "Boulders" camera missed its subject — re-aiming from RockField data.
- 01:45 AV (cliff foot close-ups): boulders rounded with lichen tones
  (good); slab silhouettes irregular now. Two defects: (a) ground inside
  grass cutouts (rock feet, ruins) rendered as flat untextured meadow
  green → bare soil mix (dirt + sparse green) where mask.r < 0.55;
  (b) rock cracks were one continuous iso-line network at 14 m scale =
  "contour map" → confined to broken zones (second noise mask) and
  thinner. Verify AW (cliff foot, Shelves, temple, overlook).
- 02:30 Shelves bald-green investigation: terrain-only render = bright
  under-grass meadow on the slope; grass-only render = no blades there
  (only in the first 20 m). In-page probe: tiles visible, counts full,
  in frustum, baked slope 0.92–0.99, blade placement math correct
  (world - tileOrigin). Still unexplained; AX re-shoots from plate top /
  up-slope / foot-with-lip, plus a CPU ray-cast of the foot view.
- 02:50 ROOT CAUSE of bald green cliff faces (Shelves face, castle cliff
  "camo", overlook): CPU ray-cast showed the green band is a 9–12 m-away
  wall with true ny 0.18–0.52; the terrain shader classified it by the
  smoothed vertex normal, which on a 2-cell-wide cliff blends toward the
  flat ground (ny≈0.7 → meadow), while the grass (baked grid slope)
  correctly culled → bare green. Fix: terrain classifies rock with the
  face normal from dFdx/dFdy(vWPos) (lighting keeps the smooth normal).
  Verify AY (plate foot, castle cliff, overlook cliff, overlook noon).
- 03:05 AW (crack zones + bare soil, pre face-normal fix): contour-line
  cracks gone, faces cleaner; cliff-foot green unchanged → confirms the
  smoothed-normal classification as the cause (AY tests the dFdx fix).
  Temple noon and overlook noon stable. Next candidate after AY: rock
  faces are flat/pale at <10 m (need mid-scale relief / cavity shading).
- 03:25 AX (Shelves cameras): plates read as gentle tree-covered hills
  with a grey ledge, not jagged tilted slabs → rise ×1.5 (14→21 m over
  46 m ≈ 25°), lifts ×1.3, no trees on plates. Face-normal fix (AY)
  should turn the broken faces to rock. Verify AZ (wide, foot, upslope,
  golden).
- 03:40 Rock close-range flatness (AW1/AX3): cavity term 0.8+0.4h →
  0.5+0.75h, darker base 0x6f6a64, grit 0.2→0.28, bump 1.4→2.2 (terrain)
  and 1.2→2.0 (rock meshes). Verify BA (cliff close, boulder foot,
  castle cliff, overlook golden) after AY/AZ.
- 04:00 BA1 (rock relief): cavities and lichen now give faces depth;
  crack iso-lines still read as drawn lines → crack weight 0.45→0.28,
  zone tighter (staged, ships once BA's renders finish — a concurrent
  Chromium killed AY's shots). view2 screenshot timeout 600→1500 s.
  Render queue: BA → AZ (steeper Shelves) → BB (AY re-shoot).
- 04:20 BA2/BA3: face-normal fix shows rock on the steep part at the
  cliff foot; castle cliff clean. Remaining bald band = grassy bank at
  ny 0.6–0.82 where blades were already culled but rock hadn't started →
  grass cull now smoothstep(0.56,0.7), rock by 90% face normal. Cracks
  softened (0.28). Verify BC after BB.
- 04:35 BA4 overlook golden (with rock relief): keeper frame — rose-amber
  haze, lamps lit, village and hills in warm light, near slab shows
  cavities/lichen. Render queue now: BB (face-normal re-shoot) → AZ
  (steeper Shelves) → BC (bank grass + crack softening).
- 05:00 AZ/BB/BC reviewed (11 renders). Face-normal fix holds (castle
  cliff, overlook cliff clean); BA4 golden overlook is a keeper. Still
  wrong: (1) bald lit-green band on steep banks — the terrain lifted the
  under-grass colour (×1.36) wherever mask.r said grass, even where the
  blade shader had culled by slope → groundColor now takes a `carpet`
  factor (same smoothstep(0.56,0.7, ny) as the blades) and shows bare
  earth instead; (2) plate lips read as concrete boxes → slabGeometry
  rebuilt: position-pure noise displacement (up to ~4 m at the tip),
  level top, box face groups → [rock, turf] so the top is meadow turf;
  Plates now built after the turf material exists. AZ1/AZ4 aerial cam
  was inside geometry (bad vantage) → BD re-shoots from player spots +
  a 70 m aerial.
- 05:20 Probe of the ground under the Shelves: base terrain climbs from
  ~10 m at z 230 to 60–100 m at z 350 (mountain-ring apron starts at
  r≈220). Three plates sat on 46–74 m slope and read as hillside bumps;
  the AZ aerial camera at y 45–70 was inside that slope. Plates moved
  north onto 5–25 m ground (z 205–300), SHELVES label → (-165,248).
  BD (lip/turf/bank checks) and BE (relocated Shelves) queued.
- 06:30 BD/BE reviewed. Lips now rounded turf-topped shelves from the air
  (BD0/BE0: close to the ref), relocated Shelves sit on flat ground. Left:
  (1) lit-green strip at rock feet persists (BD3/BE4) — terrain carpet
  used the smoothed vertex normal, blades use the baked 5 m slope → the
  terrain now samples uHeightMap/terrainSlope() itself; (2) BD5 mountain
  face showed flat triangle facets — triWeights took the face normal
  (projection flips per triangle) → smooth normal for projection, face
  normal only for classification; (3) BE2/BE4 lips still boxy with a
  ruler-straight top → displacement ×1.7, bedding 0.3, top swell ±0.45 m
  mirrored in surfaceAt. Verify BF.
- 07:40 BF: lips now ragged broken shelves (BF2), mountain facets gone
  (BF4), Shelves aerial good (BF5). The lime strip at cliff feet survived
  the carpet fix → it was never the carpet: rockAlbedo's moss term used
  the smoothed normal, painting steep-but-smoothed-gentle rock a lit
  lime green. Moss now keyed to the face-classified normal, darker
  (0x3d5424, 0.6) and only above ny 0.82. Plate faces get a 2 m jag term
  and a noise-varied face width. BF6 was blocked by a juniper spawned
  on the overlook (tree RNG reshuffles whenever placement rules change)
  → 8 m clearing at OVERLOOK and SPAWN. Verify BG.
- 08:40 Raycast probe of the lime band (BG1 px 0.33,0.65): terrain hit,
  mask.r 0.75, baked slope 0.99 (blades fully allowed), smooth ny 0.56,
  FACE ny 0.41 — a steep bank facing the 15:00 sun. Blades spread thin
  on a 60° face so the lit ×1.36 under-carpet glows through. Carpet
  lift now also gated by the face normal (smoothstep 0.45–0.78) and
  reduced to ×1.28. BG3 overlook golden clear again (keeper). BG2 shows
  a per-triangle ledge facet at a plate face (open, low priority).
  Verify BH (bank + fresh critique frames: bridge 08:30, plaza 16:30,
  lake noon, castle road 17:30).
- 09:50 BH: bridge at 08:30 is a keeper (willow, bridge, castle hill,
  tavern); plaza and lake-noon frames good. The bank strip (BH1) was in
  the end sunlit GRASS: the baked slope texel at that spot is a flat
  vertex (0.99) beside a one-cell cliff, so blades stood at full density
  on a 60° sunlit face and the terrain gates never engaged. Blades now
  cull by min(baked, local 0.6 m gradient groundN.y) and the terrain
  carpet by min(baked, face normal). Verify BI (+ Rift golden, glade
  dusk as new critique frames).
- 11:00 Bank strip finally understood by full/nograss/terrain-only
  renders + PIL: the remaining strip is just the thin carpet→bare
  transition; the real defect is that the GROUND under the grass renders
  (110,155,3) in sun — blue ≈ 0, acid green (the user's exact complaint)
  — while blades are (112,143,50). Under-grass colour now desaturated
  40% toward warm grey-olive; blades 15%. Measure again (batch58 reruns
  diagbank2) and view BJ (overlook noon, bridge morning, road golden).
  Also: BI5 glade at dusk is a keeper; BI2 overlook cliffs clean.
- 12:00 Measured after the olive fix: ground (120,144,72) vs blades
  (115,140,65) — matched, acid green gone. BJ overlook noon, bridge
  08:30 (keeper), road golden all read warm and natural. Grass/ground
  pass closed after ~14 measured rounds. Next critique sweep: places not
  re-shot since the lighting overhaul — crypt interior, castle ward,
  Shelves golden, jungle, river town, citadel bridge, sky isles.
- 13:10 BK critique (7 realms/interiors): crypt interior and castle ward
  masonry read as flat bathroom tile — hard black joints, no weathering;
  river-town house walls showed the castle's 2.6 m-repeat blocks; sky
  island cones smooth grey blobs. Citadel (BK6) is a keeper. Fixes:
  ashlarStone gains rain streaks under joints, dirt blotches, wider
  per-block tint (pale base 0.84, 0.76+0.26t), narrower softer mortar;
  whiteHouse material = white ashlar at 2.4x repeat for the town; island
  cones get 6 ribs + fissures + overhanging rim. Verify BL (+ chapel
  close, castle gate from the bridge).
- 13:40 BL verified: castle gate from the bridge and river-town street
  good; crypt/ward walls still tile-like at 2 m; island cone still
  smooth. Session handoff written: HANDOFF.md (this branch) and
  https://claude.ai/artifact/WfyERcS7grzanb3KJnACvt
- 2026-10-30 (resumed after compaction; the stop hook held the /goal open
  because the visual loop had not reached "incredible"). Another session
  (Opus) is pushing to main in parallel: z-fighting fixes (castle wall
  runs lifted 12 mm alternately, crates, portcullis, sawmill rafters,
  bridge soffit, town-hall arcade), calmer moonlit water, feedback-kind
  toggle row. Always `git fetch && git rebase origin/main` before push.
- Pass 26 (BM/BN): world-space masonry weathering shader
  (`buildings/masonry.js`, applied to white/whiteDark/whiteHouse/ashlar/
  stone/stoneWarm/ruin/ruinDark): broad + mid stains, rain streaks on
  vertical faces, rising damp and moss at the foot (reads terrain height
  under the wall via TERRAIN_HEIGHT_GLSL), lichen, 2.2 m × 0.8 m patchwork
  tint, soft macro normal wobble. GLSL reserved word `patch` bit again →
  `quilt`. ashlarStone: unequal course heights, wandering joints, chipped
  corners, pale per-block tint 0.6+0.44t, softer arris. Castle walls and
  towers at metres 3.6/3 (monumental blocks). Grass grows on the floating
  isles: `uDiscs[6]` (x,z,r,top) override terrainHeight in the grass
  vertex shader + per-tile culling sphere stretched up to the disc top
  (first try showed nothing because the tile's sphere sat 100 m below).
  Island cones 56×22 segments, ridged noise, bedding steps, 5–8 ribs,
  hanging vines (rope) and root knots (logs). Moss pads on flagstones are
  ragged 9-gon patches in 0x3f5a2a. Jungle floor: ground tint
  [0.5,0.46,0.3], grassDensity 0.38, olive grass tint. Rock relief gains
  fine fracture grain (tri 1.5/4.2) and bedding ledges near the camera.
  Result: castle gate (BN4) and ward (BN1) now read as masonry; sky isle
  (BN2) has blades and a craggy cone — keepers. Castle at 19:00 from
  (120,-120) yaw -0.785 is a keeper.
- Pass 27 (BO): realm grassDensity scaled blade HEIGHT, not cover, so the
  jungle stayed a dark lawn → cover now thresholds the lush noise
  (`cover = smoothstep(0.88-a, 1.08-a, gn.y*0.8+br*0.2)`), so thin realms
  break into patches with ground showing. Close rock: cavity contrast
  `mix(0.5+0.75h, 0.28+1.15h, detail)` via a `rockDetailF` global; gully
  banding halved. Verify BO (jungle, cliff close, isle looking down for
  the cloud sea, tundra tufts, canyon, ward at dusk).
- Pass 28–29 (BP/BQ/BR): snowfield shading (drifts, ripples, windswept
  patches); terrain rock takes the realm tint (canyon finally red) and
  snows over on the tundra; slab outcrops rounder; grass patch cover
  thresholded by the noise quantile (gn.z*0.75+gn.y*0.25, t=0.52+(0.5-a)
  *0.48) — the jungle floor finally breaks into tufts over dark earth;
  rock feet darkened (object-space y); granular hash speckle on close
  rock; ferns (Weber–Penn 'fern' species: stub trunk, 7–11 drooping
  fronds, willow-kind leaflets) under the jungle, cliff ruins and giant
  grove; crystals are hex quartz points with fresnel rim + tip glow;
  wildflowers in the grass shader (first as single wide heads — the
  user's #40 says confetti — now as clumps per tuft, small heads, one
  colour family per clump).
- Owner playtest (issues #7–#49, label feedback): a second agent (Opus)
  works the issues one at a time; I took the ones that touch my systems
  and closed them with commit SHAs: #41/#42/#45/#46/#47 pixelation
  shimmer, #34 default clouds, #35 Ghibli clouds, #48/#49 weather speed,
  #40 flowers (claimed). Close an issue when shipped so the other agent
  skips it.
- Pixelation (user ask): PIXEL_LEVELS Off/Mild/Strong (px 0/3/6 CSS px per
  game pixel), menu radio row + P key, ?pixels=N, localStorage
  murk.pixels. Renders at ratio 2/px, PixelatePass box-filters each 2×2
  block (kills thin-diagonal moiré, leaf cut-out speckle, far-grass
  mush), canvas image-rendering: pixelated. TemporalPass blends 42/55 %
  of the previous frame, weight × (1-smoothstep(0.35,2.5, cam angular
  speed)) × (1-smoothstep(2.5,9, cam speed)). Wind.stepHz 18/12 publishes
  the wind uniforms in steps; grass uPixelWiden 1.8/2.6. Both passes idle
  at level 0. Feedback screenshots are captured at the pixel resolution
  (small) — fine, it is what they see.
- Clouds (user: "comical blob of circles", then "all styles lifeless",
  then "too fast"): clouds.js now has churn(uv,T,amp) — rotational domain
  warp from two fbm pairs — used by all three styles; cloud clock T =
  skyTime*cloudSpeed*600 (was 2500 for one push: timelapse, #48/#49);
  skyTime += dt*(0.5+0.6*wind) (was 0.6+2.5*wind). Ghibli = opaque
  cauliflower towers (body fbm + 3 billow octaves, soft slope lighting,
  belly darkening, silver rim, scudding puffs). Realistic gained a cirrus
  veil. Painterly (default now, per #34) banks + curling cirrus strokes.
  Headless note: the heavier sky shader makes swiftshader page loads
  ~40 s; view2.cjs goto timeout raised to 240 s after a whole batch died
  on the 30 s default.
- Weather speed (#49): mist banks scrolled at 2.2×wind travel (3–12 m/s)
  → 0.35×; tree sway 0.9/1.73 Hz → 0.45/0.87 Hz, flutter 5.3 → 3.4 Hz.
  Grass gust fronts unchanged (praised in #16).
- Map (user ask): MapScreen pans toward the pointer (virtual pointer under
  pointer lock, dead zone 14 % of half the short side, up to 900 px/s at
  the edge), WASD/arrows pan 720 px/s, wheel zoom eased (targetZoom,
  exp(-deltaY*0.0022), anchored on the pointer), Q/E and -/= zoom keys,
  centre clamped so the world edge stops at the screen edge, radial
  parchment fade beyond r≈745 m hides the smeared far grid. map.update(dt,
  input) runs from Game.frame while open. Tested headlessly (maptest.cjs).
- Concurrency: another session pushes to main continuously — fetch +
  rebase before every push; one conflict so far (Castle wallRun lift vs
  block scale), resolved keeping both.
- Later on 2026-10-30 (owner asks, all pushed): #50 far leaves vanish in
  Strong pixels → leaf alpha boosted with distance in pixel modes only
  (uLeafBoost). #51 roads+mushrooms → GroundMask road width wobbles
  (roadWobble), shader roadAmount() adds metre/hand-scale edge noise with a
  short fade, roadColor() (packed-earth patches, ruts, cracks, gravel, pale
  verge), grass right up to the edge (grass stroke width+0.2, blades culled
  by roadAmount), Rocks.placeRoadsides() pebble groups + odd boulder,
  world/Mushrooms.js (merged lathe geometry per kind, vertex colour +
  glow attribute, uGlow 0.12+1.3*night, giants bounce: Player.bouncers,
  BOUNCE_SPEED 10.5, stem colliders). Autosave: murk.save {x,y,z,yaw,
  pitch,time,paused} every 2 s + pagehide; restored unless ?at=. #53/#54
  potions/cauldron: Kit keeps + transforms an 'aux' attribute (liquid
  centre+radius) → shader works in bottle space: murmur (deep vs deep*0.35,
  5× slower) + eel (8-sample gaussian trail along a Lissajous path, visible
  in bursts); cauldron kind 6 with vertex-animated bubbles (phase .4-.8) and
  splashes (>.8), flame ring (flicker() vertex wobble on fm.flame), logs,
  ladle. Kit.build drops 'aux' where a material's parts disagree (the empty
  bottle's dregs broke mergeGeometries). #55 plaza edge → river bank
  e*0.3+max(0,e-6)²*0.015, plaza plot eases over 16 m, rubble retaining
  wall + ashlar kerb where drop>0.45. #57 rock/turf boundary: wnClass mix
  0.55 (was 0.9) + noisier threshold. Clouds: masses thickened after CA
  renders showed thin skies; churn's second octave is plain noise now.
- GLSL reserved word `patch` has now bitten three times (sweep, quilt,
  packed). Never name a float `patch`.
- Headless renders are slow since the cloud overhaul (~8-10 min/frame in
  swiftshader at 800×450); batches 68-72 queued back to back. Verify CA
  (clouds), CB (isle sea, flowers, tundra), CC (roads, mushrooms, pixel
  trees), CD (potions, cauldron), CE (plaza edge, hill rock, ghibli).
- Verification round (CB–CE frames): flowers now clumps (ok); jungle floor
  patchy (ok); cloud sea shot from a free camera was invalid until view2's
  cam mode also ran updateWorld(0) (atmosphere uniforms were stale);
  road gravel read as white sprinkles → sparser, earth-toned; road edge
  wobble needed a 4–5 m bay term; potions by night ok (eel brightened);
  cauldron fire was hidden inside the pot's belly → ring at r 0.36–0.46;
  plaza edge: wall+kerb good, the remaining sheer step was the ROAD cut
  switching off within 3 m of the river → bandFade over riverHalf+1..+7;
  hill rock shaded side one black mass → rock envMapIntensity 1.6,
  terrain 1.35, meso/band contrast up. Bridge-at-morning (CE3) is a keeper.
- Headless cloud checks all sit at skyTime≈0 (paused on load), i.e. the
  same cloud phase every time → view2 gained a `sky` shot option; judge
  coverage across 2–3 phases, never one frame.
- Night sky / glare / motes shipped (#17 #18 #22 #23 commented): stars are
  soft sprites with a slow per-star wink (aStar: size, phase, rate), moon
  has maria/craters/terminator in AtmospherePass (uMoon), lens ghosts +
  streak when the sun is near centre, motes 1500 with speeds and 2-point
  trails, god rays 0.12+0.6*low with pow 1.35 sharpening.
