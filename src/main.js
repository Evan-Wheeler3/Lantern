// Lanternkeeper — entry point.
//   (no params)      the shrine: choose a depth, buy upgrades
//   ?round=N         descend into depth N (the toll is paid at the shrine)
//   ?dev=1           look-dev panel + FPS        ?free=1  skip the toll check (testing)
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { settings, loadSettings } from './core/Settings.js';
import { GAME } from './core/GameConfig.js';
import { progress, saveProgress, markSeen } from './core/Progress.js';
import { roundConfig, ROUNDS } from './data/rounds.js';
import { storyFor } from './data/story.js';
import { Pipeline } from './renderer/Pipeline.js';
import { shared } from './renderer/SharedUniforms.js';
import { World } from './world/World.js';
import { Beacons } from './world/Beacons.js';
import { Doors } from './world/Doors.js';
import { StoryRoom } from './world/StoryRoom.js';
import { PlayerController } from './player/PlayerController.js';
import { Lantern } from './player/Lantern.js';
import { Monsters } from './game/Monsters.js';
import { FireJet } from './game/FireJet.js';
import { Firebomb } from './game/Firebomb.js';
import { OilSpills } from './game/OilSpills.js';
import { Economy } from './game/Economy.js';
import { Interactions } from './game/Interactions.js';
import { applyLoadout } from './game/Loadout.js';
import { GameState } from './game/GameState.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';
import { Plates } from './ui/Plate.js';
import { AimOverlay } from './ui/AimOverlay.js';
import { Shrine, consumePaidTicket } from './ui/Shrine.js';

const params = new URLSearchParams(location.search);
const dev = params.get('dev') === '1';
if (params.get('quality')) settings.quality = params.get('quality') === 'Low' ? 'Low' : 'High';
try {
  const saved = params.get('settings');
  if (saved) loadSettings(atob(saved));
} catch (e) {
  console.warn('bad settings param', e);
}

// ---- which depth? A paid ticket (or a cleared depth) is needed to descend. ----
let roundN = Number(params.get('round')) || 0;
if (roundN) {
  const paid = consumePaidTicket(roundN) || roundN <= progress.passed || roundConfig(roundN).fee === 0 || params.get('free') === '1';
  if (!paid) roundN = 0;
}
const atShrine = !roundN;
const round = roundConfig(roundN || Math.min(progress.passed + 1, ROUNDS.length));
const abilities = applyLoadout(round);
const story = storyFor(round.n, round.seed);
const seed = round.seed;

const canvas = document.getElementById('view');
const engine = new Engine();
const pipeline = new Pipeline(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.player.fov, 1, 0.03, 70);
scene.add(camera);

const interactions = new Interactions();
const world = new World(scene, engine.events, seed, round);
world.water.bindReflection(pipeline.reflection);
const beacons = new Beacons(scene, world, engine.events, interactions);
const doors = new Doors(scene, world, engine.events, interactions, beacons);
const game = new GameState(engine.events, beacons.total, seed);
const economy = new Economy(engine.events);
const plates = new Plates(game, engine.events);
const storyRoom = new StoryRoom(scene, world, engine.events, interactions, beacons, story, plates);
const player = new PlayerController(camera, world, engine.events, canvas);
const lantern = new Lantern(camera, engine.events);
const oil = new OilSpills(scene, world, engine.events, interactions, economy);
const firebomb = new Firebomb(scene, world, engine.events, interactions, economy, lantern);
const monsters = new Monsters(scene, world, engine.events, seed, round, { firebomb, drips: world.drips });
const fire = new FireJet(scene);
const audio = new AudioSystem(engine.events);
const hud = new HUD();
const aim = new AimOverlay();
const minimap = new Minimap(world.dungeon, engine.events, beacons, doors, oil);
lantern.canBlast = abilities.has('blast');
firebomb.enabled = abilities.has('throw');

Object.assign(engine.services, {
  pipeline, scene, camera, world, beacons, doors, game, player, lantern, monsters, audio, hud, minimap,
  interactions, economy, firebomb, oil, plates, storyRoom, round, abilities,
});

// Screenshot / test hooks: ?cam=x,y,z,yawDeg,pitchDeg  &focus=1  &play=1
const camParam = params.get('cam');
if (camParam) {
  const [x, y, z, yaw, pitch] = camParam.split(',').map(Number);
  player.feet.set(x, y, z);
  player.yaw = (yaw * Math.PI) / 180;
  player.pitch = (pitch * Math.PI) / 180;
}
if (params.get('focus') === '1') engine.events.emit('focusToggle');

monsters.spawnInitial(player.feet);

