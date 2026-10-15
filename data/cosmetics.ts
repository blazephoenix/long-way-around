// Car cosmetics. Purchases add expression, never power. Prices tuned with the economy sim.
// `stand: true` items are sold only at specific roadside stands (one per stand).
// `unlock` items come from journal milestones. `india` items arrive with milestone 7.

export type Slot = 'paint' | 'dash' | 'hang' | 'seat' | 'wheel' | 'bumper' | 'sticker';

export interface Cosmetic {
  id: string;
  name: string;
  slot: Slot;
  price: number;
  colors?: [number, number];
  stand?: boolean;
  unlock?: boolean;
  india?: boolean;
  note?: string;
}

export const SLOT_NAMES: Record<Slot, string> = {
  paint: 'Paint',
  dash: 'Dashboard',
  hang: 'Mirror hanging',
  seat: 'Seat covers',
  wheel: 'Steering wheel cover',
  bumper: 'Bumper charm',
  sticker: 'Rear windshield sticker',
};

export const COSMETICS: Cosmetic[] = [
  // paint (colours: body, roof)
  { id: 'paint-lake', name: 'Lake blue', slot: 'paint', price: 0, colors: [0x2f6f8f, 0xf2efe6] },
  { id: 'paint-moss', name: 'Moss green', slot: 'paint', price: 90, colors: [0x4f7a4a, 0xece6d4] },
  { id: 'paint-chalk', name: 'Chalk white', slot: 'paint', price: 85, colors: [0xeeeae0, 0xeeeae0] },
  { id: 'paint-sunset', name: 'Sunset orange', slot: 'paint', price: 140, colors: [0xe0703a, 0xf2e6d0] },
  { id: 'paint-plum', name: 'Plum', slot: 'paint', price: 170, colors: [0x6a3a5a, 0x6a3a5a] },
  { id: 'paint-cream-teal', name: 'Cream & teal two-tone', slot: 'paint', price: 280, colors: [0x2f8a86, 0xf0e4c4] },
  { id: 'paint-mint', name: 'Mint & white two-tone', slot: 'paint', price: 320, colors: [0x9ad8bf, 0xffffff] },
  { id: 'paint-night', name: 'Night sky', slot: 'paint', price: 600, colors: [0x1b2740, 0x3c4a66] },
  { id: 'paint-aurora', name: 'Aurora pearl', slot: 'paint', price: 2000, colors: [0x7fd8c0, 0xc8a8f0], note: 'The long-haul prize.' },
  { id: 'paint-sedan', name: 'Vintage sedan white', slot: 'paint', price: 220, colors: [0xf4f0e2, 0xf4f0e2], india: true },
  { id: 'paint-hatch', name: 'Family hatchback red', slot: 'paint', price: 240, colors: [0xb8302a, 0xb8302a], india: true },
  { id: 'paint-taxi', name: 'Taxi yellow-black', slot: 'paint', price: 420, colors: [0x1a1a1a, 0xf2c230], india: true },
  { id: 'paint-ghat', name: 'Monsoon green', slot: 'paint', price: 0, colors: [0x2f7a4a, 0xe8e2c8], unlock: true },
  { id: 'paint-dune', name: 'Dune sand', slot: 'paint', price: 0, colors: [0xd9b48a, 0x8a5a3a], unlock: true },

  // dashboard
  { id: 'dash-dog', name: 'Nodding dog', slot: 'dash', price: 80 },
  { id: 'dash-plant', name: 'Tiny succulent', slot: 'dash', price: 95 },
  { id: 'dash-cat', name: 'Cat figurine', slot: 'dash', price: 120 },
  { id: 'dash-shell', name: 'Seashell', slot: 'dash', price: 0, unlock: true },
  { id: 'dash-cactus', name: 'Pocket cactus', slot: 'dash', price: 0, unlock: true },
  { id: 'dash-ganesha', name: 'Ganesha figurine', slot: 'dash', price: 150, india: true },
  { id: 'dash-buddha', name: 'Buddha figurine', slot: 'dash', price: 150, india: true },
  { id: 'dash-cross', name: 'Small wooden cross', slot: 'dash', price: 150, india: true },
  { id: 'dash-tasbih', name: 'Prayer beads (tasbih)', slot: 'dash', price: 150, india: true },
  { id: 'dash-khanda', name: 'Khanda emblem', slot: 'dash', price: 150, india: true },
  { id: 'dash-bat', name: 'Mini cricket bat', slot: 'dash', price: 130, india: true },
  { id: 'dash-auto', name: 'Toy auto-rickshaw', slot: 'dash', price: 160, india: true },

  // mirror hangings
  { id: 'hang-pine', name: 'Pine air freshener', slot: 'hang', price: 80 },
  { id: 'hang-beads', name: 'Wooden beads', slot: 'hang', price: 110 },
  { id: 'hang-lantern', name: 'Tiny lantern', slot: 'hang', price: 190 },
  { id: 'hang-feather', name: 'Heron feather', slot: 'hang', price: 0, unlock: true },
  { id: 'hang-rudraksha', name: 'Rudraksha-style beads', slot: 'hang', price: 140, india: true },
  { id: 'hang-tassel', name: 'Tasselled charm', slot: 'hang', price: 120, india: true },
  { id: 'hang-eye', name: 'Mini evil-eye', slot: 'hang', price: 100, india: true },

  // seats
  { id: 'seat-plaid', name: 'Plaid seat covers', slot: 'seat', price: 150, colors: [0x8a3a3a, 0x2a4a3a] },
  { id: 'seat-sheep', name: 'Woolly seat covers', slot: 'seat', price: 230, colors: [0xefe6d4, 0xe2d6c0] },
  { id: 'seat-beads', name: 'Bead-massage covers', slot: 'seat', price: 170, colors: [0x9a7a52, 0x6a5232], india: true },
  { id: 'seat-floral', name: 'Floral print covers', slot: 'seat', price: 150, colors: [0xd86a7a, 0xf2d27a], india: true },

  // steering wheel covers
  { id: 'wheel-leather', name: 'Brown leather cover', slot: 'wheel', price: 120, colors: [0x6a4028, 0x6a4028] },
  { id: 'wheel-knit', name: 'Knitted stripes cover', slot: 'wheel', price: 160, colors: [0xe8a03a, 0x3a7a8a] },
  { id: 'wheel-fur', name: 'Fuzzy cover', slot: 'wheel', price: 0, colors: [0xc8a8e0, 0xc8a8e0], unlock: true },

  // bumper
  { id: 'bumper-nimbu', name: 'Nimbu-mirchi charm', slot: 'bumper', price: 80, india: true, note: 'Lemon and chillies on a thread.' },

  // rear sticker (original lines in the family-car-sticker tradition)
  { id: 'sticker-prayers', name: 'Sticker: "On the road thanks to Amma\'s prayers"', slot: 'sticker', price: 85, india: true },
  { id: 'sticker-slow', name: 'Sticker: "Slow is also a speed"', slot: 'sticker', price: 85, india: true },
  { id: 'sticker-chai', name: 'Sticker: "Will stop for chai"', slot: 'sticker', price: 85, india: true },

  // stand-only rarities
  { id: 'dash-owl', name: 'Carved owl', slot: 'dash', price: 260, stand: true },
  { id: 'hang-bell', name: 'Brass bell', slot: 'hang', price: 220, stand: true },
  { id: 'hang-shells', name: 'Shell string', slot: 'hang', price: 200, stand: true },
  { id: 'dash-kite', name: 'Paper kite', slot: 'dash', price: 240, stand: true, india: true },
  { id: 'seat-ikat', name: 'Handwoven ikat covers', slot: 'seat', price: 380, stand: true, india: true, colors: [0x2f4f8a, 0xd8a03a] },
  { id: 'paint-copper', name: 'Copper patina', slot: 'paint', price: 900, stand: true, colors: [0x5aa08a, 0xb8764a] },
  { id: 'wheel-cane', name: 'Woven cane cover', slot: 'wheel', price: 280, stand: true, colors: [0xc8a46a, 0xa8844a] },
];

export const COSMETIC_BY_ID: Record<string, Cosmetic> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

/** Journal milestones (25/50/75/100% of a page) unlock these, in order, per biome. */
export const JOURNAL_UNLOCKS: Record<string, string[]> = {
  forest: ['hang-feather', 'paint-moss', 'dash-owl', 'paint-night'],
  coast: ['dash-shell', 'hang-shells', 'paint-cream-teal', 'paint-mint'],
  desert: ['dash-cactus', 'paint-dune', 'paint-sunset', 'paint-copper'],
  farm: ['wheel-fur', 'dash-plant', 'seat-plaid', 'paint-chalk'],
  tropical: ['paint-ghat', 'hang-bell', 'wheel-cane', 'seat-ikat'],
  city: ['dash-cat', 'hang-lantern', 'wheel-knit', 'paint-plum'],
  roadside: ['hang-pine', 'dash-dog', 'wheel-leather', 'seat-sheep'],
  ghat: ['hang-tassel', 'dash-kite', 'seat-floral', 'paint-taxi'],
};
