'use strict';

const feedback = document.querySelector('.copy-feedback');
const gallery = document.querySelector('.image-dialog');
const music = document.querySelector('#background-music');
const musicToggle = document.querySelector('.music-toggle');
let feedbackTimeout;

function showFeedback(message) {
  feedback.textContent = message;
  window.clearTimeout(feedbackTimeout);
  feedbackTimeout = window.setTimeout(() => {
    feedback.textContent = '';
  }, 3000);
}

function updateMusicToggle() {
  const playing = !music.paused && !music.ended && !music.error;
  musicToggle.setAttribute('aria-pressed', String(playing));
  musicToggle.title = playing ? '暂停背景音乐' : '播放背景音乐';
}

if (music && musicToggle) {
  const preferenceKey = 'chenghui-background-music';
  let musicEnabled = true;
  try {
    musicEnabled = localStorage.getItem(preferenceKey) !== 'off';
  } catch {
    // Music still works when a web-view disables local storage.
  }

  function rememberMusicPreference() {
    try {
      localStorage.setItem(preferenceKey, musicEnabled ? 'on' : 'off');
    } catch {
      // The current page still keeps the choice.
    }
  }

  function startMusic(fromToggle = false) {
    if (!musicEnabled || !music.paused || (document.hidden && !fromToggle)) return;
    if (!music.hasAttribute('src')) {
      music.src = music.dataset.src;
    } else if (music.error && fromToggle) {
      music.load();
    }
    music.play()?.catch((error) => {
      updateMusicToggle();
      if (fromToggle && error.name !== 'AbortError') {
        showFeedback('音乐播放失败，请点按重试');
      }
    });
  }

  musicToggle.hidden = false;
  for (const event of ['play', 'pause', 'ended', 'error']) {
    music.addEventListener(event, updateMusicToggle);
  }
  musicToggle.addEventListener('click', () => {
    musicEnabled = music.paused;
    rememberMusicPreference();
    if (musicEnabled) {
      startMusic(true);
    } else {
      music.pause();
    }
  });

  // WeChat may allow playback once its bridge is ready. Other clients can
  // require a real tap, so also retry inside that event's activation window.
  document.addEventListener('WeixinJSBridgeReady', () => startMusic(), { once: true });
  function startOnInteraction(event) {
    if (event.isTrusted && !musicToggle.contains(event.target)) startMusic();
  }
  document.addEventListener('click', startOnInteraction, { capture: true });
  document.addEventListener('touchend', startOnInteraction, { capture: true, passive: true });

  const cover = document.querySelector('.cover-mosaic img');
  const afterCoverPaint = () => requestAnimationFrame(() => requestAnimationFrame(() => startMusic()));
  if (!cover || cover.complete) {
    afterCoverPaint();
  } else {
    cover.addEventListener('load', afterCoverPaint, { once: true });
    cover.addEventListener('error', afterCoverPaint, { once: true });
  }
}

function copyWithSelection(text) {
  const previousFocus = document.activeElement;
  const field = document.createElement('textarea');
  field.className = 'copy-buffer';
  field.value = text;
  field.readOnly = true;
  document.body.append(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, field.value.length);
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

async function copyAddress(button) {
  const address = document.getElementById(button.dataset.copy).textContent.trim();
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(address);
      showFeedback('地址已复制');
      return;
    } catch {
      // Some web-views deny the Clipboard API but still allow selection-based copying.
    }
  }

  try {
    if (copyWithSelection(address)) {
      showFeedback('地址已复制');
      return;
    }
  } catch {
    // The address stays selectable when both clipboard methods are unavailable.
  }
  showFeedback('复制失败，请长按地址手动复制');
}

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.hidden = false;
  button.addEventListener('click', () => copyAddress(button));
});

if (typeof gallery?.showModal === 'function') {
  const photo = new Image();
  document.addEventListener('click', (event) => {
    const link = event.target.closest('.art-zoom');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    photo.src = link.href;
    photo.alt = link.querySelector('img').alt;
    gallery.append(photo);
    gallery.showModal();
    gallery.scrollTop = 0;
  });

  gallery.addEventListener('close', () => {
    photo.remove();
    photo.removeAttribute('src');
  });
}

