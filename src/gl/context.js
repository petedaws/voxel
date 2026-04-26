export function createContext(canvas) {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 is not supported in this browser.');

  const coarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cappedDpr = Math.min(devicePixelRatio || 1, coarsePointer ? 2 : 3);
  const resize = () => {
    canvas.width  = Math.max(1, Math.floor(canvas.clientWidth  * cappedDpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * cappedDpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  resize();
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  window.addEventListener('resize', resize);
  globalThis.visualViewport?.addEventListener('resize', resize);

  return gl;
}
