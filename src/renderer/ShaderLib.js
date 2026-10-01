// Registers our GLSL chunks with three's #include resolver and exposes sources.
import * as THREE from 'three';

import common from '../shaders/common.glsl?raw';
import lighting from '../shaders/lighting.glsl?raw';
import ink from '../shaders/ink.glsl?raw';

import worldVert from '../shaders/world.vert.glsl?raw';
import worldFrag from '../shaders/world.frag.glsl?raw';
import creatureFrag from '../shaders/creature.frag.glsl?raw';
import waterVert from '../shaders/water.vert.glsl?raw';
import waterFrag from '../shaders/water.frag.glsl?raw';
import flameVert from '../shaders/flame.vert.glsl?raw';
import flameFrag from '../shaders/flame.frag.glsl?raw';
import embersVert from '../shaders/embers.vert.glsl?raw';
import embersFrag from '../shaders/embers.frag.glsl?raw';
import dripsVert from '../shaders/drips.vert.glsl?raw';
import dripsFrag from '../shaders/drips.frag.glsl?raw';
import shadowVert from '../shaders/shadowDepth.vert.glsl?raw';
import shadowFrag from '../shaders/shadowDepth.frag.glsl?raw';
import fullscreenVert from '../shaders/fullscreen.vert.glsl?raw';
import fogFrag from '../shaders/fog.frag.glsl?raw';
import bloomBrightFrag from '../shaders/bloomBright.frag.glsl?raw';
import bloomDownFrag from '../shaders/bloomDown.frag.glsl?raw';
import bloomUpFrag from '../shaders/bloomUp.frag.glsl?raw';
import compositeFrag from '../shaders/composite.frag.glsl?raw';

THREE.ShaderChunk.lk_common = common;
THREE.ShaderChunk.lk_lighting = lighting;
THREE.ShaderChunk.lk_ink = ink;

export const SHADERS = {
  worldVert, worldFrag, creatureFrag, waterVert, waterFrag, flameVert, flameFrag,
  embersVert, embersFrag, dripsVert, dripsFrag, shadowVert, shadowFrag,
  fullscreenVert, fogFrag, bloomBrightFrag, bloomDownFrag, bloomUpFrag, compositeFrag,
};
