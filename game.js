// ===== Constants =====
const MEDAL_R    = 13;
const BALL_R     = 20;
const GRAVITY    = 0.42;
const PUSHER_SPD = 0.55;
const PUSHER_MAX = 72;   // how far pusher travels forward (px)
const FRIC_TABLE = 0.970;  // さらに高摩擦：ほぼ動かない
const FRIC_AIR   = 0.995;
const SETTLE_V   = 0.40;   // 停止閾値を上げる（より素早く静止）
const BOUNCE_M   = 0.20;
const BOUNCE_B   = 0.58;
// 獲得口は中央70%のみ（両端15%はガター）
const CHUTE_L    = 0.15;
const CHUTE_R    = 0.85;
const SLOT_SYMS  = ['7','★','♦','♣','♥','♠'];
const SLOT_PAY   = { '7':50, '★':20, '♦':10, '♣':5, '♥':3, '♠':2 };

// ===== Layout (computed in resize) =====
let table  = { x:0, w:0, topY:0, frontY:0 };
let chukkas= [];  // [{x,y,r,lit}]
let pusher = { x:0, w:0, y:0, baseY:0, h:14, dir:1, progress:0 };

// ===== Game state =====
let medals       = [];
let ballObj      = null;
let particles    = [];
let medalCount   = 100;
let ballCount    = 3;
let score        = 0;
let slotSpinning = false;
let slotReels    = ['7','7','7'];
let flashOverlay = 0;
let sliderRatio  = 0.5;

const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

// ===== Resize =====
function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width  = rect.width  * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const W = rect.width, H = rect.height;
  table.w      = W * 0.74;
  table.x      = (W - table.w) / 2;
  table.topY   = H * 0.33;
  table.frontY = H * 0.83;

  pusher.x     = table.x;
  pusher.w     = table.w;
  pusher.baseY = table.topY;
  pusher.y     = table.topY;

  // チャッカー：台の中央付近に2つ
  const cy = table.topY + (table.frontY - table.topY) * 0.48;
  chukkas = [
    { x: table.x + table.w * 0.28, y: cy, r: 15, lit: 0 },
    { x: table.x + table.w * 0.72, y: cy, r: 15, lit: 0 },
  ];
}
window.addEventListener('resize', resize);
resize();

