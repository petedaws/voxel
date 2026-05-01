export const ChunkState = {
  PENDING:    'PENDING',
  GENERATING: 'GENERATING',
  READY:      'READY',
};

export class Chunk {
  constructor(cx, cz) {
    this.cx    = cx;
    this.cz    = cz;
    this.state = ChunkState.PENDING;
    this.voxels = null; // Uint8Array once generated
    this.gpu    = null; // { vao, vbo, ibo, indexCount } once uploaded
    this.busy   = false; // a remesh request is in flight (for edits)
  }

  key() {
    return `${this.cx},${this.cz}`;
  }
}
