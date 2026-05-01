import {
  CHUNK_SIZE, RENDER_DIST,
  PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_EYE_HEIGHT,
  WALK_SPEED, FLY_SPEED, JUMP_VELOCITY, GRAVITY, TERMINAL_VELOCITY,
  REACH_DISTANCE, BLOCK,
} from '../config.js';
import {
  moveAndCollide, aabbIntersectsSolid, raycastVoxels,
} from '../physics/voxelPhysics.js';

const DEG2RAD   = Math.PI / 180;
const PITCH_LIM = 89 * DEG2RAD;

const PLACEABLE_BLOCKS = [
  BLOCK.STONE, BLOCK.DIRT, BLOCK.GRASS,
  BLOCK.SAND,  BLOCK.SNOW,
];
const BLOCK_NAMES = {
  [BLOCK.STONE]: 'Stone',
  [BLOCK.DIRT]:  'Dirt',
  [BLOCK.GRASS]: 'Grass',
  [BLOCK.SAND]:  'Sand',
  [BLOCK.SNOW]:  'Snow',
};

export class PlayerController {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world  = world;

    // position is the player's feet (center of base of AABB).
    this.position = new Float32Array([0, 110, 0]);
    this.velocity = new Float32Array([0, 0, 0]);
    this.yaw      = 0;
    this.pitch    = 0;
    this.fov      = 70 * DEG2RAD;
    this.mode     = 'fly';   // 'walk' | 'fly' — start in fly so terrain can stream in
    this.onGround = false;

    this.halfW    = PLAYER_WIDTH / 2;
    this.height   = PLAYER_HEIGHT;
    this.eye      = PLAYER_EYE_HEIGHT;

    // Rendering interface (mirrors FlyCamera)
    this.viewProjection = new Float32Array(16);
    this._view = new Float32Array(16);
    this._proj = new Float32Array(16);
    this._eyePos = new Float32Array(3); // eye world pos used by renderer for fog

    this.selectedBlock = PLACEABLE_BLOCKS[0];
    this.targetBlock   = null; // last raycast hit, refreshed each frame

