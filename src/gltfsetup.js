// gltfsetup.js — every GLTFLoader in the game decodes meshopt-compressed models (Tripo assets in assets/models are
// meshopt + webp optimised by the asset pipeline), without each module having to configure its own loader.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const _parse = GLTFLoader.prototype.parse;
GLTFLoader.prototype.parse = function (...args) { if (!this.meshoptDecoder) this.setMeshoptDecoder(MeshoptDecoder); return _parse.apply(this, args); };
