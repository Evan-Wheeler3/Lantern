// Lanternkeeper — style prototype entry point. Wires systems into the engine.
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { settings, loadSettings } from './core/Settings.js';
import { Pipeline } from './renderer/Pipeline.js';
import { World } from './world/World.js';
import { PlayerController } from './player/PlayerController.js';
import { Lantern } from './player/Lantern.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { DebugPanel } from './debug/DebugPanel.js';
import { FpsCounter } from './debug/FpsCounter.js';

const params = new URLSearchParams(location.search);
if (params.get('quality')) settings.quality = params.get('quality') === 'Low' ? 'Low' : 'High';
try {
  const saved = params.get('settings');
  if (saved) loadSettings(atob(saved));
} catch (e) {
  console.warn('bad settings param', e);
}

const canvas = document.getElementById('view');
const engine = new Engine();
const pipeline = new Pipeline(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.player.fov, 1, 0.03, 90);
scene.add(camera);

const world = new World(scene, engine.events);
world.water.bindReflection(pipeline.reflection);
const player = new PlayerController(camera, world, engine.events, canvas);
const lantern = new Lantern(camera, engine.events);
const audio = new AudioSystem(engine.events);
const fps = new FpsCounter(pipeline.renderer);

Object.assign(engine.services, { pipeline, scene, camera, world, player, lantern, audio });

// Optional deterministic camera for screenshots: ?cam=x,y,z,yawDeg,pitchDeg&focus=1
const camParam = params.get('cam');
if (camParam) {
  const [x, y, z, yaw, pitch] = camParam.split(',').map(Number);
  player.feet.set(x, y, z);
  player.yaw = (yaw * Math.PI) / 180;
  player.pitch = (pitch * Math.PI) / 180;
}
if (params.get('focus') === '1') engine.events.emit('focusToggle');

// System order matters: input -> lantern (drives the light) -> world -> audio -> render.
engine.add({ update: (dt) => player.update(dt) }, 'playerSystem');
engine.add({ update: (dt, t) => lantern.update(dt, t, player) }, 'lanternSystem');
engine.add(world, 'worldSystem');
engine.add(audio, 'audioSystem');
engine.add({
  update: (dt, t) => pipeline.render(scene, camera, t),
  resize: (w, h) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pipeline.resize(w, h);
  },
}, 'renderSystem');
engine.add({ update: (dt) => fps.update(dt) }, 'fpsSystem');

if (params.get('gui') !== '0') engine.services.debug = new DebugPanel(engine);

const onResize = () => engine.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onResize);
onResize();

// Title card: first click locks the pointer and starts audio (needs a gesture).
const overlay = document.getElementById('overlay');
canvas.addEventListener('click', () => audio.start());
overlay.addEventListener('click', () => {
  audio.start();
  canvas.requestPointerLock?.();
});
engine.events.on('pointerlock', (locked) => overlay.classList.toggle('hidden', locked));
if (params.get('overlay') === '0') overlay.classList.add('hidden');

window.__lk = engine; // console access for look-dev
window.__lkSettings = settings;
engine.start();
