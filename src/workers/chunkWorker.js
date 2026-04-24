import { generateChunk } from '../terrain/generator.js';
import { buildMesh } from '../terrain/meshBuilder.js';

self.onmessage = function(e) {
  const { type, cx, cz, neighbors } = e.data;

  let voxels;
  if (type === 'generate') {
    voxels = generateChunk(cx, cz);
  } else if (type === 'remesh') {
    voxels = e.data.voxels;
  } else return;

  const { vertices, indices } = buildMesh(voxels, neighbors ?? {});

  self.postMessage(
    { cx, cz, voxels, vertices, indices },
    [voxels.buffer, vertices.buffer, indices.buffer]
  );
};
