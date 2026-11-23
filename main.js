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
  musicToggle.hidden = false;
  for (const event of ['play', 'pause', 'ended', 'error']) {
    music.addEventListener(event, updateMusicToggle);
  }
  musicToggle.addEventListener('click', () => {
    if (!music.paused) {
      music.pause();
      return;
    }
    if (!music.hasAttribute('src')) {
      music.src = music.dataset.src;
    } else if (music.error) {
      music.load();
    }
    music.play()?.catch((error) => {
      if (error.name !== 'AbortError') {
        updateMusicToggle();
        showFeedback('音乐播放失败，请点按重试');
      }
    });
  });
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
      entry.target.classList.add('is-entering');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0 });

  document.querySelectorAll('[data-reveal]').forEach((panel) => observer.observe(panel));
}
