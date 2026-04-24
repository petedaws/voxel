import { createContext } from './gl/context.js';
import { Renderer } from './renderer/renderer.js';
import { FlyCamera } from './camera/flyCamera.js';
import { ChunkManager } from './terrain/chunkManager.js';
import { HUD } from './ui/hud.js';

async function main() {
  const canvas = document.getElementById('canvas');
  const gl     = createContext(canvas);

  const renderer     = new Renderer(gl);
  const camera       = new FlyCamera(canvas);
  const chunkManager = new ChunkManager(renderer);
  const hud          = new HUD(camera, chunkManager);

  let last = 0;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    camera.update(dt);
    chunkManager.update(camera.position);

    const chunks        = chunkManager.readyChunks;
    const frustumPlanes = camera.frustumPlanes;
    const visibleCount  = renderer.render(camera, chunks, frustumPlanes);

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
