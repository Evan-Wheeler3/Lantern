# Lanternkeeper — "Ink and Ember"

A first-person descent through a drowned, procedurally generated undercroft, lit only by the lantern
in your hand and rendered like a woodcut print.

**Objective:** kindle the 5 dead beacons scattered through the rooms. When the last one catches, the
sealed door unseals: find it and walk out. Shadow creatures hunt you in the dark between the beacons.
Three touches and your flame goes out.

![Hunted](docs/screenshots/01_hunted.png)

| | |
|---|---|
| ![Frozen in the beam](docs/screenshots/02_frozen.png) | ![Kindled beacon](docs/screenshots/03_kindled.png) |
| ![The exit opens](docs/screenshots/04_exit.png) | ![Map](docs/screenshots/05_map.png) |

## Run

Requires Node 18+.

```bash
npm install
npm run dev          # http://localhost:5173
# or a production build:
npm run build && npm run preview
```

Use a desktop browser with WebGL2 (Chrome, Edge, Firefox, Safari 16+). The renderer also needs the
`EXT_color_buffer_float` extension, which nearly every desktop GPU provides.

## Controls

| Input | Action |
|-------|--------|
| Click | Take up the lantern (pointer lock + audio) and begin |
| **W A S D** / arrows | Wade |
| **Shift** | Hurry |
| Mouse | Look |
| **Left click** / **F** | Shutter the lantern: focused beam ⟷ wide glow |
| **Right click** (hold) | Off-hand blast: drive fire through the lantern |
| **Space** (mash) | Pump oil into a burnt-out lantern |
| **E** (hold) | Kindle a beacon |
| **M** (hold) | Full map |
| Esc | Release the mouse |

## How it plays

* **Wide glow** slows the shadows. The **focused beam** holds them still and *charges* them: an
  ember outline and hatching burn into the body, getting thicker the longer you hold it. At full
  charge they **freeze for 5 seconds** (white-hot cross-hatching) even after the beam leaves them.
* **Fire blast** (right click) burns any shadow in a short cone in front of you; frozen ones burn
  faster. It forces the light into the beam and drains the fire meter (about 1 second from full). Run it
  dry and the lantern **burns out**: dim, no beam or blast for ~4 s, or less if you mash Space.
* **Beacons** become permanent room lights and sanctuaries. Shadows will not enter a kindled room,
  and kindling one restores one lost flame.
* **Minimap** (top right) reveals what your lantern has seen; kindled rooms are gilded.
* Every run is a new seed. The end card offers a new descent or the same dark again.

## URL parameters

| Param | Example | Effect |
|-------|---------|--------|
| `seed` | `?seed=1234` | Replay a specific dungeon |
| `quality` | `?quality=Low` | Low preset (lower resolution, cheaper shadows/fog) |
| `dev` | `?dev=1` | Look-dev panel (every style slider, copy JSON) + FPS counter |
| `cam` / `focus` / `play` / `overlay` | `?cam=0,-0.22,0,0,0&play=1&overlay=0` | Testing / screenshots |

The style is locked to the defaults in `src/core/Settings.js`. The look-dev panel is still there
behind `?dev=1` if you want to tune it. Gameplay numbers live in `src/core/GameConfig.js`.

## Documents

* [`STYLE_GUIDE.md`](STYLE_GUIDE.md): the rules of the look (palette, bands, hatching, outlines, water, creatures).
* [`ARCHITECTURE.md`](ARCHITECTURE.md): module layout, the render pipeline pass by pass, extension points
  for gameplay, performance notes, and the review log of issues found and fixed while building each layer.

## Tech summary

Three.js r186 on WebGL2 with custom `ShaderMaterial`s throughout, plus a hand-rolled post pipeline:
cube-map distance shadows from the flame → planar water reflection → MRT main pass (HDR colour +
normal/light G-buffer + depth) → half-res raymarched volumetric light → flame-only dual-Kawase bloom →
composite (ink outlines, fog, bloom, paper/grain/vignette, 4-colour palette ramp).
All geometry, textures and audio are procedural; there are no asset files.
