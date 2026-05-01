import { createProgram } from '../gl/shader.js';
import { createVBO, createIBO, createChunkVAO } from '../gl/buffer.js';
import { createAtlasTexture } from './texture.js';
import { CHUNK_SIZE, SEA_LEVEL, FOG_DENSITY } from '../config.js';

import terrainVert from './shaders/terrain.vert?raw';
import terrainFrag from './shaders/terrain.frag?raw';
import waterVert   from './shaders/water.vert?raw';
import waterFrag   from './shaders/water.frag?raw';

const FOG_COLOR = [0.55, 0.75, 0.95];

// Flat water quad covering one chunk at SEA_LEVEL
function makeWaterQuadVerts() {
  const S = CHUNK_SIZE;
  const Y = SEA_LEVEL + 0.9; // slightly below top of sea-level voxel
  return new Float32Array([
    0, Y, 0,
    S, Y, 0,
    S, Y, S,
    0, Y, S,
  ]);
}
const WATER_INDICES = new Uint32Array([0,1,2, 0,2,3]);

export class Renderer {
  constructor(gl) {
    this.gl = gl;

    this.terrainProg = createProgram(gl, terrainVert, terrainFrag);
    this.waterProg   = createProgram(gl, waterVert,   waterFrag);

    this.atlas = createAtlasTexture(gl);

    // Cache uniform locations
    this._tUni = this._uniforms(this.terrainProg,
      ['u_viewProjection','u_chunkOffset','u_atlas','u_cameraPos','u_fogColor','u_fogDensity']);
    this._wUni = this._uniforms(this.waterProg,
      ['u_viewProjection','u_chunkOffset','u_cameraPos','u_fogColor','u_fogDensity']);

    // Water quad shared geometry
    const wVBO = createVBO(gl, makeWaterQuadVerts());
    const wIBO = createIBO(gl, WATER_INDICES);
    this.waterVAO = this._makeWaterVAO(wVBO, wIBO);
  }

  _uniforms(prog, names) {
    const map = {};
    for (const n of names) map[n] = this.gl.getUniformLocation(prog, n);
    return map;
  }

  _makeWaterVAO(vbo, ibo) {
    const gl  = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return vao;
  }

  /** Upload mesh data for a chunk and return {vao, indexCount} */
  uploadChunkMesh(vertices, indices) {
    const gl  = this.gl;
    const vbo = createVBO(gl, vertices);
    const ibo = createIBO(gl, indices);
    const vao = createChunkVAO(gl, vbo, ibo);
    return { vao, vbo, ibo, indexCount: indices.length };
  }

  freeChunkMesh({ vao, vbo, ibo }) {
    const gl = this.gl;
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(ibo);
  }

  render(camera, chunks, frustumPlanes) {
    const gl = this.gl;
    gl.clearColor(...FOG_COLOR, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const visibleChunks = chunks.filter(c => this._inFrustum(c, frustumPlanes));

    // — Opaque terrain pass —
    gl.useProgram(this.terrainProg);
    const tu = this._tUni;
    gl.uniformMatrix4fv(tu.u_viewProjection, false, camera.viewProjection);
    gl.uniform3fv(tu.u_cameraPos,  (camera.cameraPos || camera.position));
    gl.uniform3fv(tu.u_fogColor,   FOG_COLOR);
    gl.uniform1f(tu.u_fogDensity,  FOG_DENSITY);
    gl.uniform1i(tu.u_atlas, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);

    for (const chunk of visibleChunks) {
      if (!chunk.gpu) continue;
      gl.uniform3fv(tu.u_chunkOffset, [
        chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE,
      ]);
      gl.bindVertexArray(chunk.gpu.vao);
      gl.drawElements(gl.TRIANGLES, chunk.gpu.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);

    // — Water pass (translucent) —
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    gl.useProgram(this.waterProg);
    const wu = this._wUni;
    gl.uniformMatrix4fv(wu.u_viewProjection, false, camera.viewProjection);
    gl.uniform3fv(wu.u_cameraPos,  (camera.cameraPos || camera.position));
    gl.uniform3fv(wu.u_fogColor,   FOG_COLOR);
    gl.uniform1f(wu.u_fogDensity,  FOG_DENSITY);

    for (const chunk of visibleChunks) {
      gl.uniform3fv(wu.u_chunkOffset, [
        chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE,
      ]);
      gl.bindVertexArray(this.waterVAO);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);
    gl.depthMask(true);

    return visibleChunks.length;
  }

  _inFrustum(chunk, planes) {
    if (!planes) return true;
    const minX = chunk.cx * CHUNK_SIZE;
    const minY = 0;
    const minZ = chunk.cz * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE;
    const maxY = CHUNK_HEIGHT_CONST;
    const maxZ = minZ + CHUNK_SIZE;

    for (const [a, b, c, d] of planes) {
      const px = a > 0 ? maxX : minX;
      const py = b > 0 ? maxY : minY;
      const pz = c > 0 ? maxZ : minZ;
      if (a * px + b * py + c * pz + d < 0) return false;
    }
    return true;
  }
}

const CHUNK_HEIGHT_CONST = 128;
