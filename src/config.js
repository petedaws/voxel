export const CHUNK_SIZE    = 32;
export const CHUNK_HEIGHT  = 128;
export const RENDER_DIST   = 8;
export const SEA_LEVEL     = 40;
export const TERRAIN_MIN   = 16;
export const TERRAIN_MAX   = 100;
export const NOISE_OCTAVES = 6;
export const NOISE_FREQ    = 0.003;
export const FLY_SPEED     = 20;
export const FOG_DENSITY   = 0.004;
export const WORKER_COUNT  = Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 2), 4);

// Player physics
export const PLAYER_WIDTH      = 0.6;   // total AABB width on X and Z (centered on position)
export const PLAYER_HEIGHT     = 1.8;   // AABB height; feet at position.y, head at position.y + HEIGHT
export const PLAYER_EYE_HEIGHT = 1.62;  // eye offset above feet
export const WALK_SPEED        = 5.0;
export const JUMP_VELOCITY     = 8.5;
export const GRAVITY           = 28.0;  // m/s^2
export const TERMINAL_VELOCITY = 60.0;
export const REACH_DISTANCE    = 6.0;   // max raycast distance for block targeting

export const BLOCK = {
  AIR:   0,
  STONE: 1,
  DIRT:  2,
  GRASS: 3,
  SAND:  4,
  SNOW:  5,
  WATER: 6,
};
