// ==UserScript==
// @name         Image Intrinsic vs Displayed Size Highlighter
// @namespace    https://seegreen.uk/tools
// @version      1.6.1
// @description  Highlights <img> elements whose displayed size differs significantly from their intrinsic (natural) size — especially images downloaded much larger than they're shown, which waste bandwidth — and gives well-sized images a green outline. Also labels each <img> with the filename of its currently selected source.
// @author       robert.wood@seegreen.uk
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // Kept in sync with the @version header above (shown in the panel so
    // it's obvious at a glance which build is running on a page).
    const SCRIPT_VERSION = '1.6.1';

    // ---------------------------------------------------------------------
    // Config — tweak these thresholds to taste
    // ---------------------------------------------------------------------
    const CONFIG = {
        // Intrinsic pixels are "wasted" once they exceed displayed pixels
        // (adjusted for devicePixelRatio) by this multiple.
        OVERSIZE_WARN_RATIO: 1.5,   // e.g. downloaded 1.5x more pixels than needed
        OVERSIZE_BAD_RATIO: 3,      // downloaded 3x+ more pixels than needed — flagged hard
        // Displayed size exceeding intrinsic (adjusted for DPR) by this
        // multiple means the image is being upscaled and will look blurry.
        UNDERSIZE_WARN_RATIO: 1.1,
        UNDERSIZE_BAD_RATIO: 1.5,
        // Ignore tiny/hidden images — not worth flagging.
        MIN_DISPLAY_DIMENSION: 8,
        // Re-scan the DOM for new images this often (ms), on top of the
        // MutationObserver (covers lazy-loaded / src-swapped images whose
        // size settles after layout/animation).
        RESCAN_INTERVAL_MS: 2000,
        // Start enabled?
        START_ENABLED: true,
        // Label every <img> with the filename of its currently selected
        // source (img.currentSrc, falling back to img.src for a bare
        // <img> not inside a <picture>), so you can see at a glance which
        // srcset/media candidate the browser picked — or just the
        // filename of a plain <img>.
        SHOW_FILENAME_LABELS: true,
    };

    // Remembers the enabled/disabled state across page loads and across
    // sites (via the toggle, Alt+Shift+Y, or the panel link), using
    // GM_getValue/GM_setValue — which persist globally for this script,
    // not per-page — so toggling it off sticks until you toggle it back
    // on, instead of resetting to enabled on every reload/navigation.
    const STORAGE_KEY_ENABLED = 'isz-enabled';

    const STATE = {
        enabled: GM_getValue(STORAGE_KEY_ENABLED, CONFIG.START_ENABLED),
        processed: new WeakSet(),
        overlays: new WeakMap(), // img -> badge element
        filenameLabels: new WeakMap(), // img -> label element
        results: [], // for the summary panel / console table
    };

    // Only the outline rules touch real page elements (the <img> itself),
    // so only those need to be a page-level stylesheet. Everything else we
    // create (badges, labels, the panel) lives inside a shadow root — see
    // "Shadow DOM host" below — and is styled from within that root, so it
    // can never leak onto the page and page CSS can never leak onto it.
    GM_addStyle(`
        .isz-outline-oversize-warn  { outline: 2px dashed #d9822b !important; outline-offset: -2px; }
        .isz-outline-oversize-bad   { outline: 3px solid  #d9363e !important; outline-offset: -3px; }
        .isz-outline-undersize-warn { outline: 2px dashed #b08d00 !important; outline-offset: -2px; }
        .isz-outline-undersize-bad  { outline: 3px solid  #8a5a00 !important; outline-offset: -3px; }
        /* Well-sized — intrinsic size is a good match for how it's shown.
           Thin and subtle since this is the common case and will end up
           on most images on a well-optimised page. */
        .isz-outline-good           { outline: 1px dashed #2f9e44 !important; outline-offset: -1px; }
    `);

    // ---------------------------------------------------------------------
    // Shadow DOM host — all of our injected UI (badges, picture labels,
    // the summary panel) is rendered inside this closed-off root instead
    // of directly in document.body. That keeps our markup out of the
    // page's DOM/CSSOM (no interference with page selectors like
    // `body > div:last-child`, no inherited page styles bleeding in) and
    // keeps the page's own styles from bleeding into us.
    // ---------------------------------------------------------------------
    const iszHost = document.createElement('div');
    iszHost.id = 'isz-host';
    // Fixed + zero-size so it never affects page layout; children are
    // positioned with `position: fixed` themselves so the host's own
    // size/position doesn't matter (fixed descendants use the viewport
    // as their containing block).
    iszHost.style.cssText = 'position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647;';
    document.documentElement.appendChild(iszHost);
    const iszRoot = iszHost.attachShadow({ mode: 'open' });

    const iszStyle = document.createElement('style');
    iszStyle.textContent = `
        .isz-badge {
            position: fixed;
            font: 11px/1.3 -apple-system, "Segoe UI", Arial, sans-serif;
            padding: 2px 5px;
            border-radius: 3px;
            color: #fff;
            pointer-events: auto;
            cursor: pointer;
            white-space: nowrap;
            box-shadow: 0 1px 3px rgba(0,0,0,.5);
            opacity: 0.92;
        }
        .isz-badge:hover { opacity: 1; }
        .isz-badge.isz-oversize-warn { background: #d9822b; }
        .isz-badge.isz-oversize-bad  { background: #d9363e; }
        .isz-badge.isz-undersize-warn{ background: #b08d00; }
        .isz-badge.isz-undersize-bad { background: #8a5a00; }

        .isz-filename-label {
            position: fixed;
            font: 10px/1.3 -apple-system, "Segoe UI", Arial, sans-serif;
            padding: 1px 4px;
            border-radius: 3px;
            color: #fff;
            background: #2a6fb0;
            pointer-events: auto;
            /* Default cursor — the click only does something while
               Ctrl/Cmd is held (see :host(.isz-mod-active) below), so a
               pointer cursor at rest would falsely promise clickability. */
            cursor: default;
            white-space: nowrap;
            box-shadow: 0 1px 3px rgba(0,0,0,.5);
            opacity: 0.85;
        }
        .isz-filename-label:hover { opacity: 1; }
        /* :host targets the shadow host (iszHost) from inside its own
           shadow tree — toggled by the keydown/keyup/blur listeners below
           whenever Ctrl/Cmd is held, so the cursor previews the click. */
        :host(.isz-mod-active) .isz-filename-label { cursor: pointer; }

        #isz-panel {
            position: fixed;
            bottom: 10px;
            right: 10px;
            background: #1e1e1e;
            color: #eee;
            font: 12px/1.4 -apple-system, "Segoe UI", Arial, sans-serif;
            padding: 8px 10px;
            border-radius: 6px;
            box-shadow: 0 2px 10px rgba(0,0,0,.5);
            max-width: 300px;
        }
        #isz-panel b { color: #fff; }
        #isz-panel .isz-toggle {
            cursor: pointer;
            text-decoration: underline;
            color: #6cb6ff;
        }
        #isz-panel table { border-collapse: collapse; margin-top: 4px; }
        #isz-panel td { padding: 1px 4px; }
    `;
    iszRoot.appendChild(iszStyle);

    function fmtBytes(n) {
        if (!n || n <= 0) return '?';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function getTransferSize(src) {
        try {
            const entries = performance.getEntriesByName(src);
            if (entries.length) {
                const e = entries[entries.length - 1];
                // transferSize is 0 for cross-origin resources without
                // Timing-Allow-Origin, or for cached (memory) hits.
                return e.transferSize || e.encodedBodySize || 0;
            }
        } catch (e) { /* ignore */ }
        return 0;
    }

    // Extracts just the filename (no path, no query string) from a URL,
    // for the filename label. Falls back to the raw string if it can't
    // be parsed as a URL.
    function filenameFromSrc(src) {
        if (!src) return '(no source)';
        try {
            const u = new URL(src, location.href);
            const parts = u.pathname.split('/');
            return parts[parts.length - 1] || u.pathname;
        } catch (e) {
            const clean = src.split('?')[0].split('#')[0];
            const parts = clean.split('/');
            return parts[parts.length - 1] || clean;
        }
    }

    function classify(img) {
        const rect = img.getBoundingClientRect();
        const dispW = rect.width;
        const dispH = rect.height;

        if (dispW < CONFIG.MIN_DISPLAY_DIMENSION || dispH < CONFIG.MIN_DISPLAY_DIMENSION) return null;
        if (!img.naturalWidth || !img.naturalHeight) return null;

        // Lazy-loading libraries commonly swap a tiny placeholder
        // (1x1 tracking pixel, blurred LQIP thumbnail, etc.) into the
        // <img> before the real asset has finished downloading. That
        // placeholder is "complete" and has a real naturalWidth/Height,
        // so without this guard a large hero image would be reported as
        // massively "upscaled/blurry" purely because we measured it
        // against the placeholder instead of the final image. If the
        // natural size is tiny (well under our normal minimum) yet the
        // displayed box is much larger, treat it as not-yet-loaded and
        // skip — a follow-up mutation (src/srcset change) or load event
        // will trigger a rescan once the real image is in place.
        const PLACEHOLDER_MAX_DIMENSION = 32;
        if (
            img.naturalWidth <= PLACEHOLDER_MAX_DIMENSION &&
            img.naturalHeight <= PLACEHOLDER_MAX_DIMENSION &&
            (dispW > PLACEHOLDER_MAX_DIMENSION * 2 || dispH > PLACEHOLDER_MAX_DIMENSION * 2)
        ) return null;

        // Ideal intrinsic size to look crisp on this display. Read
        // devicePixelRatio fresh each time rather than caching it at
        // script load — it changes with browser zoom level and when the
        // window moves to a different-DPR monitor, and a stale value
        // here would silently misclassify images after either happens.
        const dpr = window.devicePixelRatio || 1;
        const idealW = dispW * dpr;
        const idealH = dispH * dpr;

        const overRatio = (img.naturalWidth * img.naturalHeight) / (idealW * idealH);
        const underRatio = (idealW * idealH) / (img.naturalWidth * img.naturalHeight);

        // Neither over- nor under-sized enough to warn about — a good
        // match between intrinsic and (DPR-adjusted) displayed size.
        let kind = 'good';
        let ratio = 1;

        if (overRatio >= CONFIG.OVERSIZE_WARN_RATIO) {
            kind = overRatio >= CONFIG.OVERSIZE_BAD_RATIO ? 'oversize-bad' : 'oversize-warn';
            ratio = overRatio;
        } else if (underRatio >= CONFIG.UNDERSIZE_WARN_RATIO) {
            kind = underRatio >= CONFIG.UNDERSIZE_BAD_RATIO ? 'undersize-bad' : 'undersize-warn';
            ratio = underRatio;
        }

        return {
            kind,
            ratio,
            dispW: Math.round(dispW),
            dispH: Math.round(dispH),
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            idealW: Math.round(idealW),
            idealH: Math.round(idealH),
            dpr,
        };
    }

    function makeBadge(img, info) {
        const badge = document.createElement('div');
        badge.className = 'isz-badge isz-' + info.kind;

        // Show the DPR-adjusted "ideal" size alongside the raw CSS
        // "shown" size — without it, an image with a smaller CSS-pixel
        // display size than its intrinsic size can still be flagged as
        // upscaled/blurry (because devicePixelRatio > 1 means more
        // physical pixels are needed than the CSS number suggests), and
        // that looks contradictory unless the DPR math is visible.
        const label = info.kind.startsWith('oversize')
            ? `${info.naturalW}×${info.naturalH} — shown ${info.dispW}×${info.dispH} @${info.dpr}x = needs ${info.idealW}×${info.idealH} (${info.ratio.toFixed(1)}x too big)`
            : `${info.naturalW}×${info.naturalH} — shown ${info.dispW}×${info.dispH} @${info.dpr}x = needs ${info.idealW}×${info.idealH} (upscaled ${info.ratio.toFixed(1)}x, blurry)`;
        badge.textContent = label;

        badge.title = 'Click to log details to console';
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const bytes = getTransferSize(img.currentSrc || img.src);
            console.log('[ImageSizeHighlighter]', img, {
                ...info,
                src: img.currentSrc || img.src,
                transferSize: bytes ? fmtBytes(bytes) : 'unknown (no ResourceTiming entry / cross-origin)',
            });
        });

        positionBadge(img, badge);
        iszRoot.appendChild(badge);
        return badge;
    }

    // Badges/labels live in the shadow host, which is `position: fixed`
    // at the viewport origin, so they're positioned with plain
    // viewport-relative rect coordinates — no scrollX/scrollY offset
    // needed (the scroll listener below keeps them lined up as the page
    // scrolls, since getBoundingClientRect() changes with it).
    function positionBadge(img, badge) {
        const rect = img.getBoundingClientRect();
        badge.style.left = Math.max(0, rect.left) + 'px';
        badge.style.top = Math.max(0, rect.top) + 'px';
    }

    // Stacks the filename label directly under the size badge (when the
    // img has one) at the top-left of the visible portion of the image —
    // so the two read together as one box: size on top, filename below —
    // instead of the filename floating at the opposite (bottom) corner.
    // If there's no size badge (image isn't flagged), the label sits at
    // the top-left instead. Clamped to the portion of the image actually
    // on-screen so scrolling the image partway off the viewport slides the
    // label along with it instead of pushing it off-screen.
    function positionFilenameLabel(img, label) {
        const rect = img.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const visLeft = Math.max(rect.left, 0);
        const visRight = Math.min(rect.right, vw);
        const visTop = Math.max(rect.top, 0);
        const visBottom = Math.min(rect.bottom, vh);

        if (visRight <= visLeft || visBottom <= visTop) {
            // No part of the image is on-screen — hide rather than show
            // a stray label floating at a clamped edge.
            label.style.display = 'none';
            return;
        }
        label.style.display = '';

        const labelW = label.offsetWidth;
        const labelH = label.offsetHeight;

        const badge = STATE.overlays.get(img);
        const stackTop = badge ? badge.getBoundingClientRect().bottom : visTop;

        let left = Math.min(visLeft, visRight - labelW);
        left = Math.max(left, visLeft, 0);

        let top = Math.max(stackTop, visTop);
        top = Math.min(top, vh - labelH);
        top = Math.max(top, 0);

        label.style.left = left + 'px';
        label.style.top = top + 'px';
    }

    function clearFilenameLabel(img) {
        const label = STATE.filenameLabels.get(img);
        if (label) {
            label.remove();
            STATE.filenameLabels.delete(img);
        }
    }

    // Creates (or updates) the filename label for a single <img> — whether
    // it's a bare <img> or the fallback of a <picture>. The label reflects
    // img.currentSrc — the source the browser actually picked among a
    // <picture>'s <source> candidates — falling back to img.src for a
    // bare <img> (currentSrc is only populated by <picture>/srcset).
    function processImageLabel(img) {
        if (!STATE.enabled || !CONFIG.SHOW_FILENAME_LABELS) return;

        const src = img.currentSrc || img.src;
        if (!src) { clearFilenameLabel(img); return; }

        const filename = filenameFromSrc(src);
        let label = STATE.filenameLabels.get(img);

        if (label && label.dataset.iszSrc === src) {
            // Unchanged — just reposition (layout may have shifted).
            positionFilenameLabel(img, label);
            return;
        }

        if (!label) {
            label = document.createElement('div');
            label.className = 'isz-filename-label';
            label.title = 'Ctrl/Cmd+Click to open image in a new tab';
            label.addEventListener('click', (e) => {
                // Require Ctrl (Windows/Linux) or Cmd (Mac) — the standard
                // browser convention for "open in a new tab" — so a plain
                // click passes through to whatever's underneath (e.g. a
                // link wrapping the image) instead of always hijacking it.
                if (!e.ctrlKey && !e.metaKey) return;
                e.stopPropagation();
                e.preventDefault();
                console.log('[ImageSizeHighlighter] <img> source:', img, { src: label.dataset.iszSrc });
                window.open(label.dataset.iszSrc, '_blank', 'noopener');
            });
            iszRoot.appendChild(label);
            STATE.filenameLabels.set(img, label);
        }

        label.dataset.iszSrc = src;
        label.textContent = filename;
        positionFilenameLabel(img, label);
    }

    function clearImage(img) {
        img.classList.remove(
            'isz-outline-oversize-warn', 'isz-outline-oversize-bad',
            'isz-outline-undersize-warn', 'isz-outline-undersize-bad',
            'isz-outline-good'
        );
        const badge = STATE.overlays.get(img);
        if (badge) {
            badge.remove();
            STATE.overlays.delete(img);
        }
        STATE.lastKey.delete(img);
    }

    // A cache key so we skip touching the DOM for images whose
    // classification hasn't actually changed since the last scan.
    STATE.lastKey = new WeakMap();

    function processImage(img) {
        if (!STATE.enabled) return;

        const info = classify(img);
        const key = info ? `${info.kind}:${info.dispW}x${info.dispH}` : null;

        if (STATE.lastKey.get(img) === key) {
            // Unchanged — nothing to do, avoids needless DOM churn.
            if (info) STATE.results.push({ img, info, src: img.currentSrc || img.src });
            return;
        }

        // clearImage() deletes STATE.lastKey internally, so set the new key
        // AFTER clearing — otherwise it gets wiped right back out and every
        // scan recreates the badge from scratch (tearing down the DOM node
        // that has the click listener, sometimes mid-click).
        clearImage(img);
        STATE.lastKey.set(img, key);
        if (!info) return;

        img.classList.add('isz-outline-' + info.kind);
        // "good" images just get the outline — no badge. A badge on every
        // well-sized image (the common case) would bury the ones that
        // actually need attention.
        if (info.kind !== 'good') {
            const badge = makeBadge(img, info);
            STATE.overlays.set(img, badge);
        }

        STATE.results.push({ img, info, src: img.currentSrc || img.src });
    }

    function scan() {
        if (!STATE.enabled || STATE.scanning) return;
        STATE.scanning = true;

        // Our own DOM writes (badges, labels, the panel) would otherwise
        // be picked up by the MutationObserver below and trigger another
        // scan, causing an infinite loop. Pause it while we write.
        mo.disconnect();
        try {
            STATE.results = [];
            const imgs = document.querySelectorAll('img');
            imgs.forEach((img) => {
                // processImage() (the size badge) runs before
                // processImageLabel() so the filename label — which
                // stacks itself under the badge — can find it already in
                // place. Applies to every <img>, bare or inside a
                // <picture>: a <picture>'s <source> candidates only
                // affect which file the browser loads into that one <img>.
                const run = () => {
                    processImage(img);
                    if (CONFIG.SHOW_FILENAME_LABELS) processImageLabel(img);
                };
                if (img.complete && img.naturalWidth) {
                    run();
                } else {
                    img.addEventListener('load', run, { once: true });
                }
            });

            updatePanel();
        } finally {
            observeMutations();
            STATE.scanning = false;
        }
    }

    let scanTimer = null;
    function requestScan(delay = 150) {
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = setTimeout(scan, delay);
    }

    function repositionAll() {
        if (!STATE.enabled) return;
        document.querySelectorAll('img').forEach((img) => {
            const badge = STATE.overlays.get(img);
            if (badge) positionBadge(img, badge);
        });
        if (CONFIG.SHOW_FILENAME_LABELS) {
            document.querySelectorAll('img').forEach((img) => {
                const label = STATE.filenameLabels.get(img);
                if (label) positionFilenameLabel(img, label);
            });
        }
    }

    function clearAll() {
        document.querySelectorAll('img').forEach(clearImage);
        document.querySelectorAll('img').forEach(clearFilenameLabel);
        STATE.results = [];
        updatePanel();
    }

    function toggle() {
        STATE.enabled = !STATE.enabled;
        GM_setValue(STORAGE_KEY_ENABLED, STATE.enabled);
        if (STATE.enabled) {
            scan();
        } else {
            clearAll();
        }
        updatePanel();
    }

    // ---------------------------------------------------------------------
    // Summary panel
    // ---------------------------------------------------------------------
    let panel;
    function ensurePanel() {
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'isz-panel';
        iszRoot.appendChild(panel);
        return panel;
    }

    function updatePanel() {
        const p = ensurePanel();
        const overCount = STATE.results.filter(r => r.info.kind.startsWith('oversize')).length;
        const underCount = STATE.results.filter(r => r.info.kind.startsWith('undersize')).length;
        const goodCount = STATE.results.filter(r => r.info.kind === 'good').length;
        p.innerHTML = `
            <div><b>Image Size Highlighter</b> <span style="opacity:.6">v${SCRIPT_VERSION}</span> — <span class="isz-toggle" id="isz-toggle-btn">${STATE.enabled ? 'disable' : 'enable'}</span></div>
            ${STATE.enabled ? `
            <div>Oversized (wasted bytes): <b>${overCount}</b></div>
            <div>Undersized (blurry/upscaled): <b>${underCount}</b></div>
            <div>Good (crisp &amp; efficient): <b style="color:#3ddc63">${goodCount}</b></div>
            <div style="margin-top:4px;opacity:.7">Click a badge to log details to console.<br>Ctrl/Cmd+Click a filename to open the image.<br>Alt+Shift+Y toggles this script.</div>
            ` : `<div style="opacity:.7">Highlighting disabled</div>`}
        `;
        const btn = iszRoot.getElementById('isz-toggle-btn');
        if (btn) btn.addEventListener('click', toggle);
    }

    // ---------------------------------------------------------------------
    // Wiring
    // ---------------------------------------------------------------------
    window.addEventListener('load', () => requestScan(0));
    window.addEventListener('resize', () => requestScan(200));
    window.addEventListener('scroll', repositionAll, { passive: true });

    document.addEventListener('keydown', (e) => {
        // Alt+Shift+Y — was Alt+Shift+I, which collides with Chrome's
        // built-in "Send feedback" shortcut.
        if (e.altKey && e.shiftKey && (e.key === 'Y' || e.key === 'y')) {
            toggle();
        }
    });

    // Mirrors the Ctrl/Cmd-Click requirement on the filename label as a
    // live cursor hint: toggles a class on the shadow host so the label's
    // cursor switches to pointer only while the modifier is actually held
    // (see the :host(.isz-mod-active) rule above). Checked on both keydown
    // and keyup — either key can be the one released — and cleared on
    // blur/visibilitychange so a modifier released while the page didn't
    // have focus (e.g. alt-tabbing away) doesn't leave it stuck active.
    function syncModifierCursor(e) {
        iszHost.classList.toggle('isz-mod-active', !!(e && (e.ctrlKey || e.metaKey)));
    }
    document.addEventListener('keydown', syncModifierCursor);
    document.addEventListener('keyup', syncModifierCursor);
    window.addEventListener('blur', () => iszHost.classList.remove('isz-mod-active'));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) iszHost.classList.remove('isz-mod-active');
    });

    // Ignore mutations to nodes we created ourselves. Badges/labels/the
    // panel now live inside the shadow root, and MutationObserver never
    // crosses a shadow boundary, so they never reach this callback at all.
    // The one node of ours that *is* part of the observed (light) DOM is
    // the shadow host itself, added once to <html> — skip that too, so
    // its insertion doesn't trigger a needless scan.
    function isOwnNode(node) {
        return !!(node && node.nodeType === 1 && node.id === 'isz-host');
    }

    const mo = new MutationObserver((mutations) => {
        if (!STATE.enabled) return;
        let dirty = false;
        for (const m of mutations) {
            if (isOwnNode(m.target)) continue;
            if (m.type === 'childList') {
                const added = Array.from(m.addedNodes).filter(n => !isOwnNode(n));
                const removed = Array.from(m.removedNodes).filter(n => !isOwnNode(n));
                if (added.length || removed.length) dirty = true;
            }
            if (m.type === 'attributes' &&
                (m.attributeName === 'src' || m.attributeName === 'srcset' ||
                 m.attributeName === 'media' || m.attributeName === 'sizes')) dirty = true;
        }
        if (dirty) requestScan();
    });

    function observeMutations() {
        mo.observe(document.documentElement, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['src', 'srcset', 'media', 'sizes'],
        });
    }
    observeMutations();

    setInterval(() => { if (STATE.enabled) requestScan(0); }, CONFIG.RESCAN_INTERVAL_MS);

    // Render the panel immediately, regardless of enabled state. scan()
    // (which also calls updatePanel()) bails out early while disabled —
    // without this, a page that loads with the remembered state disabled
    // would never call updatePanel() at all, and the panel (with the only
    // link back to re-enable) would simply never appear.
    updatePanel();

    // Initial run once DOM is ready enough to have <body>.
    if (document.body) {
        requestScan(0);
    } else {
        document.addEventListener('DOMContentLoaded', () => requestScan(0));
    }
})();
