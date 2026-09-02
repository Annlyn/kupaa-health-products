import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { syncProductAggregates } from '../src/services/variant.service.js';
import 'dotenv/config';

const prisma = new PrismaClient();

/** Passwords that have appeared in this repo's docs and must never reach production. */
const INSECURE_DEFAULTS = new Set(['Admin@12345', 'admin', 'password', 'changeme']);
const uploadDir = path.resolve(process.cwd(), env.uploadDir);
const ensureUploadDir = () => fs.mkdirSync(uploadDir, { recursive: true });
ensureUploadDir();

/**
 * Demo imagery is generated locally as SVG so the storefront looks finished
 * without depending on any external CDN. Replace via Admin > Products.
 */
function writePlaceholder(slug, label, [from, to], { onlyIfMissing = false } = {}) {
  const file = `seed-${slug}.svg`;
  if (onlyIfMissing && fs.existsSync(path.join(uploadDir, file))) return `/uploads/${file}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="400" cy="330" r="150" fill="#ffffff" opacity="0.16"/>
  <rect x="330" y="250" width="140" height="300" rx="34" fill="#ffffff" opacity="0.92"/>
  <rect x="352" y="222" width="96" height="46" rx="16" fill="#ffffff" opacity="0.7"/>
  <rect x="352" y="330" width="96" height="8" rx="4" fill="${to}" opacity="0.5"/>
  <rect x="352" y="352" width="70" height="8" rx="4" fill="${to}" opacity="0.3"/>
  <text x="400" y="440" font-family="Georgia,serif" font-size="42" font-weight="bold" fill="${to}" text-anchor="middle">${label}</text>
  <text x="400" y="700" font-family="Helvetica,Arial,sans-serif" font-size="30" fill="#ffffff" opacity="0.85" text-anchor="middle" letter-spacing="6">KUPAA HEALTH</text>
</svg>`;
  fs.writeFileSync(path.join(uploadDir, file), svg);
  return `/uploads/${file}`;
}

const slugFor = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const PALETTES = [
  ['#0f766e', '#14b8a6'], ['#7c3aed', '#a78bfa'], ['#b45309', '#f59e0b'],
  ['#be123c', '#fb7185'], ['#1d4ed8', '#60a5fa'], ['#15803d', '#4ade80'],
  ['#0369a1', '#38bdf8'], ['#9333ea', '#c084fc'],
];

const categories = [
  { name: 'Vitamins & Supplements', slug: 'vitamins-supplements', sortOrder: 1, description: 'Daily essentials to fill the gaps in your diet — clinically dosed, third-party tested.' },
  { name: 'Ayurveda & Herbs', slug: 'ayurveda-herbs', sortOrder: 2, description: 'Time-tested Indian botanicals, standardised for consistent potency.' },
  { name: 'Protein & Fitness', slug: 'protein-fitness', sortOrder: 3, description: 'Clean protein and recovery nutrition for everyday training.' },
  { name: 'Immunity & Wellness', slug: 'immunity-wellness', sortOrder: 4, description: 'Support your defences through every season.' },
  { name: 'Personal Care', slug: 'personal-care', sortOrder: 5, description: 'Gentle, dermatologist-approved daily care.' },
  { name: 'Health Devices', slug: 'health-devices', sortOrder: 6, description: 'Home monitoring devices you can trust.' },
];