function setupBook(book) {
  const pages = Array.from(book.querySelectorAll(':scope > section'));
  const controls = book.querySelector('.book-controls');
  const position = book.querySelector('.book-position');
  const directory = book.querySelector('.book-directory');
  const previous = book.querySelector('[data-step="-1"]');
  const next = book.querySelector('[data-step="1"]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const offsets = new Map();
  const pageFromHash = () => pages.findIndex((page) => '#' + page.id === location.hash);
  let current = Math.max(0, pageFromHash());
  let turn;
  let gesture;
  let lastWheel = -Infinity;

  function setDirectory(open) {
    book.classList.toggle('is-directory-open', open);
    directory.setAttribute('aria-expanded', String(open));
  }

  function updateControls() {
    position.value = `${current + 1} / ${pages.length}`;
    previous.disabled = current === 0;
    next.disabled = current === pages.length - 1;
  }

  function atEdge(direction) {
    const page = pages[current];
    return direction < 0
      ? page.scrollTop <= 2
      : page.scrollTop + page.clientHeight >= page.scrollHeight - 2;
  }

  function showPage(index) {
    const old = pages[current];
    const focused = old.contains(document.activeElement);
    offsets.set(old, old.scrollTop);
    old.classList.remove('book-current');
    old.inert = true;

    current = index;
    const page = pages[current];
    page.classList.add('book-current');
    page.inert = false;
    page.scrollTop = offsets.get(page) || 0;
    if (focused) page.focus({ preventScroll: true });
    updateControls();
  }

  function beginTurn(index) {
    if (turn || index === current || !pages[index]) return false;
    const front = pages[current];
    const back = pages[index];
    turn = {
      index, front, back, height: front.clientHeight,
      direction: Math.sign(index - current), animations: [],
    };
    setDirectory(false);
    back.classList.add('book-preview');
    back.scrollTop = offsets.get(back) || 0;
    drawTurn(0);
    return true;
  }

  function drawTurn(distance) {
    if (reducedMotion.matches) return;
    const { front, back, direction, height } = turn;
    const progress = Math.min(distance / height, 1);
    front.style.transform = `translateY(${-direction * distance}px) rotateX(${direction * progress * 16}deg)`;
    back.style.transform = `translateY(${direction * (1 - progress) * 24}px) scale(${.95 + progress * .05})`;
    back.style.opacity = String(.82 + progress * .18);
  }

  function finishTurn(changePage) {
    const { front, back, index, animations } = turn;
    if (changePage) showPage(index);
    back.classList.remove('book-preview');
    front.style.removeProperty('transform');
    back.style.removeProperty('transform');
    back.style.removeProperty('opacity');
    animations.forEach((animation) => animation.cancel());
    turn = undefined;
  }

  function settleTurn(changePage) {
    const pending = turn;
    if (!pending || pending.animations.length) return;
    if (reducedMotion.matches || typeof pending.front.animate !== 'function') {
      finishTurn(changePage);
      return;
    }

    const { front, back, height } = pending;
    const frames = [front, back].map((page) => ({
      transform: page.style.transform, opacity: page.style.opacity || '1',
    }));
    drawTurn(changePage ? height * 1.08 : 0);
    pending.animations = [front, back].map((page, i) => page.animate([
      frames[i], { transform: page.style.transform, opacity: page.style.opacity || '1' },
    ], { duration: changePage ? 370 : 210, easing: 'cubic-bezier(.2,.72,.22,1)', fill: 'both' }));
    Promise.allSettled(pending.animations.map((animation) => animation.finished)).then(() => {
      if (turn === pending) finishTurn(changePage);
    });
  }

  function goTo(index) {
    if (beginTurn(index)) settleTurn(true);
  }

  pages.forEach((page, index) => {
    page.tabIndex = -1;
    page.inert = index !== current;
  });
  pages[current].classList.add('book-current');
  book.classList.add('is-book');
  document.body.classList.add('book-open');
  controls.hidden = false;
  updateControls();
  setDirectory(location.hash === '#chapters');

  previous.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  directory.addEventListener('click', () => setDirectory(directory.getAttribute('aria-expanded') !== 'true'));
  book.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    const index = pages.findIndex((page) => '#' + page.id === hash);
    if (index < 0) return;
    event.preventDefault();
    if (turn) return;
    if (location.hash !== hash) history.pushState(null, '', hash);
    if (directory.getAttribute('aria-expanded') === 'true') directory.focus({ preventScroll: true });
    setDirectory(false);
    goTo(index);
  });

  function followHistory() {
    const index = pageFromHash();
    if (turn) finishTurn(false);
    setDirectory(location.hash === '#chapters');
    if (index >= 0 && index !== current) showPage(index);
    if (!location.hash && current !== 0) showPage(0);
  }
  window.addEventListener('popstate', followHistory);
  window.addEventListener('hashchange', followHistory);

  book.addEventListener('touchstart', (event) => {
    if (turn || event.touches.length !== 1
        || event.target.closest('.book-controls, .chapters, input, textarea')) return;
    setDirectory(false);
    const [{ clientX, clientY }] = event.touches;
    gesture = { x: clientX, y: clientY, forward: atEdge(1), back: atEdge(-1), started: performance.now() };
  }, { passive: true });

  book.addEventListener('touchmove', (event) => {
    if (!gesture) return;
    if (event.touches.length !== 1 || !event.cancelable) {
      if (gesture.direction) settleTurn(false);
      gesture = undefined;
      return;
    }
    const [{ clientX, clientY }] = event.touches;
    const delta = gesture.y - clientY;
    if (!gesture.direction) {
      if (Math.abs(delta) < 8 && Math.abs(gesture.x - clientX) < 8) return;
      const direction = delta > 0 ? 1 : -1;
      const canTurn = direction > 0 ? gesture.forward : gesture.back;
      if (!canTurn || Math.abs(delta) < Math.abs(gesture.x - clientX) || !beginTurn(current + direction)) {
        gesture = undefined;
        return;
      }
      gesture.direction = direction;
    }
    event.preventDefault();
    gesture.distance = Math.max(0, delta * gesture.direction);
    drawTurn(Math.min(gesture.distance * .85, turn.height));
  }, { passive: false });

  book.addEventListener('touchend', () => {
    if (gesture?.direction) {
      const quick = performance.now() - gesture.started < 330;
      settleTurn(gesture.distance >= (quick ? 38 : 65));
    }
    gesture = undefined;
  }, { passive: true });
  book.addEventListener('touchcancel', () => {
    if (gesture?.direction) settleTurn(false);
    gesture = undefined;
  }, { passive: true });

  book.addEventListener('wheel', (event) => {
    if (!event.deltaY || event.ctrlKey || directory.getAttribute('aria-expanded') === 'true') return;
    const now = performance.now();
    const first = now - lastWheel > 180;
    lastWheel = now;
    const direction = Math.sign(event.deltaY);
    if (turn || atEdge(direction)) {
      event.preventDefault();
      if (first) goTo(current + direction);
    }
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || gallery?.open || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' && directory.getAttribute('aria-expanded') === 'true') {
      setDirectory(false);
      directory.focus({ preventScroll: true });
      return;
    }
    const direction = { ArrowUp: -1, PageUp: -1, ArrowDown: 1, PageDown: 1 }[event.key];
    if (!direction || event.target.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    if (turn) return;
    if (atEdge(direction)) goTo(current + direction);
    else pages[current].scrollBy(0, direction * (event.key.startsWith('Arrow') ? 50 : pages[current].clientHeight * .85));
  });
}

const book = document.querySelector('.site');
if (book?.querySelector('.book-controls')) setupBook(book);

const deferredImages = document.querySelectorAll('img[data-src]');

function loadImage(image) {
  image.src = image.dataset.src;
  delete image.dataset.src;
}

if ('IntersectionObserver' in window) {
  const nearViewport = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      loadImage(entry.target);
      nearViewport.unobserve(entry.target);
    }
  }, { rootMargin: '155px 0px' });

  deferredImages.forEach((image) => nearViewport.observe(image));
} else {
  deferredImages.forEach(loadImage);
}

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('h5-enter');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -24px 0px' });

  document.querySelectorAll(
    '[data-reveal] > :is(.panel-heading, .copy, .artwork, .meal-photos, .quality-group, .values-logo, .values-art)'
  ).forEach((block) => observer.observe(block));
}
