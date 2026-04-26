export const CHUNK_SIZE    = 32;
export const CHUNK_HEIGHT  = 128;
const IS_MOBILE = (navigator.maxTouchPoints > 0) || (globalThis.matchMedia?.('(pointer: coarse)').matches ?? false);
export const RENDER_DIST   = IS_MOBILE ? 4 : 8;
export const SEA_LEVEL     = 40;
export const TERRAIN_MIN   = 16;
export const TERRAIN_MAX   = 100;
export const NOISE_OCTAVES = 6;
export const NOISE_FREQ    = 0.003;
export const FLY_SPEED     = 20;
export const FOG_DENSITY   = 0.004;
const MAX_WORKERS = IS_MOBILE ? 2 : 4;
const MIN_WORKERS = IS_MOBILE ? 1 : 2;
export const WORKER_COUNT  = Math.min(
  Math.max((navigator.hardwareConcurrency || 4) - 1, MIN_WORKERS),
  MAX_WORKERS
);

export const BLOCK = {
  AIR:   0,
  STONE: 1,
  DIRT:  2,
  GRASS: 3,
  SAND:  4,
  SNOW:  5,
  WATER: 6,
};
