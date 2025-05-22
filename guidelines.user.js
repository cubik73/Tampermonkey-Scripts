// ==UserScript==
// @name         Webpage Guidelines
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add moveable horizontal and vertical guide lines to webpages
// @author       Rob Wood
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=robertwood.me
// @homepage     https://github.com/cubik73/Tampermonkey-Scripts/
// @supportURL   https://github.com/cubik73/Tampermonkey-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/cubik73/Tampermonkey-Scripts/main/guidelines.user.js
// @downloadURL  https://raw.githubusercontent.com/cubik73/Tampermonkey-Scripts/main/guidelines.user.js
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Create container for Shadow DOM
    const container = document.createElement('div');
    container.id = 'guidelines-container';
    document.body.appendChild(container);

    // Create shadow DOM
    const shadow = container.attachShadow({ mode: 'closed' });

    // Add CSS for guidelines and controls
    const styles = document.createElement('style');
    styles.textContent = `
        .guideline-controls {
            position: fixed;
            top: 10px;
            right: 10px;
            background: white;
            border: 1px solid #ccc;
            padding: 10px;
            z-index: 2147483645; /* Very high z-index */
            box-shadow: 0 0 5px rgba(0,0,0,0.3);
            font-family: Arial, sans-serif;
            font-size: 14px;
        }
        .guideline-controls button {
            padding: 5px;
            margin: 2px;
            cursor: pointer;
        }
        .storage-controls {
            margin-top: 10px;
            padding-top: 5px;
            border-top: 1px solid #ddd;
        }
        .storage-controls select {
            width: 100%;
            margin-bottom: 5px;
        }
        ::host {
            all: initial;
        }
    `;
    shadow.appendChild(styles);

    // Create global styles for guidelines (these need to be in the main document)
    const globalStyles = document.createElement('style');
    globalStyles.textContent = `
        .gl-horizontal-line {
            position: fixed; /* Changed from absolute to fixed for better overlay */
            left: 0;
            right: 0;
            height: 0;
            border-top: 2px dashed green;
            cursor: ns-resize;
            z-index: 2147483644; /* Extremely high z-index to overlay almost everything */
            pointer-events: auto;
            margin: 0;
            padding: 0;
        }
        .gl-vertical-line {
            position: fixed; /* Changed from absolute to fixed for better overlay */
            top: 0;
            bottom: 0;
            width: 0;
            border-left: 2px dashed green;
            cursor: ew-resize;
            z-index: 2147483644; /* Extremely high z-index to overlay almost everything */
            pointer-events: auto;
            margin: 0;
            padding: 0;
        }
        
        /* Measurement bars along edges */
        .gl-measurement-bar-top {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 24px;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 2147483643;
            pointer-events: auto; /* Enable pointer events for dragging from bar */
            cursor: row-resize;
        }
        
        .gl-measurement-bar-left {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 24px;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 2147483643;
            pointer-events: auto; /* Enable pointer events for dragging from bar */
            cursor: col-resize;
        }
        
        .gl-between-distance {
            position: fixed;
            color: #00ff00;
            font-size: 12px;
            font-family: Arial, sans-serif;
            z-index: 2147483646; /* Highest z-index for measurements */
            pointer-events: none;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: transparent;
            text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
        }
        
        .gl-between-vertical {
            top: 4px;
            transform: translateX(-50%);
        }
        
        .gl-between-horizontal {
            left: 10px; /* Increased from 4px to 10px to move away from edge */
            transform: translateY(-50%) rotate(-90deg);
            transform-origin: left center;
        }
        
        /* Preview line styles for drag operation */
        .gl-preview-line {
            position: fixed;
            background-color: rgba(0, 255, 0, 0.5);
            z-index: 2147483642;
            pointer-events: none;
        }
        
        .gl-preview-horizontal {
            left: 0;
            right: 0;
            height: 2px;
        }
        
        .gl-preview-vertical {
            top: 0;
            bottom: 0;
            width: 2px;
        }
    `;
    document.head.appendChild(globalStyles);

    // Create the measurement bars
    const topBar = document.createElement('div');
    topBar.className = 'gl-measurement-bar-top';
    document.body.appendChild(topBar);
    
    const leftBar = document.createElement('div');
    leftBar.className = 'gl-measurement-bar-left';
    document.body.appendChild(leftBar);

    // Create control panel
    const controlPanel = document.createElement('div');
    controlPanel.className = 'guideline-controls';
    controlPanel.innerHTML = `
        <div>
            <button id="add-horizontal">Add Horizontal Line</button>
            <button id="add-vertical">Add Vertical Line</button>
        </div>
        <div style="margin-top: 5px;">
            <button id="clear-lines">Clear All Lines</button>
        </div>
        <div class="storage-controls">
            <select id="storage-scope">
                <option value="page">This Page</option>
                <option value="site">Entire Site</option>
                <option value="global">Global</option>
            </select>
            <button id="save-guidelines">Save Guidelines</button>
            <button id="load-guidelines">Load Guidelines</button>
            <button id="delete-guidelines">Delete Saved</button>
        </div>
    `;
    shadow.appendChild(controlPanel);

    // Track all guidelines
    const guidelines = {
        horizontal: [],
        vertical: []
    };

    // Store between-measurements
    const measurements = {
        horizontal: [],
        vertical: []
    };

    // Variables for drag operations from bars
    let isDragging = false;
    let dragType = null;
    let previewLine = null;

    // Storage keys
    const STORAGE_KEYS = {
        global: 'guidelines_global',
        site: `guidelines_site_${window.location.hostname}`,
        page: `guidelines_page_${window.location.hostname}${window.location.pathname}`
    };

    // Add horizontal line - modified to work with fixed positioning
    function addHorizontalLine(yPosition = 100) {
        const line = document.createElement('div');
        line.className = 'gl-horizontal-line';
        line.style.top = yPosition + 'px';
        document.body.appendChild(line);
        
        makeDraggable(line, 'horizontal');
        guidelines.horizontal.push({line, position: yPosition});
        
        // Update measurement between lines
        updateHorizontalMeasurements();
    }

    // Add vertical line - modified to work with fixed positioning
    function addVerticalLine(xPosition = 100) {
        const line = document.createElement('div');
        line.className = 'gl-vertical-line';
        line.style.left = xPosition + 'px';
        document.body.appendChild(line);
        
        makeDraggable(line, 'vertical');
        guidelines.vertical.push({line, position: xPosition});
        
        // Update measurement between lines
        updateVerticalMeasurements();
    }

    // Create/update measurements between horizontal lines
    function updateHorizontalMeasurements() {
        // Clear existing measurements
        measurements.horizontal.forEach(m => document.body.removeChild(m));
        measurements.horizontal = [];

        // Sort horizontal guidelines by position
        const sorted = [...guidelines.horizontal].sort((a, b) => {
            return parseInt(a.line.style.top) - parseInt(b.line.style.top);
        });

        // Add measurement for space between top of page and first line
        if (sorted.length > 0) {
            const firstPos = parseInt(sorted[0].line.style.top);
            if (firstPos > 0) {
                createHorizontalMeasurement(0, firstPos, firstPos);
            }

            // Add measurements between consecutive lines
            for (let i = 0; i < sorted.length - 1; i++) {
                const pos1 = parseInt(sorted[i].line.style.top);
                const pos2 = parseInt(sorted[i + 1].line.style.top);
                const distance = pos2 - pos1;
                
                createHorizontalMeasurement(pos1, pos2, distance);
            }
            
            // Add measurement from last line to bottom of viewport
            const lastPos = parseInt(sorted[sorted.length - 1].line.style.top);
            const distanceToBottom = window.innerHeight - lastPos;
            if (distanceToBottom > 0) {
                createHorizontalMeasurement(lastPos, window.innerHeight, distanceToBottom);
            }
        }
    }

    // Create/update measurements between vertical lines
    function updateVerticalMeasurements() {
        // Clear existing measurements
        measurements.vertical.forEach(m => document.body.removeChild(m));
        measurements.vertical = [];

        // Sort vertical guidelines by position
        const sorted = [...guidelines.vertical].sort((a, b) => {
            return parseInt(a.line.style.left) - parseInt(b.line.style.left);
        });

        // Add measurement for space between left of page and first line
        if (sorted.length > 0) {
            const firstPos = parseInt(sorted[0].line.style.left);
            if (firstPos > 0) {
                createVerticalMeasurement(0, firstPos, firstPos);
            }

            // Add measurements between consecutive lines
            for (let i = 0; i < sorted.length - 1; i++) {
                const pos1 = parseInt(sorted[i].line.style.left);
                const pos2 = parseInt(sorted[i + 1].line.style.left);
                const distance = pos2 - pos1;
                
                createVerticalMeasurement(pos1, pos2, distance);
            }
            
            // Add measurement from last line to right edge of viewport
            const lastPos = parseInt(sorted[sorted.length - 1].line.style.left);
            const distanceToRight = window.innerWidth - lastPos;
            if (distanceToRight > 0) {
                createVerticalMeasurement(lastPos, window.innerWidth, distanceToRight);
            }
        }
    }

    // Create measurement display between horizontal lines
    function createHorizontalMeasurement(y1, y2, distance) {
        const measurement = document.createElement('div');
        measurement.className = 'gl-between-distance gl-between-horizontal';
        measurement.style.top = (y1 + (y2 - y1) / 2) + 'px';
        measurement.textContent = distance + 'px';
        document.body.appendChild(measurement);
        measurements.horizontal.push(measurement);
    }

    // Create measurement display between vertical lines
    function createVerticalMeasurement(x1, x2, distance) {
        const measurement = document.createElement('div');
        measurement.className = 'gl-between-distance gl-between-vertical';
        measurement.style.left = (x1 + (x2 - x1) / 2) + 'px';
        measurement.textContent = distance + 'px';
        document.body.appendChild(measurement);
        measurements.vertical.push(measurement);
    }

    // Make lines draggable
    function makeDraggable(element, type) {
        let startX, startY, startPos;
        
        element.addEventListener('mousedown', startDrag);
        
        function startDrag(e) {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            
            if (type === 'horizontal') {
                startPos = parseInt(element.style.top);
            } else {
                startPos = parseInt(element.style.left);
            }
            
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        }
        
        function drag(e) {
            if (type === 'horizontal') {
                const newPos = startPos + (e.clientY - startY);
                element.style.top = newPos + 'px';
                
                // Update the line's position in the guidelines array
                const guidelineObj = guidelines.horizontal.find(g => g.line === element);
                if (guidelineObj) {
                    guidelineObj.position = newPos;
                }
                
                // Update between-line measurements
                updateHorizontalMeasurements();
            } else {
                const newPos = startPos + (e.clientX - startX);
                element.style.left = newPos + 'px';
                
                // Update the line's position in the guidelines array
                const guidelineObj = guidelines.vertical.find(g => g.line === element);
                if (guidelineObj) {
                    guidelineObj.position = newPos;
                }
                
                // Update between-line measurements
                updateVerticalMeasurements();
            }
        }
        
        function stopDrag() {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
        }
    }

    // Clear all guidelines
    function clearAllLines() {
        guidelines.horizontal.forEach(item => {
            document.body.removeChild(item.line);
        });
        guidelines.vertical.forEach(item => {
            document.body.removeChild(item.line);
        });
        guidelines.horizontal = [];
        guidelines.vertical = [];
        
        // Clear all measurements
        measurements.horizontal.forEach(m => document.body.removeChild(m));
        measurements.vertical.forEach(m => document.body.removeChild(m));
        measurements.horizontal = [];
        measurements.vertical = [];
    }

    // Setup drag functionality from measurement bars
    function setupBarDragHandlers() {
        // Top bar - for horizontal lines
        topBar.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            dragType = 'horizontal';
            
            // Create a preview line
            previewLine = document.createElement('div');
            previewLine.className = 'gl-preview-line gl-preview-horizontal';
            previewLine.style.top = e.clientY + 'px';
            document.body.appendChild(previewLine);
            
            document.addEventListener('mousemove', handleBarDragMove);
            document.addEventListener('mouseup', handleBarDragEnd);
        });
        
        // Left bar - for vertical lines
        leftBar.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            dragType = 'vertical';
            
            // Create a preview line
            previewLine = document.createElement('div');
            previewLine.className = 'gl-preview-line gl-preview-vertical';
            previewLine.style.left = e.clientX + 'px';
            document.body.appendChild(previewLine);
            
            document.addEventListener('mousemove', handleBarDragMove);
            document.addEventListener('mouseup', handleBarDragEnd);
        });
    }
    
    // Handle mouse move during dragging from bar
    function handleBarDragMove(e) {
        if (!isDragging || !previewLine) return;
        
        if (dragType === 'horizontal') {
            previewLine.style.top = e.clientY + 'px';
        } else {
            previewLine.style.left = e.clientX + 'px';
        }
    }
    
    // Handle mouse up after dragging from bar
    function handleBarDragEnd(e) {
        if (!isDragging || !previewLine) return;
        
        if (dragType === 'horizontal') {
            addHorizontalLine(e.clientY);
        } else {
            addVerticalLine(e.clientX);
        }
        
        // Clean up
        document.body.removeChild(previewLine);
        previewLine = null;
        isDragging = false;
        dragType = null;
        
        document.removeEventListener('mousemove', handleBarDragMove);
        document.removeEventListener('mouseup', handleBarDragEnd);
    }

    // Serialize guidelines for storage
    function serializeGuidelines() {
        const horizontalPositions = guidelines.horizontal.map(item => parseInt(item.line.style.top));
        const verticalPositions = guidelines.vertical.map(item => parseInt(item.line.style.left));
        
        return {
            horizontal: horizontalPositions,
            vertical: verticalPositions,
            timestamp: Date.now()
        };
    }
    
    // Save guidelines to storage
    function saveGuidelines() {
        const storageScope = shadow.getElementById('storage-scope').value;
        const key = STORAGE_KEYS[storageScope];
        const data = serializeGuidelines();
        
        try {
            localStorage.setItem(key, JSON.stringify(data));
            alert(`Guidelines saved for ${storageScope} scope`);
        } catch (e) {
            alert('Failed to save guidelines: ' + e.message);
        }
    }
    
    // Load guidelines from storage
    function loadGuidelines() {
        const storageScope = shadow.getElementById('storage-scope').value;
        const key = STORAGE_KEYS[storageScope];
        
        try {
            const savedData = localStorage.getItem(key);
            if (!savedData) {
                alert(`No saved guidelines found for ${storageScope} scope`);
                return;
            }
            
            const data = JSON.parse(savedData);
            
            // Clear existing guidelines
            clearAllLines();
            
            // Load horizontal lines
            if (data.horizontal && Array.isArray(data.horizontal)) {
                data.horizontal.forEach(pos => {
                    addHorizontalLine(pos);
                });
            }
            
            // Load vertical lines
            if (data.vertical && Array.isArray(data.vertical)) {
                data.vertical.forEach(pos => {
                    addVerticalLine(pos);
                });
            }
            
            alert(`Guidelines loaded from ${storageScope} scope`);
        } catch (e) {
            alert('Failed to load guidelines: ' + e.message);
        }
    }
    
    // Delete saved guidelines
    function deleteSavedGuidelines() {
        const storageScope = shadow.getElementById('storage-scope').value;
        const key = STORAGE_KEYS[storageScope];
        
        try {
            localStorage.removeItem(key);
            alert(`Saved guidelines deleted for ${storageScope} scope`);
        } catch (e) {
            alert('Failed to delete guidelines: ' + e.message);
        }
    }
    
    // Auto-load guidelines based on availability and priority
    function autoLoadGuidelines() {
        // Try to load in order: page specific, site-wide, global
        const pageData = localStorage.getItem(STORAGE_KEYS.page);
        const siteData = localStorage.getItem(STORAGE_KEYS.site);
        const globalData = localStorage.getItem(STORAGE_KEYS.global);
        
        let dataToLoad = null;
        let sourceScope = '';
        
        if (pageData) {
            dataToLoad = pageData;
            sourceScope = 'page';
        } else if (siteData) {
            dataToLoad = siteData;
            sourceScope = 'site';
        } else if (globalData) {
            dataToLoad = globalData;
            sourceScope = 'global';
        }
        
        if (dataToLoad) {
            try {
                const data = JSON.parse(dataToLoad);
                
                // Load horizontal lines
                if (data.horizontal && Array.isArray(data.horizontal)) {
                    data.horizontal.forEach(pos => {
                        addHorizontalLine(pos);
                    });
                }
                
                // Load vertical lines
                if (data.vertical && Array.isArray(data.vertical)) {
                    data.vertical.forEach(pos => {
                        addVerticalLine(pos);
                    });
                }
                
                console.log(`Guidelines auto-loaded from ${sourceScope} scope`);
            } catch (e) {
                console.error('Failed to auto-load guidelines:', e);
            }
        }
    }

    // Initialize drag from bar functionality
    setupBarDragHandlers();

    // Add event listeners for control panel
    const addHorizontalBtn = shadow.getElementById('add-horizontal');
    const addVerticalBtn = shadow.getElementById('add-vertical');
    const clearLinesBtn = shadow.getElementById('clear-lines');
    const saveGuidelinesBtn = shadow.getElementById('save-guidelines');
    const loadGuidelinesBtn = shadow.getElementById('load-guidelines');
    const deleteGuidelinesBtn = shadow.getElementById('delete-guidelines');
    
    addHorizontalBtn.addEventListener('click', () => {
        addHorizontalLine(Math.floor(window.innerHeight / 2));
    });
    
    addVerticalBtn.addEventListener('click', () => {
        addVerticalLine(Math.floor(window.innerWidth / 2));
    });
    
    clearLinesBtn.addEventListener('click', clearAllLines);
    saveGuidelinesBtn.addEventListener('click', saveGuidelines);
    loadGuidelinesBtn.addEventListener('click', loadGuidelines);
    deleteGuidelinesBtn.addEventListener('click', deleteSavedGuidelines);
    
    // Auto-load any saved guidelines when the script initializes
    autoLoadGuidelines();
})();