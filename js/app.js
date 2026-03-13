(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  const $ = (sel) => document.querySelector(sel);

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  function toast(message) {
    const el = document.createElement("div");
    el.className =
      "position-fixed bottom-0 start-50 translate-middle-x mb-4 px-3 py-2 glass";
    el.style.zIndex = 2000;
    el.style.borderRadius = "14px";
    el.style.maxWidth = "92vw";
    el.innerHTML = `<div class="d-flex align-items-center gap-2"><i class="bi bi-check2-circle"></i><span class="tiny">${message}</span></div>`;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .25s";
    }, 1400);
    setTimeout(() => el.remove(), 1700);
  }

  const copyBtn = $("#copyTracklist");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const rows = [
        ...document.querySelectorAll("#trackList .track strong"),
      ].map((el) => el.textContent.trim());
      const txt = rows.join("\n");
      try {
        await navigator.clipboard.writeText(txt);
        toast("Tracklist copiada!");
      } catch {
        toast(
          "Não consegui copiar automaticamente. Selecione e copie manualmente.",
        );
      }
    });
  }

  const shareBtn = $("#btnShare");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const data = {
        title: document.title,
        text: "Confira o álbum + o game Wave Rider!",
        url: window.location.href,
      };
      if (navigator.share) {
        try {
          await navigator.share(data);
        } catch {}
      } else {
        try {
          await navigator.clipboard.writeText(window.location.href);
          toast("Link copiado!");
        } catch {
          toast("Copie o link da barra de endereço.");
        }
      }
    });
  }

  const canvas = $("#surfCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const uiScore = $("#score");
  const uiBest = $("#best");
  const uiCombo = $("#combo");
  const uiStoke = $("#stoke");

  const btnStart = $("#btnStart");
  const btnPause = $("#btnPause");
  const btnRestart = $("#btnRestart");
  const btnSecret = $("#btnSecret");

  const SECRET_URL = "https://www.youtube.com/";
  const SECRET_SCORE_TO_UNLOCK = 2222;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) paused = true;
  });

  function resizeCanvasCSS() {
    const shell = canvas.parentElement;
    const aspect = canvas.width / canvas.height;
    const maxW = shell.clientWidth;
    const w = maxW;
    const h = w / aspect;
    canvas.style.width = Math.floor(w) + "px";
    canvas.style.height = Math.floor(h) + "px";
  }

  window.addEventListener("resize", resizeCanvasCSS);
  resizeCanvasCSS();

  let running = false;
  let paused = false;
  let gameOver = false;

  let score = 0;
  let best = Number(localStorage.getItem("uranus_best") || 0);
  let combo = 1;
  let comboTimer = 0;
  let stoke = 0;

  if (uiBest) uiBest.textContent = best;

  const world = {
    t: 0,
    dist: 0,
    speed: 330,
    baseSpeed: 330,
    boost: 0,
    gravity: 1850,
    seaBase: 330,
  };

  const player = {
    x: 240,
    y: 260,
    vy: 0,
    r: 18,
    onGround: true,
    rot: 0,
    rotVel: 0,
    airTime: 0,
    trickRot: 0,
    invuln: 0,
  };

  const obstacles = [];
  const pearls = [];
  let spawnObsIn = 0;
  let spawnPearlIn = 0;

  const keys = new Set();
  window.addEventListener(
    "keydown",
    (e) => {
      const k = e.key.toLowerCase();
      keys.add(k);

      if (k === "p") togglePause();
      if (k === "r") startOrRestart(true);

      if (running && (k === " " || k.startsWith("arrow"))) e.preventDefault();

      if (k === " " || k === "w" || k === "arrowup") {
        e.preventDefault();
        if (!running) startOrRestart(false);
        jump();
      }
    },
    { passive: false },
  );

  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  let pointerDown = false;
  let lastPX = 0;
  let lastPY = 0;

  canvas.addEventListener("pointerdown", (e) => {
    pointerDown = true;
    lastPX = e.clientX;
    lastPY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    if (!running) startOrRestart(false);
    jump();
  });

  canvas.addEventListener("pointerup", () => (pointerDown = false));
  canvas.addEventListener("pointercancel", () => (pointerDown = false));

  canvas.addEventListener("pointermove", (e) => {
    if (!pointerDown) return;

    const dx = e.clientX - lastPX;
    const dy = e.clientY - lastPY;
    lastPX = e.clientX;
    lastPY = e.clientY;

    if (!player.onGround) {
      player.rotVel += clamp(dx * 0.015, -3.2, 3.2);
    } else {
      if (dy < -12) jump();
    }
  });

  if (btnStart) btnStart.addEventListener("click", () => startOrRestart(false));
  if (btnPause) btnPause.addEventListener("click", togglePause);
  if (btnRestart)
    btnRestart.addEventListener("click", () => startOrRestart(true));
  if (btnSecret) {
    btnSecret.addEventListener("click", () => {
      if (score >= SECRET_SCORE_TO_UNLOCK)
        window.open(SECRET_URL, "_blank", "noopener,noreferrer");
    });
  }

  function togglePause() {
    if (!running || gameOver) return;
    paused = !paused;
    if (btnPause) {
      btnPause.innerHTML = paused
        ? '<i class="bi bi-play-fill"></i>'
        : '<i class="bi bi-pause-fill"></i>';
    }
  }

  function updateHUD() {
    if (uiScore) uiScore.textContent = Math.floor(score);
    if (uiBest) uiBest.textContent = best;
    if (uiCombo) uiCombo.textContent = "x" + Math.round(combo * 10) / 10;
    if (uiStoke) uiStoke.textContent = Math.round(stoke * 100) + "%";

    if (btnSecret) {
      if (score >= SECRET_SCORE_TO_UNLOCK) {
        btnSecret.disabled = false;
        btnSecret.innerHTML = '<i class="bi bi-unlock"></i> Link secreto';
      } else {
        btnSecret.disabled = true;
        btnSecret.innerHTML = '<i class="bi bi-lock"></i> Link secreto';
      }
    }
  }

  function resetGame() {
    running = false;
    paused = false;
    gameOver = false;

    score = 0;
    combo = 1;
    comboTimer = 0;
    stoke = 0;

    world.t = 0;
    world.dist = 0;
    world.speed = world.baseSpeed;
    world.boost = 0;

    player.y = 260;
    player.vy = 0;
    player.onGround = true;
    player.rot = 0;
    player.rotVel = 0;
    player.airTime = 0;
    player.trickRot = 0;
    player.invuln = 0;

    obstacles.length = 0;
    pearls.length = 0;
    spawnObsIn = 0.6;
    spawnPearlIn = 0.45;

    if (btnStart)
      btnStart.innerHTML = '<i class="bi bi-play-fill"></i> Iniciar';
    if (btnPause)
      btnPause.innerHTML = '<i class="bi bi-pause-fill"></i> Resetar';

    updateHUD();
    render(0);
  }

  function startOrRestart(forceRestart) {
    if (forceRestart) resetGame();

    if (!running) {
      running = true;
      paused = false;
      if (btnStart)
        btnStart.innerHTML = '<i class="bi bi-lightning-charge"></i> Rodando';
      if (btnPause) btnPause.innerHTML = '<i class="bi bi-pause-fill"></i>';
      lastTS = null;
      requestAnimationFrame(loop);
    } else if (gameOver) {
      resetGame();
      running = true;
      if (btnStart)
        btnStart.innerHTML = '<i class="bi bi-lightning-charge"></i> Rodando';
      lastTS = null;
      requestAnimationFrame(loop);
    }
  }

  function waveY(worldX, t) {
    const a1 = 26;
    const a2 = 14;
    const a3 = 8;
    const k1 = 0.01;
    const k2 = 0.018;
    const k3 = 0.031;
    const s1 = 1.65;
    const s2 = 2.1;
    const s3 = 2.9;
    return (
      world.seaBase +
      Math.sin(worldX * k1 + t * s1) * a1 +
      Math.sin(worldX * k2 + t * s2 + 1.3) * a2 +
      Math.sin(worldX * k3 + t * s3 + 2.1) * a3
    );
  }

  function waveNormal(worldX, t) {
    const eps = 2.0;
    const y1 = waveY(worldX - eps, t);
    const y2 = waveY(worldX + eps, t);
    const dy = (y2 - y1) / (2 * eps);
    const nx = -dy;
    const ny = 1;
    const len = Math.hypot(nx, ny) || 1;
    return { nx: nx / len, ny: ny / len, slope: dy };
  }

  function spawnObstacle() {
    const kinds = ["rock", "buoy", "fin"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const wx = world.dist + canvas.width + rand(120, 220);
    const size =
      kind === "rock"
        ? rand(18, 30)
        : kind === "buoy"
          ? rand(16, 24)
          : rand(14, 22);
    const off =
      kind === "buoy" ? rand(40, 80) : kind === "fin" ? rand(-6, 10) : 0;
    obstacles.push({ wx, kind, size, off, wob: rand(0, Math.PI * 2) });
    spawnObsIn = rand(0.65, 1.25);
  }

  function spawnPearl() {
    const wx = world.dist + canvas.width + rand(100, 200);
    const off = rand(70, 150);
    const r = rand(10, 13);
    pearls.push({ wx, off, r, wob: rand(0, Math.PI * 2) });
    spawnPearlIn = rand(0.38, 0.9);
  }

  function jump() {
    if (!running || paused || gameOver) return;
    if (!player.onGround) return;
    player.onGround = false;
    player.vy = -720;
    player.airTime = 0;
    player.trickRot = 0;
    stoke = clamp(stoke + 0.06, 0, 1);
  }

  function circleHit(cx, cy, cr, ox, oy, or) {
    const dx = cx - ox;
    const dy = cy - oy;
    return dx * dx + dy * dy <= (cr + or) * (cr + or);
  }

  function update(dt) {
    world.t += dt;

    const boosting = keys.has("shift") || keys.has("b");
    if (boosting && stoke > 0.01 && !gameOver) {
      world.boost = lerp(world.boost, 1, 0.08);
      stoke = clamp(stoke - dt * 0.18, 0, 1);
    } else {
      world.boost = lerp(world.boost, 0, 0.1);
    }

    world.speed = world.baseSpeed + world.boost * 220;
    world.dist += world.speed * dt;

    if (comboTimer > 0) comboTimer -= dt;
    else combo = lerp(combo, 1, 0.08);

    if (!gameOver) score += dt * 14 * combo * (1 + world.boost * 0.25);

    const left = keys.has("arrowleft") || keys.has("a");
    const right = keys.has("arrowright") || keys.has("d");
    const spinInput = (right ? 1 : 0) - (left ? 1 : 0);

    if (!player.onGround) {
      player.rotVel += spinInput * 22 * dt;
      player.rotVel = clamp(player.rotVel, -16, 16);
    } else {
      const worldX = world.dist + player.x;
      const n = waveNormal(worldX, world.t);
      const target = clamp(n.slope * 0.18, -0.35, 0.35);
      player.rot = lerp(player.rot, target, 0.18);
      player.rotVel *= 0.55;
    }

    const pWorldX = world.dist + player.x;
    const ground = waveY(pWorldX, world.t) - 18;

    if (player.onGround) {
      player.y = ground;
      player.vy = 0;
    } else {
      player.airTime += dt;
      player.vy += world.gravity * dt;
      player.y += player.vy * dt;

      player.rot += player.rotVel * dt;
      player.trickRot += Math.abs(player.rotVel) * dt;

      const landingLine = ground;
      if (player.vy > 0 && player.y >= landingLine) {
        const safe = player.airTime < 1.25;
        player.onGround = true;
        player.y = landingLine;

        const fullTurns = Math.floor(player.trickRot / (Math.PI * 2));
        if (fullTurns > 0 && safe) {
          const trickPts = 180 * fullTurns * (1 + combo * 0.35);
          score += trickPts;
          combo = clamp(combo + 0.8 + fullTurns * 0.35, 1, 8);
          comboTimer = 1.25;
          stoke = clamp(stoke + 0.22, 0, 1);
        } else if (!safe) {
          combo = lerp(combo, 1, 0.45);
        }

        player.rotVel *= 0.25;
      }
    }

    if (player.y > canvas.height + 120) endGame();

    if (player.invuln > 0) player.invuln -= dt;

    spawnObsIn -= dt;
    spawnPearlIn -= dt;
    if (spawnObsIn <= 0) spawnObstacle();
    if (spawnPearlIn <= 0) spawnPearl();

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      const sx = o.wx - world.dist;
      if (sx < -140) {
        obstacles.splice(i, 1);
        continue;
      }

      const yWave = waveY(o.wx, world.t);
      let oy = yWave - 18;

      if (o.kind === "rock") oy = yWave - 12;
      else if (o.kind === "buoy")
        oy = yWave - o.off + Math.sin(world.t * 3.1 + o.wob) * 6;
      else if (o.kind === "fin")
        oy = yWave + o.off + Math.sin(world.t * 4.2 + o.wob) * 4;

      if (!gameOver && player.invuln <= 0) {
        if (circleHit(player.x, player.y - 10, player.r, sx, oy, o.size))
          endGame();
      }
    }

    for (let i = pearls.length - 1; i >= 0; i--) {
      const p = pearls[i];
      const sx = p.wx - world.dist;
      if (sx < -120) {
        pearls.splice(i, 1);
        continue;
      }

      const py =
        waveY(p.wx, world.t) - p.off + Math.sin(world.t * 2.8 + p.wob) * 5;

      if (
        !gameOver &&
        circleHit(player.x, player.y - 10, player.r, sx, py, p.r)
      ) {
        pearls.splice(i, 1);
        score += 90 * (1 + combo * 0.25);
        combo = clamp(combo + 0.5, 1, 8);
        comboTimer = 1.3;
        stoke = clamp(stoke + 0.18, 0, 1);
        player.invuln = 0.08;
      }
    }

    updateHUD();
  }

  function endGame() {
    if (gameOver) return;
    gameOver = true;
    running = true;
    paused = false;

    if (score > best) {
      best = Math.floor(score);
      localStorage.setItem("uranus_best", String(best));
    }

    if (btnStart) btnStart.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
    toast("Game over! Aperte R ou clique em Reiniciar.");
    updateHUD();
  }

  function drawSky(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(135,206,235,.38)");
    g.addColorStop(0.55, "rgba(139,92,246,.24)");
    g.addColorStop(1, "rgba(0,0,0,.40)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 30; i++) {
      const x = (i * 97 + world.t * 60) % w;
      const y = 30 + ((i * 41) % 160);
      ctx.fillStyle =
        i % 3 === 0 ? "rgba(34,211,238,.85)" : "rgba(255,255,255,.75)";
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
  }

  function drawCity(w, h) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(255,255,255,.60)";
    const baseY = 250;
    for (let i = 0; i < 8; i++) {
      const bw = 60 + (i % 3) * 38;
      const bh = 70 + (i % 4) * 44;
      const x = 30 + i * 150 - ((world.dist * 0.12) % 120);
      ctx.fillRect(x, baseY - bh, bw, bh);
    }
    ctx.restore();
  }

  function drawWater(w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.05)";
    ctx.fillRect(0, world.seaBase - 10, w, h - (world.seaBase - 10));

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(34,211,238,.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 14) {
      const wx = world.dist + x;
      const y = waveY(wx, world.t);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "rgba(139,92,246,.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 14) {
      const wx = world.dist + x;
      const y = waveY(wx, world.t) + 18;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 42; i++) {
      const y = world.seaBase + 55 + i * 6;
      ctx.fillStyle =
        i % 2 === 0 ? "rgba(255,255,255,.24)" : "rgba(34,211,238,.18)";
      ctx.fillRect(0, y, w, 1);
    }

    ctx.restore();
  }

  function drawPearl(p) {
    const x = p.wx - world.dist;
    const y =
      waveY(p.wx, world.t) - p.off + Math.sin(world.t * 2.8 + p.wob) * 5;
    ctx.save();
    const grad = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, p.r * 2.1);
    grad.addColorStop(0, "rgba(255,255,255,.95)");
    grad.addColorStop(0.35, "rgba(34,211,238,.70)");
    grad.addColorStop(1, "rgba(139,92,246,.10)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawObstacle(o) {
    const x = o.wx - world.dist;
    const yWave = waveY(o.wx, world.t);
    let y = yWave - 18;

    ctx.save();

    if (o.kind === "rock") {
      y = yWave - 12;
      ctx.fillStyle = "rgba(255,255,255,.14)";
      ctx.strokeStyle = "rgba(255,255,255,.20)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, o.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(236,72,153,.50)";
      ctx.beginPath();
      ctx.arc(
        x - o.size * 0.22,
        y - o.size * 0.22,
        o.size * 0.35,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else if (o.kind === "buoy") {
      y = yWave - o.off + Math.sin(world.t * 3.1 + o.wob) * 6;
      ctx.fillStyle = "rgba(236,72,153,.82)";
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(
        x - o.size * 0.85,
        y - o.size * 1.3,
        o.size * 1.7,
        o.size * 2.6,
        o.size * 0.6,
      );
      ctx.fill();
      ctx.stroke();

      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fillRect(
        x - o.size * 0.18,
        y - o.size * 0.7,
        o.size * 0.22,
        o.size * 1.4,
      );
    } else {
      y = yWave + o.off + Math.sin(world.t * 4.2 + o.wob) * 4;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(255,255,255,.20)";
      ctx.strokeStyle = "rgba(34,211,238,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - o.size, y + o.size * 0.8);
      ctx.quadraticCurveTo(
        x - o.size * 0.1,
        y - o.size * 1.2,
        x + o.size,
        y + o.size * 0.8,
      );
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSurfer() {
    const px = player.x;
    const py = player.y;

    ctx.save();
    ctx.globalAlpha = 0.2 + world.boost * 0.12;
    ctx.strokeStyle = "rgba(34,211,238,.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px - 70, py + 18);
    ctx.quadraticCurveTo(px - 20, py + 40, px + 12, py + 18);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.rot);

    if (player.invuln > 0) {
      ctx.shadowColor = "rgba(34,211,238,.75)";
      ctx.shadowBlur = 16;
    }

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.strokeStyle = "rgba(139,92,246,.70)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-46, 10, 96, 16, 10);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(236,72,153,.8)";
    ctx.fillRect(-16, 12, 12, 12);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,.90)";
    ctx.beginPath();
    ctx.arc(0, -6, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = "rgba(0,0,0,.85)";
    ctx.beginPath();
    ctx.roundRect(-12, -12, 10, 6, 2);
    ctx.roundRect(2, -12, 10, 6, 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function overlayCard(title, line1, line2) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(7,7,17,.76)";
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.lineWidth = 2;

    const cw = Math.min(720, w * 0.88);
    const ch = 160;
    const x = (w - cw) / 2;
    const y = (h - ch) / 2;

    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, 18);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "800 30px Inter, Arial";
    ctx.fillText(title, x + 22, y + 54);

    ctx.fillStyle = "rgba(255,255,255,.70)";
    ctx.font = "500 18px Inter, Arial";
    ctx.fillText(line1, x + 22, y + 90);
    if (line2) ctx.fillText(line2, x + 22, y + 118);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(34,211,238,.22)";
    ctx.fillRect(x + 22, y + 66, 160, 3);
    ctx.restore();
  }

  function drawFilmGrain(ts) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.globalAlpha = 0.1;

    const n = 70;
    for (let i = 0; i < n; i++) {
      const x = (i * 37 + ts * 0.06) % w;
      const y = (i * 91 + ts * 0.03) % h;
      ctx.fillStyle = i % 3 === 0 ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.55)";
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.restore();
  }

  function render(ts) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    drawSky(w, h);
    drawCity(w, h);
    drawWater(w, h);

    for (const p of pearls) drawPearl(p);
    for (const o of obstacles) drawObstacle(o);

    drawSurfer();

    if (!running) {
      overlayCard(
        "WAVE RIDER",
        "Clique em Iniciar ou toque no jogo",
        "Pular: Espaço • Trick: ← → no ar • Boost: Shift",
      );
    } else if (paused) {
      overlayCard("PAUSADO", "Pressione P ou clique no botão", "");
    } else if (gameOver) {
      overlayCard(
        "GAME OVER",
        `Score: ${Math.floor(score)} • Melhor: ${best}`,
        "Pressione R ou clique em Reiniciar",
      );
    }

    ctx.save();
    const grd = ctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      120,
      w * 0.5,
      h * 0.45,
      Math.max(w, h) * 0.8,
    );
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(0,0,0,.40)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    drawFilmGrain(ts);
  }

  let lastTS = null;

  function loop(ts) {
    if (!running) return;
    if (lastTS == null) lastTS = ts;
    const dt = clamp((ts - lastTS) / 1000, 0, 0.033);
    lastTS = ts;

    if (!paused && !gameOver) update(dt);
    render(ts);

    requestAnimationFrame(loop);
  }

  resetGame();
})();
