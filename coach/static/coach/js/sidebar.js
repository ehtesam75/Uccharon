/**
 * Uccharon - AI English Speaking Coach
 * Sidebar behavior
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // SIDEBAR
    // ═══════════════════════════════════════════════════════

    function initSidebar() {
        DOM.sidebarToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.matchMedia('(max-width: 768px)').matches) {
                closeMobileSidebar();
            } else {
                DOM.sidebar.classList.toggle('collapsed');
            }
            updateScrollToBottomButton();
        });

        DOM.mobileSidebarToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent document click from immediately closing it
            if (window.matchMedia('(max-width: 768px)').matches) {
                DOM.sidebar.classList.toggle('mobile-open');
                DOM.sidebarOverlay.classList.toggle('active');
                DOM.sidebar.classList.remove('collapsed'); // ensure no conflict
            } else {
                DOM.sidebar.classList.toggle('collapsed');
            }
            updateScrollToBottomButton();
        });

        DOM.sidebar.addEventListener('transitionend', (e) => {
            if (e.propertyName === 'width' || e.propertyName === 'left') {
                updateScrollToBottomButton();
            }
        });

        // Overlay click closes the sidebar and blocks interaction with the background
        DOM.sidebarOverlay.addEventListener('click', (e) => {
            e.preventDefault();
            closeMobileSidebar();
        });

        // Fallback: close on any outside click not already handled by the overlay
        document.addEventListener('click', (e) => {
            if (DOM.sidebar.classList.contains('mobile-open') &&
                !DOM.sidebar.contains(e.target) &&
                e.target !== DOM.mobileSidebarToggle &&
                !DOM.mobileSidebarToggle.contains(e.target) &&
                !DOM.sidebarOverlay.contains(e.target) &&
                !DOM.settingsDrawer.contains(e.target) &&
                e.target !== DOM.settingsOverlay) {
                closeMobileSidebar();
            }
        });

        DOM.newChatBtn.addEventListener('click', createConversation);
        DOM.welcomeNewChat.addEventListener('click', createConversation);
        DOM.deleteConvoBtn.addEventListener('click', deleteConversation);

        window.addEventListener('resize', updateScrollToBottomButton);
    }

    function closeMobileSidebar() {
        DOM.sidebar.classList.remove('mobile-open');
        DOM.sidebarOverlay.classList.remove('active');
        updateScrollToBottomButton();
    }

