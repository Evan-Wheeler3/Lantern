// Pass 2: planar reflection of the world in the water (y = waterLevel), rendered
// from a mirrored camera with an oblique near plane (port of three's Reflector math).
import * as THREE from 'three';
import { LAYERS } from '../Layers.js';

const _plane = new THREE.Plane();
const _normal = new THREE.Vector3(0, 1, 0);
const _reflPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _lookAt = new THREE.Vector3();
const _view = new THREE.Vector3();
const _target = new THREE.Vector3();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();

export class ReflectionPass {
  constructor(waterLevel = 0) {
    this.waterLevel = waterLevel;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.disableAll();
    this.camera.layers.enable(LAYERS.WORLD);
    this.camera.layers.enable(LAYERS.VIEWMODEL);
    this.camera.layers.enable(LAYERS.FX);
    this.textureMatrix = new THREE.Matrix4();
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
  }

  setSize(w, h) {
    this.rt.setSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  render(renderer, scene, camera) {
    _reflPos.set(0, this.waterLevel, 0);
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    _view.subVectors(_reflPos, _camPos);
    if (_view.dot(_normal) > 0) return; // camera below the water: skip

    _rot.extractRotation(camera.matrixWorld);
    _lookAt.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);

    _view.reflect(_normal).negate().add(_reflPos);
    _target.subVectors(_reflPos, _lookAt).reflect(_normal).negate().add(_reflPos);

    const vc = this.camera;
    vc.position.copy(_view);
    vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    vc.lookAt(_target);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    // Oblique near plane = the water plane, so nothing below the surface leaks in.
    _plane.setFromNormalAndCoplanarPoint(_normal, _reflPos).applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = vc.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + e[8]) / e[0];
    _q.y = (Math.sign(_clip.y) + e[9]) / e[5];
    _q.z = -1.0;
    _q.w = (1.0 + e[10]) / e[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    e[2] = _clip.x;
    e[6] = _clip.y;
    e[10] = _clip.z + 1.0 - 0.003;
    e[14] = _clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.render(scene, vc);
  }
}
