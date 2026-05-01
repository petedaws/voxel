import { createProgram } from '../gl/shader.js';
import { createVBO, createIBO, createChunkVAO } from '../gl/buffer.js';
import { createAtlasTexture } from './texture.js';
import { CHUNK_SIZE, FOG_DENSITY } from '../config.js';

import terrainVert from './shaders/terrain.vert?raw';
import terrainFrag from './shaders/terrain.frag?raw';

const FOG_COLOR = [0.55, 0.75, 0.95];

export class Renderer {
  constructor(gl) {
    this.gl = gl;

    this.terrainProg = createProgram(gl, terrainVert, terrainFrag);
    this.atlas = createAtlasTexture(gl);

    this._tUni = this._uniforms(this.terrainProg, [
      'u_viewProjection',
      'u_chunkOffset',
      'u_atlas',
      'u_cameraPos',
      'u_fogColor',
      'u_fogDensity',
    ]);
  }

  _uniforms(prog, names) {
    const map = {};
    for (const n of names) map[n] = this.gl.getUniformLocation(prog, n);
    return map;
  }

  uploadChunkMesh(vertices, indices) {
    const gl = this.gl;
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

    gl.useProgram(this.terrainProg);
    const tu = this._tUni;
    gl.uniformMatrix4fv(tu.u_viewProjection, false, camera.viewProjection);
    gl.uniform3fv(tu.u_cameraPos, camera.cameraPos || camera.position);
    gl.uniform3fv(tu.u_fogColor, FOG_COLOR);
    gl.uniform1f(tu.u_fogDensity, FOG_DENSITY);
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
