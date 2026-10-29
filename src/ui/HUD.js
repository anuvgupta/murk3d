// Skyrim-style compass strip, time of day and control hints.

const PX_PER_DEG = 3;
const LABELS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.strip = document.getElementById('compass-strip');
    this.compass = document.getElementById('compass');
    this.timeLabel = document.getElementById('time-label');
    this.marks = [];

    for (let deg = 0; deg < 360; deg += 15) {
      const el = document.createElement('span');
      if (LABELS[deg]) {
        el.textContent = LABELS[deg];
      } else {
        el.textContent = '|';
        el.className = 'tick';
      }
      this.strip.appendChild(el);
      this.marks.push({ deg, el });
    }
    this.lastTime = '';
  }

  toast(text) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      this.root.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  show(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  // yaw: camera yaw in radians (0 faces -z, which we call north).
  update(yaw, timeText) {
    const heading = ((-yaw * 180) / Math.PI + 360 * 10) % 360;
    const half = this.compass.clientWidth / 2;
    for (const { deg, el } of this.marks) {
      let delta = deg - heading;
      delta = ((delta + 540) % 360) - 180;
      const x = half + delta * PX_PER_DEG;
      el.style.transform = `translateX(${x}px) translateX(-50%)`;
      el.style.visibility = Math.abs(delta) < 100 ? 'visible' : 'hidden';
    }
    if (timeText !== this.lastTime) {
      this.timeLabel.textContent = timeText;
      this.lastTime = timeText;
    }
  }
}