    this._keys     = {};
    this._locked   = false;
    this._inputEnabled = true;
    this._mobile = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);
    this._touchMove = { strafe: 0, fwd: 0 };
    this._touchLook = { active: false, pointerId: null, lastX: 0, lastY: 0 };
    this._joystick = { active: false, pointerId: null, radius: 34 };
    this._jumpReq  = false;
    this._lastJumpKey = false;
    this._lastModeKey = false;
    this._bindInput();
  }

  // The renderer uses `position` as the camera (eye) position. Override to
  // return the eye position rather than feet.
  get cameraPos() {
    this._eyePos[0] = this.position[0];
    this._eyePos[1] = this.position[1] + this.eye;
    this._eyePos[2] = this.position[2];
    return this._eyePos;
  }

  _bindInput() {
    const overlay = document.getElementById('overlay');
    const overlayButtons = [
      document.getElementById('overlay-start'),
      document.getElementById('overlay-close'),
    ].filter(Boolean);

    this._inputEnabled = !overlay || overlay.classList.contains('hidden');

    const closeOverlay = (requestLock) => {
      overlay?.classList.add('hidden');
      this._inputEnabled = true;
      this._keys = {};
      if (requestLock) this.canvas.requestPointerLock?.();
    };

    for (const button of overlayButtons) {
      button.addEventListener('click', e => {
        e.preventDefault();
        closeOverlay(!this._mobile);
      });
    }

    document.addEventListener('keydown', e => {
      if (!this._inputEnabled) {
        if (e.code === 'Escape') closeOverlay(false);
        return;
      }
      this._keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    });
    document.addEventListener('keyup', e => { this._keys[e.code] = false; });
    window.addEventListener('blur', () => { this._keys = {}; });

    if (!this._mobile) {
      this.canvas.addEventListener('click', () => {
        if (!this._locked && this._inputEnabled) this.canvas.requestPointerLock?.();
      });

      document.addEventListener('pointerlockchange', () => {
        this._locked = document.pointerLockElement === this.canvas;
        document.getElementById('overlay')?.classList.toggle('hidden', this._locked);
      });

      document.addEventListener('mousemove', e => {
        if (!this._locked) return;
        this.yaw   += e.movementX * 0.0018;
        this.pitch -= e.movementY * 0.0018;
        this.pitch  = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, this.pitch));
      });
    } else {
      this._locked = true;
      this.canvas.addEventListener('pointerdown', e => {
        if (!this._inputEnabled) return;
        if (e.target.closest('#mobile-controls')) return;
        e.preventDefault();
        this.canvas.setPointerCapture?.(e.pointerId);
        this._touchLook.active = true;
        this._touchLook.pointerId = e.pointerId;
        this._touchLook.lastX = e.clientX;
        this._touchLook.lastY = e.clientY;
      });
      this.canvas.addEventListener('pointermove', e => {
        if (!this._touchLook.active || e.pointerId !== this._touchLook.pointerId) return;
        e.preventDefault();
        const dx = e.clientX - this._touchLook.lastX;
        const dy = e.clientY - this._touchLook.lastY;
        this.yaw += dx * 0.0045;
        this.pitch -= dy * 0.0045;
        this.pitch = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, this.pitch));
        this._touchLook.lastX = e.clientX;
        this._touchLook.lastY = e.clientY;
      });
      const stopLook = e => {
        if (e.pointerId !== this._touchLook.pointerId) return;
        this._touchLook.active = false;
        this._touchLook.pointerId = null;
      };
      this.canvas.addEventListener('pointerup', stopLook);
      this.canvas.addEventListener('pointercancel', stopLook);
      this._bindJoystick();
    }

    document.addEventListener('wheel', e => {
      // Cycle selected block
      const i = PLACEABLE_BLOCKS.indexOf(this.selectedBlock);
      const n = PLACEABLE_BLOCKS.length;
      const j = ((i + (e.deltaY > 0 ? 1 : -1)) % n + n) % n;
      this.selectedBlock = PLACEABLE_BLOCKS[j];
    }, { passive: true });

    document.addEventListener('mousedown', e => {
      if (!this._locked) return;
      if (e.button === 0) this._breakBlock();
      else if (e.button === 2) this._placeBlock();
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Number keys 1..5 select block
    document.addEventListener('keydown', e => {
      const n = parseInt(e.key, 10);
      if (Number.isInteger(n) && n >= 1 && n <= PLACEABLE_BLOCKS.length) {
        this.selectedBlock = PLACEABLE_BLOCKS[n - 1];
      }
    });
  }

  _bindJoystick() {
    const base = document.getElementById('move-joystick');
    const knob = document.getElementById('move-joystick-knob');
    if (!base || !knob) return;

    const release = (e) => {
      if (e.pointerId !== this._joystick.pointerId) return;
      this._joystick.active = false;
      this._joystick.pointerId = null;
      this._touchMove.strafe = 0;
      this._touchMove.fwd = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    };
    const move = (e) => {
      if (!this._joystick.active || e.pointerId !== this._joystick.pointerId) return;
      const r = base.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > this._joystick.radius) {
        const k = this._joystick.radius / dist;
        dx *= k; dy *= k;
      }
      this._touchMove.strafe = dx / this._joystick.radius;
      this._touchMove.fwd = -(dy / this._joystick.radius);
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    base.addEventListener('pointerdown', e => {
      e.preventDefault();
      base.setPointerCapture?.(e.pointerId);
      this._joystick.active = true;
      this._joystick.pointerId = e.pointerId;
      move(e);
    });
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', release);
    base.addEventListener('pointercancel', release);
  }

  _toggleMode() {
    this.mode = this.mode === 'walk' ? 'fly' : 'walk';
    this.velocity[1] = 0;
  }

  update(dt) {
    // Mode toggle (F) — edge-triggered
    const modeKey = !!this._keys['KeyF'];
    if (modeKey && !this._lastModeKey) this._toggleMode();
    this._lastModeKey = modeKey;

    // Build view direction
    const cy = Math.cos(this.yaw),   sy = Math.sin(this.yaw);
    const keyboardFwd = (this._keys['KeyW'] ? 1 : 0) - (this._keys['KeyS'] ? 1 : 0);
    const keyboardStrafe = (this._keys['KeyD'] ? 1 : 0) - (this._keys['KeyA'] ? 1 : 0);
    const fwd = Math.max(-1, Math.min(1, keyboardFwd + this._touchMove.fwd));
    const strafe = Math.max(-1, Math.min(1, keyboardStrafe + this._touchMove.strafe));

    // Horizontal velocity from input (no inertia — feels responsive).
    let speed = this.mode === 'fly' ? FLY_SPEED : WALK_SPEED;
    if (this._keys['ControlLeft'] || this._keys['ControlRight']) speed *= 1.6;

    let vx = sy * fwd + cy * strafe;
    let vz = cy * fwd - sy * strafe;

    if (this.mode === 'fly') {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const vertical = (this._keys['Space'] ? 1 : 0) - ((this._keys['ShiftLeft'] || this._keys['ShiftRight']) ? 1 : 0);
      let vy = sp * fwd + vertical;
      vx = sy * cp * fwd + cy * strafe;
      vz = cy * cp * fwd - sy * strafe;

      const len = Math.hypot(vx, vy, vz);
      if (len > 0) {
        this.velocity[0] = vx / len * speed;
        this.velocity[1] = vy / len * speed;
        this.velocity[2] = vz / len * speed;
      } else {
        this.velocity[0] = 0;
        this.velocity[1] = 0;
        this.velocity[2] = 0;
      }
    } else {
      const len = Math.hypot(vx, vz);
      if (len > 0) { vx = vx / len * speed; vz = vz / len * speed; }
      this.velocity[0] = vx;
      this.velocity[2] = vz;
      // Walk: gravity + jump.
      const wantJump = !!this._keys['Space'];
      if (wantJump && !this._lastJumpKey && this.onGround) {
        this.velocity[1] = JUMP_VELOCITY;
      }
      this._lastJumpKey = wantJump;

      this.velocity[1] -= GRAVITY * dt;
      if (this.velocity[1] < -TERMINAL_VELOCITY) this.velocity[1] = -TERMINAL_VELOCITY;
    }

    // If the player is somehow inside a solid block (newly-loaded chunk under
    // them, fly→walk toggle) push them up out of it so they don't get stuck.
    while (aabbIntersectsSolid(this.world, this.position, this.halfW, this.height)) {
      this.position[1] += 1;
      this.velocity[1] = 0;
      if (this.position[1] > 256) break;
    }

    const result = moveAndCollide(
      this.world, this.position, this.velocity, dt, this.halfW, this.height,
    );
    this.onGround = result.onGround;

    // Refresh target block for HUD + click handlers
    this.targetBlock = this._raycast();

    this._buildMatrices();
  }

  _raycast() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw),   cy = Math.cos(this.yaw);
    const dir = [sy * cp, sp, cy * cp];
    const eye = this.cameraPos;
    return raycastVoxels(this.world, eye, dir, REACH_DISTANCE);
  }

  _breakBlock() {
    if (!this.targetBlock) return;
    const { x, y, z } = this.targetBlock;
    this.world.setBlock(x, y, z, BLOCK.AIR);
  }

  _placeBlock() {
    if (!this.targetBlock) return;
    const { x, y, z, face } = this.targetBlock;
    const px = x + face[0], py = y + face[1], pz = z + face[2];
    // Reject if placement cell would overlap the player's AABB.
    const p = this.position;
    const overlapsPlayer =
      p[0] - this.halfW  < px + 1 && p[0] + this.halfW  > px &&
      p[1]               < py + 1 && p[1] + this.height > py &&
      p[2] - this.halfW  < pz + 1 && p[2] + this.halfW  > pz;
    if (overlapsPlayer) return;
    this.world.setBlock(px, py, pz, this.selectedBlock);
  }

  _buildMatrices() {
    const asp  = this.canvas.width / this.canvas.height;
    const far  = CHUNK_SIZE * (RENDER_DIST + 2);
    _perspective(this._proj, this.fov, asp, 0.1, far);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw),   cy = Math.cos(this.yaw);
    const fdx = sy * cp, fdy = sp, fdz = cy * cp;

    _lookAt(this._view, this.cameraPos, fdx, fdy, fdz);
    _mat4Mul(this.viewProjection, this._proj, this._view);
  }

  get frustumPlanes() { return _frustumPlanes(this.viewProjection); }
}

