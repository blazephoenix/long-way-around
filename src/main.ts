import './style.css';
import { App } from './ui/app';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
if (new URLSearchParams(location.search).has('gallery')) {
  // asset gallery: every model on one lot, no game
  import('./gallery/gallery').then((g) => g.startGallery(canvas, ui));
} else {
  const app = new App(canvas, ui);
  (window as any).__app = app;
  app.boot();
}
import * as subjects from '../data/subjects';
(window as any).__subjects = subjects;
import { FEATURES } from './core/features';
(window as any).__features = FEATURES;
import * as sites from './world/sites';
(window as any).__sites = sites;
import { buildRoadChunkGen } from './world/chunkBuild';
(window as any).__chunkGen = buildRoadChunkGen;
