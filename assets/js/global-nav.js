/* =============================================================
   GLOBAL HEADER NAVIGATION — SINGLE SOURCE OF TRUTH
   Mobile hamburger menu + "More" dropdown behavior, shared
   across every page of sayedasif.com.
   ============================================================= */

(function () {
    "use strict";

    /* =====================================================
       MOBILE NAVIGATION
    ====================================================== */

    const menuButton = document.getElementById("menuButton");
    const navLinks = document.getElementById("navLinks");

    function closeMobileMenu() {
        if (!navLinks || !navLinks.classList.contains("active")) {
            return;
        }

        navLinks.classList.remove("active");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Open navigation menu");

        const icon = menuButton.querySelector("i");
        if (icon) {
            icon.classList.remove("fa-times");
            icon.classList.add("fa-bars");
        }
    }

    if (menuButton && navLinks) {

        menuButton.addEventListener("click", function (event) {
            event.stopPropagation();

            const isOpen = navLinks.classList.toggle("active");

            menuButton.setAttribute("aria-expanded", String(isOpen));
            menuButton.setAttribute(
                "aria-label",
                isOpen ? "Close navigation menu" : "Open navigation menu"
            );

            const icon = menuButton.querySelector("i");
            if (icon) {
                icon.classList.toggle("fa-bars", !isOpen);
                icon.classList.toggle("fa-times", isOpen);
            }
        });

        navLinks.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", closeMobileMenu);
        });

        document.addEventListener("click", function (event) {
            if (
                !navLinks.contains(event.target) &&
                !menuButton.contains(event.target)
            ) {
                closeMobileMenu();
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" || event.code === "Escape") {
                if (navLinks.classList.contains("active")) {
                    closeMobileMenu();
                    menuButton.focus();
                }
            }
        });

        /* Reset mobile navigation when resizing back to desktop width */
        window.addEventListener("resize", function () {
            if (window.innerWidth > 992) {
                closeMobileMenu();
            }
        });
    }

    /* =====================================================
       MORE DROPDOWN
    ====================================================== */

    const moreButton = document.querySelector("#moreButton");
    const moreMenu = document.querySelector("#moreMenu");

    function closeMoreMenu() {
        if (!moreMenu || !moreMenu.classList.contains("active")) {
            return;
        }

        moreButton.setAttribute("aria-expanded", "false");
        moreMenu.classList.remove("active");
    }

    if (moreButton && moreMenu) {

        moreButton.addEventListener("click", function (event) {
            event.stopPropagation();

            const isOpen = moreButton.getAttribute("aria-expanded") === "true";

            moreButton.setAttribute("aria-expanded", String(!isOpen));
            moreMenu.classList.toggle("active", !isOpen);
        });

        /* Close the dropdown when clicking outside */
        document.addEventListener("click", function (event) {
            if (
                !moreButton.contains(event.target) &&
                !moreMenu.contains(event.target)
            ) {
                closeMoreMenu();
            }
        });

        /* Close the dropdown with Escape key */
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" || event.code === "Escape") {
                if (moreMenu.classList.contains("active")) {
                    closeMoreMenu();
                    moreButton.focus();
                }
            }
        });

        /* Close the dropdown when a link is clicked */
        moreMenu.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", closeMoreMenu);
        });
    }
})();
