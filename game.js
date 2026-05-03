// ===== Constants =====
const MEDAL_R = 14;
const GRAVITY = 0.4;
const PUSHER_SPEED = 0.6;
const PUSHER_DEPTH = 60; // how far pusher travels
const FRICTION = 0.94;
const BOUNCE = 0.25;
const SLOT_SYMBOLS = ['7', '★', '♦', '♣', '♥', '♠'];
const SLOT_PAYOUTS = { '7': 50, '★': 20, '♦': 10, '♣': 5, '♥': 3, '♠': 2 };

// ===== State =====
let medals = [];          // falling + on-table medals
let particles = [];       // coin burst particles
let medalCount = 100;
let score = 0;
let slotSpinning = false;
let slotReels = ['7', '7', '7'];
let slotAnimFrame = 0;

// Pusher state — baseY is fixed, y moves forward/back with progress
let pusher = { x: 0, y: 0, baseY: 0, w: 0, h: 18, dir: 1, progress: 0 };

// Slider state
let sliderRatio = 0.5; // 0..1

// Canvas
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// ===== Resize =====
function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  pusher.w = rect.width * 0.7;
  pusher.x = rect.width / 2 - pusher.w / 2;
  pusher.baseY = rect.height * 0.52;
  pusher.y = pusher.baseY;
}

window.addEventListener('resize', () => { resize(); });
resize();

