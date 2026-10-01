# Lanternkeeper — Architecture

Style prototype built on Three.js (WebGL2) with a custom multi-pass pipeline and
hand-written GLSL. No external assets: every mesh, texture and sound is procedural.

```
index.html            title card, HUD markup, end cards, CSS
src/
  main.js             composition root: seed, systems, title/end flow
  core/
    Engine.js         clock + ordered list of systems (update/resize), service registry
    EventBus.js       pub/sub between systems
    Settings.js       every STYLE knob (locked defaults) + quality presets
    GameConfig.js     every GAMEPLAY number (meter, freeze, monsters, beacons)
    noise.js          deterministic CPU noise + seeded RNG
  renderer/           the Ink & Ember pipeline (unchanged contract, see below)
  shaders/            GLSL; lighting.glsl also holds the beacon lights (lk_beacons)
  world/
    Dungeon.js        seeded layout: rooms on a 1 m grid, MST hallways + loops, start/exit/beacons
    DungeonBuilder.js grid -> geometry: merged wall runs, lintels, greedy ceilings, hall vaults,
                      doorway arches, corridor ribs, per-room dressing; colliders, drips, chains
    props.js          piers, crypt columns, sarcophagi, font, rubble, beacon braziers
    geo.js            arches, vaults, limbs, displacement, chunked merge (2D bins)
    World.js          builds a run's dungeon; collision, ground height, line of sight, start pose
    Beacons.js        kindling (hold E), beacon fires as lights, sanctuaries, exit door + portal
    Creatures.js      creature silhouettes (stalker, crawler)
    Chains.js, Water.js, Ripples.js, Drips.js, Embers.js
  game/
    GameState.js      title -> playing -> dead | won; hits, messages, hurt/fade
    Monsters.js       hunting AI (Dijkstra flow field), light response, charge/freeze, blast damage
    FireJet.js        blast particles
  player/
    PlayerController.js  pointer lock, WASD, sprint, wading, collision, bob; right-click / E / Space
    Lantern.js           viewmodel, flicker, sway, shutters, fire meter, burnout, off hand; DRIVES the light
  audio/AudioSystem.js   all procedural sound (ambience + gameplay cues)
  ui/
    HUD.js            beacon count, flames (hits), fire meter, prompts, messages, end cards
    Minimap.js        fog-of-war map (canvas 2D), full map on M
  debug/              look-dev panel + FPS (only with ?dev=1)
```

## Gameplay systems (v3: depths, oil, story)

* **Flow.** `index.html` without params shows **the shrine** (`ui/Shrine.js`): oil, depth choice,
  upgrade shop. Choosing a depth pays its toll (`core/Progress.js`, localStorage) and reloads with
  `?round=N` plus a one-shot paid ticket in sessionStorage. Each depth has a fixed seed
  (`data/rounds.js`), so cleared depths can be replayed for free to gather oil.
* **Loadout** (`game/Loadout.js`) applies the depth's difficulty and bought upgrades to `GAME` /
  `settings.light` before anything is built. `abilitiesAt(n)` gates the blast and the firebomb.
* **Interactions** (`game/Interactions.js`): every E-action registers `{x, z, radius, hold, label,
  enabled, onComplete | onHold}`; the nearest one in front of the player wins the prompt.
* **Oil** (`game/OilSpills.js`, `game/Economy.js`, `shaders/oil.frag.glsl`): spills are placed by
  the builder; scooping stows the lantern (`Lantern.update` ctx.collecting → light ×0.28). The sack
  is settled into progress on win (keep all) or death (back to the entry amount).
* **Great door & sanctum** (`Dungeon._placeSanctum`, `world/Doors.js`): a 6 × 7 room is carved
  behind the exit room. The door is barred until all beacons are lit; the bar falls (heard
  everywhere) and the lantern flame leans toward it (`flame.frag` uLean). The sanctum holds the
  chapter's page (lectern) and the well down.
* **Story** (`data/story.js`, `world/StoryRoom.js`, `ui/Plate.js`): per-depth intro, ability lesson
  and one beat per beacon (mural / echo / keeper) + the door page. Plates pause the world.
* **Blast pose & star jet** (`Lantern.js`, `FireJet.js`): the root blends to a centred pose, the
  lantern rotates half a turn on its bail so the star shutter faces forward, the off hand comes up
  behind it; particles are emitted along a star outline so the front expands as a star.
* **Firebomb** (`game/Firebomb.js`): prime (sack, douse) → charge (arc guide) → ballistic flight →
  burning pool (light slot 7, damage, moth lure). While the lantern lies in the fire, the light
  source *is* the thrown lantern; walk in and press E to take it back.
* **Monsters** (`game/Monsters.js`): types `stalker`, `hound` (ground), `moth` (flying, lured by the
  beam and burning oil, immune to freezing), `ceiling` (walks the ceilings of crypts and chapels,
  drips, drops when you pass under, then hunts on the ground).

