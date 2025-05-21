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
            z-index: 10000;
            box-shadow: 0 0 5px rgba(0,0,0,0.3);
            font-family: Arial, sans-serif;
            font-size: 14px;
        }
        .guideline-controls button {
            padding: 5px;
            margin: 2px;
            cursor: pointer;
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
            width: 100%;
            height: 1px;
            border-top: 2px dashed green;
            cursor: ns-resize;
            z-index: 9999;
            pointer-events: auto;
        }
        .gl-vertical-line {
            position: absolute;
            height: 100%;
            width: 1px;
            border-left: 2px dashed green;
            cursor: ew-resize;
            z-index: 9999;
            pointer-events: auto;
        }
        .gl-between-distance {
            position: fixed;
            background: rgba(255,255,255,0.8);
            padding: 2px 5px;
            font-size: 11px;
            font-family: Arial, sans-serif;
            color: #007700;
            z-index: 10001;
            pointer-events: none;
            border: 1px solid rgba(0,120,0,0.3);
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .gl-between-vertical {
            height: 20px;
            transform: translateX(-50%);
            top: 30px;
        }
        .gl-between-horizontal {
            width: 20px;
            transform: translateY(-50%);
            left: 30px;
        }
    `;
    document.head.appendChild(globalStyles);

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

    // Add horizontal line
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

    // Add vertical line
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

    // Add event listeners
    const addHorizontalBtn = shadow.getElementById('add-horizontal');
    const addVerticalBtn = shadow.getElementById('add-vertical');
    const clearLinesBtn = shadow.getElementById('clear-lines');
    
    addHorizontalBtn.addEventListener('click', () => {
        addHorizontalLine(Math.floor(window.innerHeight / 2));
    });
    
    addVerticalBtn.addEventListener('click', () => {
        addVerticalLine(Math.floor(window.innerWidth / 2));
    });
    
    clearLinesBtn.addEventListener('click', clearAllLines);
})();