// ===== Medal class =====
class Medal {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 1.2;
    this.vy = 0;
    this.r = MEDAL_R;
    this.onTable = false;
    this.settled = false;
  }

  update(W, H) {
    const tableY = pusher.y + pusher.h + MEDAL_R;
    const floorY = H - MEDAL_R - 2;

    if (!this.onTable) {
      this.vy += GRAVITY;
      this.x += this.vx;
      this.y += this.vy;

      // Land on pusher surface
      if (this.y >= pusher.y - this.r &&
          this.y <= pusher.y + pusher.h &&
          this.x >= pusher.x && this.x <= pusher.x + pusher.w) {
        this.y = pusher.y - this.r;
        this.vy *= -BOUNCE;
        this.vx *= FRICTION;
        this.onTable = true;
      }

      // Wall bounce
      if (this.x - this.r < 0) { this.x = this.r; this.vx = Math.abs(this.vx); }
      if (this.x + this.r > W) { this.x = W - this.r; this.vx = -Math.abs(this.vx); }
    } else {
      // Pushed by pusher
      this.x += this.vx;
      this.vx *= FRICTION;
      this.y = pusher.y - this.r;

      // Fell off pusher edge → becomes falling
      if (this.x < pusher.x - this.r || this.x > pusher.x + pusher.w + this.r) {
        this.onTable = false;
        this.vy = 1;
        this.vx *= 0.5;
      }
    }

    // Floor (collected)
    if (this.y >= floorY) {
      return 'collect';
    }

    return 'alive';
  }

  draw(ctx) {
    // Coin body
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(
      this.x - this.r * 0.3, this.y - this.r * 0.3, this.r * 0.1,
      this.x, this.y, this.r
    );
    grad.addColorStop(0, '#fff8a0');
    grad.addColorStop(0.5, '#f0c040');
    grad.addColorStop(1, '#a06000');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#c08800';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner ring
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.65, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,180,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ===== Particle =====
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 2;
    this.life = 1.0;
    this.r = 3 + Math.random() * 4;
  }
  update() {
    this.vy += 0.15;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 0.04;
  }
  draw(ctx) {
    ctx.globalAlpha = this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${40 + Math.random() * 20}, 100%, 60%)`;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ===== Pusher =====
function updatePusher() {
  pusher.progress += pusher.dir * PUSHER_SPEED;
  if (pusher.progress >= PUSHER_DEPTH) {
    pusher.progress = PUSHER_DEPTH;
    pusher.dir = -1;
  } else if (pusher.progress <= 0) {
    pusher.progress = 0;
    pusher.dir = 1;
  }
  // Pusher moves forward (down-screen) as progress increases
  pusher.y = pusher.baseY + pusher.progress;

  // Nudge on-table medals in the push direction
  const pushDelta = PUSHER_SPEED * pusher.dir * 0.35;
  medals.forEach(m => {
    if (m.onTable) m.vx += pushDelta;
  });
}

function drawPusher(W, H) {
  const alpha = pusher.progress / PUSHER_DEPTH;
  const px = pusher.x, pw = pusher.w;
  const py = pusher.y, ph = pusher.h;

  // Static back shelf (always at baseY + PUSHER_DEPTH)
  const shelfY = pusher.baseY + PUSHER_DEPTH + ph;
  ctx.fillStyle = '#2a1060';
  ctx.fillRect(px, shelfY, pw, H - shelfY);
  ctx.strokeStyle = '#6030a0';
  ctx.lineWidth = 2;
  ctx.strokeRect(px, shelfY, pw, H - shelfY);

  // Pusher plate with gradient
  const plateGrad = ctx.createLinearGradient(px, py, px, py + ph);
  plateGrad.addColorStop(0, `rgba(160,80,255,${0.7 + alpha * 0.25})`);
  plateGrad.addColorStop(1, `rgba(80,30,160,${0.8 + alpha * 0.15})`);
  ctx.fillStyle = plateGrad;
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = `rgba(200,140,255,${0.6 + alpha * 0.4})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);

  // Sheen line on top edge
  ctx.strokeStyle = `rgba(255,220,255,${0.3 + alpha * 0.4})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px + 4, py + 2);
  ctx.lineTo(px + pw - 4, py + 2);
  ctx.stroke();
}

function drawBackground(W, H) {
  // Dark field
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, W, H);

  // Side walls
  ctx.fillStyle = '#1a0a40';
  ctx.fillRect(0, 0, pusher.x - 2, H);
  ctx.fillRect(pusher.x + pusher.w + 2, 0, W - (pusher.x + pusher.w + 2), H);

  // Floor glow
  const floorGrad = ctx.createLinearGradient(0, H - 30, 0, H);
  floorGrad.addColorStop(0, 'rgba(240,180,0,0.0)');
  floorGrad.addColorStop(1, 'rgba(240,180,0,0.25)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(pusher.x, H - 30, pusher.w, 30);
}

function drawDropZone(W, H) {
  const dropX = pusher.x + sliderRatio * pusher.w;
  ctx.strokeStyle = 'rgba(255,220,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(dropX, 0);
  ctx.lineTo(dropX, pusher.y - 20);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow
  ctx.fillStyle = 'rgba(255,220,0,0.7)';
  ctx.beginPath();
  ctx.moveTo(dropX, pusher.y - 16);
  ctx.lineTo(dropX - 7, pusher.y - 28);
  ctx.lineTo(dropX + 7, pusher.y - 28);
  ctx.closePath();
  ctx.fill();
}

// ===== Slot Machine =====
function spinSlot(bonusMedals) {
  if (slotSpinning) return;
  slotSpinning = true;
  document.getElementById('slot-result').textContent = '';

  const durations = [600, 900, 1200];
  const reelEls = [
    document.querySelector('#reel-0 .reel-item'),
    document.querySelector('#reel-1 .reel-item'),
    document.querySelector('#reel-2 .reel-item'),
  ];

  const results = [];
  durations.forEach((dur, i) => {
    let elapsed = 0;
    const interval = 80;
    const timer = setInterval(() => {
      elapsed += interval;
      const sym = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
      reelEls[i].textContent = sym;
      if (elapsed >= dur) {
        clearInterval(timer);
        const final = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
        reelEls[i].textContent = final;
        slotReels[i] = final;
        results.push(final);
        if (results.length === 3) {
          onSlotComplete();
        }
      }
    }, interval);
  });
}

let flashOverlay = 0; // 0..1, drawn each frame

function onSlotComplete() {
  const [a, b, c] = slotReels;
  const resultEl = document.getElementById('slot-result');
  const reelEls = [
    document.getElementById('reel-0'),
    document.getElementById('reel-1'),
    document.getElementById('reel-2'),
  ];
  let reward = 0;

  if (a === b && b === c) {
    reward = SLOT_PAYOUTS[a] || 5;
    resultEl.textContent = `✨ ${a}${b}${c} ✨ +${reward}枚!`;
    resultEl.style.color = '#f0c040';
    flashOverlay = 1.0;
    reelEls.forEach(el => { el.style.boxShadow = '0 0 24px #fff, 0 0 48px #f0c040'; });
    setTimeout(() => reelEls.forEach(el => { el.style.boxShadow = ''; }), 1200);
    spawnRewardMedals(reward);
  } else if (a === b || b === c || a === c) {
    reward = 2;
    resultEl.textContent = `${a}${b}${c} +${reward}枚`;
    resultEl.style.color = '#c0c0c0';
    spawnRewardMedals(reward);
  } else {
    resultEl.textContent = `${a}${b}${c} ハズレ`;
    resultEl.style.color = '#666';
  }

  setTimeout(() => { slotSpinning = false; }, 500);
}

function spawnRewardMedals(n) {
  const W = canvas.getBoundingClientRect().width;
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const x = pusher.x + Math.random() * pusher.w;
      medals.push(new Medal(x, -MEDAL_R * 2));
      medalCount += 1;
      updateHUD();
    }, i * 60);
  }
}

// ===== HUD =====
function updateHUD() {
  document.getElementById('medal-value').textContent = medalCount;
  document.getElementById('score-value').textContent = score;
}

// ===== Slider Control =====
const sliderTrack = document.getElementById('slider-track');
const sliderThumb = document.getElementById('slider-thumb');
const dropIndicator = document.getElementById('drop-indicator');

function updateSliderUI() {
  const trackW = sliderTrack.clientWidth;
  const thumbW = 36;
  const px = sliderRatio * (trackW - thumbW);
  sliderThumb.style.left = px + 'px';
  sliderThumb.style.transform = 'translateY(-50%)';
  dropIndicator.style.left = (sliderRatio * trackW) + 'px';
  dropIndicator.style.transform = 'none';
}

function getRatioFromEvent(e) {
  const rect = sliderTrack.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

sliderTrack.addEventListener('mousedown', e => {
  sliderRatio = getRatioFromEvent(e);
  updateSliderUI();
  const onMove = ev => { sliderRatio = getRatioFromEvent(ev); updateSliderUI(); };
  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

sliderTrack.addEventListener('touchstart', e => {
  e.preventDefault();
  sliderRatio = getRatioFromEvent(e);
  updateSliderUI();
}, { passive: false });

sliderTrack.addEventListener('touchmove', e => {
  e.preventDefault();
  sliderRatio = getRatioFromEvent(e);
  updateSliderUI();
}, { passive: false });

sliderTrack.addEventListener('touchend', e => {
  e.preventDefault();
  dropMedal();
}, { passive: false });

// ===== Game Over =====
function checkGameOver() {
  if (medalCount <= 0 && medals.length === 0) {
    const resultEl = document.getElementById('slot-result');
    resultEl.textContent = 'ゲームオーバー！タップでリスタート';
    resultEl.style.color = '#ff4040';
    canvas.addEventListener('click', restartGame, { once: true });
    document.getElementById('drop-btn').disabled = true;
  }
}

function restartGame() {
  medals = [];
  particles = [];
  medalCount = 100;
  score = 0;
  collected = 0;
  slotSpinning = false;
  flashOverlay = 0;
  document.getElementById('slot-result').textContent = '';
  document.getElementById('drop-btn').disabled = false;
  updateHUD();
}

// ===== Drop logic =====
function dropMedal() {
  if (medalCount <= 0) return;
  const dropX = pusher.x + sliderRatio * pusher.w;
  medals.push(new Medal(dropX, 0));
  medalCount -= 1;
  updateHUD();
}

// ===== Drop Button =====
let autoDropTimer = null;

const dropBtn = document.getElementById('drop-btn');
dropBtn.addEventListener('pointerdown', () => {
  dropMedal();
  autoDropTimer = setInterval(() => dropMedal(), 280);
});
dropBtn.addEventListener('pointerup', () => { clearInterval(autoDropTimer); });
dropBtn.addEventListener('pointerleave', () => { clearInterval(autoDropTimer); });

// ===== Main Loop =====
let collected = 0; // medals collected this session for slot trigger

function gameLoop() {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;

  // Update pusher
  updatePusher();

  // Medal-medal collision (simple circle push)
  for (let i = 0; i < medals.length; i++) {
    for (let j = i + 1; j < medals.length; j++) {
      const a = medals[i], b = medals[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = a.r + b.r;
      if (dist < minDist && dist > 0.01) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = (minDist - dist) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          a.vx -= rel * nx * 0.5; a.vy -= rel * ny * 0.5;
          b.vx += rel * nx * 0.5; b.vy += rel * ny * 0.5;
        }
      }
    }
  }

  // Update medals
  const toRemove = [];
  medals.forEach((m, i) => {
    const result = m.update(W, H);
    if (result === 'collect') {
      toRemove.push(i);
      score += 1;
      medalCount += 1;
      collected += 1;
      // Burst particles
      for (let p = 0; p < 6; p++) particles.push(new Particle(m.x, H - 10));
      // Trigger slot every 5 collected
      if (collected % 5 === 0) spinSlot();
      updateHUD();
      checkGameOver();
    }
  });
  for (let i = toRemove.length - 1; i >= 0; i--) medals.splice(toRemove[i], 1);

  // Update particles
  particles = particles.filter(p => { p.update(); return p.life > 0; });

  // Draw
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Reset transform for devicePixelRatio
  ctx.save();

  drawBackground(W, H);
  drawDropZone(W, H);
  drawPusher(W, H);

  medals.forEach(m => m.draw(ctx));
  particles.forEach(p => p.draw(ctx));

  // Jackpot flash overlay
  if (flashOverlay > 0) {
    ctx.fillStyle = `rgba(255,240,100,${flashOverlay * 0.35})`;
    ctx.fillRect(0, 0, W, H);
    flashOverlay -= 0.03;
    if (flashOverlay < 0) flashOverlay = 0;
  }

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// Init
updateSliderUI();
updateHUD();
gameLoop();
