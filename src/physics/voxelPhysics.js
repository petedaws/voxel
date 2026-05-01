// AABB-vs-voxel collision and voxel raycasting.
//
// The world is queried through `world.isSolidBlock(x, y, z)`. The player's
// AABB is centered on (pos.x, pos.z) with feet at pos.y, head at pos.y + height.

const EPS = 1e-4;
const MAX_SUBSTEP = 0.4; // never advance more than this per resolution sub-step

export function aabbIntersectsSolid(world, pos, halfW, height) {
  const minX = Math.floor(pos[0] - halfW + EPS);
  const maxX = Math.floor(pos[0] + halfW - EPS);
  const minY = Math.floor(pos[1] + EPS);
  const maxY = Math.floor(pos[1] + height - EPS);
  const minZ = Math.floor(pos[2] - halfW + EPS);
  const maxZ = Math.floor(pos[2] + halfW - EPS);
  for (let y = minY; y <= maxY; y++)
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++)
        if (world.isSolidBlock(x, y, z)) return true;
  return false;
}

// Move the player along one axis, snapping out of any solid voxel they end up
// overlapping. Zeros velocity[axis] on contact. Returns true if a collision
// stopped the motion.
export function moveAxis(world, pos, vel, axis, delta, halfW, height) {
  if (delta === 0) return false;

  // Sub-step large motions so we never tunnel through a 1×1×1 block.
  let remaining = delta;
  let collided = false;
  while (Math.abs(remaining) > 0) {
    const step = Math.sign(remaining) * Math.min(Math.abs(remaining), MAX_SUBSTEP);
    pos[axis] += step;
    if (aabbIntersectsSolid(world, pos, halfW, height)) {
      // Snap to the nearest non-overlap face on this axis.
      if (axis === 0) {
        if (step > 0) {
          const f = Math.floor(pos[0] + halfW - EPS);
          pos[0] = f - halfW - EPS;
        } else {
          const f = Math.floor(pos[0] - halfW + EPS);
          pos[0] = f + 1 + halfW + EPS;
        }
      } else if (axis === 1) {
        if (step > 0) {
          const f = Math.floor(pos[1] + height - EPS);
          pos[1] = f - height - EPS;
        } else {
          const f = Math.floor(pos[1] + EPS);
          pos[1] = f + 1 + EPS;
        }
      } else {
        if (step > 0) {
          const f = Math.floor(pos[2] + halfW - EPS);
          pos[2] = f - halfW - EPS;
        } else {
          const f = Math.floor(pos[2] - halfW + EPS);
          pos[2] = f + 1 + halfW + EPS;
        }
      }
      vel[axis] = 0;
      collided = true;
      break;
    }
    remaining -= step;
  }
  return collided;
}

// Step a player position+velocity through the world for one frame.
// Order is X, Z, Y so vertical motion is resolved last. Returns
// { onGround, hitCeiling }.
export function moveAndCollide(world, pos, vel, dt, halfW, height) {
  moveAxis(world, pos, vel, 0, vel[0] * dt, halfW, height);
  moveAxis(world, pos, vel, 2, vel[2] * dt, halfW, height);
  const hitY = moveAxis(world, pos, vel, 1, vel[1] * dt, halfW, height);

  let onGround = false;
  let hitCeiling = false;
  if (hitY) {
    if (vel[1] === 0 && pos[1] - Math.floor(pos[1]) < 0.05) onGround = true;
    // Distinguish ceiling vs floor by checking for a solid block just above head.
    const headY = pos[1] + height;
    if (world.isSolidBlock(Math.floor(pos[0]), Math.floor(headY + EPS), Math.floor(pos[2]))) {
      hitCeiling = true;
      onGround = false;
    }
  }
  // Final ground probe — check just below feet regardless of vertical motion.
  if (!onGround) {
    const footY = pos[1] - EPS;
    const minX = Math.floor(pos[0] - halfW + EPS);
    const maxX = Math.floor(pos[0] + halfW - EPS);
    const minZ = Math.floor(pos[2] - halfW + EPS);
    const maxZ = Math.floor(pos[2] + halfW - EPS);
    const fy = Math.floor(footY);
    outer: for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (world.isSolidBlock(x, fy, z)) { onGround = true; break outer; }
      }
    }
  }
  return { onGround, hitCeiling };
}

// Voxel DDA raycast. Returns the first solid voxel hit within `maxDist`, or
// null. The `face` is the unit vector pointing outward from the hit face into
// the block we approached from (i.e. the normal of the face we struck).
export function raycastVoxels(world, origin, dir, maxDist) {
  let x = Math.floor(origin[0]);
  let y = Math.floor(origin[1]);
  let z = Math.floor(origin[2]);

  const stepX = dir[0] > 0 ? 1 : dir[0] < 0 ? -1 : 0;
  const stepY = dir[1] > 0 ? 1 : dir[1] < 0 ? -1 : 0;
  const stepZ = dir[2] > 0 ? 1 : dir[2] < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir[0]) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir[1]) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir[2]) : Infinity;

  let tMaxX = stepX === 0 ? Infinity
    : ((stepX > 0 ? x + 1 - origin[0] : origin[0] - x) / Math.abs(dir[0]));
  let tMaxY = stepY === 0 ? Infinity
    : ((stepY > 0 ? y + 1 - origin[1] : origin[1] - y) / Math.abs(dir[1]));
  let tMaxZ = stepZ === 0 ? Infinity
    : ((stepZ > 0 ? z + 1 - origin[2] : origin[2] - z) / Math.abs(dir[2]));

  let face = [0, 0, 0];
  let t = 0;

  // Inclusive of starting voxel — but if you're already inside a solid block
  // we still want to allow targeting it. Most callers will be standing in air.
  if (world.isSolidBlock(x, y, z)) {
    return { x, y, z, face: [0, 0, 0], t: 0 };
  }

  while (t <= maxDist) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0];
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
    }
    if (t > maxDist) return null;
    if (world.isSolidBlock(x, y, z)) return { x, y, z, face, t };
  }
  return null;
}