const products = [
  { c: 'vitamins-supplements', name: 'Vitamin D3 + K2 Softgels', sku: 'KUP-VD3', price: 549, mrp: 799, stock: 0, weightKg: 0.12, featured: true,
    variantLabel: 'Count',
    variants: [
      { name: '60 softgels', sku: 'KUP-VD3-060', price: 549, mrp: 799, stock: 120, weightKg: 0.12 },
      { name: '120 softgels', sku: 'KUP-VD3-120', price: 949, mrp: 1499, stock: 65, weightKg: 0.2 },
    ],
    short: '2000 IU vitamin D3 with MK-7 K2 for bone and immune support.',
    tags: 'vitamin d,bone health,immunity,softgel',
    desc: 'Each softgel delivers 2000 IU of cholecalciferol (D3) paired with 55 mcg of MK-7 menaquinone (K2). D3 raises serum calcium; K2 directs that calcium into bone rather than soft tissue. Cold-pressed olive oil base for absorption. 60 softgels, two months at one a day.' },

  { c: 'vitamins-supplements', name: 'Chelated Magnesium Glycinate 500mg', sku: 'KUP-MAG-090', price: 699, mrp: 949, stock: 84, weightKg: 0.24,
    short: 'Highly bioavailable magnesium for sleep, muscle recovery and calm.',
    tags: 'magnesium,sleep,recovery,calm',
    desc: 'Magnesium bound to glycine — far gentler on the gut than oxide or citrate forms. 90 tablets. Take two an hour before bed for sleep quality, or post-workout for cramp relief.' },

  { c: 'vitamins-supplements', name: 'Methylcobalamin B12 1500mcg Tablets', sku: 'KUP-B12-060', price: 429, mrp: 599, stock: 210, weightKg: 0.1,
    short: 'Active B12 in sublingual form — built for vegetarian diets.',
    tags: 'b12,vegetarian,energy,nerve health',
    desc: 'Vegetarian and vegan diets run short on B12. This sublingual tablet uses methylcobalamin, the form your body already uses, bypassing absorption issues in the gut. 60 tablets.' },

  { c: 'ayurveda-herbs', name: 'KSM-66 Ashwagandha 600mg Capsules', sku: 'KUP-ASH-060', price: 899, mrp: 1299, stock: 64, weightKg: 0.15, featured: true,
    short: 'Full-spectrum root extract, 5% withanolides, for stress and stamina.',
    tags: 'ashwagandha,stress,ayurveda,adaptogen,sleep',
    desc: 'KSM-66 is the most clinically studied ashwagandha extract available, drawn from roots only using a milk-free green chemistry process. 600mg per serving standardised to 5% withanolides. Studied for cortisol reduction, sleep quality and strength gains.' },

  { c: 'ayurveda-herbs', name: 'Organic Triphala Churna', sku: 'KUP-TRI', price: 349, mrp: 499, stock: 0, weightKg: 0.23,
    variantLabel: 'Pack size',
    variants: [
      { name: '200 g', sku: 'KUP-TRI-200', price: 349, mrp: 499, stock: 96, weightKg: 0.23 },
      { name: '500 g', sku: 'KUP-TRI-500', price: 749, mrp: 1099, stock: 54, weightKg: 0.55 },
    ],
    short: 'Classical three-fruit blend for digestion and gentle detox.',
    tags: 'triphala,digestion,ayurveda,gut health',
    desc: 'Amalaki, Bibhitaki and Haritaki in the traditional 1:1:1 ratio, sun-dried and stone-ground. Certified organic. One teaspoon in warm water at bedtime.' },

  { c: 'ayurveda-herbs', name: 'Curcumin 95% with Piperine (60 capsules)', sku: 'KUP-CUR-060', price: 749, mrp: 1099, stock: 72, weightKg: 0.13,
    short: 'Standardised turmeric extract with black pepper for 20x absorption.',
    tags: 'curcumin,turmeric,joint,inflammation,ayurveda',
    desc: '500mg of curcuminoids standardised to 95%, with 5mg BioPerine black pepper extract that raises bioavailability roughly twentyfold. For joint comfort and recovery.' },

  { c: 'protein-fitness', name: 'Whey Protein Isolate — Chocolate', sku: 'KUP-WPI', price: 1499, mrp: 1899, stock: 0, weightKg: 0.6, featured: true,
    variantLabel: 'Size',
    variants: [
      { name: '500 g', sku: 'KUP-WPI-500', price: 1499, mrp: 1899, stock: 42, weightKg: 0.62 },
      { name: '1 kg', sku: 'KUP-WPI-1000', price: 2699, mrp: 3499, stock: 38, weightKg: 1.15 },
      { name: '2 kg', sku: 'KUP-WPI-2000', price: 4999, mrp: 6799, stock: 12, weightKg: 2.2 },
    ],
    short: '27g protein, 0.5g sugar per scoop. Cold-filtered, lab tested.',
    tags: 'whey,protein,isolate,fitness,muscle',
    desc: 'Cross-flow microfiltered whey isolate at 90% protein by dry weight. 27g protein, 6.1g BCAA and under 1g carbohydrate per 30g scoop. Instantised so it mixes in a shaker without lumps. Every batch tested for heavy metals and banned substances.' },

  { c: 'protein-fitness', name: 'Plant Protein Blend — Vanilla', sku: 'KUP-PLP', price: 1249, mrp: 1599, stock: 0, weightKg: 0.58,
    variantLabel: 'Size',
    variants: [
      { name: '500 g', sku: 'KUP-PLP-500', price: 1249, mrp: 1599, stock: 30, weightKg: 0.58 },
      { name: '1 kg', sku: 'KUP-PLP-1000', price: 2199, mrp: 2899, stock: 45, weightKg: 1.12 },
    ],
    short: 'Pea, brown rice and pumpkin protein with a complete amino profile.',
    tags: 'plant protein,vegan,fitness,dairy free',
    desc: 'A 70:20:10 blend of pea, brown rice and pumpkin seed protein giving a complete essential amino acid profile. 24g protein per scoop, no dairy, no soy, sweetened with stevia.' },

  { c: 'protein-fitness', name: 'Micronised Creatine Monohydrate 250g', sku: 'KUP-CRE-250', price: 999, mrp: 1399, stock: 88, weightKg: 0.32,
    short: 'Creapure-grade creatine. 83 servings of 3g.',
    tags: 'creatine,strength,fitness,performance',
    desc: 'The single most evidence-backed sports supplement there is. Micronised for faster dissolution, unflavoured, mixes into anything. 3g daily, no loading phase needed.' },

  { c: 'immunity-wellness', name: 'Liposomal Vitamin C 1000mg', sku: 'KUP-VTC-060', price: 899, mrp: 1249, stock: 110, weightKg: 0.18,
    short: 'Phospholipid-encapsulated C for higher plasma levels, no acid reflux.',
    tags: 'vitamin c,immunity,antioxidant,skin',
    desc: 'Standard ascorbic acid saturates absorption quickly. Liposomal encapsulation carries vitamin C through the gut wall intact, raising plasma concentration without the stomach upset of high oral doses.' },

  { c: 'immunity-wellness', name: 'Zinc Picolinate 50mg + Quercetin', sku: 'KUP-ZNQ-090', price: 599, mrp: 849, stock: 130, weightKg: 0.14,
    short: 'The classic seasonal immune pairing, in one tablet.',
    tags: 'zinc,quercetin,immunity,seasonal',
    desc: 'Zinc picolinate is the best-absorbed zinc salt. Quercetin acts as a zinc ionophore, helping move zinc into cells. 90 tablets.' },

  { c: 'immunity-wellness', name: 'Omega-3 Fish Oil 1000mg (Triple Strength)', sku: 'KUP-OM3-060', price: 1099, mrp: 1599, stock: 76, weightKg: 0.22, featured: true,
    short: '660mg EPA + 440mg DHA, molecularly distilled, zero fishy burps.',
    tags: 'omega 3,fish oil,heart,brain,epa,dha',
    desc: 'Sourced from small cold-water fish and molecularly distilled to strip mercury, dioxins and PCBs. Triple-strength triglyceride form with an enteric coating so there is no aftertaste.' },

  { c: 'personal-care', name: 'Bhringraj & Rosemary Hair Oil 200ml', sku: 'KUP-HRO-200', price: 499, mrp: 699, stock: 92, weightKg: 0.28,
    short: 'Cold-pressed base with bhringraj, amla and rosemary essential oil.',
    tags: 'hair oil,bhringraj,rosemary,personal care',
    desc: 'Sesame and coconut base infused with bhringraj, amla, curry leaf and brahmi, finished with rosemary essential oil. Massage in an hour before washing, twice a week.' },

  { c: 'personal-care', name: 'Ceramide Barrier Repair Moisturiser 100g', sku: 'KUP-CRM-100', price: 849, mrp: 1199, stock: 58, weightKg: 0.16,
    short: 'Ceramides, niacinamide and hyaluronic acid. Fragrance free.',
    tags: 'moisturiser,ceramide,skin,barrier,fragrance free',
    desc: 'A 3:1:1 ceramide ratio matching the skin’s own lipid profile, with 4% niacinamide and multi-weight hyaluronic acid. Non-comedogenic, fragrance free, safe for compromised barriers.' },

  { c: 'health-devices', name: 'Digital BP Monitor — Upper Arm', sku: 'KUP-BPM-001', price: 2299, mrp: 3199, stock: 26, weightKg: 0.62,
    short: 'Clinically validated oscillometric monitor with 2x120 memory.',
    tags: 'bp monitor,blood pressure,device,health',
    desc: 'Validated to the ESH protocol. Wide-range cuff fits 22-42cm arms, irregular heartbeat detection, two user profiles with 120 readings each, and a backlit display readable in low light.' },

  { c: 'health-devices', name: 'Fingertip Pulse Oximeter', sku: 'KUP-OXI-001', price: 1299, mrp: 1899, stock: 41, weightKg: 0.09,
    short: 'SpO2 and pulse rate in eight seconds, OLED display.',
    tags: 'oximeter,spo2,device,health,monitoring',
    desc: 'Dual-wavelength LED sensor reads SpO2 to ±2% and pulse to ±2 bpm. Six-direction rotating OLED display, auto-off, works down to a 5kg fingertip. Two AAA batteries included.' },
];

