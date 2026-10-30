import * as THREE from 'three';
import { Game } from './core/Game.js';
import { REGIONS } from './world/regions.js';
import { PIXEL_LEVELS } from './core/settings.js';

const menu = document.getElementById('menu');
const play = document.getElementById('play');
const loading = document.getElementById('loading');

const game = new Game(document.getElementById('app'));
window.game = game; // handy for poking at things from the console
window.THREE = THREE;

// Loading: the world starts building as soon as the page opens, with a
// progress bar. Play works at any time: clicked early, it takes the mouse
// straight away and the game opens the moment the world is ready.
const loadBox = document.getElementById('load');
const loadFill = document.getElementById('load-fill');
const loadLabel = document.getElementById('load-label');
const loadPct = document.getElementById('load-pct');
let wantPlay = false;
let pendingRealm = null;

function enter() {
  wantPlay = false;
  menu.classList.remove('entering');
  menu.classList.add('hidden');
  if (pendingRealm) {
    game.travelTo(pendingRealm);
    pendingRealm = null;
  }
  game.setActive(true);
}

function waitForWorld() {
  wantPlay = true;
  menu.classList.add('entering');
  play.textContent = 'Entering the Vale\u2026';
}

loading.classList.add('hidden');
// Let the menu paint before the world generation starts.
requestAnimationFrame(() => {
  setTimeout(async () => {
    await game.init((f, label) => {
      loadFill.style.width = `${(f * 100).toFixed(1)}%`;
      loadPct.textContent = `${Math.round(f * 100)}%`;
      if (label) loadLabel.textContent = `${label}\u2026`;
    });
    game.start();
    loadBox.classList.add('done');
    loading.classList.remove('hidden');
    loading.textContent = 'WASD to move \u00b7 mouse to look';
    if (wantPlay) enter();
    else play.textContent = 'Click to begin';
  }, 30);
});

play.addEventListener('click', () => {
  // Show the wait straight away; the lock itself may be granted later.
  if (!game.ready) waitForWorld();
  game.input.lock();
});

// Realm select: step straight through to a realm's gate.
const worlds = document.getElementById('worlds');
for (const R of [{ id: 'vale', name: 'The Vale', tagline: 'Home' }, ...REGIONS]) {
  const b = document.createElement('button');
  b.className = 'world';
  b.innerHTML = `<b>${R.name}</b><span>${R.tagline}</span>`;
  b.addEventListener('click', () => {
    if (!game.ready) {
      pendingRealm = R.id === 'vale' ? null : R.id;
      waitForWorld();
      game.input.lock();
      return;
    }
    game.travelTo(R.id);
    game.input.lock();
  });
  worlds.appendChild(b);
}

// Pixelation: Off / Mild / Strong (P in the game cycles them too).
const pixels = document.getElementById('pixels');
const pixelButtons = PIXEL_LEVELS.map((L, i) => {
  const b = document.createElement('button');
  b.className = 'pix';
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.textContent = L.name;
  b.addEventListener('click', () => game.setPixelLevel(i, { quiet: true }));
  pixels.appendChild(b);
  return b;
});
function refreshPixels() {
  pixelButtons.forEach((b, i) => b.setAttribute('aria-checked', String(i === game.pixelLevel)));
}
window.addEventListener('murk:pixels', refreshPixels);
refreshPixels();

game.input.on('lock', () => {
  if (game.ready) enter();
  else waitForWorld();
});

function showMenu() {
  // Writing a note releases the mouse too; that isn't a pause.
  if (game.feedbackOpen) {
    game.setActive(false);
    return;
  }
  menu.classList.remove('hidden');
  if (!game.ready) {
    // Backed out while the world was still loading.
    wantPlay = false;
    menu.classList.remove('entering');
    play.textContent = 'Click to begin';
    return;
  }
  play.textContent = 'Resume';
  game.setActive(false);
}

game.input.on('unlock', showMenu);

// No pointer lock available: play anyway with drag-to-look, and use Esc for the menu.
game.input.on('lockfailed', () => {
  if (game.active) return;
  game.input.dragMode = true;
  document.getElementById('help-look').textContent = 'look';
  document.getElementById('help-look-key').textContent = 'Drag';
  if (game.ready) enter();
  else waitForWorld();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.input.dragMode && game.active) showMenu();
});
