// ==UserScript==
// @name         Chess.com -> Lichess Import
// @namespace    https://github.com/Puhhh/chesscom-to-lichess-import
// @version      2.1.2
// @description  Import the current Chess.com game to Lichess via PGN. Handles Share icon and Analyze -> ... -> Share flows.
// @author       Puhhh
// @match        https://www.chess.com/*
// @match        https://lichess.org/paste*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// ==/UserScript==

(function () {
    'use strict';

    const pendingPgnKey = 'pendingLichessImportPgn';

    if (location.hostname === 'lichess.org') {
        submitPendingPgnOnLichess();
        return;
    }

    // --------------- UI (native menu look, no background) ---------------
    GM_addStyle(`
    .tm-lichess-menu-btn {
    display: grid;
    grid-auto-flow: column;
    grid-template-columns: 24px auto;
    column-gap: 12px;

    align-items: center;
    justify-content: normal;

    height: 40px;
    min-height: 40px;
    max-width: 100%;
    width: 100%;

    padding: 8px;
    box-sizing: border-box;

    border-radius: 5px;
    border: none;

    background: transparent;
    box-shadow: none;

    font-family: -apple-system, BlinkMacSystemFont, system-ui, Helvetica, Arial, sans-serif;
    font-size: 14px;
    font-weight: 600;
    line-height: 16px;

    color: rgba(255, 255, 255, 0.72);
    text-decoration: none;
    text-align: left;
    white-space: nowrap;

    cursor: pointer;
    user-select: none;
    touch-action: manipulation;

    position: relative;
  }

  .tm-lichess-menu-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.92);
  }

  .tm-lichess-menu-btn:disabled {
    opacity: 0.45;
    pointer-events: none;
    cursor: default;
  }

  .tm-lichess-menu-btn:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.6);
    outline-offset: 2px;
  }

  .tm-lichess-icon {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
    line-height: 1;
    color: currentColor;
  }

  .tm-lichess-error {
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 12px;
    color: rgba(255, 100, 100, 0.9);
    padding: 4px 8px;
    display: block;
  }
`);

    // <button> instead of <div> — keyboard accessible, native disabled semantics
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tm-lichess-menu-btn';
    btn.title = 'Import current game to Lichess';
    btn.setAttribute('aria-label', 'Lichess Import');

    const icon = document.createElement('span');
    icon.className = 'tm-lichess-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '♞';

    const labelEl = document.createElement('span');
    labelEl.textContent = 'Lichess Import';

    btn.append(icon, labelEl);

    // ---- show only on /game/* and /analysis/* ----
    function shouldShow() {
        const p = location.pathname || '';
        return p.startsWith('/game/') || p.startsWith('/analysis/');
    }

    function updateButtonVisibility() {
        if (!shouldShow()) {
            if (btn.parentElement) btn.remove();
            return;
        }
        installButtonAboveSearch();
    }

    updateButtonVisibility();
    observeDomForSidebar();
    interceptNavigation();

    btn.addEventListener('click', async () => {
        try {
            setBtn(true, 'Import…');

            const pgn = await getPgnByTwoScenarios();
            await importAndOpen(pgn);

        } catch (e) {
            console.error('[TM Chess->Lichess]', e);
            showError('Импорт не удался: ' + (e?.message || e));
        } finally {
            setBtn(false, 'Lichess Import');
        }
    });

    function setBtn(disabled, label) {
        btn.disabled = disabled;
        btn.setAttribute('aria-busy', disabled ? 'true' : 'false');
        labelEl.textContent = label;
    }

    function showError(message) {
        const existing = btn.parentElement?.querySelector('.tm-lichess-error');
        if (existing) existing.remove();

        const errEl = document.createElement('span');
        errEl.className = 'tm-lichess-error';
        errEl.setAttribute('role', 'alert');
        errEl.textContent = message;
        btn.insertAdjacentElement('afterend', errEl);
        setTimeout(() => errEl.remove(), 6000);
    }

    // ==================== Placement: ABOVE "Поиск" ====================

    function findSearchEntry() {
        return document.querySelector('div[data-interaction="search"].sidebar-desktop-navbar-search')
            || document.querySelector('div[data-interaction="search"]');
    }

    function installButtonAboveSearch() {
        const searchEl = findSearchEntry();
        if (!searchEl) return;

        const parent = searchEl.parentElement;
        if (!parent) return;

        // Skip if already correctly placed
        if (btn.parentElement === parent && btn.nextElementSibling === searchEl) return;

        parent.insertBefore(btn, searchEl);
    }

    // ==================== SPA Navigation ====================

    let debounceTimer = null;
    function debouncedUpdate() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(updateButtonVisibility, 200);
    }

    function observeDomForSidebar() {
        const mo = new MutationObserver(debouncedUpdate);
        mo.observe(document.body, { childList: true, subtree: true });
    }

    function interceptNavigation() {
        if (history.__tmLichessImportPatched) return;
        Object.defineProperty(history, '__tmLichessImportPatched', {
            value: true,
            configurable: false
        });

        window.addEventListener('popstate', updateButtonVisibility);

        const origPush = history.pushState.bind(history);
        const origReplace = history.replaceState.bind(history);
        history.pushState = function (...args) { origPush(...args); updateButtonVisibility(); };
        history.replaceState = function (...args) { origReplace(...args); updateButtonVisibility(); };
    }

    // ==================== Two scenarios ====================

    async function getPgnByTwoScenarios() {
        const openDialog = findShareDialog();
        if (openDialog) return await readPgnFromShareDialog(openDialog);

        const shareIconDialog = await openShareDialogFromSidebarIcon();
        if (shareIconDialog) return await readPgnFromShareDialog(shareIconDialog);

        const analysisDialog = await openShareDialogFromAnalysis();
        if (analysisDialog) return await readPgnFromShareDialog(analysisDialog);

        throw new Error('Не нашёл ни кнопку «Поделиться», ни «Анализ» на этой странице.');
    }

    async function openShareDialogFromSidebarIcon() {
        const shareIcon = document.querySelector('button[data-cy="sidebar-share-icon"]');
        if (!shareIcon || !isVisible(shareIcon)) return null;

        const existingDialog = findShareDialog();
        clickElement(shareIcon);

        const dialog = await waitFor(() => {
            const d = findShareDialog();
            return (d && d !== existingDialog) ? d : null;
        }, 3000, 60);
        if (!dialog) throw new Error('Окно «Поделиться» не открылось после кнопки Поделиться.');

        return dialog;
    }

    async function openShareDialogFromAnalysis() {
        const analyzeBtn = document.querySelector('button[data-cy="sidebar-header-end-button"]');
        if (analyzeBtn && isVisible(analyzeBtn)) {
            clickElement(analyzeBtn);
        }

        const moreBtn = await waitFor(
            () => visibleElement('button[data-cy="analysis-secondary-controls-more-button"]'),
            analyzeBtn ? 6000 : 1500,
            80
        );
        if (!moreBtn) return null;

        await sleep(50);
        clickElement(moreBtn);

        const shareItem = await waitFor(() => findShareMenuItem(), 2500, 60);
        if (!shareItem) throw new Error('Не нашёл пункт «Поделиться партией» в меню после "…".');
        clickElement(shareItem);

        const dialog = await waitFor(() => findShareDialog(), 5000, 60);
        if (!dialog) throw new Error('Окно «Поделиться» не открылось из меню анализа.');

        return dialog;
    }

    // ==================== Share dialog helpers ====================

    function findShareDialog() {
        const candidates = Array.from(document.querySelectorAll([
            '[role="dialog"]',
            '[aria-modal="true"]',
            '[data-cy*="modal"]',
            '[data-cy*="dialog"]',
            '[class*="modal"]',
            '[class*="dialog"]'
        ].join(','))).filter(isVisible);

        const byText = candidates.find(isShareDialogCandidate);
        if (byText) return byText;

        const pgnControl = Array.from(document.querySelectorAll('textarea, [role="tab"], button'))
            .find(el => isVisible(el) && isPgnControl(el));
        if (!pgnControl) return null;

        return closestVisibleContainer(pgnControl, candidates) || closestShareContainerFromPgnControl(pgnControl);
    }

    function isShareDialogCandidate(el) {
        const text = (el.textContent || '').toLowerCase();
        const hasShareText = text.includes('поделиться') || text.includes('share');
        const hasPgnText = text.includes('pgn');
        const hasPgnTextarea = Array.from(el.querySelectorAll('textarea'))
            .some(ta => /\[Event\s+"/i.test(ta.value || ta.textContent || ''));
        return hasShareText || hasPgnText || hasPgnTextarea;
    }

    async function readPgnFromShareDialog(dialog) {
        clickPgnTab(dialog);

        const ta = await waitFor(() => findPgnTextarea(dialog), 4000, 60);
        if (!ta) throw new Error('Не нашёл поле PGN в окне «Поделиться».');

        const pgn = (ta.value || ta.textContent || '').trim();
        if (!looksLikePgn(pgn)) throw new Error('PGN пустой или не похож на PGN.');

        closeShareDialog(dialog);
        // Wait for dialog to actually leave the DOM instead of a fixed sleep
        await waitFor(() => !document.body.contains(dialog), 1000, 50);

        return normalizePgn(pgn);
    }

    function clickPgnTab(dialog) {
        // Scope to [role="tab"] and button only — avoid matching decorative divs
        const tabs = Array.from(dialog.querySelectorAll('[role="tab"], button'))
            .filter(isPgnControl);
        if (tabs.length) clickElement(tabs.find(t => t.getAttribute('role') === 'tab') || tabs[0]);
    }

    function findPgnTextarea(dialog) {
        const tas = Array.from(dialog.querySelectorAll('textarea'));
        // Never fall back to tas[0] — return null and let waitFor retry
        return tas.find(t => /\[Event\s+"/i.test(t.value || '')) || null;
    }

    function closeShareDialog(dialog) {
        const closeBtn =
            dialog.querySelector('button[aria-label*="close" i]') ||
            dialog.querySelector('button[aria-label*="закры" i]') ||
            dialog.querySelector('button[title*="close" i]') ||
            dialog.querySelector('button[title*="закры" i]');
        if (closeBtn) return closeBtn.click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    }

    function findShareMenuItem() {
        // Scope search to open menu container when possible
        const menu = document.querySelector('[role="menu"]');
        const scope = menu || document;

        // Try data-cy attribute first
        const byCy = scope.querySelector('[data-cy*="share"]');
        if (byCy && isVisible(byCy)) return closestClickable(byCy);

        // Restrict to [role="menuitem"] only — avoids getBoundingClientRect on thousands of divs
        const items = Array.from(scope.querySelectorAll('[role="menuitem"]')).filter(isVisible);

        const item = items.find(x => (x.textContent || '').trim().toLowerCase() === 'поделиться партией')
            || items.find(x => {
                const t = (x.textContent || '').toLowerCase();
                return (t.includes('поделиться') || t.includes('share')) && (t.includes('парт') || t.includes('game'));
            })
            || null;
        return item ? closestClickable(item) : null;
    }

    // ==================== Helpers ====================

    function isVisible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function visibleElement(selector) {
        const el = document.querySelector(selector);
        return isVisible(el) ? el : null;
    }

    function looksLikePgn(s) {
        return typeof s === 'string'
            && /\[Event\s+".*?"\]/.test(s)
            && /\[Site\s+".*?"\]/.test(s)
            && /\d+\.\s*[A-Za-z]/.test(s); // require at least one move
    }

    function isPgnControl(el) {
        const value = el.value || '';
        const text = (el.textContent || '').trim().toLowerCase();
        return /\[Event\s+"/i.test(value) || text.includes('pgn');
    }

    function closestClickable(el) {
        return el.closest('button, a, [role="menuitem"], [role="button"], [tabindex]') || el;
    }

    function closestVisibleContainer(el, candidates) {
        return candidates.find(candidate => candidate.contains(el)) || null;
    }

    function closestShareContainerFromPgnControl(el) {
        let node = el.parentElement;
        let candidate = null;
        while (node && node !== document.body) {
            if (isVisible(node)) {
                const text = (node.textContent || '').toLowerCase();
                if (node.querySelector('textarea') || text.includes('pgn') || text.includes('share') || text.includes('поделиться')) {
                    candidate = node;
                }
            }
            node = node.parentElement;
        }
        return candidate;
    }

    function clickElement(el) {
        const target = closestClickable(el);
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        target.click();
    }

    function normalizePgn(pgn) { return pgn.replace(/\r\n/g, '\n').trim(); }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function waitFor(fn, timeoutMs = 2000, intervalMs = 50) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const v = fn();
                if (v) return v;
            } catch (err) {
                // Suppress "element not found" errors; rethrow unexpected ones
                if (!(err instanceof TypeError) && !(err instanceof ReferenceError)) throw err;
            }
            await sleep(intervalMs);
        }
        return null;
    }

    // ==================== Lichess import ====================

    async function importAndOpen(pgn) {
        GM_setValue(pendingPgnKey, pgn);
        GM_openInTab('https://lichess.org/paste', { active: true, setParent: true });
    }

    async function submitPendingPgnOnLichess() {
        const pgn = GM_getValue(pendingPgnKey, '');
        if (!pgn || !looksLikePgn(pgn)) return;

        const textarea = await waitFor(() => document.querySelector('textarea[name="pgn"]'), 6000, 80);
        const form = textarea?.closest('form');
        if (!textarea || !form) return;

        GM_deleteValue(pendingPgnKey);

        textarea.value = pgn;
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: pgn }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        form.submit();
    }

})();
