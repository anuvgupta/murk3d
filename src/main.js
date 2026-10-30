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

play.disabled = true;

// Let the menu paint before the (blocking) world generation starts.
requestAnimationFrame(() => {
  setTimeout(() => {
    game.init();
    game.start();
    play.disabled = false;
    loading.textContent = 'WASD to move · mouse to look';
  }, 30);
});

play.addEventListener('click', () => game.input.lock());

// Realm select: step straight through to a realm's gate.
const worlds = document.getElementById('worlds');
for (const R of [{ id: 'vale', name: 'The Vale', tagline: 'Home' }, ...REGIONS]) {
  const b = document.createElement('button');
  b.className = 'world';
  b.innerHTML = `<b>${R.name}</b><span>${R.tagline}</span>`;
  b.addEventListener('click', () => {
    if (!game.player) return;
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
  menu.classList.add('hidden');
  game.setActive(true);
});

function showMenu() {
  // Writing a note releases the mouse too; that isn't a pause.
  if (game.feedbackOpen) {
    game.setActive(false);
    return;
  }
  menu.classList.remove('hidden');
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
  menu.classList.add('hidden');
  game.setActive(true);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.input.dragMode && game.active) showMenu();
});
