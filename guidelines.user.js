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
        .guideline-controls.collapsed .controls-content {
            display: none;
        }
        .guideline-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            cursor: move;
        }
        .guideline-title {
            font-weight: bold;
        }
        .collapse-btn {
            width: 24px;
            height: 24px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            font-size: 14px;
            font-weight: bold;
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
            position: absolute;
            left: 0;
            right: 0;
            height: 0;
            border-top: 1px solid green;
            cursor: ns-resize;
            z-index: 2147483644;
            pointer-events: auto;
            margin: 0;
            padding: 0;
        }
        .gl-vertical-line {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 0;
            border-left: 1px solid green;
            cursor: ew-resize;
            z-index: 2147483644;
            pointer-events: auto;
            margin: 0;
            padding: 0;
        }
        
        .gl-measurement-bar-top {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 24px;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 2147483643;
            pointer-events: auto;
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
            pointer-events: auto;
            cursor: col-resize;
        }
        
        .gl-between-distance {
            color: #00ff00;
            font-size: 12px;
            font-family: Arial, sans-serif;
            z-index: 2147483646;
            pointer-events: none;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: transparent;
            text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
        }
        
        /* Horizontal measurements (left side) remain absolute positioned */
        .gl-between-horizontal {
            position: absolute;
            left: 10px;
            transform: translateY(-50%) rotate(-90deg);
            transform-origin: left center;
        }
        
        /* Vertical measurements (top) are now fixed positioned */
        .gl-between-vertical {
            position: fixed; 
            top: 4px;
            transform: translateX(-50%);
        }
        
        /* Preview line styles for drag operation */
        .gl-preview-line {
            position: absolute;
            background-color: rgba(0, 255, 0, 0.5);
            z-index: 2147483644; /* Updated to match the guidelines z-index */
            pointer-events: none;
        }
        
        .gl-preview-horizontal {
            left: 0;
            width: 100%; /* Ensure it spans the full width */
            height: 2px;
        }
        
        .gl-preview-vertical {
            top: 0;
            height: 100%; /* Ensure it spans the full height */
            width: 2px;
        }
        
        .gl-horizontal-line:hover, .gl-vertical-line:hover {
            border-color: #0f0;
            border-width: 1px;
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

    // Control panel HTML structure
    const controlPanel = document.createElement('div');
    controlPanel.className = 'guideline-controls';

    // Create header with title and collapse button
    const header = document.createElement('div');
    header.className = 'guideline-header';

    const title = document.createElement('div');
    title.className = 'guideline-title';
    title.textContent = 'Guidelines';

    const collapseToggle = document.createElement('button');
    collapseToggle.textContent = '—';
    collapseToggle.title = 'Collapse/Expand controls';
    collapseToggle.className = 'collapse-btn';

    header.appendChild(title);
    header.appendChild(collapseToggle);

    // Create a container for all the content that will be hidden when collapsed
    const controlsContent = document.createElement('div');
    controlsContent.className = 'controls-content';

    controlsContent.innerHTML = `
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

    // Assemble the control panel
    controlPanel.appendChild(header);
    controlPanel.appendChild(controlsContent);
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

    // Control panel drag variables
    let isPanelDragging = false;
    let panelStartX, panelStartY, panelStartLeft, panelStartTop;

    // Storage keys
    const STORAGE_KEYS = {
        global: 'guidelines_global',
        site: `guidelines_site_${window.location.hostname}`,
        page: `guidelines_page_${window.location.hostname}${window.location.pathname}`
    };

    // Storage key for collapsed state
    const collapsedKey = `guidelines_collapsed_${window.location.hostname}`;
    const positionKey = `guidelines_position_${window.location.hostname}`;

    // Add horizontal line - modified to include removal handler
    function addHorizontalLine(yPosition = 100) {
        const line = document.createElement('div');
        line.className = 'gl-horizontal-line';
        
        // Account for scroll position when setting the top position
        line.style.top = (yPosition + window.scrollY) + 'px';
        
        // Set width to cover the entire document width
        line.style.width = Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth
        ) + 'px';
        
        document.body.appendChild(line);
        
        makeDraggable(line, 'horizontal');
        addRemovalHandler(line, 'horizontal'); // Add right-click handler
        guidelines.horizontal.push({line, position: yPosition + window.scrollY});
        
        // Update measurement between lines
        updateHorizontalMeasurements();
    }

    // Add vertical line - modified to include removal handler
    function addVerticalLine(xPosition = 100) {
        const line = document.createElement('div');
        line.className = 'gl-vertical-line';
        
        // Account for scroll position when setting the left position
        line.style.left = (xPosition + window.scrollX) + 'px';
        
        // Set height to cover the entire document height
        line.style.height = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
        ) + 'px';
        
        document.body.appendChild(line);
        
        makeDraggable(line, 'vertical');
        addRemovalHandler(line, 'vertical'); // Add right-click handler
        guidelines.vertical.push({line, position: xPosition + window.scrollX});
        
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
            
            // Add measurement from last line to bottom of document
            const lastPos = parseInt(sorted[sorted.length - 1].line.style.top);
            const docHeight = Math.max(
                document.documentElement.scrollHeight, 
                document.body.scrollHeight
            );
            const distanceToBottom = docHeight - lastPos;
            if (distanceToBottom > 0) {
                createHorizontalMeasurement(lastPos, docHeight, distanceToBottom);
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
        
        // For fixed position elements, subtract scrollX to keep aligned with lines
        measurement.style.left = ((x1 + (x2 - x1) / 2) - window.scrollX) + 'px';
        measurement.textContent = distance + 'px';
        document.body.appendChild(measurement);
        measurements.vertical.push(measurement);
    }

    // Make lines draggable
    function makeDraggable(element, type) {
        let startX, startY, startPos, startScrollX, startScrollY;
        
        element.addEventListener('mousedown', startDrag);
        
        function startDrag(e) {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            startScrollX = window.scrollX;
            startScrollY = window.scrollY;
            
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
                // Account for both mouse movement and scroll position changes
                const scrollDiffY = window.scrollY - startScrollY;
                const newPos = startPos + (e.clientY - startY) + scrollDiffY;
                element.style.top = newPos + 'px';
                
                // Update the line's position in the guidelines array
                const guidelineObj = guidelines.horizontal.find(g => g.line === element);
                if (guidelineObj) {
                    guidelineObj.position = newPos;
                }
                
                // Update between-line measurements
                updateHorizontalMeasurements();
            } else {
                // Account for both mouse movement and scroll position changes
                const scrollDiffX = window.scrollX - startScrollX;
                const newPos = startPos + (e.clientX - startX) + scrollDiffX;
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
            
            // Create a preview line with scroll position included
            previewLine = document.createElement('div');
            previewLine.className = 'gl-preview-line gl-preview-horizontal';
            previewLine.style.top = (e.clientY + window.scrollY) + 'px';
            document.body.appendChild(previewLine);
            
            document.addEventListener('mousemove', handleBarDragMove);
            document.addEventListener('mouseup', handleBarDragEnd);
        });
        
        // Left bar - for vertical lines
        leftBar.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            dragType = 'vertical';
            
            // Create a preview line with scroll position included
            previewLine = document.createElement('div');
            previewLine.className = 'gl-preview-line gl-preview-vertical';
            previewLine.style.left = (e.clientX + window.scrollX) + 'px';
            document.body.appendChild(previewLine);
            
            document.addEventListener('mousemove', handleBarDragMove);
            document.addEventListener('mouseup', handleBarDragEnd);
        });
    }
    
    // Handle mouse move during dragging from bar
    function handleBarDragMove(e) {
        if (!isDragging || !previewLine) return;
        
        if (dragType === 'horizontal') {
            // Add scroll position when positioning the preview line
            previewLine.style.top = (e.clientY + window.scrollY) + 'px';
        } else {
            // Add scroll position when positioning the preview line
            previewLine.style.left = (e.clientX + window.scrollX) + 'px';
        }
    }
    
    // Handle mouse up after dragging from bar
    function handleBarDragEnd(e) {
        if (!isDragging || !previewLine) return;
        
        if (dragType === 'horizontal') {
            // When creating a new line from the bar, include scroll position
            addHorizontalLine(e.clientY);
        } else {
            // When creating a new line from the bar, include scroll position
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
                
                // Add this line to ensure dimensions are updated after loading
                setTimeout(updateGuidelineDimensions, 500);
            } catch (e) {
                console.error('Failed to auto-load guidelines:', e);
            }
        }
    }

    // Add a function to update guideline dimensions
    function updateGuidelineDimensions() {
        const docHeight = Math.max(
            document.documentElement.scrollHeight, 
            document.body.scrollHeight
        );
        const docWidth = Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth
        );
        
        // Update heights of all vertical lines
        guidelines.vertical.forEach(item => {
            item.line.style.height = docHeight + 'px';
        });
        
        // Update widths of all horizontal lines
        guidelines.horizontal.forEach(item => {
            item.line.style.width = docWidth + 'px';
        });
        
        // Update measurements
        updateVerticalMeasurements();
        updateHorizontalMeasurements();
    }

    // Listen for events that might change page dimensions
    window.addEventListener('resize', updateGuidelineDimensions);
    window.addEventListener('load', updateGuidelineDimensions);

    // For dynamically loaded content, periodically check dimensions
    const dimensionCheckInterval = setInterval(updateGuidelineDimensions, 2000);

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

    // Add this function to your script
    function addRemovalHandler(line, type) {
        line.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // Prevent the regular context menu
            
            // Remove the line from DOM
            document.body.removeChild(line);
            
            // Remove from guidelines array
            if (type === 'horizontal') {
                guidelines.horizontal = guidelines.horizontal.filter(item => item.line !== line);
                updateHorizontalMeasurements();
            } else {
                guidelines.vertical = guidelines.vertical.filter(item => item.line !== line);
                updateVerticalMeasurements();
            }
        });
    }

    // Update vertical measurement positions during scroll
    window.addEventListener('scroll', function() {
        // Only update fixed position vertical measurements when scrolling horizontally
        if (measurements.vertical.length > 0) {
            // Get current sorted vertical guidelines
            const sorted = [...guidelines.vertical].sort((a, b) => {
                return parseInt(a.line.style.left) - parseInt(b.line.style.left);
            });
            
            if (sorted.length > 0) {
                // Update existing measurements
                measurements.vertical.forEach((measurement, index) => {
                    let x1, x2;
                    
                    // First measurement (left edge to first line)
                    if (index === 0 && parseInt(sorted[0].line.style.left) > 0) {
                        x1 = 0;
                        x2 = parseInt(sorted[0].line.style.left);
                    } 
                    // Between lines measurements
                    else if (index < sorted.length) {
                        x1 = parseInt(sorted[index-1].line.style.left);
                        x2 = parseInt(sorted[index].line.style.left);
                    }
                    // Last measurement (last line to right edge)
                    else {
                        x1 = parseInt(sorted[sorted.length-1].line.style.left);
                        x2 = window.innerWidth + window.scrollX;
                    }
                    
                    // Update position by compensating for horizontal scroll
                    measurement.style.left = ((x1 + (x2 - x1) / 2) - window.scrollX) + 'px';
                });
            }
        }
    });

    // Collapse toggle behavior
    collapseToggle.addEventListener('click', () => {
        const collapsed = controlPanel.classList.toggle('collapsed');
        collapseToggle.textContent = collapsed ? '+' : '—';
        localStorage.setItem(collapsedKey, collapsed);
    });

    // Make the control panel draggable
    header.addEventListener('mousedown', (e) => {
        // Only drag when clicking the header itself, not its children buttons
        if (e.target === header || e.target === title) {
            isPanelDragging = true;
            panelStartX = e.clientX;
            panelStartY = e.clientY;
            panelStartLeft = controlPanel.offsetLeft;
            panelStartTop = controlPanel.offsetTop;
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isPanelDragging) {
            // Calculate new position
            const newLeft = panelStartLeft + (e.clientX - panelStartX);
            const newTop = panelStartTop + (e.clientY - panelStartY);
            
            // Constrain to viewport
            const maxX = window.innerWidth - controlPanel.offsetWidth;
            const maxY = window.innerHeight - controlPanel.offsetHeight;
            
            // Apply constrained position
            controlPanel.style.left = Math.max(0, Math.min(maxX, newLeft)) + 'px';
            controlPanel.style.top = Math.max(0, Math.min(maxY, newTop)) + 'px';
            controlPanel.style.right = 'auto'; // Clear any right positioning
        }
    });

    document.addEventListener('mouseup', () => {
        if (isPanelDragging) {
            isPanelDragging = false;
            // Save position
            savePosition();
        }
    });

    // Save position to localStorage
    function savePosition() {
        localStorage.setItem(positionKey, JSON.stringify({
            left: controlPanel.style.left,
            top: controlPanel.style.top
        }));
    }

    // Restore position from localStorage
    function restorePosition() {
        const saved = JSON.parse(localStorage.getItem(positionKey));
        if (saved) {
            controlPanel.style.left = saved.left;
            controlPanel.style.top = saved.top;
            controlPanel.style.right = 'auto';
        }
    }

    // Restore collapsed state from localStorage
    function restoreCollapsedState() {
        const collapsed = localStorage.getItem(collapsedKey) === 'true';
        if (collapsed) {
            controlPanel.classList.add('collapsed');
            collapseToggle.textContent = '+';
        }
    }

    // Call restore functions when initializing
    window.addEventListener('DOMContentLoaded', () => {
        restorePosition();
        restoreCollapsedState();
    });
})();