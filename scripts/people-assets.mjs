// Builds the people asset files (src/assets/people-*.glb) from Quaternius CC0 characters.
//   node scripts/people-assets.mjs
// Sources are downloaded once into .cache/people-src/ from Poly Pizza's mirror of the Quaternius
// packs (Ultimate Modular Men / Women, Animated Men / Women). Each output file is one "family":
// a template character (skeleton + the few clips we use) plus the head/body/legs/feet meshes of
// every other character that shares that skeleton, so the game can mix parts per person.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const SRC = '.cache/people-src';
const OUT = 'src/assets';
const PP = 'https://static.poly.pizza/';

// family -> template + characters; parts to skip per character
const FAMILIES = {
  man: {
    clips: /\|(Idle|Idle_Neutral|Walk|Wave|Interact)$/,
    chars: {
      casual: '90a9e2d4-053f-42f1-99a2-8f5e1180ea7f', // template (first)
      beach: 'f771a536-1c18-4a47-bb56-ceea4b603455',
      farmer: '81f2f0cf-6f53-4b57-92ea-dba0928620f2',
      hoodie: 'bcd66ec5-5e81-4901-a222-47abc875fe2a',
      adventurer: 'bbe369ee-a686-42c7-adad-14356f5f2f15',
      punk: 'e56f23b5-3270-406f-8924-f77cad980c43',
    },
    skip: { adventurer: /Backpack/, punk: /Head/ },
  },
  woman: {
    clips: /\|(Idle|Idle_Neutral|Walk|Wave|Interact)$/,
    chars: {
      formal: '46d6db5a-3c9f-4238-8cdf-8eb7194498dc', // template
      adventurer: '69689495-028d-4b81-8678-792338a5693e',
      suit: '1bd7759c-ab76-4178-8fe6-7706dffa7d5f',
      worker: 'c0253218-85f2-4d67-b3f2-a4611a7901fe',
      soldier: '66a55d04-4286-44a3-b289-0d774c27db5b',
    },
    skip: {},
  },
  boy: {
    clips: /\|Man_(Idle|Walk|Sitting|Clapping)$/,
    chars: { man: '3746be88-6799-4817-929b-6bc067c47caa' },
    skip: {},
  },
  girl: {
    clips: /\|Female_(Idle|Walk|Sitting|Clapping)$/,
    chars: {
      casual: '51d5abdd-bb87-4b8d-9967-21738ffb8437', // template
      dress: 'a642af96-e239-4c5f-b50d-7661ff51deec',
    },
    skip: {},
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

async function source(family, name, id) {
  const file = path.join(SRC, `${family}-${name}.glb`);
  if (!fs.existsSync(file)) {
    const res = await fetch(PP + id + '.glb');
    if (!res.ok) throw new Error(`download ${name}: ${res.status}`);
    fs.mkdirSync(SRC, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return io.read(file);
}

/** part name from a source mesh node: Casual2_Body -> body, BaseHuman -> all */
function partOf(nodeName) {
  const m = /_(Head|Body|Legs|Pants|Feet)$/.exec(nodeName) ?? /^(Formad)_Head$/.exec(nodeName);
  if (!m) return 'all';
  return { Head: 'head', Body: 'body', Legs: 'legs', Pants: 'legs', Feet: 'feet' }[m[1]] ?? 'head';
}

function dropAnimation(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

await MeshoptEncoder.ready;
fs.mkdirSync(OUT, { recursive: true });
for (const [family, spec] of Object.entries(FAMILIES)) {
  const names = Object.keys(spec.chars);
  const doc = await source(family, names[0], spec.chars[names[0]]);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  // dispose a dropped clip's channels and samplers too, or prune() keeps their keyframe accessors
  for (const a of root.listAnimations()) if (!spec.clips.test(a.getName())) dropAnimation(a);
  for (const a of root.listAnimations()) a.setName(a.getName().replace(/^.*\|(Man_|Female_)?/, ''));
  // one skin shared by every part
  const meshNodes = root.listNodes().filter((n) => n.getMesh());
  const skin = meshNodes[0].getSkin();
  for (const n of meshNodes) {
    n.setSkin(skin);
    if (spec.skip[names[0]]?.test(n.getName())) { n.getMesh().dispose(); n.dispose(); continue; }
    n.setName(`part-${names[0]}-${partOf(n.getName())}`);
  }
  for (const name of names.slice(1)) {
    const src = await source(family, name, spec.chars[name]);
    for (const n of src.getRoot().listNodes()) {
      const mesh = n.getMesh();
      if (!mesh || spec.skip[name]?.test(n.getName())) continue;
      const map = copyToDocument(doc, src, [mesh]);
      const node = doc.createNode(`part-${name}-${partOf(n.getName())}`).setMesh(map.get(mesh)).setSkin(skin);
      scene.addChild(node);
    }
  }
  // the game recolours every primitive and shades flat, so normals, UVs and colours go
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) for (const s of ['NORMAL', 'TEXCOORD_0', 'COLOR_0']) p.setAttribute(s, null);
  for (const t of root.listTextures()) t.dispose();
  const [buffer, ...extra] = root.listBuffers();
  for (const a of root.listAccessors()) a.setBuffer(buffer);
  for (const b of extra) b.dispose();
  await doc.transform(prune({ keepLeaves: false }), dedup(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }));
  const out = path.join(OUT, `people-${family}.glb`);
  await io.write(out, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  console.log(`${out}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${root.listMeshes().length} parts, ${tris} tris, clips ${root.listAnimations().map((a) => a.getName()).join(' ')}`);
}
