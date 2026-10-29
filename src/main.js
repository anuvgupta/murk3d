import { Game } from './core/Game.js';

const menu = document.getElementById('menu');
const play = document.getElementById('play');
const loading = document.getElementById('loading');

const game = new Game(document.getElementById('app'));
window.game = game; // handy for poking at things from the console

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

game.input.on('lock', () => {
  menu.classList.add('hidden');
  game.setActive(true);
});

game.input.on('unlock', () => {
  menu.classList.remove('hidden');
  play.textContent = 'Resume';
  game.setActive(false);
});
