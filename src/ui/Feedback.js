import * as THREE from 'three';

// In-game feedback: press F to pin a note to what you're looking at.
//
// Captures a screenshot, your position, view direction, the time of day and
// what's under the crosshair, then files it as a GitHub issue (labelled
// "feedback") with the screenshot committed to the repo's `feedback` branch.
// Holding F (or the panel's Record button) records a clip of the canvas to
// attach the same way, and reference images (chosen, pasted, or pasted as
// links) are uploaded beside it. Every attachment is listed in the issue so
// whoever picks it up knows what to look at. Needs a GitHub token with
// Contents and Issues write access to this repo, stored only in this
// browser. Without one, notes are kept locally (without clips or images).

const OWNER = 'anuvgupta';
const REPO = 'murk3d';
const BRANCH = 'feedback';
const TOKEN_KEY = 'murk.githubToken';
const QUEUE_KEY = 'murk.feedbackQueue';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const MAX_CLIP_SECONDS = 20;
const CLIP_MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
const MAX_REFS = 8;
const IMAGE_LINK = /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i;

function imageExt(mime, fallback = 'png') {
  const m = /image\/(png|jpe?g|gif|webp)/i.exec(mime || '');
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : fallback;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
    this.kind = 'art';
    this.kindButtons = [...document.querySelectorAll('#fb-kind button')];
    this.status = document.getElementById('fb-status');
    this.tokenInput = document.getElementById('fb-token');
    this.tokenRow = document.getElementById('fb-token-row');
    this.video = document.getElementById('fb-video');
    this.shotToggle = document.getElementById('fb-include-shot');
    this.clipToggle = document.getElementById('fb-include-clip');
    this.clipRow = document.getElementById('fb-clip-row');
    this.recEl = document.getElementById('rec');
    this.open = false;
    this.recording = null; // { hold, rec, chunks, mime, stream, startedAt } while a clip records
    this.clip = null; // { blob, url, mime, seconds } attached to the open note
    this.refs = []; // reference images: { blob, url, ext, link } (blob null when only a link)
    this.refList = document.getElementById('fb-ref-list');
    this.files = document.getElementById('fb-files');

    for (const b of this.kindButtons) b.addEventListener('click', () => this.setKind(b.dataset.kind));
    document.getElementById('fb-add-images').addEventListener('click', () => this.files.click());
    this.files.addEventListener('change', () => {
      for (const f of this.files.files) this.addRefFile(f);
      this.files.value = '';
    });
    // Pasting into the panel: image data becomes an attachment; a bare image
    // link is fetched and attached (kept as a link if it can't be fetched).
    this.root.addEventListener('paste', (e) => {
      const images = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      const text = e.clipboardData?.getData('text/plain').trim() || '';
      if (images.length) {
        e.preventDefault();
        for (const f of images) this.addRefFile(f);
      } else if (IMAGE_LINK.test(text)) {
        e.preventDefault();
        this.addRefLink(text);
      }
    });
    document.getElementById('fb-record').addEventListener('click', () => {
      this.close();
      this.startRecording({ hold: false });
    });
    document.getElementById('rec-stop').addEventListener('click', () => this.game.endRecording());
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

  // One kind is always chosen; picking another releases the rest.
  setKind(kind) {
    this.kind = kind;
    for (const b of this.kindButtons) b.setAttribute('aria-checked', String(b.dataset.kind === kind));
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

  // Records the game canvas until stopRecording(). `hold` marks a clip
  // started by holding F, which ends on release rather than on the next tap.
  startRecording({ hold }) {
    if (this.recording) return;
    const mime = CLIP_MIMES.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) {
      this.game.hud.toast('Recording is not supported in this browser');
      return;
    }
    const stream = this.game.renderer.domElement.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(250);
    this.recording = { hold, rec, chunks, mime, stream, startedAt: performance.now() };
    document.getElementById('rec-hint').textContent = hold ? 'release F to stop' : 'F to stop';
    this.recEl.classList.remove('hidden');
    this.recTimer = setInterval(() => {
      const s = (performance.now() - this.recording.startedAt) / 1000;
      document.getElementById('rec-time').textContent = `${s.toFixed(0)} s`;
      if (s >= MAX_CLIP_SECONDS) this.game.endRecording();
    }, 250);
  }

  // Resolves with the finished clip. `recording` is cleared at once so a key
  // event during the recorder's final write can't start or stop another.
  stopRecording() {
    const r = this.recording;
    if (!r) return Promise.resolve(null);
    this.recording = null;
    clearInterval(this.recTimer);
    this.recEl.classList.add('hidden');
    return new Promise((resolve) => {
      r.rec.onstop = () => {
        for (const track of r.stream.getTracks()) track.stop();
        const blob = new Blob(r.chunks, { type: r.mime });
        const seconds = +((performance.now() - r.startedAt) / 1000).toFixed(1);
        resolve({ blob, url: URL.createObjectURL(blob), mime: r.mime, seconds });
      };
      if (r.rec.state === 'inactive') r.rec.onstop();
      else r.rec.stop();
    });
  }

  addRefFile(file, link = null) {
    if (this.refs.length >= MAX_REFS) {
      this.status.textContent = `Up to ${MAX_REFS} images per note.`;
      return;
    }
    this.refs.push({ blob: file, url: URL.createObjectURL(file), ext: imageExt(file.type), link });
    this.renderRefs();
  }

  async addRefLink(link) {
    this.status.textContent = 'Fetching image…';
    try {
      const res = await fetch(link, { mode: 'cors' });
      const blob = await res.blob();
      if (!res.ok || !blob.type.startsWith('image/')) throw new Error('not an image');
      this.addRefFile(blob, link);
      this.status.textContent = '';
    } catch {
      // Cross-origin hosts often refuse; the issue will carry the link itself.
      this.refs.push({ blob: null, url: link, ext: null, link });
      this.renderRefs();
      this.status.textContent = "Couldn't fetch that image; it will be linked from the note.";
    }
  }

  removeRef(i) {
    const [ref] = this.refs.splice(i, 1);
    if (ref.blob) URL.revokeObjectURL(ref.url);
    this.renderRefs();
  }

  renderRefs() {
    this.refList.classList.toggle('hidden', !this.refs.length);
    this.refList.replaceChildren(
      ...this.refs.map((ref, i) => {
        const el = document.createElement('div');
        el.className = 'fb-ref';
        el.title = ref.link || 'Reference image';
        if (ref.blob) {
          const img = document.createElement('img');
          img.src = ref.url;
          img.alt = '';
          el.appendChild(img);
        } else {
          el.append(`link: ${new URL(ref.link).host}`);
        }
        const x = document.createElement('button');
        x.type = 'button';
        x.textContent = '×';
        x.setAttribute('aria-label', 'Remove image');
        x.addEventListener('click', () => this.removeRef(i));
        el.appendChild(x);
        return el;
      })
    );
  }

  clearRefs() {
    for (const ref of this.refs) if (ref.blob) URL.revokeObjectURL(ref.url);
    this.refs = [];
    this.renderRefs();
  }

  setClip(clip) {
    if (this.clip) URL.revokeObjectURL(this.clip.url);
    this.clip = clip;
    this.root.querySelector('.fb-panel').classList.toggle('has-clip', !!clip);
    this.video.classList.toggle('hidden', !clip);
    this.clipRow.classList.toggle('hidden', !clip);
    this.video.src = clip ? clip.url : '';
    this.clipToggle.checked = true;
    this.shotToggle.checked = true;
    if (clip) document.getElementById('fb-clip-label').textContent = `Include clip (${clip.seconds} s, ${(clip.blob.size / 1e6).toFixed(1)} MB)`;
    document.getElementById('fb-record').textContent = clip ? 'Re-record clip' : 'Record a clip';
  }

  // Called by the game while it is in view mode, with the clip just recorded
  // if there is one.
  show(clip = null) {
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
    this.setClip(clip);
    this.clearRefs();

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
      clipSeconds: clip ? clip.seconds : 0,
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
    const entry = {
      note,
      kind: this.kind,
      context: this.context,
      image: this.shotToggle.checked ? this.image : null,
      clip: this.clip && this.clipToggle.checked ? this.clip : null,
      refs: this.refs,
    };
    const heavy = entry.clip || entry.refs.some((r) => r.blob);
    if (!this.token) {
      this.saveLocally(entry);
      this.status.textContent = `Saved in this browser${heavy ? ' (without the clip or images)' : ''}. Add a token to post it to GitHub.`;
      return;
    }
    const bytes = (entry.clip ? entry.clip.blob.size : 0) + entry.refs.reduce((s, r) => s + (r.blob ? r.blob.size : 0), 0);
    this.status.textContent = bytes ? `Posting… uploading ${(bytes / 1e6).toFixed(1)} MB of media` : 'Posting…';
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
      this.status.textContent = `Couldn't post (${err.message}). Saved locally${heavy ? ' without the clip or images' : ''}; it will be retried next time.`;
    }
  }

  // Clips and image files are too large for storage, so a queued note keeps
  // only its screenshot and any image links.
  saveLocally({ clip, refs = [], ...entry }) {
    const queue = JSON.parse(storageGet(QUEUE_KEY) || '[]');
    queue.push({ ...entry, refs: refs.filter((r) => !r.blob).map((r) => ({ blob: null, url: r.link, ext: null, link: r.link })) });
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

  async upload(path, message, content) {
    await this.api(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content, branch: BRANCH }) });
    return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
  }

  async post({ note, kind, context, image, clip, refs = [] }) {
    const id = `${context.at.replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
    if (image || clip || refs.some((r) => r.blob)) await this.ensureBranch();
    const imageUrl = image ? await this.upload(`feedback/${id}.jpg`, `Feedback screenshot ${id}`, image.split(',')[1]) : null;
    const clipUrl = clip
      ? await this.upload(`feedback/${id}.${clip.mime.includes('mp4') ? 'mp4' : 'webm'}`, `Feedback clip ${id}`, await blobToBase64(clip.blob))
      : null;
    const refUrls = [];
    for (const [i, ref] of refs.entries()) {
      refUrls.push(
        ref.blob ? await this.upload(`feedback/${id}-ref-${i + 1}.${ref.ext}`, `Feedback reference image ${id} #${i + 1}`, await blobToBase64(ref.blob)) : ref.link
      );
    }

    // Every attachment is spelled out so whoever reads the issue knows what
    // there is to look at and where it came from.
    const attachments = [];
    if (imageUrl) attachments.push(`- **Screenshot** of the view when the note was written: ![screenshot](${imageUrl})`);
    if (clipUrl) attachments.push(`- 🎬 **Clip** (${clip.seconds} s, recorded in game just before the note): [${clipUrl.split('/').pop()}](${clipUrl})`);
    refs.forEach((ref, i) => {
      const from = ref.link ? ` (from ${ref.link})` : ' (added by the player)';
      attachments.push(
        ref.blob
          ? `- **Reference image ${i + 1}**${from}: ![reference ${i + 1}](${refUrls[i]})`
          : `- **Reference link ${i + 1}** (could not be fetched, open it directly): ${ref.link}`
      );
    });
    if (!attachments.length) attachments.push('- None: this note has no screenshot, clip or images.');

    const c = context;
    const title = `[${kind}] ${note.split('\n')[0].slice(0, 70)}`;
    const body = [
      note,
      '',
      imageUrl ? `![screenshot](${imageUrl})` : '',
      '',
      '### Attachments',
      ...attachments,
      imageUrl || clipUrl || refUrls.some((u, i) => refs[i].blob) ? `Files are on the \`${BRANCH}\` branch (\`git show origin/${BRANCH}:feedback/<name>\`).` : '',
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
      JSON.stringify({ kind, ...c, image: imageUrl, clip: clipUrl, references: refUrls }, null, 2),
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
