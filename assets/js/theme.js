/*
 * Light / dark theme.
 *
 * Loaded in <head> WITHOUT defer so a stored choice is applied before the first paint
 * (no flash of the wrong theme). It is tiny and does not touch the DOM until it is ready.
 *
 * - No stored choice: the page follows the system setting through CSS (prefers-color-scheme).
 * - A click on #themeToggle stores "light" or "dark" in localStorage and sets data-theme on <html>.
 * - The button ships with the hidden attribute: without JavaScript it cannot work, so it stays hidden.
 */
(function () {
    var root = document.documentElement;
    var KEY = 'theme';
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    try {
        var stored = localStorage.getItem(KEY);
        if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);
    } catch (e) { /* storage blocked: follow the system setting */ }

    function current() {
        var chosen = root.getAttribute('data-theme');
        if (chosen) return chosen;
        return media && media.matches ? 'dark' : 'light';
    }

    function sync(button) {
        button.setAttribute('aria-pressed', current() === 'dark' ? 'true' : 'false');
    }

    function init() {
        var button = document.getElementById('themeToggle');
        if (!button) return;
        button.hidden = false;
        sync(button);

        button.addEventListener('click', function () {
            var next = current() === 'dark' ? 'light' : 'dark';
            root.classList.add('theme-switching');
            root.setAttribute('data-theme', next);
            try { localStorage.setItem(KEY, next); } catch (e) { /* not persisted */ }
            sync(button);
            window.setTimeout(function () { root.classList.remove('theme-switching'); }, 50);
        });

        if (media && media.addEventListener) {
            media.addEventListener('change', function () { sync(button); });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
