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

  // Check if we're in the top-level document
  if (window.self !== window.top) {
    return; // Exit if we're in a frame
  }

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
  const style = document.createElement('style');
  const styleContent = `
    * {
      all: initial;
      box-sizing: border-box;
      font-family: Consolas, Monaco, "Courier New", monospace !important;
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
    #overlay.collapsed .settings-header {
      margin-top: 0;
      border-top: none;
      padding-top: 0;
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
  
  // Log information about the overlay container to the console
  console.log(
    `%c Responsive Viewport Overlay %c v${SCRIPT_VERSION} %c loaded`,
    'background: #800000; color: white; padding: 2px 4px; border-radius: 3px 0 0 3px;',
    'background: #333; color: white; padding: 2px 4px;',
    'background: #4CAF50; color: white; padding: 2px 4px; border-radius: 0 3px 3px 0;'
  );
  console.log(`Toggle shortcut: ${TOGGLE_KEY}`);
  console.log(`Host domain: ${domainKey}`);
  console.log('Container node:', overlay);

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
    { w: 320, h: 568 }, // Mobile S
    { w: 375, h: 667 }, // Mobile M
    { w: 425, h: 896 }, // Mobile L
    { w: 768, h: 576 }, // Tablet
    { w: 1024, h: 768 }, // Laptop
    { w: 1440, h: 1366 }, // Laptop L
    { w: 2560, h: 900 } // 4K
  ];

  devices.forEach(d => {
    const label = d.h ? `${d.w}×${d.h}` : `${d.w}px`;
    const title = d.h ? 
      `Open new window at ${d.w}x${d.h}` : 
      `Open new window with width ${d.w}px`;
      
    controls.appendChild(
      btn(label, title, () => {
        let windowFeatures = `width=${d.w},resizable=yes`;
        if (d.h) {
          windowFeatures += `,height=${d.h}`;
        }
        window.open(location.href, '_blank', windowFeatures);
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
  widthInput.placeholder = 'Width (required)';
  widthInput.required = true;

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = 100;
  heightInput.placeholder = 'Height (optional)';

  const applyBtn = btn('Set', 'Open new window with custom size', () => {
    const w = parseInt(widthInput.value);
    const h = parseInt(heightInput.value);
    
    if (!isNaN(w)) {
      let windowFeatures = `width=${w},resizable=yes`;
      // Only add height if it's provided and valid
      if (!isNaN(h)) {
        windowFeatures += `,height=${h}`;
      }
      window.open(location.href, '_blank', windowFeatures);
    } else {
      alert('Please enter a valid width');
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
      widthInput.required = true;
      
      const separator = document.createElement('span');
      separator.textContent = '×';
      
      const heightInput = document.createElement('input');
      heightInput.type = 'number';
      heightInput.min = '100';
      heightInput.value = device.h || ''; // Use empty string if height is not defined
      heightInput.placeholder = 'Optional';
      
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
    
    // Add import/export buttons row
    const importExportRow = document.createElement('div');
    importExportRow.className = 'settings-actions';
    importExportRow.style.justifyContent = 'space-between';
    importExportRow.style.marginTop = '12px';
    importExportRow.style.borderTop = '1px solid rgba(255, 255, 255, 0.2)';
    importExportRow.style.paddingTop = '8px';
    
    const exportButton = document.createElement('button');
    exportButton.textContent = '📤 Export';
    exportButton.title = 'Export settings to a file';
    exportButton.addEventListener('click', exportSettings);
    
    const importButton = document.createElement('button');
    importButton.textContent = '📥 Import';
    importButton.title = 'Import settings from a file';
    importButton.addEventListener('click', importSettings);
    
    // Hidden file input for import
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,.vpsettings';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', handleFileImport);
    shadow.appendChild(fileInput);
    
    importExportRow.appendChild(importButton);
    importExportRow.appendChild(exportButton);
    
    actionsRow.appendChild(resetButton);
    actionsRow.appendChild(saveButton);
    
    settingsContainer.appendChild(deviceConfigs);
    settingsContainer.appendChild(actionsRow);
    settingsContainer.appendChild(importExportRow);
  }
  
  function exportSettings() {
    try {
      // Get device settings
      const presetRows = settingsContainer.querySelectorAll('.device-preset');
      const deviceSettings = Array.from(presetRows).map(row => {
        const inputs = row.querySelectorAll('input');
        return {
          w: parseInt(inputs[0].value, 10) || 320,
          h: parseInt(inputs[1].value, 10) || 568
        };
      });
      
      // Create settings payload with version and metadata for future compatibility
      const exportData = {
        version: SCRIPT_VERSION,
        exportDate: new Date().toISOString(),
        type: 'viewport-overlay-settings',
        settings: {
          devices: deviceSettings,
          // Can add more settings categories here in future versions
        }
      };
      
      // Convert to JSON
      const jsonData = JSON.stringify(exportData, null, 2);
      
      // Create downloadable file
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `viewport-settings-${domainKey}-${new Date().toISOString().slice(0,10)}.vpsettings`;
      
      // Trigger download
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Clean up
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
      // Show success feedback
      const exportBtn = settingsContainer.querySelector('button[title="Export settings to a file"]');
      const originalText = exportBtn.textContent;
      exportBtn.textContent = '✓ Exported!';
      setTimeout(() => {
        exportBtn.textContent = originalText;
      }, 1500);
      
    } catch(e) {
      alert(`Export failed: ${e.message}`);
      console.error('Settings export failed:', e);
    }
  }
  
  function importSettings() {
    // Trigger file input click
    const fileInput = shadow.querySelector('input[type="file"]');
    fileInput.click();
  }
  
  function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        // Parse the imported file
        const importedData = JSON.parse(event.target.result);
        
        // Validate the data structure
        if (!importedData.type || importedData.type !== 'viewport-overlay-settings') {
          throw new Error('Invalid settings file format');
        }
        
        // Handle device settings
        if (importedData.settings && importedData.settings.devices && 
            Array.isArray(importedData.settings.devices)) {
            
          // Update the localStorage
          localStorage.setItem(settingsKey, JSON.stringify(importedData.settings.devices));
          
          // Rebuild the settings UI
          settingsContainer.innerHTML = '';
          createSettingsUI();
          
          // Update the device buttons
          updateDeviceButtons(importedData.settings.devices);
          
          // Show success feedback
          const importBtn = settingsContainer.querySelector('button[title="Import settings from a file"]');
          const originalText = importBtn.textContent;
          importBtn.textContent = '✓ Imported!';
          setTimeout(() => {
            importBtn.textContent = originalText;
          }, 1500);
        } else {
          throw new Error('No valid device settings found');
        }
        
      } catch(e) {
        alert(`Import failed: ${e.message}`);
        console.error('Settings import failed:', e);
      }
      
      // Reset the file input
      e.target.value = '';
    };
    
    reader.onerror = function() {
      alert('Error reading file');
      console.error('File read error');
    };
    
    reader.readAsText(file);
  }

  function saveDevicePresets() {
    const presetRows = settingsContainer.querySelectorAll('.device-preset');
    const newDevices = Array.from(presetRows).map(row => {
      const inputs = row.querySelectorAll('input');
      const width = parseInt(inputs[0].value, 10) || 320;
      const height = parseInt(inputs[1].value, 10) || 0;
      
      // Only include height if it's a valid number greater than 0
      return height > 0 ? 
        { w: width, h: height } : 
        { w: width };
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
  
  function updateDeviceButtons(newDevices) {
    // Clear existing device buttons
    controls.querySelectorAll('button').forEach(button => {
      if (button.textContent.includes('×') || button.textContent.includes('px')) {
        button.remove();
      }
    });
    
    // Create new device buttons at the start
    newDevices.slice().reverse().forEach(d => {
      const label = d.h ? `${d.w}×${d.h}` : `${d.w}px`;
      const title = d.h ? 
        `Open new window at ${d.w}x${d.h}` : 
        `Open new window with width ${d.w}px`;
        
      const newBtn = btn(label, title, () => {
        let windowFeatures = `width=${d.w},resizable=yes`;
        if (d.h) {
          windowFeatures += `,height=${d.h}`;
        }
        window.open(location.href, '_blank', windowFeatures);
      });
      controls.insertBefore(newBtn, controls.firstChild);
    });
  }
  
  function resetDevicePresets() {
    if (confirm('Reset all viewport presets to default values?')) {
      localStorage.removeItem(settingsKey);
      settingsContainer.innerHTML = '';
      createSettingsUI();
      updateDeviceButtons(devices);
    }
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
    // Don't hide the settings section
    settingsHeader.style.display = 'flex';  // Keep settings header visible
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
    // Don't hide the settings section
    settingsHeader.style.display = 'flex';  // Keep settings header visible
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
