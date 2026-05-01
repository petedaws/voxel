import { CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DIST, WORKER_COUNT, BLOCK } from '../config.js';
import { Chunk, ChunkState } from './chunk.js';

const key = (cx, cz) => `${cx},${cz}`;

export class ChunkManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.chunks   = new Map(); // key → Chunk

    this._workerPool   = [];
    this._workerFree   = [];
    this._pendingQueue = []; // {cx, cz} sorted by priority
    this._remeshQueue  = new Set(); // chunk keys needing re-mesh
    this._currentRenderDist = RENDER_DIST;

    this._initWorkers();
  }

  _initWorkers() {
    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL('../workers/chunkWorker.js', import.meta.url),
        { type: 'module' }
      );
      worker.onmessage = e => this._onWorkerResult(e.data, worker);
      worker.onerror   = e => { console.error('Worker error', e); this._workerFree.push(worker); };
      this._workerPool.push(worker);
      this._workerFree.push(worker);
    }
  }

  setRenderDist(d) {
    this._currentRenderDist = d;
  }

  update(camPos) {
    const cx = Math.floor(camPos[0] / CHUNK_SIZE);
    const cz = Math.floor(camPos[2] / CHUNK_SIZE);
    const rd = this._currentRenderDist;

    // Compute desired set
    const desired = new Set();
    for (let dz = -rd; dz <= rd; dz++) {
      for (let dx = -rd; dx <= rd; dx++) {
        if (dx*dx + dz*dz <= rd*rd) desired.add(key(cx+dx, cz+dz));
      }
    }

    // Unload chunks outside desired
    for (const [k, chunk] of this.chunks) {
      if (!desired.has(k)) {
        if (chunk.gpu) this.renderer.freeChunkMesh(chunk.gpu);
        this.chunks.delete(k);
        this._remeshQueue.delete(k);
      }
    }

    // Queue new chunks to load, sorted by distance to player
    const toLoad = [];
    for (const k of desired) {
      if (!this.chunks.has(k)) {
        const [ccx, ccz] = k.split(',').map(Number);
        const dist = (ccx-cx)*(ccx-cx) + (ccz-cz)*(ccz-cz);
        toLoad.push({ cx: ccx, cz: ccz, dist });
        this.chunks.set(k, new Chunk(ccx, ccz));
      }
    }
    toLoad.sort((a,b) => a.dist - b.dist);

    // Add to pending queue (avoid duplicates)
    const queuedKeys = new Set(this._pendingQueue.map(e => key(e.cx, e.cz)));
    for (const item of toLoad) {
      if (!queuedKeys.has(key(item.cx, item.cz))) {
        this._pendingQueue.push(item);
      }
    }

    // Dispatch to free workers
    this._dispatchPending();

    // Process re-mesh queue (process as many as we have free workers)
    if (this._remeshQueue.size > 0) {
      for (const k of [...this._remeshQueue]) {
        if (this._workerFree.length === 0) break;
        const chunk = this.chunks.get(k);
        if (!chunk || chunk.state !== ChunkState.READY || !chunk.voxels || chunk.busy) {
          this._remeshQueue.delete(k);
          continue;
        }
        this._remeshQueue.delete(k);
        this._dispatchRemesh(chunk);
      }
    }
  }

  _dispatchPending() {
    while (this._workerFree.length > 0 && this._pendingQueue.length > 0) {
      const { cx, cz } = this._pendingQueue.shift();
      const chunk = this.chunks.get(key(cx, cz));
      if (!chunk || chunk.state !== ChunkState.PENDING) continue;

      chunk.state = ChunkState.GENERATING;
      const worker = this._workerFree.pop();
      worker.postMessage({ type: 'generate', cx, cz, neighbors: this._getNeighborData(cx, cz) });
    }
  }

  _dispatchRemesh(chunk) {
    if (this._workerFree.length === 0) {
      this._remeshQueue.add(chunk.key());
      return;
    }
    const worker = this._workerFree.pop();
    chunk.busy = true;
    // Copy so the chunk's voxel data stays queryable (collision, further edits)
    // while the worker meshes. Buffer is transferred to the worker, then thrown away.
    const voxelsCopy = new Uint8Array(chunk.voxels);
    worker.postMessage({
      type: 'remesh',
      cx: chunk.cx,
      cz: chunk.cz,
      voxels: voxelsCopy,
      neighbors: this._getNeighborData(chunk.cx, chunk.cz),
    }, [voxelsCopy.buffer]);
  }

  _getNeighborData(cx, cz) {
    return {
      px: this._voxelsOf(cx+1, cz),
      nx: this._voxelsOf(cx-1, cz),
      pz: this._voxelsOf(cx,   cz+1),
      nz: this._voxelsOf(cx,   cz-1),
    };
  }

  _voxelsOf(cx, cz) {
    const chunk = this.chunks.get(key(cx, cz));
    return (chunk && chunk.voxels) ? chunk.voxels : null;
  }

  _onWorkerResult(data, worker) {
    this._workerFree.push(worker);

    const chunk = this.chunks.get(key(data.cx, data.cz));
    if (!chunk) {
      // Chunk was unloaded before worker finished — discard
      this._dispatchPending();
      return;
    }

    const wasInitialGen = (chunk.state !== ChunkState.READY);
    if (wasInitialGen) {
      // Initial generation: take ownership of the worker's voxel buffer.
      chunk.voxels = data.voxels;
      chunk.state  = ChunkState.READY;
    }
    // For remesh of an existing chunk we already have voxels in main thread;
    // the worker's copy is discarded.
    chunk.busy = false;

    // Upload mesh to GPU
    if (chunk.gpu) this.renderer.freeChunkMesh(chunk.gpu);
    chunk.gpu = this.renderer.uploadChunkMesh(data.vertices, data.indices);

    // Trigger re-mesh on neighbours that are already loaded so they can
    // hide faces against this chunk's border voxels.
    for (const [dcx, dcz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nk = key(chunk.cx + dcx, chunk.cz + dcz);
      const nc = this.chunks.get(nk);
      if (nc && nc.state === ChunkState.READY) this._remeshQueue.add(nk);
    }

    this._dispatchPending();
  }

  // ─── Voxel access (world coordinates) ───────────────────────────────────────

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BLOCK.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(key(cx, cz));
    if (!chunk || !chunk.voxels) return BLOCK.AIR;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return chunk.voxels[lx + lz * CHUNK_SIZE + wy * CHUNK_SIZE * CHUNK_SIZE];
  }

  isSolidBlock(wx, wy, wz) {
    const b = this.getBlock(wx, wy, wz);
    return b !== BLOCK.AIR && b !== BLOCK.WATER;
  }

  setBlock(wx, wy, wz, value) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(key(cx, cz));
    if (!chunk || !chunk.voxels) return false;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const idx = lx + lz * CHUNK_SIZE + wy * CHUNK_SIZE * CHUNK_SIZE;
    if (chunk.voxels[idx] === value) return false;
    chunk.voxels[idx] = value;

    // Mark this chunk for remesh.
    this._remeshQueue.add(chunk.key());
    // Mark border-touching neighbours, since their hidden faces depend on
    // this voxel.
    if (lx === 0)               this._maybeQueueRemesh(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1)  this._maybeQueueRemesh(cx + 1, cz);
    if (lz === 0)               this._maybeQueueRemesh(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1)  this._maybeQueueRemesh(cx, cz + 1);
    return true;
  }

  _maybeQueueRemesh(cx, cz) {
    const c = this.chunks.get(key(cx, cz));
    if (c && c.state === ChunkState.READY) this._remeshQueue.add(c.key());
  }

  get readyChunks() {
    const result = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.state === ChunkState.READY && chunk.gpu) result.push(chunk);
    }
    return result;
  }

  get stats() {
    let loaded = 0, generating = 0;
    for (const c of this.chunks.values()) {
      if (c.state === ChunkState.READY) loaded++;
      else generating++;
    }
    return { loaded, generating, queued: this._pendingQueue.length };
  }
}
