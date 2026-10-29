// Keyboard and pointer-lock mouse input.

export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since the last frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    // Fallback when pointer lock is unavailable (some embedded frames, phones):
    // look around by dragging with the left mouse button.
    this.dragMode = false;
    this.listeners = { lock: [], unlock: [], lockfailed: [] };

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if ((this.locked || this.dragMode) && ['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked && !(this.dragMode && e.buttons & 1)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('pointerlockerror', () => this.emit('lockfailed'));

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.keys.clear();
      this.emit(this.locked ? 'lock' : 'unlock');
    });
  }

  emit(event) {
    for (const fn of this.listeners[event]) fn();
  }

  on(event, fn) {
    this.listeners[event].push(fn);
  }

  lock() {
    if (!this.element.requestPointerLock) {
      this.emit('lockfailed');
      return;
    }
    try {
      const p = this.element.requestPointerLock();
      if (p && p.catch) p.catch(() => this.emit('lockfailed'));
    } catch {
      this.emit('lockfailed');
    }
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
