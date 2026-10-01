# Lanternkeeper — Architecture

Style prototype built on Three.js (WebGL2) with a custom multi-pass pipeline and
hand-written GLSL. No external assets: every mesh, texture and sound is procedural.

```
index.html            title card, CSS, canvas
src/
  main.js             composition root: builds systems, registers them with the Engine
  core/
    Engine.js         clock + ordered list of systems (update/resize), service registry
    EventBus.js       pub/sub between systems (footstep, drip, focusToggle, focus, pointerlock)
    Settings.js       every style knob + quality presets; JSON load/save
    noise.js          deterministic CPU noise (geometry displacement, textures)
  renderer/
    Pipeline.js       pass orchestration, render targets, quality/resize
    Layers.js         render-layer contract (WORLD / VIEWMODEL / CAGE / WATER / FX)
    SharedUniforms.js one uniform set referenced by every material; settings -> uniforms
    Materials.js      material factories (world, creature, water, flame, embers, drips, shadow)
    ShaderLib.js      registers GLSL chunks (#include <lk_*>) and exports sources
    ProceduralTextures.js  64^3 noise volume, paper texture
    passes/           ShadowPass, ReflectionPass, FogPass, BloomPass, CompositePass, FullscreenPass
  shaders/            *.glsl (imported with Vite ?raw)
    common.glsl       hashes, value noise, IGN, sRGB
    lighting.glsl     the lantern: attenuation, beam cone, cube-shadow PCF
    ink.glsl          band model, hatching, gouges, masonry  ("the look")
    world.*.glsl      stone/iron/leather/viewmodel
    creature.frag     black mass + rim
    water.*.glsl      reflection, ripples, glint, oil film
    flame/embers/drips/shadowDepth/fog/bloom*/composite
  world/
    World.js          the room as a system: owns dynamic pieces, answers spatial queries
    Cathedral.js      procedural layout + geometry, colliders, walkables, drip/beacon/chain anchors
    geo.js            geometry helpers (pointed arches, vaults, limbs, displacement, chunked merge)
    Creatures.js      shadow creature silhouettes
    Chains.js         instanced swinging chains + gibbet cage
    Water.js, Ripples.js, Drips.js, Embers.js
  player/
    PlayerController.js   pointer lock, WASD, sprint, wading inertia, collision, bob, footsteps
    Lantern.js            viewmodel, flicker, sway pendulum, shutters, DRIVES the light uniforms
  audio/
    AudioSystem.js    Web Audio synthesis: drone, crackle, drips, footsteps, shutter, convolution reverb
  debug/
    DebugPanel.js     lil-gui look-dev panel, copy/paste JSON
    FpsCounter.js     fps / ms / draw calls / triangles
```

## Frame order

Systems run in registration order each `requestAnimationFrame`:

1. **Player** — input, movement, collision, head bob, emits `footstep`.
2. **Lantern** — flicker, focus, sway; writes `uLightPos / Intensity / Range / SpotDir / Focus / LightColor`.
3. **World** — chains swing, drips fall (emit `drip`), embers, water params.
4. **Audio** — listener follows camera, crackle scheduler.
5. **Render** — the pipeline below.
6. **FPS** overlay.

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

## Extending toward gameplay

* **New systems** — anything with `update(dt, time, engine)` → `engine.add(system, 'name')`.
  Shared objects are on `engine.services` (`world`, `player`, `lantern`, `pipeline`, `audio`, `camera`, `scene`).
* **Events** — `engine.events.on('footstep' | 'drip' | 'focus' | 'focusToggle' | 'pointerlock', fn)`.
  AI can listen to footsteps; beacons can listen to focus.
* **Spatial queries** — `world.blocked(x, z, r, feetY)`, `world.groundHeight(x, z)`,
  `world.surfaceHeight(x, z)`; data in `world.colliders`, `world.walkables`.
* **Beacons** — `world.beacons` lists anchor positions (`kind: 'tripod' | 'great'`).
  Lighting one = a second light. The lighting chunk is single-light by design;
  the intended extension is a small fixed array (`uBeaconPos[3]`, `uBeaconLit[3]`)
  added to `lk_lighting`, each with its own cheap shadow (or none: beacons are
  static, so their cube maps can be rendered once and cached).
* **Creatures** — currently static meshes with the creature material. Animation can
  move the mesh or add skinning; the shader needs only normals for the rim.
* **Ripples** — `world.water.ripples.add(x, z, strength)` from anything (wading AI, thrown objects).
* **Settings** — add a key to `DEFAULTS`, read it where needed, add a slider in
  `DebugPanel.js`. JSON copy/paste picks it up automatically.

## Performance notes

* Static architecture is merged into ~20 spatial chunks (one draw call each, culled
  per pass); total ≈ 30k triangles. Chains are one `InstancedMesh` (~570 links × 64 tris).
* Per frame on High: ≈ 140–170 draw calls, ≈ 0.45M triangles across all 9 scene
  renders (6 cube faces + reflection + main), dominated by the shadow cube.
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
