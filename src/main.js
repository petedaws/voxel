import { createContext } from './gl/context.js';
import { Renderer } from './renderer/renderer.js';
import { PlayerController } from './camera/playerController.js';
import { ChunkManager } from './terrain/chunkManager.js';
import { HUD } from './ui/hud.js';

async function main() {
  const canvas = document.getElementById('canvas');
  const gl     = createContext(canvas);

  const renderer     = new Renderer(gl);
  const chunkManager = new ChunkManager(renderer);
  const player       = new PlayerController(canvas, chunkManager);
  const hud          = new HUD(player, chunkManager);

  let last = 0;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    chunkManager.update(player.position);
    player.update(dt);

    const chunks        = chunkManager.readyChunks;
    const frustumPlanes = player.frustumPlanes;
    const visibleCount  = renderer.render(player, chunks, frustumPlanes);

    hud.update(now, visibleCount);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
}

main().catch(err => {
  console.error(err);
  document.getElementById('overlay').innerHTML =
    `<h1 style="color:#f66">Error</h1><pre>${err.message}</pre>`;
  document.getElementById('overlay').classList.remove('hidden');
});
