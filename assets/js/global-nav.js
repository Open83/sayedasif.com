/* =============================================================
   GLOBAL HEADER NAVIGATION: mobile menu only
   Shared across every page of sayedasif.com. The desktop header
   is plain links and needs no script; the menu-button icon swap
   is handled in CSS from aria-expanded.
   ============================================================= */

(function () {
    "use strict";

    var menuButton = document.getElementById("menuButton");
    var navLinks = document.getElementById("navLinks");

    if (!menuButton || !navLinks) {
        return;
    }

    function setOpen(open) {
        navLinks.classList.toggle("active", open);
        menuButton.setAttribute("aria-expanded", String(open));
        menuButton.setAttribute(
            "aria-label",
            open ? "Close navigation menu" : "Open navigation menu"
        );
    }

    function isOpen() {
        return navLinks.classList.contains("active");
    }

    menuButton.addEventListener("click", function (event) {
        event.stopPropagation();
        setOpen(!isOpen());
    });

    /* Choosing a link closes the menu (same-page anchors do not reload) */
    navLinks.addEventListener("click", function (event) {
        if (event.target.closest("a")) {
            setOpen(false);
        }
    });

    /* Click or tap outside closes it */
    document.addEventListener("click", function (event) {
        if (isOpen() && !navLinks.contains(event.target) && !menuButton.contains(event.target)) {
            setOpen(false);
        }
    });

    /* Escape closes it and returns focus to the button */
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && isOpen()) {
            setOpen(false);
            menuButton.focus();
        }
    });

    /* Moving keyboard focus out of the open menu closes it */
    document.addEventListener("focusin", function (event) {
        if (isOpen() && !navLinks.contains(event.target) && !menuButton.contains(event.target)) {
            setOpen(false);
        }
    });

    /* Reset when resizing up to the desktop layout */
    window.addEventListener("resize", function () {
        if (window.innerWidth > 992 && isOpen()) {
            setOpen(false);
        }
    });
})();
