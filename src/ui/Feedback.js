import * as THREE from 'three';

// In-game feedback: press F to pin a note to what you're looking at.
//
// Captures a screenshot, your position, view direction, the time of day and
// what's under the crosshair, then files it as a GitHub issue (labelled
// "feedback") with the screenshot committed to the repo's `feedback` branch.
// Needs a GitHub token with Contents and Issues write access to this repo,
// stored only in this browser. Without one, notes are kept locally.

const OWNER = 'anuvgupta';
const REPO = 'murk3d';
const BRANCH = 'feedback';
const TOKEN_KEY = 'murk.githubToken';
const QUEUE_KEY = 'murk.feedbackQueue';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked; the token just won't persist.
  }
}

export class Feedback {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('feedback');
    this.shot = document.getElementById('fb-shot');
    this.meta = document.getElementById('fb-meta');
    this.text = document.getElementById('fb-text');
    this.kind = document.getElementById('fb-kind');
    this.status = document.getElementById('fb-status');
    this.tokenInput = document.getElementById('fb-token');
    this.tokenRow = document.getElementById('fb-token-row');
    this.open = false;

    document.getElementById('fb-send').addEventListener('click', () => this.submit());
    document.getElementById('fb-cancel').addEventListener('click', () => this.close());
    document.getElementById('fb-token-save').addEventListener('click', () => {
      const t = this.tokenInput.value.trim();
      storageSet(TOKEN_KEY, t || null);
      this.tokenInput.value = '';
      this.refreshToken();
    });
    document.getElementById('fb-token-clear').addEventListener('click', () => {
      storageSet(TOKEN_KEY, null);
      this.refreshToken();
    });
    this.text.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) this.submit();
      if (e.key === 'Escape') this.close();
    });
    this.refreshToken();
  }

  get token() {
    return storageGet(TOKEN_KEY);
  }

  refreshToken() {
    const has = !!this.token;
    this.tokenRow.dataset.state = has ? 'set' : 'missing';
    document.getElementById('fb-token-label').textContent = has
      ? 'GitHub token saved in this browser.'
      : 'Add a GitHub token to post notes (fine-grained, this repo only: Contents and Issues read/write).';
  }

  // What the crosshair is on: march the ray over the terrain, then check
  // buildings, rocks and trees up to that distance.
  probe() {
    const g = this.game;
    const cam = g.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const origin = cam.position.clone();
    let hitDist = 400;
    for (let d = 0.5; d < 400; d += 0.5) {
      const p = origin.clone().addScaledVector(dir, d);
      if (p.y < g.terrain.heightAt(p.x, p.z)) {
        hitDist = d;
        break;
      }
    }
    const ray = new THREE.Raycaster(origin, dir, 0.1, hitDist);
    const targets = [g.village.group, g.rocks.group, g.forest.group].filter(Boolean);
    const hits = ray.intersectObjects(targets, true);
    const hit = hits[0];
    const point = hit ? hit.point : origin.clone().addScaledVector(dir, hitDist);
    return { point, distance: hit ? hit.distance : hitDist, what: this.describe(point, hit) };
  }

  describe(p, hit) {
    const g = this.game;
    let best = null;
    for (const l of g.village.landmarks) {
      const d = Math.hypot(p.x - l.x, p.z - l.z) - l.r;
      if (d < 3 && (!best || d < best.d)) best = { d, name: l.name };
    }
    if (best) return best.name;
    if (hit && hit.object.name) {
      const species = hit.object.name.split('-')[0];
      if (g.forest.counts && species in g.forest.counts) return `${species} tree`;
    }
    if (hit && hit.object.parent === g.rocks.group) return 'rock';
    const m = g.groundMask;
    if (m.sample(p.x, p.z, 2) > 0.5) return 'water';
    if (m.sample(p.x, p.z, 3) > 0.5) return 'plaza';
    if (m.sample(p.x, p.z, 1) > 0.5) return 'road';
    return 'ground';
  }

  // Called by the game while it is in view mode.
  show() {
    const g = this.game;
    // Grab the frame now, before the panel covers it.
    g.render();
    const canvas = g.renderer.domElement;
    const w = Math.min(1280, canvas.width);
    const h = Math.round((w / canvas.width) * canvas.height);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(canvas, 0, 0, w, h);
    this.image = c.toDataURL('image/jpeg', 0.85);
    this.shot.src = this.image;

    const p = g.player.position;
    const target = this.probe();
    const env = g.environment;
    this.context = {
      world: g.worldName || 'vale',
      position: [p.x, p.y, p.z].map((v) => +v.toFixed(2)),
      yaw: +g.player.yaw.toFixed(3),
      pitch: +g.player.pitch.toFixed(3),
      heading: Math.round(((-g.player.yaw * 180) / Math.PI + 3600) % 360),
      timeOfDay: +env.timeOfDay.toFixed(2),
      looking: target.what,
      target: [target.point.x, target.point.y, target.point.z].map((v) => +v.toFixed(2)),
      distance: +target.distance.toFixed(1),
      quality: new URLSearchParams(location.search).get('quality') || 'high',
      build: document.querySelector('script[type="module"]')?.src?.split('/').pop() || '',
      at: new Date().toISOString(),
    };
    const c2 = this.context;
    this.meta.textContent = `At (${c2.position[0]}, ${c2.position[2]}) · facing ${c2.heading}° · looking at ${c2.looking} ${c2.distance} m away · ${env.timeLabel()}`;
    this.text.value = '';
    this.status.textContent = '';
    this.root.classList.remove('hidden');
    this.open = true;
    setTimeout(() => this.text.focus(), 0);
  }

  close() {
    this.root.classList.add('hidden');
    this.open = false;
    this.game.onFeedbackClosed?.();
  }

  viewLink(c) {
    const at = [c.position[0], c.position[2], c.yaw, c.pitch, c.timeOfDay].join(',');
    return `${location.origin}${location.pathname}?at=${at}${c.world !== 'vale' ? `&world=${c.world}` : ''}`;
  }

  async submit() {
    const note = this.text.value.trim();
    if (!note) {
      this.status.textContent = 'Write a note first.';
      return;
    }
    const entry = { note, kind: this.kind.value, context: this.context, image: this.image };
    if (!this.token) {
      this.saveLocally(entry);
      this.status.textContent = 'Saved in this browser. Add a token to post it to GitHub.';
      return;
    }
    this.status.textContent = 'Posting…';
    try {
      const url = await this.post(entry);
      this.status.innerHTML = `Posted: <a href="${url}" target="_blank" rel="noopener">${url.split('/').slice(-2).join(' #')}</a>`;
      setTimeout(() => this.open && this.close(), 1800);
      // Drop the local copy of this same note, then send anything left over.
      const queue = JSON.parse(storageGet(QUEUE_KEY) || '[]').filter((e) => e.context.at !== entry.context.at);
      storageSet(QUEUE_KEY, JSON.stringify(queue));
      this.flushQueue();
    } catch (err) {
      this.saveLocally(entry);
      this.status.textContent = `Couldn't post (${err.message}). Saved locally; it will be retried next time.`;
    }
  }

  saveLocally(entry) {
    const queue = JSON.parse(storageGet(QUEUE_KEY) || '[]');
    queue.push(entry);
    // Keep the newest few; screenshots are large.
    storageSet(QUEUE_KEY, JSON.stringify(queue.slice(-5)));
  }

  async flushQueue() {
    const queue = JSON.parse(storageGet(QUEUE_KEY) || '[]');
    if (!queue.length || !this.token) return;
    storageSet(QUEUE_KEY, '[]');
    for (const entry of queue) {
      try {
        await this.post(entry);
      } catch {
        this.saveLocally(entry);
      }
    }
  }

  async api(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(`${res.status} ${body.message || res.statusText}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async ensureBranch() {
    try {
      await this.api(`/git/ref/heads/${BRANCH}`);
    } catch (err) {
      if (err.status !== 404) throw err;
      const repo = await this.api('');
      const base = await this.api(`/git/ref/heads/${repo.default_branch}`);
      await this.api('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: base.object.sha }) });
    }
  }

  async post({ note, kind, context, image }) {
    const id = `${context.at.replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
    let imageUrl = null;
    if (image) {
      await this.ensureBranch();
      const path = `feedback/${id}.jpg`;
      await this.api(`/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({ message: `Feedback screenshot ${id}`, content: image.split(',')[1], branch: BRANCH }),
      });
      imageUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
    }
    const c = context;
    const title = `[${kind}] ${note.split('\n')[0].slice(0, 70)}`;
    const body = [
      note,
      '',
      imageUrl ? `![screenshot](${imageUrl})` : '',
      '',
      `| | |`,
      `|---|---|`,
      `| World | ${c.world} |`,
      `| Position | x ${c.position[0]}, y ${c.position[1]}, z ${c.position[2]} |`,
      `| Facing | ${c.heading}° (yaw ${c.yaw}, pitch ${c.pitch}) |`,
      `| Looking at | ${c.looking}, ${c.distance} m away at (${c.target.join(', ')}) |`,
      `| Time of day | ${c.timeOfDay} |`,
      `| Quality | ${c.quality} |`,
      '',
      `[Open this view in the game](${this.viewLink(c)})`,
      '',
      '<details><summary>Raw data</summary>',
      '',
      '```json',
      JSON.stringify({ kind, ...c, image: imageUrl }, null, 2),
      '```',
      '</details>',
    ].join('\n');
    let issue;
    try {
      issue = await this.api('/issues', { method: 'POST', body: JSON.stringify({ title, body, labels: ['feedback', kind] }) });
    } catch (err) {
      // Labels can be refused; post without them.
      if (err.status !== 422 && err.status !== 403) throw err;
      issue = await this.api('/issues', { method: 'POST', body: JSON.stringify({ title, body }) });
    }
    return issue.html_url;
  }
}
