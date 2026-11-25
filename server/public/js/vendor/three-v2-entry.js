import * as THREE_NS from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);

const THREE = Object.assign({}, THREE_NS);
THREE.GLTFLoader = GLTFLoader;
THREE.OBJLoader = OBJLoader;
THREE.KTX2Loader = KTX2Loader;
THREE.IS_THREE_V2 = true;

if (typeof THREE.sRGBEncoding === 'undefined' && THREE.SRGBColorSpace !== undefined) {
    THREE.sRGBEncoding = THREE.SRGBColorSpace;
}
if (typeof THREE.LinearEncoding === 'undefined' && THREE.NoColorSpace !== undefined) {
    THREE.LinearEncoding = THREE.NoColorSpace;
}

if (MeshoptDecoder) {
    g.MeshoptDecoder = MeshoptDecoder;
    if (typeof window !== 'undefined') window.MeshoptDecoder = MeshoptDecoder;
}

g.THREE = THREE;
if (typeof window !== 'undefined') window.THREE = THREE;
