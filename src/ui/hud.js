import { CHUNK_SIZE } from '../config.js';

const RENDER_DIST_STEPS = [4, 8, 12];

export class HUD {
  constructor(camera, chunkManager) {
    this.camera       = camera;
    this.chunkManager = chunkManager;
    this._el          = document.getElementById('hud');
    this._frameTimes  = [];
    this._rdIdx       = RENDER_DIST_STEPS.indexOf(chunkManager._currentRenderDist);
    if (this._rdIdx < 0) this._rdIdx = 1;

    document.addEventListener('keydown', e => {
      if (e.code === 'BracketLeft')  this._changeRD(-1);
      if (e.code === 'BracketRight') this._changeRD(+1);
    });
  }

  _changeRD(dir) {
    this._rdIdx = Math.max(0, Math.min(RENDER_DIST_STEPS.length-1, this._rdIdx + dir));
    this.chunkManager.setRenderDist(RENDER_DIST_STEPS[this._rdIdx]);
  }

  update(now, visibleCount) {
    this._frameTimes.push(now);
    while (this._frameTimes.length > 60) this._frameTimes.shift();
    let fps = 0;
    if (this._frameTimes.length > 1) {
      const span = this._frameTimes[this._frameTimes.length-1] - this._frameTimes[0];
      fps = Math.round((this._frameTimes.length - 1) / (span / 1000));
    }

    const p = this.camera.position;
    const cx = Math.floor(p[0] / CHUNK_SIZE);
    const cz = Math.floor(p[2] / CHUNK_SIZE);
    const stats = this.chunkManager.stats;

    this._el.innerHTML =
      `FPS: ${fps}<br>` +
      `Pos: ${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)}<br>` +
      `Chunk: ${cx}, ${cz}<br>` +
      `Loaded: ${stats.loaded} | Visible: ${visibleCount} | Building: ${stats.generating}<br>` +
      `Speed: ${this.camera.speed.toFixed(1)} u/s<br>` +
      `Render dist: ${RENDER_DIST_STEPS[this._rdIdx]} chunks &nbsp;<span style="opacity:0.6">[ ] to change</span>`;
  }
}
