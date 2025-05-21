// ==UserScript==
// @name         Responsive Viewport Overlay
// @namespace    http://tampermonkey.net/
// @version      1.8.2
// @description  Adds a movable and customizable overlay to any webpage, showing the current viewport dimensions. It’s designed to help web developers and designers quickly simulate screen sizes and test responsive layouts in real time.
// @author       Rob Wood
// @license      MIT
// @icon         https://example.com/icon.png
// @homepage     https://github.com/cubik73/Tampermonkey-Scripts/responsive-viewport-overlay
// @supportURL   https://github.com/cubik73/Tampermonkey-Scripts/responsive-viewport-overlay/issues
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = typeof GM_info !== 'undefined' ? GM_info.script.version : 'unknown';

  const TOGGLE_KEY_COMBO = {
    alt: true,
    shift: true,
    ctrl: false,
    key: 'o'
  };

  function formatKeyCombo(combo) {
    return [
      combo.ctrl ? 'Ctrl' : null,
      combo.alt ? 'Alt' : null,
      combo.shift ? 'Shift' : null,
      combo.key.toUpperCase()
    ].filter(Boolean).join('+');
  }

  const TOGGLE_KEY = formatKeyCombo(TOGGLE_KEY_COMBO);

  const domainKey = location.hostname.replace(/^.*?([\w-]+\.[\w]+)$/, '$1');
  const storageKey = `viewportOverlayPos_${domainKey}`;
  const visibilityKey = `viewportOverlayVisible_${domainKey}`;
  const collapsedKey = `viewportOverlayCollapsed_${domainKey}`;

  // === Shadow DOM Setup ===
  const overlayHost = document.createElement('div');
  overlayHost.id = 'viewport-dimensions-overlay-host';
  overlayHost.style.position = 'fixed';
  overlayHost.style.zIndex = '999999999';
  overlayHost.style.all = 'initial';
  document.body.appendChild(overlayHost);

  const shadow = overlayHost.attachShadow({ mode: 'open' });

    // Add Google Fonts <link> to the Shadow DOM
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Funnel+Sans&display=swap';
    shadow.appendChild(fontLink);

  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Funnel+Sans:ital,wght@0,300..800;1,300..800&family=Prosto+One&family=Source+Code+Pro:ital,wght@0,200..900;1,200..900&display=swap');

    * {
      all: initial;
      box-sizing: border-box;
      font-family: 'Funnel Sans', sans-serif !important;
      color: #fff !important;
    }
    #overlay {
      position: fixed;
      background: rgba(128, 0, 0, 0.75);
      color: #fff;
      padding: 8px;
      font-size: 14px;
      border: 1px solid #fff;
      border-radius: 10px;
      cursor: move;
      user-select: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 180px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: auto;
      box-shadow: 0 2px 10px rgba(0,0,0,0.6);
      z-index: 999999999;
    }
    .dimensions {
      cursor: move;
    }
    button {
      padding: 2px 6px;
      font-size: 12px;
      cursor: pointer;
      border: 1px solid #ccc;
      border-radius: 5px;
      background: #333;
      color: #fff;
      flex: 1 0 auto;
    }
    input {
      padding: 2px;
      font-size: 12px;
      border-radius: 4px;
      border: 1px solid #ccc;
      flex: 1;
    }
  `;
  shadow.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  shadow.appendChild(overlay);

  // === UI Elements ===
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';

  const dimensionText = document.createElement('div');
  dimensionText.classList.add('dimensions');

  const infoIcon = document.createElement('span');
  infoIcon.textContent = 'ℹ️';
  infoIcon.title = `Viewport Overlay v${SCRIPT_VERSION}\nToggle: ${TOGGLE_KEY}`;
  infoIcon.style.cursor = 'help';

  const collapseToggle = document.createElement('button');
  collapseToggle.textContent = '—';
  collapseToggle.title = 'Collapse/Expand overlay';

  header.appendChild(dimensionText);
  header.appendChild(infoIcon);
  header.appendChild(collapseToggle);
  overlay.appendChild(header);

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.flexWrap = 'wrap';
  controls.style.gap = '4px';

  const btn = (label, title, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', fn);
    return b;
  };

  const devices = [
    { w: 320, h: 568 },
    { w: 375, h: 667 },
    { w: 414, h: 896 },
    { w: 768, h: 1024 },
    { w: 1024, h: 1366 },
    { w: 1440, h: 900 }
  ];

  devices.forEach(d => {
    controls.appendChild(
      btn(`${d.w}×${d.h}`, `Open new window at ${d.w}x${d.h}`, () => {
        window.open(location.href, '_blank', `width=${d.w},height=${d.h},resizable=yes`);
      })
    );
  });

  controls.appendChild(btn('⤧', 'Snap to left or right edge', snapToEdge));
  controls.appendChild(btn('↺', 'Reset overlay position', () => {
    overlay.style.top = '10px';
    overlay.style.left = '';
    overlay.style.right = '10px';
    savePosition();
  }));

  overlay.appendChild(controls);

  // === Editable custom width/height ===
  const customWrapper = document.createElement('div');
  customWrapper.style.display = 'flex';
  customWrapper.style.gap = '4px';
  customWrapper.style.marginTop = '4px';

  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = 100;
  widthInput.placeholder = 'Width';

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = 100;
  heightInput.placeholder = 'Height';

  const applyBtn = btn('Set', 'Open new window with custom size', () => {
    const w = parseInt(widthInput.value);
    const h = parseInt(heightInput.value);
    if (!isNaN(w) && !isNaN(h)) {
      window.open(location.href, '_blank', `width=${w},height=${h},resizable=yes`);
    } else {
      alert('Please enter valid dimensions');
    }
  });

  customWrapper.appendChild(widthInput);
  customWrapper.appendChild(heightInput);
  customWrapper.appendChild(applyBtn);
  overlay.appendChild(customWrapper);

  collapseToggle.addEventListener('click', () => {
    const collapsed = overlay.classList.toggle('collapsed');
    controls.style.display = collapsed ? 'none' : 'flex';
    customWrapper.style.display = collapsed ? 'none' : 'flex';
    collapseToggle.textContent = collapsed ? '+' : '—';
    localStorage.setItem(collapsedKey, collapsed);
  });

  function constrainToViewport() {
    const rect = overlay.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = parseInt(overlay.style.top) || 10;
    let left = overlay.style.left ? parseInt(overlay.style.left) : null;

    if (top + rect.height > vh) top = vh - rect.height - 10;
    if (top < 0) top = 10;

    if (left !== null) {
      if (left + rect.width > vw) left = vw - rect.width - 10;
      if (left < 0) left = 10;
      overlay.style.left = `${left}px`;
      overlay.style.right = '';
    } else {
      const right = parseInt(overlay.style.right || '10');
      if (right + rect.width > vw) {
        overlay.style.right = `${vw - rect.width - 10}px`;
      }
    }

    overlay.style.top = `${top}px`;
  }

  function restorePosition() {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) {
      overlay.style.top = saved.top;
      overlay.style.left = saved.left;
      overlay.style.right = saved.right || '';
    } else {
      overlay.style.top = '10px';
      overlay.style.right = '10px';
    }
    constrainToViewport();
  }

  function updateDimensions() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    dimensionText.textContent = `Viewport: ${w} × ${h}`;
    widthInput.value = w;
    heightInput.value = h;
    constrainToViewport();
  }

  function snapToEdge() {
    const rect = overlay.getBoundingClientRect();
    const vw = window.innerWidth;
    const snapLeft = rect.left < vw / 2;
    if (snapLeft) {
      overlay.style.left = '10px';
      overlay.style.right = '';
    } else {
      overlay.style.left = '';
      overlay.style.right = '10px';
    }
    savePosition();
  }

  function savePosition() {
    localStorage.setItem(storageKey, JSON.stringify({
      top: overlay.style.top,
      left: overlay.style.left,
      right: overlay.style.right
    }));
  }

  let isDragging = false, offsetX = 0, offsetY = 0;
  overlay.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    isDragging = true;
    offsetX = e.clientX - overlay.getBoundingClientRect().left;
    offsetY = e.clientY - overlay.getBoundingClientRect().top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (isDragging) {
      overlay.style.left = `${e.clientX - offsetX}px`;
      overlay.style.top = `${e.clientY - offsetY}px`;
      overlay.style.right = '';
      constrainToViewport();
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      savePosition();
    }
  });

  restorePosition();
  updateDimensions();

  const savedVisible = localStorage.getItem(visibilityKey);
  if (savedVisible === 'false') overlayHost.style.display = 'none';

  const savedCollapsed = localStorage.getItem(collapsedKey);
  if (savedCollapsed === 'true') {
    overlay.classList.add('collapsed');
    controls.style.display = 'none';
    customWrapper.style.display = 'none';
    collapseToggle.textContent = '+';
  }

  window.addEventListener('resize', updateDimensions);

  window.addEventListener('keydown', (e) => {
    if (
      e.altKey === TOGGLE_KEY_COMBO.alt &&
      e.shiftKey === TOGGLE_KEY_COMBO.shift &&
      e.ctrlKey === TOGGLE_KEY_COMBO.ctrl &&
      e.key.toLowerCase() === TOGGLE_KEY_COMBO.key
    ) {
      const isHidden = overlayHost.style.display === 'none';
      overlayHost.style.display = isHidden ? 'block' : 'none';
      localStorage.setItem(visibilityKey, isHidden);
    }
  });
})();