// ===== Medal =====
class Medal {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 1.8;
    this.vy = 0;
    this.r  = MEDAL_R;
    this.onTable = false;
  }

  update() {
    if (!this.onTable) {
      // 落下中
      this.vy += GRAVITY;
      this.vx *= FRIC_AIR;
      this.x  += this.vx;
      this.y  += this.vy;

      // チャッカー判定（台に着く前に穴へ入ったら）
      for (const c of chukkas) {
        const d2 = (this.x - c.x) ** 2 + (this.y - c.y) ** 2;
        if (d2 < (c.r + this.r * 0.55) ** 2) {
          c.lit = 30; // 光らせるフレーム数
          return 'chukka';
        }
      }

      // 台のサイド壁でバウンド（落下中は壁内で跳ね返る）
      if (this.x - this.r < table.x) {
        this.x = table.x + this.r;
        this.vx = Math.abs(this.vx) * 0.55;
      }
      if (this.x + this.r > table.x + table.w) {
        this.x = table.x + table.w - this.r;
        this.vx = -Math.abs(this.vx) * 0.55;
      }

      // 台面に着地 → バーで完全停止させる
      if (this.y + this.r >= table.topY) {
        this.y  = table.topY - this.r;
        this.vx = 0;  // 完全停止
        this.vy = 0;
        this.onTable = true;
      }

    } else {
      // 台上：高摩擦で詰まりやすく
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= FRIC_TABLE;
      if (this.vy < 0) this.vy = 0;
      else this.vy *= FRIC_TABLE;
      // 微速なら完全停止（ズルズル滑り防止）
      if (Math.abs(this.vx) < SETTLE_V) this.vx = 0;
      if (Math.abs(this.vy) < SETTLE_V) this.vy = 0;

      // 横（サイドガター）→ 没収
      if (this.x + this.r < table.x || this.x - this.r > table.x + table.w) {
        return 'lose';
      }

      // 前方（フロントエッジ）→ 中央獲得口なら獲得、端のガターは没収
      if (this.y - this.r > table.frontY) {
        const chuteL = table.x + table.w * CHUTE_L;
        const chuteR = table.x + table.w * CHUTE_R;
        return (this.x > chuteL && this.x < chuteR) ? 'collect' : 'lose';
      }
    }
    return 'alive';
  }

  draw() {
    const grad = ctx.createRadialGradient(
      this.x - this.r * 0.3, this.y - this.r * 0.3, this.r * 0.08,
      this.x, this.y, this.r
    );
    grad.addColorStop(0,   '#fff8a0');
    grad.addColorStop(0.5, '#f0c040');
    grad.addColorStop(1,   '#9a5800');
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#c08800';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,160,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ===== Ball（特殊オブジェクト） =====
class Ball {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 2.5;
    this.vy = 0;
    this.r  = BALL_R;
    this.onTable = false;
  }

  update() {
    if (!this.onTable) {
      this.vy += GRAVITY;
      this.vx *= FRIC_AIR;
      this.x  += this.vx;
      this.y  += this.vy;

      // チャッカー判定（ボールも対象）
      for (const c of chukkas) {
        const d2 = (this.x - c.x) ** 2 + (this.y - c.y) ** 2;
        if (d2 < (c.r + this.r * 0.55) ** 2) {
          c.lit = 30;
          return 'chukka';
        }
      }

      if (this.x - this.r < table.x) { this.x = table.x + this.r; this.vx = Math.abs(this.vx) * 0.8; }
      if (this.x + this.r > table.x + table.w) { this.x = table.x + table.w - this.r; this.vx = -Math.abs(this.vx) * 0.8; }

      if (this.y + this.r >= table.topY) {
        this.y  = table.topY - this.r;
        this.vy = -Math.abs(this.vy) * BOUNCE_B;
        this.vx *= 0.85;
        // 着地時：周囲のメダルを前方に吹き飛ばす
        medals.forEach(m => {
          const dx = m.x - this.x, dy = m.y - this.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 72 * 72) {
            const dist = Math.sqrt(d2) + 0.1;
            m.vy += (3.5 + 60 / dist);
            m.vx += (dx / dist) * 1.8;
          }
        });
        if (Math.abs(this.vy) < 1.2) {
          this.vy = 0;
          this.onTable = true;
        }
      }
    } else {
      // 台は手前に傾いているイメージ：常に微前進
      this.vy += 0.10;
      this.x  += this.vx;
      this.y  += this.vy;
      this.vx *= FRIC_TABLE;
      this.vy *= FRIC_TABLE;

      // ボールとメダルの接触：メダルを前方へ
      medals.forEach(m => {
        const dx = m.x - this.x, dy = m.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.r + m.r && dist > 0.1) {
          const nx = dx / dist, ny = dy / dist;
          const ov = this.r + m.r - dist;
          m.x  += nx * ov * 0.7;
          m.y  += ny * ov * 0.7;
          m.vy += ny * 2.2;
          m.vx += nx * 1.2;
        }
      });

      if (this.x + this.r < table.x || this.x - this.r > table.x + table.w) return 'gone';
      if (this.y - this.r > table.frontY) return 'gone';
    }
    return 'alive';
  }

  draw() {
    const grad = ctx.createRadialGradient(
      this.x - this.r * 0.35, this.y - this.r * 0.35, this.r * 0.1,
      this.x, this.y, this.r
    );
    grad.addColorStop(0,   '#e0f8ff');
    grad.addColorStop(0.4, '#40a8ff');
    grad.addColorStop(1,   '#0040a0');
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#80d0ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 光沢
    ctx.beginPath();
    ctx.arc(this.x - this.r * 0.3, this.y - this.r * 0.35, this.r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }
}

