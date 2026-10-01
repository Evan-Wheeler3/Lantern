// Lanternkeeper — entry point. Wires systems into the engine.
//   ?seed=1234   replay a specific dungeon      ?dev=1   look-dev panel + FPS
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { settings, loadSettings } from './core/Settings.js';
import { GAME } from './core/GameConfig.js';
import { Pipeline } from './renderer/Pipeline.js';
import { shared } from './renderer/SharedUniforms.js';
import { World } from './world/World.js';
import { Beacons } from './world/Beacons.js';
import { PlayerController } from './player/PlayerController.js';
import { Lantern } from './player/Lantern.js';
import { Monsters } from './game/Monsters.js';
import { FireJet } from './game/FireJet.js';
import { GameState } from './game/GameState.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';

const params = new URLSearchParams(location.search);
const dev = params.get('dev') === '1';
if (params.get('quality')) settings.quality = params.get('quality') === 'Low' ? 'Low' : 'High';
try {
  const saved = params.get('settings');
  if (saved) loadSettings(atob(saved));
} catch (e) {
  console.warn('bad settings param', e);
}
const seed = Number(params.get('seed')) || (Math.random() * 1e6) | 0;

const canvas = document.getElementById('view');
const engine = new Engine();
const pipeline = new Pipeline(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.player.fov, 1, 0.03, 70);
scene.add(camera);

const world = new World(scene, engine.events, seed);
world.water.bindReflection(pipeline.reflection);
const beacons = new Beacons(scene, world, engine.events);
const game = new GameState(engine.events, beacons.total, seed);
const player = new PlayerController(camera, world, engine.events, canvas);
const lantern = new Lantern(camera, engine.events);
const monsters = new Monsters(scene, world, engine.events, seed);
const fire = new FireJet(scene);
const audio = new AudioSystem(engine.events);
const hud = new HUD();
const minimap = new Minimap(world.dungeon, engine.events, beacons);

Object.assign(engine.services, { pipeline, scene, camera, world, beacons, game, player, lantern, monsters, audio });

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

// Order: input -> lantern (drives the light) -> beacons -> monsters -> world -> fx -> audio -> render -> UI
engine.add({ update: (dt) => { player.enabled = game.state === 'playing' || game.state === 'title'; player.update(dt); } }, 'playerSystem');
engine.add({ update: (dt, t) => lantern.update(dt, t, player, game) }, 'lanternSystem');
engine.add({ update: (dt, t) => beacons.update(dt, t, player, game) }, 'beaconSystem');
engine.add({ update: (dt, t) => monsters.update(dt, t, player, lantern, game) }, 'monsterSystem');
engine.add(world, 'worldSystem');
engine.add({ update: (dt) => fire.update(dt, lantern) }, 'fireSystem');
engine.add({ update: (dt) => game.update(dt) }, 'gameSystem');
engine.add(audio, 'audioSystem');
engine.add({
  update: (dt, t) => {
    const u = pipeline.composite.pass.uniforms;
    u.uHurt.value = game.hurt;
    u.uFade.value = game.fade;
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
engine.add({ update: (dt) => { hud.update(game, lantern, beacons); minimap.update(dt, player); } }, 'uiSystem');

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

// Title card: first click locks the pointer, starts audio and the run.
const overlay = document.getElementById('overlay');
document.getElementById('obj-count').textContent = String(GAME.beacons);
const begin = () => {
  audio.start();
  overlay.classList.add('hidden');
  canvas.requestPointerLock?.();
  game.start();
};
overlay.addEventListener('click', begin);
canvas.addEventListener('click', () => { audio.start(); if (game.state === 'title') begin(); });
engine.events.on('pointerlock', (locked) => {
  if (game.state === 'playing') overlay.classList.toggle('hidden', locked);
});
document.addEventListener('pointerlockerror', () => console.warn('Pointer lock refused; click the canvas to retry.'));
if (params.get('overlay') === '0') overlay.classList.add('hidden');
if (params.get('play') === '1') game.start();

// End card: another descent (new seed) or the same one again.
document.getElementById('end-new').addEventListener('click', () => {
  const p = new URLSearchParams(location.search);
  p.delete('seed');
  location.search = p.toString();
});
document.getElementById('end-retry').addEventListener('click', () => {
  const p = new URLSearchParams(location.search);
  p.set('seed', String(seed));
  location.search = p.toString();
});

window.__lk = engine; // console access
window.__lkSettings = settings;
engine.start();
