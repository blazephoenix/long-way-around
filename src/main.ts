import './style.css';
import { App } from './ui/app';

const app = new App(document.getElementById('c') as HTMLCanvasElement, document.getElementById('ui') as HTMLElement);
(window as any).__app = app;
app.boot();
import * as subjects from '../data/subjects';
(window as any).__subjects = subjects;
import { FEATURES } from './core/features';
(window as any).__features = FEATURES;
import * as sites from './world/sites';
(window as any).__sites = sites;
import { buildRoadChunkGen } from './world/chunkBuild';
(window as any).__chunkGen = buildRoadChunkGen;
