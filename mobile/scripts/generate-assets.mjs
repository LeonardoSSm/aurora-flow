// Asset generation script for Tijuca Flow mobile app
// Run: node scripts/generate-assets.mjs
import { Jimp } from 'jimp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BRAND = join(ROOT, '..', 'frontend', 'public', 'brand', 'tijuca');
const ASSETS = join(ROOT, 'assets');

async function run() {
  console.log('Generating mobile assets from Tijuca brand files...');

  // ── 1. icon.png — 1024x1024, white background (iOS requires no transparency) ──
  {
    const logo = await Jimp.read(join(BRAND, 'loginho.png'));
    logo.resize({ w: 820, h: 820 });

    const canvas = new Jimp({ width: 1024, height: 1024, color: 0xffffffff });
    const offset = Math.floor((1024 - 820) / 2); // 102
    canvas.composite(logo, offset, offset);
    await canvas.write(join(ASSETS, 'icon.png'));
    console.log('✓ icon.png (1024x1024, white background)');
  }

  // ── 2. adaptive-icon.png — 1024x1024, transparent (Android adaptive) ──
  {
    const logo = await Jimp.read(join(BRAND, 'loginho.png'));
    // Keep within safe zone (~72% of 1024 = 738) — use 700x700
    logo.resize({ w: 700, h: 700 });

    const canvas = new Jimp({ width: 1024, height: 1024, color: 0x00000000 });
    const offset = Math.floor((1024 - 700) / 2); // 162
    canvas.composite(logo, offset, offset);
    await canvas.write(join(ASSETS, 'adaptive-icon.png'));
    console.log('✓ adaptive-icon.png (1024x1024, transparent background)');
  }

  // ── 3. splash-icon.png — logo2 centered on 1284x2778 white canvas ──
  {
    const logo = await Jimp.read(join(BRAND, 'logo2.png'));
    // Scale logo2 to fit within 1100px wide while maintaining aspect ratio
    const targetW = 1100;
    const targetH = Math.round(targetW * (logo.height / logo.width));
    logo.resize({ w: targetW, h: targetH });

    const canvasW = 1284;
    const canvasH = 2778;
    const canvas = new Jimp({ width: canvasW, height: canvasH, color: 0xffffffff });
    const x = Math.floor((canvasW - targetW) / 2);
    const y = Math.floor((canvasH - targetH) / 2);
    canvas.composite(logo, x, y);
    await canvas.write(join(ASSETS, 'splash-icon.png'));
    console.log(`✓ splash-icon.png (${canvasW}x${canvasH}, logo centered at ${x},${y})`);
  }

  // ── 4. favicon.png — 48x48 for web ──
  {
    const logo = await Jimp.read(join(BRAND, 'loginho.png'));
    logo.resize({ w: 48, h: 48 });
    await logo.write(join(ASSETS, 'favicon.png'));
    console.log('✓ favicon.png (48x48)');
  }

  console.log('\nDone. Assets written to mobile/assets/');
}

run().catch((err) => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
