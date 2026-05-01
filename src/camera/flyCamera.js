import { FLY_SPEED, CHUNK_SIZE, RENDER_DIST } from '../config.js';

const DEG2RAD   = Math.PI / 180;
const PITCH_LIM = 89 * DEG2RAD;

export class FlyCamera {
  constructor(canvas) {
    this.canvas   = canvas;
    this.position = new Float32Array([0, 80, 0]);
    this.yaw      = 0;   // rotation around Y; 0 = looking +Z
    this.pitch    = 0;   // rotation around X; positive = look up
    this.fov      = 70 * DEG2RAD;
    this.speed    = FLY_SPEED;

    this.viewProjection = new Float32Array(16);
    this._view = new Float32Array(16);
    this._proj = new Float32Array(16);

    this._keys   = {};
    this._locked = false;

    // Touch state: virtual joystick (movement) + drag-look + vertical buttons
    this._touchMove = { id: null, dx: 0, dy: 0 }; // joystick offset, pixels
    this._touchLook = { id: null, x: 0, y: 0 };
    this._touchVert = 0; // -1, 0, +1 from on-screen up/down buttons
    this._isTouch   = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    this._bindInput();
  }

  _bindInput() {
    document.addEventListener('keydown', e => { this._keys[e.code] = true; });
    document.addEventListener('keyup',   e => { this._keys[e.code] = false; });

    this.canvas.addEventListener('click', () => {
      if (!this._isTouch) this.canvas.requestPointerLock();
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

    document.addEventListener('wheel', e => {
      this.speed = Math.max(0.5, Math.min(100, this.speed * (e.deltaY > 0 ? 0.9 : 1.1)));
    }, { passive: true });

    if (this._isTouch) this._bindTouch();
  }

  _bindTouch() {
    const overlay = document.getElementById('overlay');
    const stick   = document.getElementById('touch-stick');
    const knob    = document.getElementById('touch-stick-knob');
    const upBtn   = document.getElementById('touch-up');
    const downBtn = document.getElementById('touch-down');

    // Reveal touch UI and dismiss start overlay on first tap
    document.body.classList.add('touch');
    const dismissOverlay = () => overlay?.classList.add('hidden');
    overlay?.addEventListener('touchstart', e => { e.preventDefault(); dismissOverlay(); }, { passive: false });

    const STICK_RADIUS = 60;

    const onStickStart = e => {
      const t = e.changedTouches[0];
      this._touchMove.id = t.identifier;
      const r = stick.getBoundingClientRect();
      this._stickCx = r.left + r.width / 2;
      this._stickCy = r.top  + r.height / 2;
      this._updateStick(t.clientX, t.clientY, knob, STICK_RADIUS);
      e.preventDefault();
    };

    stick?.addEventListener('touchstart', onStickStart, { passive: false });

    const setVert = (v, btn) => e => {
      this._touchVert = v;
      btn.classList.add('active');
      e.preventDefault();
    };
    const clearVert = btn => e => {
      this._touchVert = 0;
      btn.classList.remove('active');
      e.preventDefault();
    };
    upBtn?.addEventListener('touchstart', setVert(+1, upBtn),  { passive: false });
    upBtn?.addEventListener('touchend',   clearVert(upBtn),     { passive: false });
    upBtn?.addEventListener('touchcancel',clearVert(upBtn),     { passive: false });
    downBtn?.addEventListener('touchstart', setVert(-1, downBtn), { passive: false });
    downBtn?.addEventListener('touchend',   clearVert(downBtn),   { passive: false });
    downBtn?.addEventListener('touchcancel',clearVert(downBtn),   { passive: false });

    // Look-drag: any touch on the canvas that isn't on a UI control
    this.canvas.addEventListener('touchstart', e => {
      dismissOverlay();
      for (const t of e.changedTouches) {
        if (this._touchLook.id === null && t.identifier !== this._touchMove.id) {
          this._touchLook.id = t.identifier;
          this._touchLook.x  = t.clientX;
          this._touchLook.y  = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchMove.id) {
          this._updateStick(t.clientX, t.clientY, knob, STICK_RADIUS);
        } else if (t.identifier === this._touchLook.id) {
          const dx = t.clientX - this._touchLook.x;
          const dy = t.clientY - this._touchLook.y;
          this._touchLook.x = t.clientX;
          this._touchLook.y = t.clientY;
          this.yaw   += dx * 0.005;
          this.pitch -= dy * 0.005;
          this.pitch  = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, this.pitch));
        }
      }
    }, { passive: false });

    const endTouch = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchMove.id) {
          this._touchMove.id = null;
          this._touchMove.dx = 0;
          this._touchMove.dy = 0;
          if (knob) knob.style.transform = 'translate(-50%, -50%)';
        } else if (t.identifier === this._touchLook.id) {
          this._touchLook.id = null;
        }
      }
    };
    document.addEventListener('touchend',    endTouch, { passive: false });
    document.addEventListener('touchcancel', endTouch, { passive: false });
  }

  _updateStick(clientX, clientY, knob, radius) {
    let dx = clientX - this._stickCx;
    let dy = clientY - this._stickCy;
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx = dx * radius / len; dy = dy * radius / len; }
    this._touchMove.dx = dx / radius;
    this._touchMove.dy = dy / radius;
    if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  update(dt) {
    const k   = this._keys;
    const sy  = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward=(sy,0,cy)  right=(cy,0,-sy)  consistent with yaw=0→+Z
    let fwd    = k['KeyW'] ? 1 : k['KeyS'] ? -1 : 0;
    let strafe = k['KeyD'] ? 1 : k['KeyA'] ? -1 : 0;
    let vert   = k['Space'] ? 1 : (k['ShiftLeft'] || k['ShiftRight']) ? -1 : 0;

    // Touch joystick: dy<0 (up) = forward, dx>0 (right) = strafe right
    if (this._touchMove.id !== null) {
      fwd    += -this._touchMove.dy;
      strafe +=  this._touchMove.dx;
    }
    if (this._touchVert) vert += this._touchVert;

    // Clamp combined vector so simultaneous keyboard + touch can't double speed
    const hLen = Math.hypot(fwd, strafe);
    if (hLen > 1) { fwd /= hLen; strafe /= hLen; }
    if (vert >  1) vert =  1;
    if (vert < -1) vert = -1;

    this.position[0] += (sy * fwd + cy * strafe) * this.speed * dt;
    this.position[2] += (cy * fwd - sy * strafe) * this.speed * dt;
    this.position[1] += vert * this.speed * dt;

    this._buildMatrices();
  }

  _buildMatrices() {
    const asp  = this.canvas.width / this.canvas.height;
    const far  = CHUNK_SIZE * (RENDER_DIST + 2);
    _perspective(this._proj, this.fov, asp, 0.1, far);

    // Look direction from yaw + pitch
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw),   cy = Math.cos(this.yaw);
    const fdx = sy * cp, fdy = sp, fdz = cy * cp;

    _lookAt(this._view, this.position, fdx, fdy, fdz);
    _mat4Mul(this.viewProjection, this._proj, this._view);
  }

  get frustumPlanes() { return _frustumPlanes(this.viewProjection); }
}

// ─── Math helpers ────────────────────────────────────────────────────────────

function _perspective(out, fovy, aspect, near, far) {
  const f  = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out[0]=f/aspect; out[1]=0;  out[2]=0;              out[3]=0;
  out[4]=0;        out[5]=f;  out[6]=0;              out[7]=0;
  out[8]=0;        out[9]=0;  out[10]=(far+near)*nf; out[11]=-1;
  out[12]=0;       out[13]=0; out[14]=2*far*near*nf; out[15]=0;
}

function _lookAt(out, eye, fdx, fdy, fdz) {
  // right = up(0,1,0) × forward
  let rx = -fdz, ry = 0, rz = fdx;
  const rLen = Math.sqrt(rx*rx + rz*rz) || 1;
  rx /= rLen; rz /= rLen;

  // up = right × forward  (re-orthogonalise; gives (0,1,0) at level orientation)
  const ux = ry * fdz - rz * fdy;
  const uy = rz * fdx - rx * fdz;
  const uz = rx * fdy - ry * fdx;

  // Column-major view matrix
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
