// ==UserScript==
// @name         Chess.com -> Lichess Import
// @namespace    tm-chess-transfer
// @version      2.0.0
// @description  Two scenarios: (1) Analyze -> ... -> Share -> PGN; (2) Share icon -> PGN. Button above Search. Visible only on /game/* and /analysis/*.
// @match        https://www.chess.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      lichess.org
// ==/UserScript==

(function () {
    'use strict';

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
    btn.textContent = 'Lichess Import';
    btn.title = 'Import current game to Lichess';
    btn.setAttribute('aria-label', 'Lichess Import');

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
        btn.textContent = label;
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
        mo.observe(document.body, { childList: true, subtree: true, attributes: false, characterData: false });
    }

    function interceptNavigation() {
        window.addEventListener('popstate', updateButtonVisibility);

        const origPush = history.pushState.bind(history);
        const origReplace = history.replaceState.bind(history);
        history.pushState = function (...args) { origPush(...args); updateButtonVisibility(); };
        history.replaceState = function (...args) { origReplace(...args); updateButtonVisibility(); };
    }

    // ==================== Two scenarios ====================

    async function getPgnByTwoScenarios() {
        // If share dialog already open -> read
        let dialog = findShareDialog();
        if (dialog) return await readPgnFromShareDialog(dialog);

        // Scenario 2: Share icon
        const shareIcon = document.querySelector('button[data-cy="sidebar-share-icon"]');
        if (shareIcon && isVisible(shareIcon)) {
            const existingDialog = findShareDialog();
            shareIcon.click();
            dialog = await waitFor(() => {
                const d = findShareDialog();
                return (d && d !== existingDialog) ? d : null;
            }, 3000, 60);
            if (!dialog) throw new Error('Окно «Поделиться» не открылось после кнопки Поделиться.');
            return await readPgnFromShareDialog(dialog);
        }

        // Scenario 1: Analyze -> ... -> Share
        const analyzeBtn = document.querySelector('button[data-cy="sidebar-header-end-button"]');
        if (analyzeBtn && isVisible(analyzeBtn)) {
            analyzeBtn.click();

            const moreBtn = await waitFor(
                () => document.querySelector('button[data-cy="analysis-secondary-controls-more-button"]'),
                6000,
                80
            );
            if (!moreBtn) throw new Error('Не нашёл кнопку "…" в анализе.');

            await sleep(50); // let animation settle before clicking
            moreBtn.click();

            const shareItem = await waitFor(() => findShareMenuItem(), 2500, 60);
            if (!shareItem) throw new Error('Не нашёл пункт «Поделиться партией» в меню после "…".');
            shareItem.click();

            dialog = await waitFor(() => findShareDialog(), 3000, 60);
            if (!dialog) throw new Error('Окно «Поделиться» не открылось из меню анализа.');

            return await readPgnFromShareDialog(dialog);
        }

        // Fallback: maybe already on analysis page
        const moreBtnFallback = document.querySelector('button[data-cy="analysis-secondary-controls-more-button"]');
        if (moreBtnFallback && isVisible(moreBtnFallback)) {
            moreBtnFallback.click();
            const shareItem = await waitFor(() => findShareMenuItem(), 2500, 60);
            if (!shareItem) throw new Error('Не нашёл пункт «Поделиться партией» в меню.');
            shareItem.click();
            dialog = await waitFor(() => findShareDialog(), 3000, 60);
            if (!dialog) throw new Error('Окно «Поделиться» не открылось.');
            return await readPgnFromShareDialog(dialog);
        }

        throw new Error('Не нашёл ни кнопку «Поделиться», ни «Анализ» на этой странице.');
    }

    // ==================== Share dialog helpers ====================

    function findShareDialog() {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        return dialogs.find(d => {
            const text = (d.textContent || '').toLowerCase();
            return text.includes('поделиться') || text.includes('share');
        }) || null;
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
            .filter(el => (el.textContent || '').trim().toLowerCase().includes('pgn'));
        if (tabs.length) (tabs.find(t => t.getAttribute('role') === 'tab') || tabs[0]).click();
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
        if (byCy && isVisible(byCy)) return byCy;

        // Restrict to [role="menuitem"] only — avoids getBoundingClientRect on thousands of divs
        const items = Array.from(scope.querySelectorAll('[role="menuitem"]')).filter(isVisible);

        return items.find(x => (x.textContent || '').trim().toLowerCase() === 'поделиться партией')
            || items.find(x => {
                const t = (x.textContent || '').toLowerCase();
                return (t.includes('поделиться') || t.includes('share')) && (t.includes('парт') || t.includes('game'));
            })
            || null;
    }

    // ==================== Helpers ====================

    function isVisible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function looksLikePgn(s) {
        return typeof s === 'string'
            && /\[Event\s+".*?"\]/.test(s)
            && /\[Site\s+".*?"\]/.test(s)
            && /\d+\.\s*[A-Za-z]/.test(s); // require at least one move
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
        const api = await importViaApi(pgn);
        if (api?.url) {
            window.open(api.url, '_blank', 'noopener');
            return;
        }
        openViaForm(pgn);
    }

    async function importViaApi(pgn) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://lichess.org/api/import',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
                data: 'pgn=' + encodeURIComponent(pgn),
                responseType: 'json',
                onload: r => {
                    if (r.status >= 200 && r.status < 300) {
                        resolve(r.response || null);
                    } else {
                        // Surface Lichess error (e.g. invalid PGN) instead of silently falling back
                        const errMsg = r.response?.error || `HTTP ${r.status}`;
                        reject(new Error('Lichess: ' + errMsg));
                    }
                },
                onerror: () => resolve(null) // network error → try form fallback
            });
        });
    }

    function openViaForm(pgn) {
        const f = document.createElement('form');
        f.method = 'POST';
        f.action = 'https://lichess.org/api/import';
        f.target = '_blank';
        const i = document.createElement('input');
        i.type = 'hidden'; i.name = 'pgn'; i.value = pgn;
        f.appendChild(i);
        document.body.appendChild(f);
        f.submit();
        // Delay removal to ensure the request is dispatched before the element is removed
        setTimeout(() => f.remove(), 1000);
    }

})();
