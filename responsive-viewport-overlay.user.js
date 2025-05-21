// ==UserScript==
// @name         Responsive Viewport Overlay
// @namespace    http://tampermonkey.net/
// @version      1.8.4.3
// @description  Adds a movable and customizable overlay to any webpage, showing the current viewport dimensions. It’s designed to help web developers and designers quickly simulate screen sizes and test responsive layouts in real time.
// @author       Rob Wood
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=robertwood.me
// @homepage     https://github.com/cubik73/Tampermonkey-Scripts/
// @supportURL   https://github.com/cubik73/Tampermonkey-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/cubik73/Tampermonkey-Scripts/main/responsive-viewport-overlay.user.js
// @downloadURL  https://raw.githubusercontent.com/cubik73/Tampermonkey-Scripts/main/responsive-viewport-overlay.user.js
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
  const touchModeKey = `viewportOverlayTouchMode_${domainKey}`;

  // === Shadow DOM Setup ===
  const overlayHost = document.createElement('div');
  overlayHost.id = 'viewport-dimensions-overlay-host';
  overlayHost.style.position = 'fixed';
  overlayHost.style.zIndex = '999999999';
  overlayHost.style.all = 'initial';
  document.body.appendChild(overlayHost);

  const shadow = overlayHost.attachShadow({ mode: 'open' });

  const fontLink1 = document.createElement('link');
  fontLink1.rel = 'stylesheet';
  fontLink1.href = 'https://fonts.googleapis.com/css2?family=Funnel+Sans&display=swap';
  shadow.appendChild(fontLink1);
  
  const fontLink2 = document.createElement('link');
  fontLink2.rel = 'stylesheet';
  fontLink2.href = 'https://fonts.googleapis.com/css2?family=Funnel+Sans:ital,wght@0,300..800;1,300..800&family=Prosto+One&family=Source+Code+Pro:ital,wght@0,200..900;1,200..900&display=swap';
  shadow.appendChild(fontLink2);

  const style = document.createElement('style');
  const styleContent = `
    * {
      all: initial;
      box-sizing: border-box;
      font-family: 'Funnel Sans', sans-serif !important;
      color: #fff !important;
    }
    style, script, link, meta, title {
      all: unset;
      display: none !important;
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
    .collapse-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      font-size: 14px;
      font-weight: bold;
    }
    input {
      padding: 2px;
      font-size: 12px;
      border-radius: 4px;
      border: 1px solid #ccc;
      flex: 1;
    }
    
    /* Toggle Switch Styles */
    .toggle-container {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1 0 auto;
      padding: 2px 6px;
      font-size: 12px;
      border: 1px solid #ccc;
      border-radius: 5px;
      background: #333;
    }
    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 20px;
    }
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
      margin: 0;
      padding: 0;
    }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #f44336; /* Red for OFF */
      transition: .3s;
      border-radius: 20px;
    }
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 2px;
      bottom: 2px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
    input:checked + .toggle-slider {
      background-color: #4CAF50; /* Green for ON */
    }
    input:checked + .toggle-slider:before {
      transform: translateX(20px);
    }
    .toggle-switch.disabled .toggle-slider {
      background-color: #888; /* Gray when disabled */
      cursor: not-allowed;
      opacity: 0.6;
    }
    
    /* Settings Section Styles */
    .settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0;
      margin-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.3);
      cursor: pointer;
    }
    .settings-toggle {
      font-size: 12px;
      font-weight: bold;
      user-select: none;
    }
    .settings-container {
      display: none;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
    }
    .settings-container.expanded {
      display: flex;
    }
    .device-preset {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .device-preset input {
      width: 60px;
      text-align: center;
    }
    .device-preset span {
      font-size: 12px;
    }
    .settings-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 4px;
    }
    .settings-actions button {
      flex: 0 1 auto;
    }
  `;
  style.appendChild(document.createTextNode(styleContent));
  shadow.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  shadow.appendChild(overlay);

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';

  // Create a container for dimensions text and info icon
  const dimensionsContainer = document.createElement('div');
  dimensionsContainer.style.display = 'flex';
  dimensionsContainer.style.alignItems = 'center';
  dimensionsContainer.style.gap = '6px';
  dimensionsContainer.style.cursor = 'move'; // Ensure container is draggable

  const dimensionText = document.createElement('div');
  dimensionText.classList.add('dimensions');

  const infoIcon = document.createElement('span');
  infoIcon.textContent = 'ℹ️';
  infoIcon.title = `Viewport Overlay v${SCRIPT_VERSION}\nToggle: ${TOGGLE_KEY}`;
  infoIcon.style.cursor = 'help';

  // Add both elements to the container
  dimensionsContainer.appendChild(dimensionText);
  dimensionsContainer.appendChild(infoIcon);

  const collapseToggle = document.createElement('button');
  collapseToggle.textContent = '—';
  collapseToggle.title = 'Collapse/Expand overlay';
  collapseToggle.classList.add('collapse-btn');

  // Add the container and collapse button to header
  header.appendChild(dimensionsContainer);
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

  // Replace the touch toggle button with a modern UI switch
  const touchToggleContainer = document.createElement('div');
  touchToggleContainer.className = 'toggle-container';
  touchToggleContainer.title = 'Toggle touch mode (hides scrollbar)';
  
  const touchLabel = document.createElement('span');
  touchLabel.textContent = 'Touch:';
  
  const touchSwitch = document.createElement('label');
  touchSwitch.className = 'toggle-switch';
  
  const touchInput = document.createElement('input');
  touchInput.type = 'checkbox';
  
  const touchSlider = document.createElement('span');
  touchSlider.className = 'toggle-slider';
  
  touchSwitch.appendChild(touchInput);
  touchSwitch.appendChild(touchSlider);
  
  touchToggleContainer.appendChild(touchLabel);
  touchToggleContainer.appendChild(touchSwitch);
  
  controls.appendChild(touchToggleContainer);

  // Touch toggle event handler
  touchInput.addEventListener('change', () => {
    const enabled = touchInput.checked;
    localStorage.setItem(touchModeKey, enabled);
    applyTouchMode(enabled);
  });

  overlay.appendChild(controls);

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

  // Add Settings section
  const settingsKey = `viewportOverlaySettings_${domainKey}`;
  
  const settingsHeader = document.createElement('div');
  settingsHeader.className = 'settings-header';
  
  const settingsTitle = document.createElement('div');
  settingsTitle.className = 'settings-toggle';
  settingsTitle.textContent = '⚙️ Settings';
  
  const settingsToggle = document.createElement('span');
  settingsToggle.textContent = '▼';
  settingsToggle.style.fontSize = '10px';
  
  settingsHeader.appendChild(settingsTitle);
  settingsHeader.appendChild(settingsToggle);
  overlay.appendChild(settingsHeader);
  
  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'settings-container';
  overlay.appendChild(settingsContainer);
  
  // Toggle settings visibility
  settingsHeader.addEventListener('click', () => {
    const expanded = settingsContainer.classList.toggle('expanded');
    settingsToggle.textContent = expanded ? '▲' : '▼';
    
    // Create settings UI if expanded for the first time
    if (expanded && !settingsContainer.hasChildNodes()) {
      createSettingsUI();
    }
  });
  
  function createSettingsUI() {
    const deviceConfigs = document.createElement('div');
    deviceConfigs.style.display = 'flex';
    deviceConfigs.style.flexDirection = 'column';
    deviceConfigs.style.gap = '6px';
    
    // Load saved device presets or use defaults
    const savedDevices = JSON.parse(localStorage.getItem(settingsKey) || 'null') || devices;
    
    // Create inputs for each device preset
    savedDevices.forEach((device, index) => {
      const deviceRow = document.createElement('div');
      deviceRow.className = 'device-preset';
      
      const widthInput = document.createElement('input');
      widthInput.type = 'number';
      widthInput.min = '100';
      widthInput.value = device.w;
      widthInput.placeholder = 'Width';
      
      const separator = document.createElement('span');
      separator.textContent = '×';
      
      const heightInput = document.createElement('input');
      heightInput.type = 'number';
      heightInput.min = '100';
      heightInput.value = device.h;
      heightInput.placeholder = 'Height';
      
      deviceRow.appendChild(widthInput);
      deviceRow.appendChild(separator);
      deviceRow.appendChild(heightInput);
      
      deviceConfigs.appendChild(deviceRow);
    });
    
    // Add actions
    const actionsRow = document.createElement('div');
    actionsRow.className = 'settings-actions';
    
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save Presets';
    saveButton.title = 'Save viewport presets';
    saveButton.addEventListener('click', saveDevicePresets);
    
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset Defaults';
    resetButton.title = 'Reset to default viewport sizes';
    resetButton.addEventListener('click', resetDevicePresets);
    
    actionsRow.appendChild(resetButton);
    actionsRow.appendChild(saveButton);
    
    settingsContainer.appendChild(deviceConfigs);
    settingsContainer.appendChild(actionsRow);
  }
  
  function saveDevicePresets() {
    const presetRows = settingsContainer.querySelectorAll('.device-preset');
    const newDevices = Array.from(presetRows).map(row => {
      const inputs = row.querySelectorAll('input');
      return {
        w: parseInt(inputs[0].value, 10) || 320,
        h: parseInt(inputs[1].value, 10) || 568
      };
    });
    
    // Save to localStorage
    localStorage.setItem(settingsKey, JSON.stringify(newDevices));
    
    // Update device buttons
    updateDeviceButtons(newDevices);
    
    // Show confirmation
    const saveButton = settingsContainer.querySelector('.settings-actions button:last-child');
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Saved!';
    setTimeout(() => {
      saveButton.textContent = originalText;
    }, 1500);
  }
  
  function resetDevicePresets() {
    if (confirm('Reset all viewport presets to default values?')) {
      localStorage.removeItem(settingsKey);
      settingsContainer.innerHTML = '';
      createSettingsUI();
      updateDeviceButtons(devices);
    }
  }
  
  function updateDeviceButtons(newDevices) {
    // Clear existing device buttons
    controls.querySelectorAll('button').forEach(button => {
      if (button.textContent.includes('×')) {
        button.remove();
      }
    });
    
    // Create new device buttons at the start
    newDevices.reverse().forEach(d => {
      const newBtn = btn(`${d.w}×${d.h}`, `Open new window at ${d.w}x${d.h}`, () => {
        window.open(location.href, '_blank', `width=${d.w},height=${d.h},resizable=yes`);
      });
      controls.insertBefore(newBtn, controls.firstChild);
    });
  }

  // Initialize with saved devices if available
  const savedDevices = JSON.parse(localStorage.getItem(settingsKey) || 'null');
  if (savedDevices) {
    updateDeviceButtons(savedDevices);
  }
  
  // Existing collapse toggle event handler
  collapseToggle.addEventListener('click', () => {
    const collapsed = overlay.classList.toggle('collapsed');
    controls.style.display = collapsed ? 'none' : 'flex';
    customWrapper.style.display = collapsed ? 'none' : 'flex';
    collapseToggle.textContent = collapsed ? '+' : '—';
    localStorage.setItem(collapsedKey, collapsed);
  });

  function applyTouchMode(enabled) {
    document.documentElement.style.scrollbarWidth = enabled ? 'none' : '';
    document.documentElement.style.msOverflowStyle = enabled ? 'none' : '';
    const customStyleId = 'tm-touch-scroll-style';
    let styleEl = document.getElementById(customStyleId);
    if (enabled) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = customStyleId;
        styleEl.textContent = `
          ::-webkit-scrollbar { width: 0px; height: 0px; }
          html, body {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
        `;
        document.head.appendChild(styleEl);
      }
    } else {
      if (styleEl) styleEl.remove();
    }
  }

  const savedTouch = localStorage.getItem(touchModeKey) === 'true';
  touchInput.checked = savedTouch;
  applyTouchMode(savedTouch);

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
