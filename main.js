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
  musicToggle.firstElementChild.textContent = playing ? 'Ⅱ' : '♫';
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
