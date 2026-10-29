// Keyboard and pointer-lock mouse input.

export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since the last frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.listeners = { lock: [], unlock: [] };

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.locked && ['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.keys.clear();
      for (const fn of this.listeners[this.locked ? 'lock' : 'unlock']) fn();
    });
  }

  on(event, fn) {
    this.listeners[event].push(fn);
  }

  lock() {
    const p = this.element.requestPointerLock();
    // Some browsers return a promise that rejects if the request is too soon after an unlock.
    if (p && p.catch) p.catch(() => {});
  }

  down(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Call once at the end of every frame.
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pressed.clear();
  }
}