## Gameplay systems (v2 notes, still valid)


**Dungeon generation (`Dungeon.js`).** 10 rooms (crypt 8–11 m, chapel 10–14 m, hall 12–26 m) are
placed with rejection sampling on a 100 × 100 m grid, at least 5 m apart. A minimum spanning tree
over room centres plus the two shortest extra edges gives loops; each edge is carved as an L-shaped
3 m hallway. The start is a small room; the exit is the room with the most link hops from it; the 5
beacons are spread over the rest by hop distance. Everything is deterministic per seed.

**Geometry (`DungeonBuilder.js`).** Walls come from floor/solid cell edges merged into runs of ≤ 8 m.
Ceiling height steps between rooms and hallways become lintels. Flat ceilings are greedy-meshed,
and halls get a pointed barrel vault with gable ends, arcades of clustered piers and transverse
ribs. Hallways get ribs on pilasters every 4 m, and doorways get arches on jambs. Rooms are dressed
by kind. Everything is merged into 9 m chunks (~70 draw calls for the level, culled per pass).

**Light as a game mechanic.** The lantern's light is computed identically in JS (`Monsters._lanternAt`)
and in GLSL, with a grid line-of-sight test standing in for the shadow map:
* glow (wide) → monsters slowed by up to 55 %
* beam cone → monsters held still, charge rises (`chargeRate`); at 1 → frozen `freezeTime`
* blast cone (`blastCos`, `blastRange`) → damage per second, doubled-ish on frozen targets, knockback

**Monsters (`Monsters.js`).** A static per-cell cost (impassable under props, expensive beside walls)
feeds a Dijkstra field from the player's cell, rebuilt every 0.4 s. Monsters descend the field, go
straight at the player when they can see them within 7 m, sidestep when stuck, and treat kindled
rooms as walls (both in the field and in collision). They drift around their room when the player
is out of range. They respawn in dark rooms out of sight, up to 4 + beacons lit.

**Beacons (`Beacons.js`, `lighting.glsl`).** Up to 8 extra lights in `uBeaconPos/uBeaconBox`. They
cast no shadows; instead each is clipped to its room's bounds, which stops leaks through walls. The
exit's glow uses the next slot once it opens.

**Fire meter (`Lantern.js`).** Blasting drains 1/s; idle regenerates after a short delay; empty =
burnout (light ×0.38, no beam/blast) until recovery reaches 1 over `burnoutTime`, with each Space
press adding `pumpBoost`.

## Frame order

Systems run in registration order each `requestAnimationFrame`:

1. **Player** — input, movement, collision, head bob, emits `footstep`.
2. **Lantern** — meter/burnout, flicker, focus, sway; writes the light uniforms.
3. **Beacons** — kindling, beacon lights, exit door.
4. **Monsters** — flow field, AI, light response, attacks (`playerHit`).
5. **World** — chains, drips (emit `drip`), embers, water.
6. **FireJet**, **GameState**, **Audio**.
7. **Render** — the pipeline below (+ hurt/fade uniforms).
8. **UI** — HUD, minimap.

## Render pipeline

| # | Pass | Target | Layers | Notes |
|---|------|--------|--------|-------|
| 1 | **Shadow** | `WebGLCubeRenderTarget` RGBA16F, 512² (Low 256²) | WORLD + CAGE | Override material writes radial distance from the flame. Cleared to 1000 m. Chunked geometry lets each face cull. |
| 2 | **Reflection** | RGBA16F, ½ res (Low 0.3) | WORLD + VIEWMODEL + FX | Mirrored camera about y = 0 with oblique near-plane clipping (Reflector math). Full ink shading, so reflections are hatched too. |
| 3 | **Main (MRT)** | 2× RGBA16F + depth texture | all | `out0` HDR colour, `out1` view normal (xyz) + band light term (a). Transparent FX write `out1 = 0` with blending so the G-buffer is untouched. |
| 4 | **Fog** | RGBA16F, ½ res (Low ⅓) | — | Ray clipped to the light's range sphere; 28 steps (Low 12) with IGN jitter; cube-shadow test + 3D noise per step; HG phase. Out: R in-scatter, G transmittance, B linear depth. |
| 5 | **Bloom** | ½ res chain, 5 levels (Low 3) | — | Bright pass (threshold 1.6 HDR: only the flame and hot embers), dual-Kawase down/up. |
| 6 | **Composite** | screen | — | Wobbly depth+normal outlines (visibility × light term) → bilateral fog upsample → bloom → luminance print (exposure, contrast, paper, grain, vignette, posterize) → palette ramp → sRGB + dither. Debug views live here. |

### Why these choices

* **Hatching in the surface shader, world-anchored**, not a screen-space overlay:
  screen-space hatch swims when the camera moves, which kills the print illusion.
  Triplanar + distance LOD gives stable strokes with near-constant on-screen density.
