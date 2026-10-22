// Shared materials for road life. People live in peopleModels.ts, vehicles in vehicleModels.ts.
import * as THREE from 'three';
import { toon } from './toon';

export const lifeMat = toon({ vertexColors: true });
export const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