// ===== Particle =====
class Particle {
  constructor(x, y) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 3;
    this.x = x; this.y = y;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s - 2;
    this.life = 1.0;
    this.r = 3 + Math.random() * 4;
  }
  update() {
    this.vy += 0.15;
    this.x  += this.vx;
    this.y  += this.vy;
    this.life -= 0.04;
  }
  draw() {
    ctx.globalAlpha = this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${40 + Math.random() * 20},100%,60%)`;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ===== Pusher =====
function updatePusher() {
  pusher.progress += pusher.dir * PUSHER_SPD;
  if (pusher.progress >= PUSHER_MAX) { pusher.progress = PUSHER_MAX; pusher.dir = -1; }
  else if (pusher.progress <= 0)     { pusher.progress = 0;          pusher.dir = 1; }
  pusher.y = pusher.baseY + pusher.progress;

  // 前進時のみ：プッシャー面に近いメダルを押す
  // メダルは table.topY - r に静止しているため pusher.y + 幅で拾う
  if (pusher.dir === 1) {
    const force = PUSHER_SPD * 1.3;
    const pushReach = pusher.y + pusher.h + MEDAL_R * 1.2;
    medals.forEach(m => {
      if (m.onTable && m.y - m.r <= pushReach) m.vy += force;
    });
    if (ballObj && ballObj.onTable) {
      ballObj.vy += force * 1.4;
    }
  }
}

function drawPusher() {
  const alpha = pusher.progress / PUSHER_MAX;
  const { x, w, y, h } = pusher;

  // 台本体（staticシェルフ: frontY より奥の壁）
  ctx.fillStyle = 'rgba(30,15,70,0.9)';
  ctx.fillRect(table.x, table.topY, table.w, table.frontY - table.topY);

  // プッシャープレート
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `rgba(170,90,255,${0.72 + alpha * 0.25})`);
  g.addColorStop(1, `rgba(80,30,160,${0.85 + alpha * 0.12})`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = `rgba(210,150,255,${0.5 + alpha * 0.45})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // 光沢ライン
  ctx.strokeStyle = `rgba(255,230,255,${0.25 + alpha * 0.4})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 2.5);
  ctx.lineTo(x + w - 6, y + 2.5);
  ctx.stroke();
}

// ===== Background / Table =====
function drawScene(W, H) {
  // キャンバス全体
  ctx.fillStyle = '#080818';
  ctx.fillRect(0, 0, W, H);

  // サイドガター（没収ゾーン）
  ctx.fillStyle = '#200a20';
  ctx.fillRect(0, table.topY, table.x, table.frontY - table.topY);
  ctx.fillRect(table.x + table.w, table.topY, W - (table.x + table.w), table.frontY - table.topY);

  // サイドガター「LOSE」ラベル
  ctx.fillStyle = 'rgba(200,60,60,0.55)';
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('LOSE', table.x / 2, (table.topY + table.frontY) / 2);
  ctx.fillText('LOSE', table.x + table.w + (W - table.x - table.w) / 2, (table.topY + table.frontY) / 2);

  // ドロップゾーン（台の上）
  const dropGrad = ctx.createLinearGradient(0, 0, 0, table.topY);
  dropGrad.addColorStop(0, '#0a0820');
  dropGrad.addColorStop(1, '#12083a');
  ctx.fillStyle = dropGrad;
  ctx.fillRect(table.x, 0, table.w, table.topY);

  // フロントエッジ（獲得ゾーン）
  const glow = ctx.createLinearGradient(0, table.frontY - 12, 0, table.frontY + 20);
  glow.addColorStop(0,   'rgba(240,200,0,0)');
  glow.addColorStop(0.4, 'rgba(240,200,0,0.55)');
  glow.addColorStop(1,   'rgba(240,200,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(table.x, table.frontY - 12, table.w, 32);

  // フロントエッジ：ガター部分（没収）
  const chuteL = table.x + table.w * CHUTE_L;
  const chuteR = table.x + table.w * CHUTE_R;
  ctx.strokeStyle = '#602020';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(table.x, table.frontY);
  ctx.lineTo(chuteL, table.frontY);
  ctx.moveTo(chuteR, table.frontY);
  ctx.lineTo(table.x + table.w, table.frontY);
  ctx.stroke();

  // フロントエッジ：獲得口（中央）
  ctx.strokeStyle = '#f0c840';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(chuteL, table.frontY);
  ctx.lineTo(chuteR, table.frontY);
  ctx.stroke();

  // 「GET!」ラベル
  ctx.fillStyle = 'rgba(240,200,0,0.85)';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('◀ GET! ▶', table.x + table.w / 2, table.frontY + 14);
  ctx.fillStyle = 'rgba(180,60,60,0.7)';
  ctx.font = 'bold 9px Arial';
  ctx.fillText('LOSE', (table.x + chuteL) / 2, table.frontY + 14);
  ctx.fillText('LOSE', (chuteR + table.x + table.w) / 2, table.frontY + 14);

  // 下部（獲得後エリア）
  const floorGrad = ctx.createLinearGradient(0, table.frontY, 0, H);
  floorGrad.addColorStop(0,   'rgba(240,180,0,0.25)');
  floorGrad.addColorStop(1,   'rgba(240,180,0,0.05)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(table.x, table.frontY, table.w, H - table.frontY);
}

// ===== Chukkas =====
function updateChukkas() {
  chukkas.forEach(c => { if (c.lit > 0) c.lit--; });
}

function drawChukkas() {
  chukkas.forEach(c => {
    const glow = c.lit / 30;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = glow > 0
      ? `rgba(255,240,100,${0.4 + glow * 0.5})`
      : 'rgba(0,0,0,0.8)';
    ctx.fill();
    ctx.strokeStyle = glow > 0
      ? `rgba(255,220,0,${0.8 + glow * 0.2})`
      : 'rgba(120,80,200,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = glow > 0 ? '#ffe040' : 'rgba(160,100,255,0.5)';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◎', c.x, c.y);
    ctx.textBaseline = 'alphabetic';
  });
}

// ===== Drop Zone Indicator =====
function drawDropZone(W) {
  const dropX = table.x + sliderRatio * table.w;
  ctx.strokeStyle = 'rgba(255,220,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(dropX, 0);
  ctx.lineTo(dropX, table.topY - 18);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,220,0,0.75)';
  ctx.beginPath();
  ctx.moveTo(dropX, table.topY - 14);
  ctx.lineTo(dropX - 7, table.topY - 26);
  ctx.lineTo(dropX + 7, table.topY - 26);
  ctx.closePath();
  ctx.fill();
}

// ===== Slot Machine =====
function spinSlot() {
  if (slotSpinning) return;
  slotSpinning = true;
  document.getElementById('slot-result').textContent = '';

  const durations = [600, 950, 1300];
  const reelEls = [
    document.querySelector('#reel-0 .reel-item'),
    document.querySelector('#reel-1 .reel-item'),
    document.querySelector('#reel-2 .reel-item'),
  ];

  const results = [];
  durations.forEach((dur, i) => {
    let elapsed = 0;
    const iv = setInterval(() => {
      elapsed += 80;
      reelEls[i].textContent = SLOT_SYMS[Math.floor(Math.random() * SLOT_SYMS.length)];
      if (elapsed >= dur) {
        clearInterval(iv);
        const final = SLOT_SYMS[Math.floor(Math.random() * SLOT_SYMS.length)];
        reelEls[i].textContent = final;
        slotReels[i] = final;
        results.push(final);
        if (results.length === 3) onSlotDone();
      }
    }, 80);
  });
}

function onSlotDone() {
  const [a, b, c] = slotReels;
  const el = document.getElementById('slot-result');
  const reelEls = [
    document.getElementById('reel-0'),
    document.getElementById('reel-1'),
    document.getElementById('reel-2'),
  ];

  if (a === b && b === c) {
    const reward = SLOT_PAY[a] || 5;
    el.textContent = `✨${a}${b}${c}✨ +${reward}枚!`;
    el.style.color = '#f0c040';
    flashOverlay = 1.0;
    reelEls.forEach(r => { r.style.boxShadow = '0 0 24px #fff, 0 0 48px #f0c040'; });
    setTimeout(() => reelEls.forEach(r => { r.style.boxShadow = ''; }), 1200);
    spawnBonus(reward);
  } else if (a === b || b === c || a === c) {
    el.textContent = `${a}${b}${c} +2枚`;
    el.style.color = '#c0c0c0';
    spawnBonus(2);
  } else {
    el.textContent = `${a}${b}${c} ハズレ`;
    el.style.color = '#555';
  }
  setTimeout(() => { slotSpinning = false; }, 500);
}

function spawnBonus(n) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      medals.push(new Medal(table.x + Math.random() * table.w, -MEDAL_R * 2));
    }, i * 55);
  }
}

// ===== HUD =====
function updateHUD() {
  document.getElementById('medal-value').textContent = medalCount;
  document.getElementById('score-value').textContent = score;
  const ballBtn = document.getElementById('ball-btn');
  if (ballBtn) ballBtn.textContent = `ボール (${ballCount})`;
}

// ===== Slider =====
const sliderTrack = document.getElementById('slider-track');
const sliderThumb = document.getElementById('slider-thumb');

function updateSliderUI() {
  const tw = sliderTrack.clientWidth - 36;
  sliderThumb.style.left      = sliderRatio * tw + 'px';
  sliderThumb.style.transform = 'translateY(-50%)';
  document.getElementById('drop-indicator').style.left =
    sliderRatio * sliderTrack.clientWidth + 'px';
  document.getElementById('drop-indicator').style.transform = 'none';
}

function getRatio(e) {
  const r = sliderTrack.getBoundingClientRect();
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  return Math.max(0, Math.min(1, (cx - r.left) / r.width));
}

sliderTrack.addEventListener('mousedown', e => {
  sliderRatio = getRatio(e); updateSliderUI();
  const mv = ev => { sliderRatio = getRatio(ev); updateSliderUI(); };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
});
sliderTrack.addEventListener('touchstart', e => { e.preventDefault(); sliderRatio = getRatio(e); updateSliderUI(); }, { passive: false });
sliderTrack.addEventListener('touchmove',  e => { e.preventDefault(); sliderRatio = getRatio(e); updateSliderUI(); }, { passive: false });
sliderTrack.addEventListener('touchend',   e => { e.preventDefault(); dropMedal(); },                                 { passive: false });

// ===== Drop =====
function dropMedal() {
  if (medalCount <= 0) return;
  const x = table.x + sliderRatio * table.w;
  medals.push(new Medal(x, 4));
  medalCount--;
  updateHUD();
}

function dropBall() {
  if (ballCount <= 0 || ballObj) return;
  const x = table.x + sliderRatio * table.w;
  ballObj = new Ball(x, 4);
  ballCount--;
  updateHUD();
}

// 投入ボタン長押し連射
let autoTimer = null;
const dropBtn = document.getElementById('drop-btn');
dropBtn.addEventListener('pointerdown', () => {
  dropMedal();
  autoTimer = setInterval(dropMedal, 280);
});
dropBtn.addEventListener('pointerup',    () => clearInterval(autoTimer));
dropBtn.addEventListener('pointerleave', () => clearInterval(autoTimer));

// ボールボタン
const ballBtn = document.getElementById('ball-btn');
if (ballBtn) {
  ballBtn.addEventListener('click', dropBall);
  // ボールは30秒ごとに1個補充
  setInterval(() => {
    if (ballCount < 5) { ballCount++; updateHUD(); }
  }, 30000);
}

// ===== Game Over / Restart =====
function checkGameOver() {
  if (medalCount <= 0 && medals.length === 0 && !ballObj) {
    document.getElementById('slot-result').textContent = 'ゲームオーバー！タップでリスタート';
    document.getElementById('slot-result').style.color = '#ff4040';
    canvas.addEventListener('click', restart, { once: true });
    dropBtn.disabled = true;
  }
}

function restart() {
  medals = []; ballObj = null; particles = [];
  medalCount = 100; ballCount = 3; score = 0;
  slotSpinning = false; flashOverlay = 0;
  document.getElementById('slot-result').textContent = '';
  dropBtn.disabled = false;
  updateHUD();
}

// ===== Main Loop =====
function gameLoop() {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;

  updatePusher();
  updateChukkas();

  // メダル同士の衝突
  for (let i = 0; i < medals.length; i++) {
    for (let j = i + 1; j < medals.length; j++) {
      const a = medals[i], b = medals[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const min  = a.r + b.r;
      if (dist < min && dist > 0.01) {
        const nx = dx / dist, ny = dy / dist;
        const ov = (min - dist) / 2;
        a.x -= nx * ov; a.y -= ny * ov;
        b.x += nx * ov; b.y += ny * ov;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          // 反発係数を上げて詰まり→弾き出しを明確に
          a.vx -= rel * nx * 0.65; a.vy -= rel * ny * 0.65;
          b.vx += rel * nx * 0.65; b.vy += rel * ny * 0.65;
        }
      }
    }
  }

  // メダル更新
  const remove = [];
  medals.forEach((m, i) => {
    const res = m.update();
    if (res === 'collect') {
      remove.push(i);
      score++;
      medalCount++;
      for (let p = 0; p < 5; p++) particles.push(new Particle(m.x, table.frontY));
      updateHUD();
      checkGameOver();
    } else if (res === 'lose') {
      remove.push(i); // 没収：何もしない
      checkGameOver();
    } else if (res === 'chukka') {
      remove.push(i);
      spinSlot(); // チャッカーに入ったのでスロット発動
    }
  });
  for (let i = remove.length - 1; i >= 0; i--) medals.splice(remove[i], 1);

  // ボール更新
  if (ballObj) {
    const res = ballObj.update();
    if (res === 'gone') ballObj = null;
    else if (res === 'chukka') { ballObj = null; spinSlot(); }
  }

  // パーティクル
  particles = particles.filter(p => { p.update(); return p.life > 0; });

  // ===== 描画 =====
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  drawScene(W, H);
  drawDropZone(W);
  drawPusher();
  drawChukkas();

  medals.forEach(m => m.draw());
  if (ballObj) ballObj.draw();
  particles.forEach(p => p.draw());

  // ジャックポットフラッシュ
  if (flashOverlay > 0) {
    ctx.fillStyle = `rgba(255,240,80,${flashOverlay * 0.30})`;
    ctx.fillRect(0, 0, W, H);
    flashOverlay -= 0.025;
  }

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

// ===== Init =====
updateSliderUI();
updateHUD();
gameLoop();