const coupons = [
  { code: 'WELCOME10', description: '10% off your first order', type: 'PERCENT', value: 10, minOrder: 499, maxDiscount: 300 },
  { code: 'HEALTH500', description: '₹500 off orders above ₹2999', type: 'FLAT', value: 500, minOrder: 2999 },
  { code: 'FREESHIP', description: '₹59 off — shipping on us', type: 'FLAT', value: 59, minOrder: 0, usageLimit: 500 },
];

const SEED_VERSION = 1;
const MARKER_KEY = 'seed.catalogue';

/** Rewrites any seed placeholder SVG that has gone missing. Returns how many. */
function restorePlaceholders() {
  ensureUploadDir();
  let count = 0;

  categories.forEach((c, i) => {
    const file = path.join(uploadDir, `seed-cat-${c.slug}.svg`);
    if (!fs.existsSync(file)) {
      writePlaceholder(`cat-${c.slug}`, c.name.split(' ')[0], PALETTES[i % PALETTES.length]);
      count += 1;
    }
  });

  products.forEach((p, i) => {
    const slug = slugFor(p.name);
    const palette = PALETTES[i % PALETTES.length];
    for (const [key, label, colours] of [
      [slug, p.name.split(' ')[0], palette],
      [`${slug}-alt`, 'Kupaa', [palette[1], palette[0]]],
    ]) {
      if (!fs.existsSync(path.join(uploadDir, `seed-${key}.svg`))) {
        writePlaceholder(key, label, colours);
        count += 1;
      }
    }
  });

  return count;
}

