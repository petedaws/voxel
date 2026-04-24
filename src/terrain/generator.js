import { fbm } from './noise.js';
import {
  CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL, TERRAIN_MIN, TERRAIN_MAX,
  NOISE_OCTAVES, NOISE_FREQ, BLOCK,
} from '../config.js';

const SEED_HEIGHT  = 1337;
const SEED_CONT    = 9001; // continentalness pass

export function generateChunk(cx, cz) {
  const voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = cx * CHUNK_SIZE + lx;
      const wz = cz * CHUNK_SIZE + lz;

      // FBM heightmap
      const h = fbm(SEED_HEIGHT, wx, wz, NOISE_OCTAVES, NOISE_FREQ, 2.0, 0.5);
      // Continentalness multiplier — broad low-freq variation
      const cont = fbm(SEED_CONT, wx, wz, 3, NOISE_FREQ * 0.2, 2.0, 0.5) * 0.5 + 0.5;
      // Map to [TERRAIN_MIN, TERRAIN_MAX]
      const height = Math.round(
        TERRAIN_MIN + (h * 0.5 + 0.5) * cont * (TERRAIN_MAX - TERRAIN_MIN)
      );

      for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
        const idx = lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
        voxels[idx] = getBlockType(ly, height);
      }
    }
  }

  return voxels;
}

function getBlockType(ly, height) {
  if (ly > height) {
    return (ly <= SEA_LEVEL) ? BLOCK.WATER : BLOCK.AIR;
  }
  if (ly === height) {
    if (height < SEA_LEVEL + 2) return BLOCK.SAND;
    if (height > 85)            return BLOCK.SNOW;
    return BLOCK.GRASS;
  }
  if (ly >= height - 3) return BLOCK.DIRT;
  return BLOCK.STONE;
}