* **Cube distance shadow map** instead of three's built-in point-light shadows:
  we own the custom shaders and also need the same map in the fog raymarcher.
* **MRT G-buffer** so outlines can use real normals and the band light term
  ("outlines where light touches") without a second geometry pass.
* **Palette as a luminance ramp in the final pass** makes the four-colour rule a
  guarantee rather than a guideline, and makes palette exploration one slider.
* **Fog clipped to the light sphere**: the only participating light is the lantern,
  so marching outside its range is wasted work.

## Extending

* **Systems**: anything with `update(dt, time, engine)` → `engine.add(system, 'name')`; shared
  objects on `engine.services`.
* **Events**: `footstep, drip, focus, focusToggle, pump, blastStart, blastEnd, burnout, rekindled,
  beaconLit, allLit, escaped, playerHit, hurt, monsterGrowl, monsterFrozen, monsterKilled, died, won`.
* **New room kinds**: add to `KINDS` in `Dungeon.js` and a branch in `dressRoom`.
* **New monster types**: add to `TYPES` in `Monsters.js` (geometry builder, speed, hp, radius).
* **Tuning**: `GameConfig.js`.

## Performance notes

* A level is ≈ 70k triangles in ~70 chunks; chains are one `InstancedMesh` per chain (36-tri links)
  with a fixed bounding sphere so they cull. The shadow cube's far plane follows the light range.
* Per frame on High: ≈ 170–230 draw calls, ≈ 0.16–0.22M triangles across all 8 scene
  renders (6 cube faces + reflection + main).
* Fragment cost is dominated by the main pass (5-tap cube PCF + hatching) and the
  fog march; hatch work is skipped outside the mid/lit bands.
* **Low** preset: 0.8 pixel ratio cap, 256² shadow, 1-tap shadow, 0.3 reflection,
  ⅓-res 12-step fog, 3 bloom levels, fewer embers.
* Budgets were designed for a mid-range laptop GPU at 1080p / 60 fps. They were
  **not measured on real hardware** during this phase (the build machine only had a
  software rasteriser) — check the FPS counter and switch to Low if needed.

## Review log (issues found while building each layer, and the fixes)

| Layer | Problem found | Fix |
|-------|---------------|-----|
| Lighting | Attenuation fell off so fast that walls 5 m away were below the ink threshold. | Broad-core falloff `1/(1+0.08d²)` × smooth range window. |
| Engine | First rAF timestamp precedes `start()` → negative dt → every exponential smoother diverged (focus = 504, light intensity = 900, black frames). | Clamp dt to `[0, 1/20]`. |
| Fog | Haze filled the whole frame: rays from the eye pass centimetres from a hand-held light. | Near-eye fade (0.6–2.2 m), `atten^1.5` weighting, much lower density. |
| Viewmodel | Open shutters stuck out as dark "wings" and threw a huge wedge shadow over the water. | Shutters slide below the lantern when open; they only join the shadow layer when closed. |
| Viewmodel | A decorative wire ring at flame height cast a horizontal black band across every wall. | Removed. |
| Hatching | Lit-band gouges read as wood grain. | Gouges clustered into chisel patches along the hatch direction + masonry joints for stone. |
| Shader | `patch` is a reserved word in GLSL ES 3.0 → world shader failed to compile. | Renamed. |
| Water | Reflection posterisation rounded faint reflections down to zero. | Earlier first step; higher reflectivity. |
| Water | Oil contours read as a topographic map / caustics. | Screen-constant hairlines, torn by noise, gated by oil patches and light. |
| Water | Reflected embers appeared as dotted copies (discrete stretch taps). | Per-pixel IGN jitter of the tap offsets. |
| Creatures | Inside of the open cloak flared cream at the hem (fresnel on back faces). | Back faces are never rimmed. |
| Embers | In beam mode, embers took the beam's ×3 intensity and bloomed into blobs. | Ember heat depends on flame proximity only. |
| Perf | 680k tris/frame: one merged room mesh drawn whole into all 6 cube faces; chains at 100 tris/link. | Chunked merge for culling; 64-tri links. |
| Chains (v2) | Unculled chain links were drawn into all 8 passes: 640k tris/frame. | One culled InstancedMesh per chain, 36-tri links; shadow far = light range → ~200k. |
| Monster AI | BFS paths hugged walls; monsters wedged on doorway jambs and piers. | Weighted Dijkstra field (props impassable, wall-adjacent cells expensive) + sidestep when stuck. |
| Monster AI | Weighted distances exceeded the aggro radius, so monsters only wandered. | Aggro on weighted distance 55 or direct sight within 16 m. |
| Readability | Charged and frozen creatures looked alike (thin rim only). | Charge engraves ember hatching into the body; frozen = white-hot cross-hatch. |
| Blast | Fire particles saturated into a cream blob hiding the target. | Fewer, smaller, dimmer tongues; emitted ahead of the lantern. |
