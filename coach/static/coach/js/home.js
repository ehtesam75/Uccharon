/**
 * Uccharon - Public Homepage / Landing Page
 * Standalone script (no dependency on the app bundle).
 * Handles: theme toggle (shared with the app via localStorage),
 * mobile nav drawer, scroll reveal animations, footer year.
 */

'use strict';

(function () {
    var STORAGE_KEY = 'uccharon_theme';
    var root = document.documentElement;

    // ─── Theme ───────────────────────────────────────────────
    function currentTheme() {
        return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function syncThemeIcons(theme) {
        var dark = document.querySelector('.theme-icon-dark');
        var light = document.querySelector('.theme-icon-light');
        if (!dark || !light) return;
        // Show the icon representing the theme you'd switch TO.
        if (theme === 'dark') {
            dark.style.display = 'block';
            light.style.display = 'none';
        } else {
            dark.style.display = 'none';
            light.style.display = 'block';
        }
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore */ }
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0a1a' : '#f4f5fa');
        syncThemeIcons(theme);
    }

    function initTheme() {
        // The inline head script already set data-theme to avoid a flash.
        syncThemeIcons(currentTheme());
        var btn = document.getElementById('theme-toggle');
        if (btn) {
            btn.addEventListener('click', function () {
                applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
            });
        }
    }

    // ─── Mobile menu ─────────────────────────────────────────
    function initMobileMenu() {
        var burger = document.getElementById('nav-burger');
        var menu = document.getElementById('mobile-menu');
        var backdrop = document.getElementById('mobile-backdrop');
        if (!burger || !menu) return;

        function setMenu(open) {
            menu.classList.toggle('open', open);
            if (backdrop) backdrop.classList.toggle('open', open);
            burger.setAttribute('aria-expanded', open ? 'true' : 'false');
            burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
            // Lock body scroll while the drawer is open.
            document.body.style.overflow = open ? 'hidden' : '';
        }

        burger.addEventListener('click', function () {
            setMenu(!menu.classList.contains('open'));
        });

        if (backdrop) {
            backdrop.addEventListener('click', function () { setMenu(false); });
        }

        menu.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () { setMenu(false); });
        });

        // Close on Escape for keyboard users.
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && menu.classList.contains('open')) setMenu(false);
        });

        // Auto-close if the viewport grows past the mobile breakpoint.
        window.addEventListener('resize', function () {
            if (window.innerWidth > 780 && menu.classList.contains('open')) setMenu(false);
        });
    }


    // ─── Scroll reveal ───────────────────────────────────────
    function initReveal() {
        var items = document.querySelectorAll('.reveal');
        if (!('IntersectionObserver' in window) || !items.length) {
            items.forEach(function (el) { el.classList.add('in'); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        items.forEach(function (el) { io.observe(el); });
    }

    // ─── Smooth anchor scrolling with sticky-nav offset ──────
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                var id = link.getAttribute('href');
                if (id === '#' || id.length < 2) return;
                var target = document.querySelector(id);
                if (!target) return;
                e.preventDefault();
                var top = target.getBoundingClientRect().top + window.pageYOffset - 78;
                window.scrollTo({ top: top, behavior: 'smooth' });
            });
        });
    }

    function initYear() {
        var y = document.getElementById('year');
        if (y) y.textContent = new Date().getFullYear();
    }

    // ─── Embedded guide close button ─────────────────────────
    // When the guide is opened inside the app (Settings → View the
    // Guide) with ?embedded=true, a floating close button is shown.
    // Clicking it returns the user to the app.
    function initEmbedClose() {
        var btn = document.getElementById('guide-embed-close');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var params = new URLSearchParams(window.location.search);
            // Opened in a fresh tab (desktop): just close the tab so the user
            // lands back on the app tab they came from.
            if (params.get('newtab') === '1') {
                window.close();
                // If the browser blocks window.close() (tab not script-opened),
                // fall back to navigating to the app.
                window.location.href = '/app/';
                return;
            }
            // Opened in the same tab (mobile): go back if we have history,
            // otherwise fall back to the app route.
            if (window.history.length > 1 && document.referrer) {
                window.history.back();
            } else {
                window.location.href = '/app/';
            }
        });
    }


    document.addEventListener('DOMContentLoaded', function () {
        initTheme();
        initMobileMenu();
        initReveal();
        initSmoothScroll();
        initYear();
        initEmbedClose();
    });
})();