export { BLOCK_NAMES, PLACEABLE_BLOCKS };

// ─── Math helpers (copied from flyCamera.js) ────────────────────────────────

function _perspective(out, fovy, aspect, near, far) {
  const f  = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out[0]=f/aspect; out[1]=0;  out[2]=0;              out[3]=0;
  out[4]=0;        out[5]=f;  out[6]=0;              out[7]=0;
  out[8]=0;        out[9]=0;  out[10]=(far+near)*nf; out[11]=-1;
  out[12]=0;       out[13]=0; out[14]=2*far*near*nf; out[15]=0;
}

function _lookAt(out, eye, fdx, fdy, fdz) {
  let rx = fdz, ry = 0, rz = -fdx;
  const rLen = Math.sqrt(rx*rx + rz*rz) || 1;
  rx /= rLen; rz /= rLen;

  const ux = fdy * rz - fdz * ry;
  const uy = fdz * rx - fdx * rz;
  const uz = fdx * ry - fdy * rx;

  out[0]=rx;   out[1]=ux;   out[2]=-fdx;  out[3]=0;
  out[4]=ry;   out[5]=uy;   out[6]=-fdy;  out[7]=0;
  out[8]=rz;   out[9]=uz;   out[10]=-fdz; out[11]=0;
  out[12]=-(rx*eye[0] + ry*eye[1] + rz*eye[2]);
  out[13]=-(ux*eye[0] + uy*eye[1] + uz*eye[2]);
  out[14]= (fdx*eye[0]+ fdy*eye[1]+ fdz*eye[2]);
  out[15]=1;
}

function _mat4Mul(out, a, b) {
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r + k*4] * b[k + c*4];
      out[r + c*4] = s;
    }
}

function _frustumPlanes(m) {
  const raw = [
    [m[3]+m[0],  m[7]+m[4],  m[11]+m[8],  m[15]+m[12]],
    [m[3]-m[0],  m[7]-m[4],  m[11]-m[8],  m[15]-m[12]],
    [m[3]+m[1],  m[7]+m[5],  m[11]+m[9],  m[15]+m[13]],
    [m[3]-m[1],  m[7]-m[5],  m[11]-m[9],  m[15]-m[13]],
    [m[3]+m[2],  m[7]+m[6],  m[11]+m[10], m[15]+m[14]],
    [m[3]-m[2],  m[7]-m[6],  m[11]-m[10], m[15]-m[14]],
  ];
  return raw.map(([a,b,c,d]) => {
    const l = Math.sqrt(a*a+b*b+c*c);
    return [a/l, b/l, c/l, d/l];
  });
}