const _right = new THREE.Vector3();
const ctxFor = () => ({ collecting: oil.collecting, priming: firebomb.priming, charging: firebomb.state === 'charging', charge: firebomb.charge });
engine.add({
  update: (dt) => {
    player.enabled = (game.state === 'playing' || game.state === 'title') && !game.paused;
    player.inputBlocked = game.paused;
    player.update(dt);
  },
}, 'playerSystem');
engine.add({ update: (dt) => interactions.update(dt, player, game) }, 'interactionSystem');
engine.add({ update: (dt) => oil.update(dt) }, 'oilSystem');
engine.add({
  update: (dt, t) => {
    // draft hint: once unbarred, the flame leans toward the great door
    const d = doors.draftDir(player.feet);
    if (d) {
      _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      lantern.lean = (d.x * _right.x + d.z * _right.z) * 0.9;
    } else lantern.lean = 0;
    lantern.update(dt, t, player, game, ctxFor());
  },
}, 'lanternSystem');
engine.add({ update: (dt, t) => firebomb.update(dt, t, player, game, camera) }, 'firebombSystem');
engine.add({ update: (dt, t) => beacons.update(dt, t) }, 'beaconSystem');
engine.add({ update: (dt, t) => doors.update(dt, t) }, 'doorSystem');
engine.add({ update: (dt, t) => storyRoom.update(dt, t) }, 'storySystem');
engine.add({ update: (dt, t) => monsters.update(dt, t, player, lantern, game) }, 'monsterSystem');
engine.add(world, 'worldSystem');
engine.add({ update: (dt) => fire.update(dt, lantern) }, 'fireSystem');
engine.add({ update: (dt) => game.update(dt) }, 'gameSystem');
engine.add(audio, 'audioSystem');
engine.add({
  update: (dt, t) => {
    const u = pipeline.composite.pass.uniforms;
    u.uHurt.value = game.hurt;
    u.uFade.value = atShrine ? 0.55 : game.fade;
    u.uFadeTo.value = game.state === 'won' ? 1 : 0;
    pipeline.shadowFar = shared.uLightRange.value + 1.5;
    pipeline.render(scene, camera, t);
  },
  resize: (w, h) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pipeline.resize(w, h);
  },
}, 'renderSystem');
engine.add({
  update: (dt) => {
    hud.update(game, lantern, { beacons, interactions, economy, abilities, firebomb, doors, round });
    minimap.update(dt, player);
    aim.update(firebomb, camera);
  },
}, 'uiSystem');

if (dev) {
  const { FpsCounter } = await import('./debug/FpsCounter.js');
  const { DebugPanel } = await import('./debug/DebugPanel.js');
  const fps = new FpsCounter(pipeline.renderer);
  engine.add({ update: () => fps.update() }, 'fpsSystem');
  engine.services.debug = new DebugPanel(engine);
}

const onResize = () => engine.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onResize);
onResize();

// ---- run outcome: settle the oil sack ----
engine.events.on('won', () => {
  economy.settle(true);
  progress.passed = Math.max(progress.passed, round.n);
  saveProgress();
});
engine.events.on('died', () => economy.settle(false));
for (const ev of ['died', 'won']) engine.events.on(ev, () => setTimeout(() => document.exitPointerLock?.(), 1500));
engine.events.on('readSanctum', () => plates.show(story.door));
engine.events.on('doorUnlocked', () => game.say('Somewhere a great bar falls. Your flame leans toward it.', 4));
engine.events.on('notEnoughOil', () => game.say(`Not enough oil to douse the lantern (${GAME.throwCost}).`, 2));

// ---- screens ----
const overlay = document.getElementById('overlay');
const shrineEl = document.getElementById('shrine');
const begin = () => {
  audio.start();
  overlay.classList.add('hidden');
  canvas.requestPointerLock?.();
  if (game.state === 'title') {
    game.start(`Kindle the ${beacons.total} beacons. The great door will unbar.`);
    // first visit: the chapter's opening page, then any new ability's lesson
    const intro = `intro-${round.n}`;
    if (!progress.seen.includes(intro) && story.intro) { plates.show(story.intro, 'story'); markSeen(intro); }
    if (story.teach && !progress.seen.includes(`teach-${story.teach.id}`)) { plates.show(story.teach, 'teach'); markSeen(`teach-${story.teach.id}`); }
  }
};
if (atShrine) {
  overlay.classList.add('hidden');
  shrineEl.classList.remove('hidden');
  new Shrine(shrineEl);
} else {
  document.getElementById('chapter-n').textContent = `Depth ${round.n}`;
  document.getElementById('chapter-title').textContent = round.title;
  overlay.addEventListener('click', begin);
  canvas.addEventListener('click', () => { audio.start(); if (game.state === 'title') begin(); });
}
engine.events.on('pointerlock', (locked) => {
  if (game.state === 'playing' && !game.paused) overlay.classList.toggle('hidden', locked);
});
document.addEventListener('pointerlockerror', () => console.warn('Pointer lock refused; click the canvas to retry.'));
if (params.get('overlay') === '0') overlay.classList.add('hidden');
if (params.get('play') === '1' && !atShrine) begin();

document.getElementById('end-shrine').addEventListener('click', () => {
  const p = new URLSearchParams(location.search);
  p.delete('round');
  location.search = p.toString();
});

window.__lk = engine; // console access
window.__lkSettings = settings;
engine.start();
