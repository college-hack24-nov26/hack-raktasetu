const fs = require('fs');
const path = require('path');
const Jimp = require('../node_modules/jimp-compact');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Colors (RGBA)
const COLOR_RED = 0xDC2626FF;       // #DC2626
const COLOR_RED_DARK = 0xB91C1CFF;  // #B91C1C
const COLOR_WHITE = 0xFFFFFFFF;     // #FFFFFF
const COLOR_TRANSPARENT = 0x00000000;

/**
 * Checks if a point (x, y) normalized to [0, 1] is inside a blood drop shape.
 * Blood drop formula:
 * Bottom half: circle centered at (0.5, 0.6) with radius R = 0.28
 * Top half: cone tapering smoothly from tangency up to apex at (0.5, 0.18)
 */
function isInsideBloodDrop(nx, ny) {
  const cx = 0.5;
  const cy = 0.60;
  const r = 0.28;
  const apexY = 0.18;

  // Bottom circular part
  const dx = nx - cx;
  const dy = ny - cy;
  if (dy >= 0) {
    return (dx * dx + dy * dy) <= (r * r);
  }

  // dy < 0: Between apex and center
  if (ny < apexY) return false;

  // Tangent slope from apex (0.5, 0.18) to circle at (0.5, 0.60)
  // Distance from apex to circle center is D = 0.42
  // Tangent angle theta = asin(r / D) = asin(0.28 / 0.42) = asin(0.6667) ~ 41.8 deg
  // Tangency occurs at y_tangent = cy - r * sin(theta) = 0.60 - 0.28 * 0.6667 ~ 0.413
  // Above tangency, width is linear from 0 at apex to tangent width at y_tangent.
  const D = cy - apexY;
  const sinA = r / D;
  const cosA = Math.sqrt(1 - sinA * sinA);
  const tanA = sinA / cosA;
  const yTangent = cy - r * sinA;

  if (ny <= yTangent) {
    // Linear taper
    const maxWidthAtY = (ny - apexY) * tanA;
    return Math.abs(dx) <= maxWidthAtY;
  } else {
    // Circular arc below tangency point
    return (dx * dx + dy * dy) <= (r * r);
  }
}

/**
 * Checks if a point (nx, ny) is inside a medical cross centered at (0.5, 0.60)
 */
function isInsideCross(nx, ny) {
  const cx = 0.5;
  const cy = 0.60;
  const crossWidth = 0.055;
  const crossLength = 0.14;

  const inV = Math.abs(nx - cx) <= crossWidth && Math.abs(ny - cy) <= crossLength;
  const inH = Math.abs(nx - cx) <= crossLength && Math.abs(ny - cy) <= crossWidth;
  return inV || inH;
}

/**
 * Generate 1024x1024 icon.png (Red background, white blood drop, red cross inside)
 */
async function generateIcon() {
  const size = 1024;
  const img = await new Promise((resolve, reject) => {
    new Jimp(size, size, COLOR_RED, (err, image) => {
      if (err) reject(err); else resolve(image);
    });
  });

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      if (isInsideBloodDrop(nx, ny)) {
        if (isInsideCross(nx, ny)) {
          img.setPixelColor(COLOR_RED, x, y);
        } else {
          img.setPixelColor(COLOR_WHITE, x, y);
        }
      }
    }
  }

  const outPath = path.join(ASSETS_DIR, 'icon.png');
  await img.writeAsync(outPath);
  console.log('Generated icon.png at ' + outPath);
}

/**
 * Generate 1024x1024 adaptive-icon.png (Transparent background, white blood drop, transparent cross)
 */
async function generateAdaptiveIcon() {
  const size = 1024;
  const img = await new Promise((resolve, reject) => {
    new Jimp(size, size, COLOR_TRANSPARENT, (err, image) => {
      if (err) reject(err); else resolve(image);
    });
  });

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      if (isInsideBloodDrop(nx, ny)) {
        if (isInsideCross(nx, ny)) {
          // Transparent cutout inside so the adaptive red background shows through
          img.setPixelColor(COLOR_TRANSPARENT, x, y);
        } else {
          img.setPixelColor(COLOR_WHITE, x, y);
        }
      }
    }
  }

  const outPath = path.join(ASSETS_DIR, 'adaptive-icon.png');
  await img.writeAsync(outPath);
  console.log('Generated adaptive-icon.png at ' + outPath);
}

/**
 * Generate splash-icon.png (Centered drop on transparent bg for splash screen)
 */
async function generateSplashIcon() {
  const size = 1024;
  const img = await new Promise((resolve, reject) => {
    new Jimp(size, size, COLOR_TRANSPARENT, (err, image) => {
      if (err) reject(err); else resolve(image);
    });
  });

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      if (isInsideBloodDrop(nx, ny)) {
        if (isInsideCross(nx, ny)) {
          img.setPixelColor(COLOR_TRANSPARENT, x, y);
        } else {
          img.setPixelColor(COLOR_WHITE, x, y);
        }
      }
    }
  }

  const outPath = path.join(ASSETS_DIR, 'splash-icon.png');
  await img.writeAsync(outPath);
  console.log('Generated splash-icon.png at ' + outPath);
}

/**
 * Generate notification-icon.png (96x96 monochrome silhouette)
 */
async function generateNotificationIcon() {
  const size = 96;
  const img = await new Promise((resolve, reject) => {
    new Jimp(size, size, COLOR_TRANSPARENT, (err, image) => {
      if (err) reject(err); else resolve(image);
    });
  });

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      if (isInsideBloodDrop(nx, ny)) {
        if (isInsideCross(nx, ny)) {
          img.setPixelColor(COLOR_TRANSPARENT, x, y);
        } else {
          img.setPixelColor(COLOR_WHITE, x, y);
        }
      }
    }
  }

  const outPath = path.join(ASSETS_DIR, 'notification-icon.png');
  await img.writeAsync(outPath);
  console.log('Generated notification-icon.png at ' + outPath);
}

/**
 * Generate favicon.png (48x48)
 */
async function generateFavicon() {
  const size = 48;
  const img = await new Promise((resolve, reject) => {
    new Jimp(size, size, COLOR_RED, (err, image) => {
      if (err) reject(err); else resolve(image);
    });
  });

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      if (isInsideBloodDrop(nx, ny)) {
        if (isInsideCross(nx, ny)) {
          img.setPixelColor(COLOR_RED, x, y);
        } else {
          img.setPixelColor(COLOR_WHITE, x, y);
        }
      }
    }
  }

  const outPath = path.join(ASSETS_DIR, 'favicon.png');
  await img.writeAsync(outPath);
  console.log('Generated favicon.png at ' + outPath);
}

async function main() {
  await generateIcon();
  await generateAdaptiveIcon();
  await generateSplashIcon();
  await generateNotificationIcon();
  await generateFavicon();
  console.log('All mobile assets generated successfully.');
}

main().catch(err => {
  console.error('Failed to generate assets:', err);
  process.exit(1);
});

