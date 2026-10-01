// Live look-dev panel: every style parameter, quality toggle, debug views,
// copy / paste settings as JSON. Toggle with H.
import GUI from 'lil-gui';
import { settings, settingsToJSON, loadSettings, resetSettings, DEFAULTS } from '../core/Settings.js';

export class DebugPanel {
  constructor(engine) {
    this.engine = engine;
    const pipeline = engine.services.pipeline;
    const gui = (this.gui = new GUI({ title: 'Lanternkeeper — Ink & Ember', width: 320 }));
    const s = settings;

    const actions = {
      copy: () => this.copy(),
      paste: () => {
        const txt = window.prompt('Paste settings JSON');
        if (!txt) return;
        try {
          loadSettings(txt);
          this.refresh();
          pipeline.setQuality(settings.quality);
        } catch (e) {
          alert('Invalid JSON: ' + e.message);
        }
      },
      reset: () => {
        resetSettings();
        this.refresh();
        pipeline.setQuality(settings.quality);
      },
      focus: () => engine.events.emit('focusToggle'),
    };
    const top = gui.addFolder('General');
    top.add(s, 'quality', ['High', 'Low']).name('Quality').onChange((v) => pipeline.setQuality(v));
    top.add(pipeline, 'debugView', { Final: 0, 'Raw colour': 1, Normals: 2, 'Light band': 3, 'Fog (R) / T (G)': 4, Outlines: 5, 'NaN check': 6 }).name('View');
    top.add(actions, 'focus').name('Toggle beam (click / F)');
    top.add(actions, 'copy').name('📋 Copy settings as JSON');
    top.add(actions, 'paste').name('Paste settings JSON');
    top.add(actions, 'reset').name('Reset to defaults');

    const pal = gui.addFolder('Palette');
    pal.addColor(s.palette, 'ink');
    pal.addColor(s.palette, 'oil');
    pal.addColor(s.palette, 'ember');
    pal.addColor(s.palette, 'cream');

    const li = gui.addFolder('Lantern light');
    li.add(s.light, 'intensity', 0, 4, 0.01);
    li.add(s.light, 'range', 2, 20, 0.1);
    li.add(s.light, 'focusIntensity', 0, 8, 0.01).name('beam intensity');
    li.add(s.light, 'focusRange', 4, 40, 0.1).name('beam range');
    li.add(s.light, 'focusAngle', 4, 45, 0.5).name('beam angle°');
    li.add(s.light, 'focusLeak', 0, 0.5, 0.005).name('shutter leak');
    li.add(s.light, 'flicker', 0, 1.5, 0.01).name('flame flicker');
    li.add(s.light, 'flickerSpeed', 0.1, 3, 0.01).name('flicker speed');
    li.add(s.light, 'jitter', 0, 0.08, 0.001).name('flame wander (m)');
    li.add(s.light, 'shadowBias', 0, 0.2, 0.001);
    li.add(s.light, 'cageShadows').name('lantern casts shadows');

    const bands = gui.addFolder('Toon bands');
    bands.add(s.bands, 'low', 0, 0.5, 0.001).name('ink | mid');
    bands.add(s.bands, 'high', 0.05, 1.5, 0.001).name('mid | ember');
    bands.add(s.bands, 'hot', 0.2, 3, 0.001).name('ember | cream');
    bands.add(s.bands, 'softness', 0, 0.1, 0.001);
    bands.add(s.bands, 'noise', 0, 1, 0.01).name('carved edges');
    bands.add(s.bands, 'midTone', 0, 1, 0.01).name('mid tone');
    bands.add(s.bands, 'specThreshold', 0.05, 2, 0.01).name('wet glint cut');
    bands.add(s.bands, 'specPower', 4, 200, 1).name('wet glint tightness');

    const h = gui.addFolder('Hatching');
    h.add(s.hatch, 'enabled');
    h.add(s.hatch, 'density', 4, 80, 0.5).name('lines / m');
    h.add(s.hatch, 'thickness', 0.05, 1, 0.01);
    h.add(s.hatch, 'wobble', 0, 1, 0.01);
    h.add(s.hatch, 'angle', -90, 90, 1).name('angle°');
    h.add(s.hatch, 'angleVar', 0, 45, 0.5).name('angle shift° (dark)');
    h.add(s.hatch, 'crossStart', 0, 1, 0.01).name('cross-hatch from');
    h.add(s.hatch, 'lodDistance', 0.5, 15, 0.1).name('LOD distance');
    h.add(s.hatch, 'litStrokes', 0, 1, 0.01).name('gouges in light');
    h.add(s.hatch, 'breakup', 0, 1, 0.01).name('stroke breakup');

    const o = gui.addFolder('Ink outlines');
    o.add(s.outline, 'width', 0, 5, 0.05).name('width px');
    o.add(s.outline, 'depthThreshold', 0.002, 0.3, 0.001).name('depth threshold');
    o.add(s.outline, 'normalThreshold', 0.02, 1.5, 0.01).name('normal threshold');
    o.add(s.outline, 'wobble', 0, 6, 0.05).name('wobble px');
    o.add(s.outline, 'wobbleFreq', 0.5, 40, 0.1).name('wobble freq');
    o.add(s.outline, 'boilFps', 0, 24, 1).name('line boil fps');
    o.add(s.outline, 'darkVisibility', 0, 1, 0.01).name('in darkness');
    o.add(s.outline, 'darkGlow', 0, 0.3, 0.001).name('ember edges in dark');

    const w = gui.addFolder('Oily water');
    w.add(s.water, 'reflectivity', 0, 2, 0.01);
    w.add(s.water, 'distortion', 0, 0.2, 0.001);
    w.add(s.water, 'stretch', 0, 0.4, 0.001).name('vertical stretch');
    w.add(s.water, 'ripple', 0, 3, 0.01).name('ripple strength');
    w.add(s.water, 'sheen', 0, 1.5, 0.01).name('oil sheen');
    w.add(s.water, 'sheenScale', 0.2, 4, 0.01).name('sheen scale');
    w.add(s.water, 'sheenSpeed', 0, 5, 0.01).name('sheen drift');
    w.add(s.water, 'glint', 0, 4, 0.01).name('flame glint');
    w.add(s.water, 'bands', 0, 10, 1).name('reflection bands');
    w.add(s.water, 'hatch', 0, 1, 0.01).name('engraved lines');

    const f = gui.addFolder('Atmosphere');
    f.add(s.fog, 'density', 0, 1, 0.005);
    f.add(s.fog, 'intensity', 0, 4, 0.01);
    f.add(s.fog, 'noiseScale', 0.05, 3, 0.01).name('noise scale');
    f.add(s.fog, 'noise', 0, 1, 0.01).name('noise amount');
    f.add(s.fog, 'heightFalloff', 0, 2, 0.01).name('height falloff');
    f.add(s.fog, 'anisotropy', -0.5, 0.9, 0.01);
    f.add(s.fog, 'extinction', 0, 3, 0.01);
    f.add(s.particles, 'embers', 0, 1.5, 0.01).name('ember amount');
    f.add(s.particles, 'emberSize', 0.2, 3, 0.01).name('ember size');
    f.add(s.particles, 'dripRate', 0, 4, 0.01).name('drip rate');

    const c = gui.addFolder('Shadow creatures');
    c.add(s.creatures, 'rimPower', 0.5, 8, 0.05).name('rim power');
    c.add(s.creatures, 'rimThreshold', 0.05, 1, 0.005).name('rim threshold');
    c.add(s.creatures, 'rimBase', 0, 1, 0.005).name('rim w/o light');

    const p = gui.addFolder('Post / print');
    p.add(s.post, 'exposure', 0.2, 3, 0.01);
    p.add(s.post, 'contrast', 0.5, 2.5, 0.01);
    p.add(s.post, 'bloom', 0, 3, 0.01).name('flame bloom');
    p.add(s.post, 'bloomThreshold', 0.5, 8, 0.05).name('bloom threshold');
    p.add(s.post, 'bloomRadius', 0.3, 3, 0.01).name('bloom radius');
    p.add(s.post, 'grain', 0, 0.3, 0.001).name('film grain');
    p.add(s.post, 'paper', 0, 1, 0.01).name('paper texture');
    p.add(s.post, 'vignette', 0, 1, 0.01);
    p.add(s.post, 'paletteStrength', 0, 1, 0.01).name('palette lock');
    p.add(s.post, 'posterize', 0, 12, 1).name('posterize steps');

    const pl = gui.addFolder('Player');
    pl.add(s.player, 'sensitivity', 0.1, 3, 0.01);
    pl.add(s.player, 'walkSpeed', 0.5, 5, 0.01).name('walk speed');
    pl.add(s.player, 'sprintMultiplier', 1, 3, 0.01).name('sprint ×');
    pl.add(s.player, 'bob', 0, 2, 0.01).name('head bob');
    pl.add(s.player, 'sway', 0, 2, 0.01).name('lantern sway');
    pl.add(s.player, 'fov', 50, 100, 0.5);

    const a = gui.addFolder('Audio');
    a.add(s.audio, 'master', 0, 1.5, 0.01);
    a.add(s.audio, 'drone', 0, 1.5, 0.01);
    a.add(s.audio, 'drips', 0, 1.5, 0.01);
    a.add(s.audio, 'crackle', 0, 1.5, 0.01).name('flame crackle');
    a.add(s.audio, 'footsteps', 0, 1.5, 0.01);
    a.add(s.audio, 'reverb', 0, 1.5, 0.01);

    for (const folder of gui.folders) if (folder !== top && folder !== pal && folder !== bands && folder !== h) folder.close();

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && !(e.target instanceof HTMLInputElement)) gui.show(gui._hidden);
    });
    this.defaults = DEFAULTS;
  }

  refresh() {
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  async copy() {
    const json = settingsToJSON();
    try {
      await navigator.clipboard.writeText(json);
      this.toast('Settings copied to clipboard');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = json;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      this.toast('Settings copied (fallback)');
    }
    console.log(json);
  }

  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }
}
