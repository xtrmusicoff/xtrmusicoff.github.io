(() => {
  'use strict';

  // ---------- Config ----------
  const SPOTIFY_URL = 'https://open.spotify.com/artist/2tXbTzvCAksgCwA7FoSufk';
  const GROUP_WINDOW_MS = 500;
  const FADE_MS = 450;
  const MESSAGE_HOLD_MS = 2000;
  const INTRO_MS = 3400;
  const HINT = 'Try to click button once, twice or thrice.';

  const SINGLE_MESSAGES = ['Hello, world!'];
  const DOUBLE_MESSAGES = ['Created by 10TR', 'and coded by Claude Haiku 5.5', 'instagram.com/@xtrmusicoff'];

  const GRID = { spacing: 28, radius: 150, push: 14, leaveMs: 650 };
  const ACCENT_RGB = [245, 73, 39];

  // ---------- Elements ----------
  const intro = document.getElementById('intro');
  const main = document.getElementById('main');
  const title = main.querySelector('.title');
  const subtitle = main.querySelector('.subtitle');
  const cta = document.getElementById('cta');
  const message = document.getElementById('message');
  const sparkLayer = document.getElementById('sparks');
  const canvas = document.getElementById('grid');
  const ctx = canvas.getContext('2d');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ---------- Intro -> main reveal ----------
  function reveal() {
    main.classList.add('is-active');
    title.classList.add('is-shown');                       // words fade in one by one (staggered via --i)
    setTimeout(() => subtitle.classList.add('is-shown'), 1300);
    setTimeout(() => {
      cta.classList.add('is-shown');
      cta.disabled = false;
    }, 2200);
  }

  setTimeout(() => {
    intro.classList.add('is-hidden');
    setTimeout(reveal, 250);
  }, INTRO_MS);

  // ---------- Message queue ----------
  let busy = false;

  async function showMessages(lines) {
    busy = true;
    cta.disabled = true;

    for (const line of lines) {
      message.textContent = line;
      message.classList.add('is-visible');
      await wait(FADE_MS);
      await wait(MESSAGE_HOLD_MS);
      message.classList.remove('is-visible');
      await wait(FADE_MS);
      message.textContent = '';
    }

    busy = false;
    cta.disabled = false;
  }

  // ---------- Click grouping ----------
  let clickCount = 0;
  let groupTimer = null;

  function resolveGroup() {
    const count = clickCount;
    clickCount = 0;
    groupTimer = null;

    if (busy) return; // a hint or sequence started in the meantime

    if (count === 1) {
      showMessages(SINGLE_MESSAGES);
    } else if (count === 2) {
      showMessages(DOUBLE_MESSAGES);
    } else {
      window.location.href = SPOTIFY_URL; // three or more clicks
    }
  }

  function spawnRipple(event) {
    if (reduceMotion) return;
    const rect = cta.getBoundingClientRect();
    // Keyboard-triggered clicks have no pointer position; centre the ripple then.
    const x = event.detail === 0 ? rect.width / 2 : event.clientX - rect.left;
    const y = event.detail === 0 ? rect.height / 2 : event.clientY - rect.top;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.addEventListener('animationend', () => ripple.remove());
    cta.appendChild(ripple);
  }

  cta.addEventListener('click', (event) => {
    if (busy) return;
    spawnRipple(event);

    clickCount += 1;
    if (groupTimer === null) {
      groupTimer = setTimeout(resolveGroup, GROUP_WINDOW_MS); // window opens at the first click
    }
  });

  // ---------- Right-click hint ----------
  cta.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (busy) return;

    clearTimeout(groupTimer);
    groupTimer = null;
    clickCount = 0;
    showMessages([HINT]);
  });

  // ---------- Sparks ----------
  if (!reduceMotion) {
    for (let i = 0; i < 18; i++) {
      const spark = document.createElement('span');
      spark.className = 'spark';
      spark.style.left = `${Math.random() * 100}%`;
      spark.style.top = `${Math.random() * 100}%`;
      spark.style.setProperty('--dur', `${3 + Math.random() * 4}s`);
      spark.style.animationDelay = `${-Math.random() * 6}s`;
      sparkLayer.appendChild(spark);
    }
  }

  // ---------- Dotted grid with pointer repulsion ----------
  let width = 0;
  let height = 0;
  let dots = [];

  const pointer = { inside: false };
  // Repulsion field: centre is frozen after the pointer leaves; amp eases the displacement.
  const field = { cx: 0, cy: 0, amp: 0, leaving: false, leaveAt: 0, leaveFrom: 0 };

  function buildGrid() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { spacing } = GRID;
    const cols = Math.ceil(width / spacing) + 1;
    const rows = Math.ceil(height / spacing) + 1;
    const ox = (width - (cols - 1) * spacing) / 2;
    const oy = (height - (rows - 1) * spacing) / 2;

    dots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push({ bx: ox + c * spacing, by: oy + r * spacing, dx: 0, dy: 0, t: 0 });
      }
    }
  }

  function updateField(now) {
    if (field.leaving) {
      const p = Math.min(1, (now - field.leaveAt) / GRID.leaveMs);
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // ease in-out cubic
      field.amp = field.leaveFrom * (1 - eased);
      if (p >= 1) {
        field.leaving = false;
        field.amp = 0;
      }
    } else if (pointer.inside) {
      field.amp += (1 - field.amp) * 0.18;
    }
  }

  function draw(now) {
    if (!reduceMotion) updateField(now);

    const { radius, push } = GRID;
    const { cx, cy, amp } = field;
    ctx.clearRect(0, 0, width, height);

    for (const d of dots) {
      let tx = 0;
      let ty = 0;
      let tt = 0;

      if (amp > 0.001) {
        const vx = d.bx - cx;
        const vy = d.by - cy;
        const dist = Math.hypot(vx, vy);
        if (dist < radius) {
          const w = 1 - dist / radius;
          const s = w * w * (3 - 2 * w); // smoothstep: zero at the radius
          const inv = dist > 0.0001 ? 1 / dist : 0;
          tx = vx * inv * push * s * amp;
          ty = vy * inv * push * s * amp;
          tt = s * amp;
        }
      }

      // Ease displacement and colour toward their targets
      d.dx += (tx - d.dx) * 0.2;
      d.dy += (ty - d.dy) * 0.2;
      d.t += (tt - d.t) * 0.2;

      const k = d.t;
      const r = 1.1 + 1.1 * k;
      const red = Math.round(255 + (ACCENT_RGB[0] - 255) * k);
      const green = Math.round(255 + (ACCENT_RGB[1] - 255) * k);
      const blue = Math.round(255 + (ACCENT_RGB[2] - 255) * k);
      const alpha = 0.18 + 0.82 * k;

      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(d.bx + d.dx, d.by + d.dy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!reduceMotion) requestAnimationFrame(draw);
  }

  function onPointerMove(event) {
    pointer.inside = true;
    field.cx = event.clientX;
    field.cy = event.clientY;
    field.leaving = false;
  }

  function onPointerLeave() {
    if (!pointer.inside) return;
    pointer.inside = false;
    field.leaving = true;
    field.leaveAt = performance.now();
    field.leaveFrom = field.amp; // start easing from wherever the slope currently is
  }

  window.addEventListener('resize', () => {
    buildGrid();
    if (reduceMotion) draw(performance.now());
  });

  if (!reduceMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    // Pointer left the window (mouseout with no related target)
    window.addEventListener('mouseout', (event) => {
      if (!event.relatedTarget) onPointerLeave();
    });
    window.addEventListener('blur', onPointerLeave);
  }

  buildGrid();
  if (reduceMotion) {
    draw(performance.now()); // static grid only
  } else {
    requestAnimationFrame(draw);
  }
})();
