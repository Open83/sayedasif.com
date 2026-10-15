/* =============================================================
   CONTACT ACTIONS (loaded on every page)

   1. The floating WhatsApp button      <a data-whatsapp>
   2. "Show phone number" buttons       <button data-reveal-phone>  (Resume, Contact)

   The phone number is never written out in the page HTML or in this
   file: it is assembled from parts when a visitor clicks. That keeps it
   away from simple scrapers; it does not stop a determined person.
   ============================================================= */

(function () {
    "use strict";

    /* ---- Pre-filled WhatsApp message: edit it here. The visitor still taps send. ---- */
    var WA_MESSAGE = "Hi Sayed, I found your portfolio (sayedasif.com) and would like to discuss a QA opportunity.";

    /* Country code first, then the ten digits in pieces. */
    var PARTS = ["91", "98", "675", "74386"];

    function allDigits() { return PARTS.join(""); }
    function displayNumber() { return "+" + PARTS[0] + " " + PARTS.slice(1).join(""); }


    /* ---------------------------------------------------------
       1. WHATSAPP BUTTON
       Without JavaScript it is a plain link to /contact/.
       --------------------------------------------------------- */

    var wa = document.querySelector("[data-whatsapp]");

    if (wa) {
        wa.addEventListener("click", function (event) {
            event.preventDefault();

            var url = "https://wa.me/" + allDigits() + "?text=" + encodeURIComponent(WA_MESSAGE);

            /* "noopener" is deliberately not in the features string: it makes window.open()
               return null even when the tab opened, so a blocked popup could not be told
               apart from a successful one and the fallback below would always fire.
               The opener is cleared by hand instead, which has the same effect. */
            var opened = window.open(url, "_blank");

            if (opened) {
                try { opened.opener = null; } catch (ignore) { /* cross-origin: nothing to clear */ }
            } else {
                window.location.href = url;
            }
        });

        /* Step aside while the button would sit on top of text or a control that
           has to stay usable: footer links and text, form buttons, the open mobile
           menu. While a form field has focus (someone is typing) it also steps
           aside. It comes back as soon as there is no overlap. */
        var guards = document.querySelectorAll(
            ".site-footer a:not([data-whatsapp]), .site-footer p, form button, form [type=submit], .nav-links a"
        );
        var pending = false;

        var overlaps = function (a, b) {
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        };

        var typing = function () {
            var el = document.activeElement;
            return !!(el && el.matches && el.matches("form input, form textarea, form select"));
        };

        var update = function () {
            pending = false;

            var r = wa.getBoundingClientRect();
            var zone = { left: r.left - 8, right: r.right + 8, top: r.top - 8, bottom: r.bottom + 8 };
            var hit = typing();

            for (var i = 0; i < guards.length && !hit; i++) {
                var g = guards[i].getBoundingClientRect();
                if (g.width > 0 && g.height > 0 && overlaps(zone, g)) { hit = true; }
            }

            wa.classList.toggle("wa-float--yield", hit);
        };

        var schedule = function () {
            if (!pending) {
                pending = true;
                window.requestAnimationFrame(update);
            }
        };

        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        document.addEventListener("focusin", schedule);
        document.addEventListener("focusout", schedule);
        document.addEventListener("click", schedule);

        if ("ResizeObserver" in window) {
            new ResizeObserver(schedule).observe(document.body);
        }

        schedule();
    }


    /* ---------------------------------------------------------
       2. CLICK-TO-REVEAL PHONE NUMBER
       --------------------------------------------------------- */

    Array.prototype.forEach.call(document.querySelectorAll("[data-reveal-phone]"), function (button) {
        button.addEventListener("click", function () {
            var link = document.createElement("a");
            link.href = "tel:+" + allDigits();
            link.textContent = displayNumber();
            button.replaceWith(link);
            link.focus();
        });
    });
})();
