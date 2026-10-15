/* Click-to-reveal phone number.
   The number is not in the page HTML: it is assembled here on click, so simple scrapers
   that read the static markup do not get it. This deters bots only, not a determined person. */
(function () {
    "use strict";

    var buttons = document.querySelectorAll("[data-reveal-phone]");
    if (!buttons.length) { return; }

    var parts = ["+91", "98", "675", "74386"];

    buttons.forEach(function (button) {
        button.addEventListener("click", function () {
            var digits = parts.slice(1).join("");
            var link = document.createElement("a");
            link.href = "tel:" + parts[0] + digits;
            link.textContent = parts[0] + " " + digits;
            button.replaceWith(link);
            link.focus();
        });
    });
})();
