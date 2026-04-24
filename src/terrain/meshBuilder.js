import { CHUNK_SIZE, CHUNK_HEIGHT, BLOCK } from '../config.js';

// Tile index [top, side, bottom] per block type in the 8×8 atlas
const BLOCK_TILES = {
  [BLOCK.STONE]: [0, 0, 0],
  [BLOCK.DIRT]:  [1, 1, 1],
  [BLOCK.GRASS]: [2, 3, 1],
  [BLOCK.SAND]:  [4, 4, 4],
  [BLOCK.SNOW]:  [5, 5, 5],
  [BLOCK.WATER]: [6, 6, 6],
};

// [normalAxis, normalDir, uAxis, vAxis, faceDir(0=top,1=side,2=bottom)]
const FACE_DEFS = [
  [1, +1, 0, 2, 0], // +Y top
  [1, -1, 0, 2, 2], // -Y bottom
  [0, +1, 2, 1, 1], // +X right
  [0, -1, 2, 1, 1], // -X left
  [2, +1, 0, 1, 1], // +Z front
  [2, -1, 0, 1, 1], // -Z back
];

const FACE_NORMALS = [
  [0, 1, 0], [0,-1, 0],
  [1, 0, 0], [-1, 0, 0],
  [0, 0, 1], [0, 0,-1],
];

const DIM = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE];

// ─── voxel lookup with neighbour support ────────────────────────────────────

function getVoxel(voxels, nbr, lx, ly, lz) {
  if (ly < 0 || ly >= CHUNK_HEIGHT) return BLOCK.AIR;

  let ax = lx, az = lz, arr = voxels;

  if      (lx < 0)         { if (!nbr.nx) return BLOCK.AIR; ax = CHUNK_SIZE - 1; arr = nbr.nx; }
  else if (lx >= CHUNK_SIZE){ if (!nbr.px) return BLOCK.AIR; ax = 0;             arr = nbr.px; }

  if      (lz < 0)         { if (!nbr.nz) return BLOCK.AIR; az = CHUNK_SIZE - 1; arr = arr === voxels ? nbr.nz : arr; }
  else if (lz >= CHUNK_SIZE){ if (!nbr.pz) return BLOCK.AIR; az = 0;             arr = arr === voxels ? nbr.pz : arr; }

  return arr[ax + az * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE];
}

function isSolid(v)       { return v !== BLOCK.AIR && v !== BLOCK.WATER; }
function isTransparent(v) { return v === BLOCK.AIR || v === BLOCK.WATER; }

// ─── AO ─────────────────────────────────────────────────────────────────────
// Position-consistent formula: at vertex (vu,vv) in face-plane at aoPlane[normalAxis].
// Samples 3 neighbours in the plane: (vu-1,vv), (vu,vv-1), (vu-1,vv-1).
// Returns 0-3 (0 = fully occluded, 3 = open).

function vertexAO(s1, s2, corner) {
  return s1 && s2 ? 0 : 3 - (s1 + s2 + corner);
}

function computeAO(voxels, nbr, na, normalDir, ua, va, vu, vv, s) {
  const aoPlane = s + normalDir; // sample voxels on the "air" side of the face
  const p = [0, 0, 0];

  p[na] = aoPlane;
  p[ua] = vu - 1; p[va] = vv;     const s1 = isSolid(getVoxel(voxels, nbr, p[0], p[1], p[2])) ? 1 : 0;
  p[ua] = vu;     p[va] = vv - 1; const s2 = isSolid(getVoxel(voxels, nbr, p[0], p[1], p[2])) ? 1 : 0;
  p[ua] = vu - 1; p[va] = vv - 1; const cr = isSolid(getVoxel(voxels, nbr, p[0], p[1], p[2])) ? 1 : 0;

  return vertexAO(s1, s2, cr);
}

// ─── main build function ─────────────────────────────────────────────────────