async function main() {
  const reset = process.argv.includes('--reset') || process.env.SEED_RESET === '1';
  const marker = await prisma.setting.findUnique({ where: { key: MARKER_KEY } });

  console.log('Seeding Kupaa Health Products…');

  // --- admin + demo customer
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@kupaahealth.com').toLowerCase();

  // Never ship a known admin password. If ADMIN_PASSWORD is unset we generate a
  // strong one and print it exactly once, here, so it exists nowhere else.
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  // An explicit ADMIN_PASSWORD always wins — that is the documented way to reset
  // a lost admin password. With none set we only generate one for a brand new
  // admin; an existing account keeps whatever password it already has.
  const configured = process.env.ADMIN_PASSWORD || '';
  const generated = !configured && !existingAdmin;
  const adminPassword = configured || (generated ? crypto.randomBytes(12).toString('base64url') : null);

  if (configured && process.env.NODE_ENV === 'production' && INSECURE_DEFAULTS.has(configured)) {
    throw new Error('ADMIN_PASSWORD is set to a well-known default. Change it before seeding production.');
  }

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: 'ADMIN',
      isActive: true,
      // Only rewrite the hash when a password was actually supplied.
      ...(adminPassword ? { passwordHash: await bcrypt.hash(adminPassword, 12) } : {}),
    },
    create: {
      name: process.env.ADMIN_NAME || 'Kupaa Admin',
      email: adminEmail,
      phone: '9876543210',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'ADMIN',
    },
  });

  // Rotating the password must end every session opened with the old one.
  if (adminPassword && existingAdmin) {
    await prisma.refreshToken.updateMany({
      where: { userId: existingAdmin.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const customer = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      name: 'Priya Raman',
      email: 'customer@example.com',
      phone: '9812345678',
      passwordHash: await bcrypt.hash('Customer@123', 12),
    },
  });

  await prisma.address.deleteMany({ where: { userId: customer.id } });
  await prisma.address.create({
    data: {
      userId: customer.id,
      label: 'Home',
      fullName: 'Priya Raman',
      phone: '9812345678',
      line1: '12/4 Anna Nagar West, 3rd Street',
      line2: 'Near Blue Star Park',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600040',
      isDefault: true,
    },
  });

  // The demo catalogue is written once. Re-running the seed must never delete a
  // product the admin added, nor bring back one they deleted — so after the
  // first run we leave the catalogue alone unless explicitly asked to reset.
  if (marker && !reset) {
    // The placeholder art lives in uploads/, which a deploy or cleanup can wipe.
    // Regenerate anything missing so seeded products never show broken images.
    const restored = restorePlaceholders();
    if (restored) console.log(`Restored ${restored} missing placeholder image(s).`);

    console.log('\nDemo catalogue already seeded — products, categories and coupons left untouched.');
    console.log('Your own products are safe. To wipe the demo data and start over:');
    console.log('  npm run seed:reset -w server\n');
    await reportAdmin();
    return;
  }

  if (reset && marker) {
    // Only remove what a previous seed created; anything the admin added stays.
    const previous = JSON.parse(marker.value)?.skus ?? [];
    const owned = await prisma.product.findMany({
      where: { sku: { in: previous } },
      include: { _count: { select: { orderItems: true } } },
    });
    for (const product of owned) {
      if (product._count.orderItems > 0) {
        await prisma.product.update({ where: { id: product.id }, data: { isActive: false, isFeatured: false } });
      } else {
        await prisma.product.delete({ where: { id: product.id } });
      }
    }
    console.log(`Reset: removed ${owned.length} previously seeded product(s). Admin-created products untouched.`);
  }

  // --- categories
  const categoryBySlug = {};
  for (const [i, c] of categories.entries()) {
    const image = writePlaceholder(`cat-${c.slug}`, c.name.split(' ')[0], PALETTES[i % PALETTES.length]);
    categoryBySlug[c.slug] = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, sortOrder: c.sortOrder, image },
      create: { ...c, image },
    });
  }

  // --- products
  for (const [i, p] of products.entries()) {
    const slug = slugFor(p.name);
    const palette = PALETTES[i % PALETTES.length];
    const images = [
      writePlaceholder(slug, p.name.split(' ')[0], palette),
      writePlaceholder(`${slug}-alt`, 'Kupaa', [palette[1], palette[0]]),
    ];

    const data = {
      name: p.name,
      slug,
      sku: p.sku,
      shortDesc: p.short,
      description: p.desc,
      categoryId: categoryBySlug[p.c].id,
      price: p.price,
      mrp: p.mrp,
      stock: p.stock,
      weightKg: p.weightKg,
      lengthCm: 15,
      breadthCm: 10,
      heightCm: 8,
      tags: p.tags,
      hsn: '30049011',
      isActive: true,
      isFeatured: Boolean(p.featured),
      variantLabel: p.variantLabel ?? null,
    };

    const product = await prisma.product.upsert({ where: { sku: p.sku }, update: data, create: data });

    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.createMany({
      data: images.map((url, idx) => ({ productId: product.id, url, alt: p.name, sortOrder: idx })),
    });

    // Options the customer chooses between at checkout.
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    if (p.variants?.length) {
      for (const [idx, v] of p.variants.entries()) {
        await prisma.productVariant.create({
          // Alternating photos, so switching option on the product page visibly
          // swaps the image the way it does with real per-pack photography.
          data: { ...v, image: images[idx % images.length], productId: product.id, sortOrder: idx },
        });
      }
      await syncProductAggregates(null, product.id);
    }
  }

  // --- coupons
  for (const c of coupons) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: c,
      create: { ...c, expiresAt: new Date(Date.now() + 180 * 86400_000) },
    });
  }

  await prisma.setting.upsert({
    where: { key: MARKER_KEY },
    create: { key: MARKER_KEY, value: JSON.stringify({ version: SEED_VERSION, seededAt: new Date().toISOString(), skus: products.map((p) => p.sku) }) },
    update: { value: JSON.stringify({ version: SEED_VERSION, seededAt: new Date().toISOString(), skus: products.map((p) => p.sku) }) },
  });

  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    coupons: await prisma.coupon.count(),
  };

  console.log('Seed complete:', counts);
  await reportAdmin();

  /** Sign-in summary. Declared here so it closes over the admin variables. */
  async function reportAdmin() {
    console.log(`\n  Admin sign-in:    ${adminEmail}`);
    if (generated) {
      console.log(`  Admin password:   ${adminPassword}`);
      console.log('  ^ generated once and stored only as a hash. Save it now, or set');
      console.log('    ADMIN_PASSWORD in server/.env and re-run `npm run seed`.');
    } else if (configured) {
      console.log('  Admin password:   reset to the ADMIN_PASSWORD value in server/.env');
    } else {
      console.log('  Admin password:   unchanged. To reset it, put a new ADMIN_PASSWORD');
      console.log('                    in server/.env and re-run `npm run seed`.');
    }

    if (configured && INSECURE_DEFAULTS.has(configured)) {
      console.warn('\n  WARNING: this admin password is a well-known default. Change it before going live.');
    }
    console.log('\n  Demo customer:    customer@example.com (password in the README)\n');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
