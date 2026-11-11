import * as THREE from "three";

const SIZE = 512;

const hash = (x, y, seed = 1) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

// Periodic value noise on [0..SIZE) so all generated 512px maps tile seamlessly with RepeatWrapping
function tileNoise(u, v, freq, seed) {
  const x = u * freq;
  const y = v * freq;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const x0 = ((ix % freq) + freq) % freq;
  const x1 = (x0 + 1) % freq;
  const y0 = ((iy % freq) + freq) % freq;
  const y1 = (y0 + 1) % freq;

  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(u, v, baseFreq, seed) {
  return (
    tileNoise(u, v, baseFreq, seed) * 0.55 +
    tileNoise(u, v, baseFreq * 2, seed + 13) * 0.3 +
    tileNoise(u, v, baseFreq * 4, seed + 29) * 0.15
  );
}

// Converts a [0..1] Float32 heightmap into a tangent-space normal map + roughness map
function buildPbrMapsFromHeight(heightField, { colorFn, roughFn, normalStrength = 3.2, repeat = 4 }) {
  const colorCanvas = document.createElement("canvas");
  const normalCanvas = document.createElement("canvas");
  const roughCanvas = document.createElement("canvas");
  colorCanvas.width = normalCanvas.width = roughCanvas.width = SIZE;
  colorCanvas.height = normalCanvas.height = roughCanvas.height = SIZE;

  const cCtx = colorCanvas.getContext("2d");
  const nCtx = normalCanvas.getContext("2d");
  const rCtx = roughCanvas.getContext("2d");

  const cImg = cCtx.createImageData(SIZE, SIZE);
  const nImg = nCtx.createImageData(SIZE, SIZE);
  const rImg = rCtx.createImageData(SIZE, SIZE);

  const cData = cImg.data;
  const nData = nImg.data;
  const rData = rImg.data;

  const sampleH = (x, y) => {
    const wx = ((x % SIZE) + SIZE) % SIZE;
    const wy = ((y % SIZE) + SIZE) % SIZE;
    return heightField[wy * SIZE + wx];
  };

  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const idx = y * SIZE + x;
      const p = idx * 4;
      const h = heightField[idx];

      // 1. Albedo (sRGB color map)
      const [cr, cg, cb] = colorFn(u, v, h, idx);
      cData[p] = cr;
      cData[p + 1] = cg;
      cData[p + 2] = cb;
      cData[p + 3] = 255;

      // 2. Tangent-space normal map via Sobel-like central difference
      const hL = sampleH(x - 1, y);
      const hR = sampleH(x + 1, y);
      const hU = sampleH(x, y - 1);
      const hD = sampleH(x, y + 1);
      const dx = (hL - hR) * normalStrength;
      const dy = (hU - hD) * normalStrength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      nData[p] = Math.round(((dx * invLen) * 0.5 + 0.5) * 255);
      nData[p + 1] = Math.round(((dy * invLen) * 0.5 + 0.5) * 255);
      nData[p + 2] = Math.round(((dz * invLen) * 0.5 + 0.5) * 255);
      nData[p + 3] = 255;

      // 3. Roughness map (NoColorSpace linear grayscale)
      const rVal = Math.round(Math.min(1, Math.max(0, roughFn(u, v, h, idx))) * 255);
      rData[p] = rVal;
      rData[p + 1] = rVal;
      rData[p + 2] = rVal;
      rData[p + 3] = 255;
    }
  }

  cCtx.putImageData(cImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  const normalTex = new THREE.CanvasTexture(normalCanvas);
  const roughTex = new THREE.CanvasTexture(roughCanvas);

  [colorTex, normalTex, roughTex].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = t === colorTex ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
  });

  return { map: colorTex, normalMap: normalTex, roughnessMap: roughTex };
}

let cachedSets = null;

export function getPbrTextureSets() {
  if (cachedSets) return cachedSets;

  // --- 1. Weedy / Grassy Untilled Ground PBR Set (512px) ---
  const grassH = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const clumping = fbm(u, v, 8, 11);
      const blades = tileNoise(u * 2.5, v, 24, 37) * 0.35;
      grassH[y * SIZE + x] = clumping * 0.65 + blades;
    }
  }
  const grassPbr = buildPbrMapsFromHeight(grassH, {
    normalStrength: 2.8,
    repeat: 3,
    colorFn: (u, v, h) => {
      // Rich earthy grass with subtle soil patches peeking through
      const patch = tileNoise(u, v, 6, 51);
      const r = Math.round(92 + h * 36 + (patch - 0.5) * 22);
      const g = Math.round(145 + h * 48 + (patch - 0.5) * 18);
      const b = Math.round(54 + h * 20);
      return [r, g, b];
    },
    roughFn: (_, __, h) => 0.92 - h * 0.14,
  });

  // --- 2. Primary Cultivated (Coarse Cloddy Ploughed Soil) PBR Set (512px) ---
  const clodH = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      // Coarse lumps and broken earth clods
      const clods = fbm(u, v, 10, 73);
      const grit = tileNoise(u, v, 32, 91) * 0.25;
      clodH[y * SIZE + x] = clods * 0.75 + grit;
    }
  }
  const tilledSoilPbr = buildPbrMapsFromHeight(clodH, {
    normalStrength: 4.2,
    repeat: 3,
    colorFn: (_, __, h) => {
      // Grayscale-neutral warm base so material.color controls dry/moist/watered tinting accurately
      const shade = 165 + h * 75;
      return [Math.round(shade), Math.round(shade * 0.96), Math.round(shade * 0.92)];
    },
    roughFn: (_, __, h) => 0.96 - h * 0.18,
  });

  // --- 3. Secondary Cultivated / Furrowed Seedbed (Parallel Ridges + Fine Tilth) PBR Set (512px) ---
  const furrowH = new Float32Array(SIZE * SIZE);
  const ridges = 6; // 6 parallel furrow ridges per tile repeat
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    const ridgeWave = Math.sin(v * Math.PI * 2 * ridges) * 0.5 + 0.5;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const fineCrumb = fbm(u, v, 16, 131) * 0.35;
      furrowH[y * SIZE + x] = ridgeWave * 0.65 + fineCrumb;
    }
  }
  const furrowedSoilPbr = buildPbrMapsFromHeight(furrowH, {
    normalStrength: 4.8,
    repeat: 2,
    colorFn: (_, __, h) => {
      // Trench bottoms are slightly darker/moister; ridge crests catch the sun
      const shade = 152 + h * 88;
      return [Math.round(shade), Math.round(shade * 0.96), Math.round(shade * 0.92)];
    },
    roughFn: (_, __, h) => 0.94 - h * 0.22,
  });

  // --- 4. Large Meadow Ground Plane PBR Set (512px, tiled 36x36 across the 240m world) ---
  const meadowPbr = buildPbrMapsFromHeight(grassH, {
    normalStrength: 2.2,
    repeat: 36,
    colorFn: (u, v, h) => {
      const patch = tileNoise(u, v, 4, 83);
      return [
        Math.round(86 + h * 30 + (patch - 0.5) * 16),
        Math.round(138 + h * 40 + (patch - 0.5) * 16),
        Math.round(52 + h * 18),
      ];
    },
    roughFn: (_, __, h) => 0.95 - h * 0.1,
  });

  cachedSets = { grassPbr, tilledSoilPbr, furrowedSoilPbr, meadowPbr };
  return cachedSets;
}