export function buildMesh(voxels, neighbors = {}) {
  const nbr = neighbors;
  const verts = []; // floats: x y z  nx ny nz  tileX tileY  ao
  const idxs  = []; // Uint32
  let vc = 0;

  for (let fi = 0; fi < 6; fi++) {
    const [na, nd, ua, va, faceDir] = FACE_DEFS[fi];
    const [nnx, nny, nnz] = FACE_NORMALS[fi];
    const dimS = DIM[na];
    const dimU = DIM[ua];
    const dimV = DIM[va];

    // Reusable 2D arrays (flat, (dimU+1)*(dimV+1) for AO, dimU*dimV for face/used)
    const faceGrid = new Uint8Array(dimU * dimV);  // block type or 0
    const aoGrid   = new Uint8Array((dimU + 1) * (dimV + 1));
    const used     = new Uint8Array(dimU * dimV);

    for (let s = 0; s < dimS; s++) {
      // ── build face grid ──────────────────────────────────────────────────
      const solidAir = nd === 1 ? [s, s + 1] : [s, s - 1];

      faceGrid.fill(0);
      for (let v = 0; v < dimV; v++) {
        for (let u = 0; u < dimU; u++) {
          const pos = [0, 0, 0];
          pos[na] = solidAir[0]; pos[ua] = u; pos[va] = v;
          const block = getVoxel(voxels, nbr, pos[0], pos[1], pos[2]);
          if (!isSolid(block)) continue;
          if (!BLOCK_TILES[block]) continue;

          pos[na] = solidAir[1];
          const nbBlock = getVoxel(voxels, nbr, pos[0], pos[1], pos[2]);
          if (!isTransparent(nbBlock)) continue;

          faceGrid[u + v * dimU] = block;
        }
      }

      // ── build AO grid (vertex positions: (dimU+1)*(dimV+1)) ─────────────
      for (let vv = 0; vv <= dimV; vv++) {
        for (let vu = 0; vu <= dimU; vu++) {
          aoGrid[vu + vv * (dimU + 1)] = computeAO(voxels, nbr, na, nd, ua, va, vu, vv, s);
        }
      }

      // ── greedy merge ─────────────────────────────────────────────────────
      used.fill(0);
      for (let v = 0; v < dimV; v++) {
        for (let u = 0; u < dimU; u++) {
          const idx0 = u + v * dimU;
          if (used[idx0] || !faceGrid[idx0]) continue;

          const block = faceGrid[idx0];
          const tile  = BLOCK_TILES[block][faceDir];

          // AO at the 4 corners of this 1×1 cell
          const ao00 = aoGrid[ u    +  v      * (dimU + 1)];
          const ao10 = aoGrid[(u+1) +  v      * (dimU + 1)];
          const ao11 = aoGrid[(u+1) + (v + 1) * (dimU + 1)];
          const ao01 = aoGrid[ u    + (v + 1) * (dimU + 1)];
          const key  = (block << 12) | (tile << 8) | (ao00 << 6) | (ao10 << 4) | (ao11 << 2) | ao01;

          // Extend in u direction
          let w = 1;
          while (u + w < dimU) {
            const idx = (u + w) + v * dimU;
            if (used[idx] || faceGrid[idx] !== block) break;
            const b = faceGrid[idx], t = BLOCK_TILES[b][faceDir];
            const a00 = aoGrid[(u+w)   +  v      * (dimU+1)];
            const a10 = aoGrid[(u+w+1) +  v      * (dimU+1)];
            const a11 = aoGrid[(u+w+1) + (v+1)   * (dimU+1)];
            const a01 = aoGrid[(u+w)   + (v+1)   * (dimU+1)];
            if (((b << 12) | (t << 8) | (a00 << 6) | (a10 << 4) | (a11 << 2) | a01) !== key) break;
            w++;
          }

          // Extend in v direction
          let h = 1;
          outer: while (v + h < dimV) {
            for (let du = 0; du < w; du++) {
              const uu = u + du, vv2 = v + h;
              const idx = uu + vv2 * dimU;
              if (used[idx] || faceGrid[idx] !== block) break outer;
              const b = faceGrid[idx], t = BLOCK_TILES[b][faceDir];
              const a00 = aoGrid[ uu    +  vv2      * (dimU+1)];
              const a10 = aoGrid[(uu+1) +  vv2      * (dimU+1)];
              const a11 = aoGrid[(uu+1) + (vv2+1)   * (dimU+1)];
              const a01 = aoGrid[ uu    + (vv2+1)   * (dimU+1)];
              if (((b << 12) | (t << 8) | (a00 << 6) | (a10 << 4) | (a11 << 2) | a01) !== key) break outer;
            }
            h++;
          }

          // Mark cells used
          for (let dv = 0; dv < h; dv++)
            for (let du = 0; du < w; du++)
              used[(u + du) + (v + dv) * dimU] = 1;

          // AO at the 4 corners of the merged quad
          const cao00 = aoGrid[ u    +  v      * (dimU+1)];
          const cao10 = aoGrid[(u+w) +  v      * (dimU+1)];
          const cao11 = aoGrid[(u+w) + (v + h) * (dimU+1)];
          const cao01 = aoGrid[ u    + (v + h) * (dimU+1)];

          // Vertex positions: face plane coord + u,v extent
          const fc = nd === 1 ? s + 1 : s; // face coordinate on the normal axis
          const tx = tile % 8, ty = Math.floor(tile / 8);

          // 4 vertex positions & AO (order per face winding computed for CCW normals)
          // Winding tables verified to produce correct face normals via cross-product
          let p0, p1, p2, p3, a0, a1, a2, a3;
          if (fi === 0) { // +Y
            p0=[u,fc,v];     p1=[u,fc,v+h];   p2=[u+w,fc,v+h]; p3=[u+w,fc,v];
            a0=cao00; a1=cao01; a2=cao11; a3=cao10;
          } else if (fi === 1) { // -Y
            p0=[u,fc,v];     p1=[u+w,fc,v];   p2=[u+w,fc,v+h]; p3=[u,fc,v+h];
            a0=cao00; a1=cao10; a2=cao11; a3=cao01;
          } else if (fi === 2) { // +X  (ua=Z, va=Y)
            p0=[fc,v,u];     p1=[fc,v+h,u];   p2=[fc,v+h,u+w]; p3=[fc,v,u+w];
            a0=cao00; a1=cao01; a2=cao11; a3=cao10;
          } else if (fi === 3) { // -X
            p0=[fc,v,u];     p1=[fc,v,u+w];   p2=[fc,v+h,u+w]; p3=[fc,v+h,u];
            a0=cao00; a1=cao10; a2=cao11; a3=cao01;
          } else if (fi === 4) { // +Z  (ua=X, va=Y)
            p0=[u,v,fc];     p1=[u+w,v,fc];   p2=[u+w,v+h,fc]; p3=[u,v+h,fc];
            a0=cao00; a1=cao10; a2=cao11; a3=cao01;
          } else {              // -Z
            p0=[u,v,fc];     p1=[u,v+h,fc];   p2=[u+w,v+h,fc]; p3=[u+w,v,fc];
            a0=cao00; a1=cao01; a2=cao11; a3=cao10;
          }

          // AO flip: choose diagonal that minimises the darker triangle
          const flip = (a0 + a2) < (a1 + a3);

          const push = (px, py, pz, ao) => {
            verts.push(px, py, pz, nnx, nny, nnz, tx, ty, ao / 3);
          };
          push(p0[0],p0[1],p0[2], a0);
          push(p1[0],p1[1],p1[2], a1);
          push(p2[0],p2[1],p2[2], a2);
          push(p3[0],p3[1],p3[2], a3);

          const b0 = vc;
          if (flip) idxs.push(b0+1, b0+2, b0+3, b0+1, b0+3, b0);
          else      idxs.push(b0,   b0+1, b0+2, b0,   b0+2, b0+3);
          vc += 4;
        }
      }
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices:  new Uint32Array(idxs),
  };
}
