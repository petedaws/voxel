// OpenSimplex2S noise — self-contained, no external deps.
// Based on the public domain reference implementation by KdotJPG.

const PRIME_X = 0x5205402B;
const PRIME_Y = 0x598CD327;
const HASH_MULTIPLIER = 0x53A3F72DEEC546F5n;
const ROOT2OVER2 = 0.7071067811865476;
const SKEW_2D    =  0.366025403784439;
const UNSKEW_2D  = -0.21132486540518713;
const FBM_NORMALIZATION = 55;

const GRAD2 = new Float64Array([
   0.38268343236509,   0.923879532511287,
   0.923879532511287,  0.38268343236509,
   0.923879532511287, -0.38268343236509,
   0.38268343236509,  -0.923879532511287,
  -0.38268343236509,  -0.923879532511287,
  -0.923879532511287, -0.38268343236509,
  -0.923879532511287,  0.38268343236509,
  -0.38268343236509,   0.923879532511287,
   0.130526192220052,  0.991444861373810,
   0.608761429008721,  0.793353340291235,
   0.793353340291235,  0.608761429008721,
   0.991444861373810,  0.130526192220052,
   0.991444861373810, -0.130526192220052,
   0.793353340291235, -0.608761429008721,
   0.608761429008721, -0.793353340291235,
   0.130526192220052, -0.991444861373810,
  -0.130526192220052, -0.991444861373810,
  -0.608761429008721, -0.793353340291235,
  -0.793353340291235, -0.608761429008721,
  -0.991444861373810, -0.130526192220052,
  -0.991444861373810,  0.130526192220052,
  -0.793353340291235,  0.608761429008721,
  -0.608761429008721,  0.793353340291235,
  -0.130526192220052,  0.991444861373810,
]);

function grad2(seed, xsvp, ysvp, dx, dy) {
  let hash = BigInt(seed) ^ BigInt(xsvp) * BigInt(PRIME_X) ^ BigInt(ysvp) * BigInt(PRIME_Y);
  hash = hash * HASH_MULTIPLIER;
  hash ^= hash >> 23n;
  hash = hash * 0xAE35A0891DC171n;
  hash ^= hash >> 47n;
  hash ^= hash >> 29n;
  const gi = Number(hash) & (GRAD2.length - 2);
  return GRAD2[gi] * dx + GRAD2[gi | 1] * dy;
}

export function noise2(seed, x, y) {
  const s  = SKEW_2D * (x + y);
  const xs = x + s;
  const ys = y + s;

  const xsb = Math.floor(xs);
  const ysb = Math.floor(ys);
  const xi  = xs - xsb;
  const yi  = ys - ysb;

  const xsbp = xsb * PRIME_X;
  const ysbp = ysb * PRIME_Y;

  const t  = (xi + yi) * UNSKEW_2D;
  const dx0 = xi + t;
  const dy0 = yi + t;

  let value = 0;

  // First vertex
  const a0 = (2.0 / 3.0) - dx0 * dx0 - dy0 * dy0;
  if (a0 > 0) {
    value += (a0 * a0) * (a0 * a0) * grad2(seed, xsbp, ysbp, dx0, dy0);
  }

  // Second vertex
  const a1 = (2.0 * (1.0 + 2.0 * UNSKEW_2D) * (1.0 / UNSKEW_2D + 2.0)) * t
    + ((-2.0 * (1.0 + 2.0 * UNSKEW_2D) * (1.0 + 2.0 * UNSKEW_2D)) + a0);
  if (a1 > 0) {
    const dx1 = dx0 - (1.0 + 2.0 * UNSKEW_2D);
    const dy1 = dy0 - (1.0 + 2.0 * UNSKEW_2D);
    value += (a1 * a1) * (a1 * a1) * grad2(seed, xsbp + PRIME_X, ysbp + PRIME_Y, dx1, dy1);
  }

  // Third and fourth vertices (determined by which triangle half we're in)
  if (dy0 > dx0) {
    const dx2 = dx0 - UNSKEW_2D;
    const dy2 = dy0 - (UNSKEW_2D + 1.0);
    const a2  = (2.0 / 3.0) - dx2 * dx2 - dy2 * dy2;
    if (a2 > 0) {
      value += (a2 * a2) * (a2 * a2) * grad2(seed, xsbp, ysbp + PRIME_Y, dx2, dy2);
    }
  } else {
    const dx2 = dx0 - (UNSKEW_2D + 1.0);
    const dy2 = dy0 - UNSKEW_2D;
    const a2  = (2.0 / 3.0) - dx2 * dx2 - dy2 * dy2;
    if (a2 > 0) {
      value += (a2 * a2) * (a2 * a2) * grad2(seed, xsbp + PRIME_X, ysbp, dx2, dy2);
    }
  }

  return value;
}

/**
 * Fractional Brownian Motion over noise2.
 * Returns a value in approximately [-1, 1].
 */
export function fbm(seed, x, y, octaves, frequency, lacunarity, persistence) {
  let value = 0;
  let amp   = 1.0;
  let freq  = frequency;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value  += noise2(seed + i * 127, x * freq, y * freq) * amp;
    maxAmp += amp;
    amp    *= persistence;
    freq   *= lacunarity;
  }
  return Math.max(-1, Math.min(1, (value / maxAmp) * FBM_NORMALIZATION));
}
