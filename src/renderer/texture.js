import { BLOCK } from '../config.js';

const TILE_PX    = 32;
const ATLAS_SIZE = 8;
const CANVAS_PX  = TILE_PX * ATLAS_SIZE; // 256

// [r,g,b] base colors per tile index matching BLOCK_TILES in meshBuilder
const TILE_COLORS = {
  0: [120, 120, 120], // Stone
  1: [110, 75,  40],  // Dirt
  2: [50,  140, 40],  // Grass top
  3: [80,  110, 50],  // Grass side
  4: [210, 195, 130], // Sand
  5: [235, 240, 245], // Snow
  6: [40,  90,  190], // Water
};

function drawTile(ctx, tx, ty, r, g, b) {
  const px = tx * TILE_PX;
  const py = ty * TILE_PX;

  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(px, py, TILE_PX, TILE_PX);

  // Overlay subtle noise for texture
  const imgData = ctx.getImageData(px, py, TILE_PX, TILE_PX);
  const d = imgData.data;
  for (let i = 0; i < TILE_PX * TILE_PX; i++) {
    const noise = (Math.random() - 0.5) * 24;
    d[i * 4]     = Math.min(255, Math.max(0, r + noise));
    d[i * 4 + 1] = Math.min(255, Math.max(0, g + noise));
    d[i * 4 + 2] = Math.min(255, Math.max(0, b + noise));
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, px, py);
}

export function createAtlasTexture(gl) {
  const canvas = document.createElement('canvas');
  canvas.width  = CANVAS_PX;
  canvas.height = CANVAS_PX;
  const ctx = canvas.getContext('2d');

  for (const [tileIdx, [r, g, b]] of Object.entries(TILE_COLORS)) {
    const tx = Number(tileIdx) % ATLAS_SIZE;
    const ty = Math.floor(Number(tileIdx) / ATLAS_SIZE);
    drawTile(ctx, tx, ty, r, g, b);
  }

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return tex;
}
