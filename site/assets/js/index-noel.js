/* Christmas skin for the landing page only. UI-only; no network/database calls. */
(() => {
  'use strict';
  const KEY = 'cscec_index_noel_mode_v1';
  const root = document.documentElement;
  const topbar = document.querySelector('.topbar');
  const languageSwitch = document.getElementById('langSwitch');
  const heading = document.querySelector('.workspace .heading');
  if (!topbar || !languageSwitch || !heading) return;

  const strings = {
    vi: { label: 'Chế độ Noel', on: 'Tắt chế độ Noel', off: 'Bật chế độ Noel', greeting: 'MÙA GIÁNG SINH AN LÀNH', subtitle: 'Chúc một mùa lễ hội ấm áp và nhiều niềm vui ✨' },
    zh: { label: '圣诞模式', on: '关闭圣诞模式', off: '开启圣诞模式', greeting: '圣诞快乐 · 温暖相伴', subtitle: '愿这个圣诞季充满温暖与欢乐 ✨' },
    en: { label: 'Christmas mode', on: 'Turn Christmas mode off', off: 'Turn Christmas mode on', greeting: 'WISHING YOU A MERRY CHRISTMAS', subtitle: 'Warm wishes for a joyful holiday season ✨' }
  };
  const getLang = () => document.querySelector('#langSwitch [data-lang].active')?.dataset.lang
    || (root.lang.toLowerCase().startsWith('zh') ? 'zh' : root.lang.toLowerCase().startsWith('en') ? 'en' : 'vi');
  const switchButton = document.createElement('button');
  switchButton.type = 'button';
  switchButton.className = 'noel-mode-toggle';
  switchButton.id = 'noelModeToggle';
  switchButton.setAttribute('aria-pressed', 'false');
  switchButton.innerHTML = '<span class="noel-mode-tree" aria-hidden="true">🎄</span><span class="noel-mode-label"></span><span class="noel-mode-track" aria-hidden="true"><span class="noel-mode-thumb"></span></span>';
  languageSwitch.after(switchButton);

  const intro = document.createElement('div');
  intro.className = 'noel-intro';
  intro.innerHTML = '<span class="noel-intro-kicker"></span>';
  const subtitle = document.createElement('span');
  subtitle.className = 'noel-intro-subtitle';
  heading.append(intro, subtitle);

  const garland = document.createElement('div');
  garland.className = 'noel-garland';
  garland.setAttribute('aria-hidden', 'true');
  heading.append(garland);

  const decor = document.createElement('div');
  decor.className = 'noel-snowfall';
  decor.setAttribute('aria-hidden', 'true');
  document.body.append(decor);

  // Fixed, modest number of lightweight nodes; CSS animations pause completely when off.
  let snowCreated = false;
  const createSnow = () => {
    if (snowCreated || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    snowCreated = true;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 28; i += 1) {
      const flake = document.createElement('i');
      const value = (i * 73 + 17) % 101;
      flake.style.setProperty('--snow-x', value + '%');
      flake.style.setProperty('--snow-size', (i % 5 === 0 ? 5 : i % 3 === 0 ? 3 : 2) + 'px');
      flake.style.setProperty('--snow-time', (11 + i % 11) + 's');
      flake.style.setProperty('--snow-delay', '-' + ((i * 13) % 19) + 's');
      flake.style.setProperty('--snow-drift', ((i % 2 ? 1 : -1) * (13 + i % 27)) + 'px');
      fragment.append(flake);
    }
    decor.append(fragment);
  };
  let mode;
  try {
    const saved = localStorage.getItem(KEY);
    mode = saved === '1' ? true : saved === '0' ? false : [10, 11].includes(new Date().getMonth());
  } catch (_) {
    mode = [10, 11].includes(new Date().getMonth());
  }
  const syncLabels = () => {
    const t = strings[getLang()] || strings.vi;
    switchButton.querySelector('.noel-mode-label').textContent = t.label;
    switchButton.setAttribute('aria-label', mode ? t.on : t.off);
    switchButton.title = mode ? t.on : t.off;
    intro.querySelector('.noel-intro-kicker').textContent = t.greeting;
    subtitle.textContent = t.subtitle;
  };
  const update = () => {
    root.classList.toggle('noel-on', mode);
    switchButton.setAttribute('aria-pressed', String(mode));
    if (mode) createSnow();
    syncLabels();
  };
  switchButton.addEventListener('click', () => {
    mode = !mode;
    try { localStorage.setItem(KEY, mode ? '1' : '0'); } catch (_) { /* storage may be disabled */ }
    update();
  });
  languageSwitch.addEventListener('click', event => {
    if (event.target.closest('[data-lang]')) queueMicrotask(syncLabels);
  });
  update();
})();
