// Builds the animal asset files (src/assets/animals/*.glb).
//   node scripts/animal-assets.mjs
// Sources are downloaded once into .cache/animal-src/ from Poly Pizza:
// - ANIMALS: rigged Quaternius CC0 animals (Ultimate Animated Animals, Animated Fish). Each file keeps
//   the skinned mesh (recoloured at runtime by material) and the few clips the game plays.
// - STATICS: unrigged low-poly animals (Poly by Google, CC-BY 3.0; Quaternius 2019 OBJ, CC0). Each is
//   baked to one mesh with a flat colour per face (sampled from its texture), turned to face +z with
//   its feet on y = 0; the game rigs and animates them at load (render/animalRig.ts).
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const SRC = '.cache/animal-src';
const OUT = 'src/assets/animals';
const PP = 'https://static.poly.pizza/';

const ANIMALS = {
  deer: '4b6c2a41-43c7-404c-ae37-e8c4645ff93b',
  fox: 'e18e86df-1692-48d8-ac6e-1e25ab4ad574',
  cow: '382b3d4a-a7c9-4c03-9858-3df630d90047',
  bull: '5704ef69-2c27-4de8-a942-70a29458af21',
  horse: 'd37dbc87-ca61-4b2c-a2da-d2f0c4240bef',
  whale: '7300e697-2543-4a9a-a77d-dedf29251fd7',
  dog: 'ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77',
};
// species: uuid on static.poly.pizza, or a zip + OBJ path; yaw (radians) turns the model to face +z
const STATICS = {
  tiger: { id: '460ff96a-ea48-4b39-b38c-d0c7daa06a3c', yaw: 0 },
  elephant: { id: '2bc73032-37c9-4276-a620-437df45db428', yaw: 0 },
  monkey: { id: '69e0460d-0909-4f00-9b81-9499c6345d1c', yaw: 0 },
  camel: { id: '3f877d62-5891-4de2-8324-ff602bdb1b1a', yaw: 0 },
  sambar: { id: '0dac29e1-fae0-4cad-b117-03b6c0dbbd37', yaw: 0 },
  jackal: { id: 'a75b3f4b-80d4-4361-b53e-135c09827f43', yaw: 0 },
  turtle: { id: '7c64cc2c-b9aa-4edd-bc32-9e95d66ca5e0', yaw: 0 },
  blackbuck: { id: 'a69377b7-683a-4441-a831-92f10fd620e1', yaw: 0 },
  cat: { id: '5d32eb38-9546-4ce4-aa77-bcef9328ee61', yaw: 0 },
};
// the clips the game plays (walking, fleeing, standing, grazing, swimming)
const CLIPS = /^(Walk|Gallop|Idle|Eating|Swim)$/;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

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

/** dispose a clip with its channels and samplers, so prune() drops its keyframes */
function dropAnimation(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

await MeshoptEncoder.ready;
fs.mkdirSync(OUT, { recursive: true });
for (const [name, id] of Object.entries(ANIMALS)) {
  const doc = await source(name, id);
  const root = doc.getRoot();
  // Poly Pizza's copies carry every clip twice (plain and 'AnimalArmature|'-prefixed); keep the plain set
  // (the fish only have prefixed ones)
  const plain = new Set(root.listAnimations().map((a) => a.getName()).filter((n) => !n.includes('|')));
  const seen = new Set();
  for (const a of root.listAnimations()) {
    const clip = a.getName().replace(/^.*\|/, '');
    if ((a.getName().includes('|') && plain.has(clip)) || !CLIPS.test(clip) || seen.has(clip)) { dropAnimation(a); continue; }
    a.setName(clip);
    seen.add(clip);
  }
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) for (const s of ['NORMAL', 'TEXCOORD_0', 'COLOR_0']) p.setAttribute(s, null);
  for (const t of root.listTextures()) t.dispose();
  const [buffer, ...extra] = root.listBuffers();
  for (const a of root.listAccessors()) a.setBuffer(buffer);
  for (const b of extra) b.dispose();
  await doc.transform(prune({ keepLeaves: false }), dedup(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }));
  const out = path.join(OUT, `${name}.glb`);
  await io.write(out, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  const mats = root.listMaterials().map((m) => m.getName()).join(' ');
  console.log(`${out}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${tris} tris, clips ${[...seen].join(' ')} | ${mats}`);
}

// ------------------------------------------------------------------ statics
function decodeImage(img) {
  const bytes = Buffer.from(img.getImage());
  const mime = img.getMimeType();
  if (mime === 'image/png') { const p = PNG.sync.read(bytes); return { w: p.width, h: p.height, data: p.data }; }
  const j = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 1024 });
  return { w: j.width, h: j.height, data: j.data };
}

/** srgb byte -> linear float, like three's Color.setHex (vertex colours are linear) */
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

for (const [name, spec] of Object.entries(STATICS)) {
  const src = await source(name, spec.id);
  const pos = [], col = [];
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices();
      const mat = prim.getMaterial(), f = mat?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const tex = mat?.getBaseColorTexture() ? decodeImage(mat.getBaseColorTexture()) : null;
      const n = I ? I.getCount() : P.getCount();
      const v = [0, 0, 0], uv = [0, 0];
      for (let t = 0; t < n; t += 3) {
        // one colour per face: the texel under the face's UV centre (textures here are palettes or paint)
        let cu = 0, cv = 0;
        const ids = [0, 1, 2].map((k) => (I ? I.getScalar(t + k) : t + k));
        for (const i of ids) {
          P.getElement(i, v);
          const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
          pos.push(x, y, z);
          if (UV) { UV.getElement(i, uv); cu += uv[0] / 3; cv += uv[1] / 3; }
        }
        let rgb = [f[0], f[1], f[2]];
        if (tex) {
          const px = Math.min(tex.w - 1, Math.max(0, Math.floor((cu - Math.floor(cu)) * tex.w)));
          const py = Math.min(tex.h - 1, Math.max(0, Math.floor((cv - Math.floor(cv)) * tex.h)));
          const o = (py * tex.w + px) * 4;
          rgb = [lin(tex.data[o]) * f[0], lin(tex.data[o + 1]) * f[1], lin(tex.data[o + 2]) * f[2]];
        }
        for (let k = 0; k < 3; k++) col.push(...rgb);
      }
    }
  }
  // face +z, centre on x/z, feet on y = 0
  const c = Math.cos(spec.yaw), s = Math.sin(spec.yaw);
  for (let i = 0; i < pos.length; i += 3) { const x = pos[i], z = pos[i + 2]; pos[i] = x * c + z * s; pos[i + 2] = -x * s + z * c; }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
  for (let i = 0; i < pos.length; i += 3) { pos[i] -= (lo[0] + hi[0]) / 2; pos[i + 1] -= lo[1]; pos[i + 2] -= (lo[2] + hi[2]) / 2; }
  const doc = new Document();
  const buf = doc.createBuffer();
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(col)).setBuffer(buf));
  doc.createScene().addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT, `${name}.glb`);
  await io.write(out, doc);
  console.log(`${out}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${pos.length / 9} tris, size ${(hi[0] - lo[0]).toFixed(2)} x ${(hi[1] - lo[1]).toFixed(2)} x ${(hi[2] - lo[2]).toFixed(2)}`);
}
