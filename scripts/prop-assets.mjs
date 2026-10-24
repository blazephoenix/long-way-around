// Builds the structure asset files (src/assets/props/*.glb).
//   node scripts/prop-assets.mjs
// Sources are downloaded once into .cache/prop-src/ from Poly Pizza. Each model is baked to flat faces
// with linear vertex colours, in metres, standing on y = 0, split into the parts the game moves.
// - windturbine: "Wind Turbine" by Colin Hopkins (CC-BY 3.0). Two nodes: `tower` (tower, base,
//   nacelle) and `rotor` (hub, spinner, blades), the rotor's origin at the hub, its blades turning
//   about z and facing -z.
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld } from '@gltf-transform/functions';

const SRC = '.cache/prop-src';
const OUT = 'src/assets/props';
const PP = 'https://static.poly.pizza/';

const PROPS = {
  windturbine: {
    id: 'e2cb636f-0964-41a1-bc67-a64ce770ed2b',
    // hub height in metres (the game's turbines stand about this tall at the hub)
    hub: 34.5,
    // source nodes that turn with the rotor
    rotor: ['group1027479694', 'group895107068', 'group1638284413', 'group319097306', 'group2091045647'],
    // the hub's centre in source units
    centre: [0, 0.73, -0.12],
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

async function source(name, id) {
  const file = path.join(SRC, `${name}.glb`);
  if (!fs.existsSync(file)) {
    const res = await fetch(PP + id + '.glb');
    if (!res.ok) throw new Error(`download ${name}: ${res.status}`);
    fs.mkdirSync(SRC, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return io.read(file);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, spec] of Object.entries(PROPS)) {
  const src = await source(name, spec.id);
  // the base's bottom is the ground; scale so the hub stands at spec.hub
  let minY = Infinity;
  const v = [0, 0, 0];
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const P = p.getAttribute('POSITION');
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); minY = Math.min(minY, m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]); }
    }
  }
  const k = spec.hub / (spec.centre[1] - minY);
  const parts = { tower: { pos: [], col: [] }, rotor: { pos: [], col: [] } };
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const rotor = spec.rotor.includes(node.getName());
    const out = parts[rotor ? 'rotor' : 'tower'];
    // the rotor about its hub; the tower from the ground up
    const o = rotor ? spec.centre : [0, minY, 0];
    for (const p of mesh.listPrimitives()) {
      const P = p.getAttribute('POSITION'), I = p.getIndices();
      const f = p.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const n = I ? I.getCount() : P.getCount();
      for (let t = 0; t < n; t++) {
        P.getElement(I ? I.getScalar(t) : t, v);
        const w = [0, 1, 2].map((a) => m[a] * v[0] + m[4 + a] * v[1] + m[8 + a] * v[2] + m[12 + a]);
        out.pos.push((w[0] - o[0]) * k, (w[1] - o[1]) * k, (w[2] - o[2]) * k);
        out.col.push(lin(f[0]), lin(f[1]), lin(f[2]));
      }
    }
  }
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene();
  for (const [part, { pos, col }] of Object.entries(parts)) {
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(col)).setBuffer(buf));
    const node = doc.createNode(part).setMesh(doc.createMesh(part).addPrimitive(prim));
    if (part === 'rotor') node.setTranslation([spec.centre[0] * k, spec.hub, spec.centre[2] * k]);
    scene.addChild(node);
  }
  // left uncompressed (a few KB) so the rotor node keeps the hub as its exact origin
  await doc.transform(weld());
  const file = path.join(OUT, `${name}.glb`);
  await io.write(file, doc);
  console.log(`${file}: ${(fs.statSync(file).size / 1024).toFixed(1)} KB, tower ${parts.tower.pos.length / 9} tris, rotor ${parts.rotor.pos.length / 9} tris, scale ${k.toFixed(2)}`);
}
