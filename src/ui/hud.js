import { CHUNK_SIZE } from '../config.js';
import { BLOCK_NAMES, PLACEABLE_BLOCKS } from '../camera/playerController.js';

const RENDER_DIST_STEPS = [4, 8, 12];

export class HUD {
  constructor(player, chunkManager) {
    this.player       = player;
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

    const p = this.player.position;
    const cx = Math.floor(p[0] / CHUNK_SIZE);
    const cz = Math.floor(p[2] / CHUNK_SIZE);
    const stats = this.chunkManager.stats;

    const tgt = this.player.targetBlock;
    const tgtStr = tgt
      ? `${tgt.x}, ${tgt.y}, ${tgt.z}`
      : '<span style="opacity:0.5">none</span>';

    const slotIdx = PLACEABLE_BLOCKS.indexOf(this.player.selectedBlock);
    const slots = PLACEABLE_BLOCKS.map((b, i) => {
      const name = BLOCK_NAMES[b] || '?';
      return i === slotIdx
        ? `<b style="color:#fc6">${i+1}:${name}</b>`
        : `<span style="opacity:0.6">${i+1}:${name}</span>`;
    }).join(' ');

    this._el.innerHTML =
      `FPS: ${fps}<br>` +
      `Pos: ${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)}<br>` +
      `Chunk: ${cx}, ${cz}<br>` +
      `Mode: ${this.player.mode.toUpperCase()}` +
        (this.player.mode === 'walk' ? (this.player.onGround ? ' (grounded)' : ' (airborne)') : '') +
        ` <span style="opacity:0.6">[F]</span><br>` +
      `Loaded: ${stats.loaded} | Visible: ${visibleCount} | Building: ${stats.generating}<br>` +
      `Render dist: ${RENDER_DIST_STEPS[this._rdIdx]} chunks <span style="opacity:0.6">[ ]</span><br>` +
      `Target: ${tgtStr}<br>` +
      `Block: ${slots}`;
  }
}
