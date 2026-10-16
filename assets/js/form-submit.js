/* =============================================================
   FORM SUBMISSION (Contact and Services forms)
   Inline validation, then a JSON POST to the form's Formspree
   endpoint. Success and error messages do not exist in the page
   until a submission has been attempted: they are created inside
   the empty live region named by data-status, so screen readers
   announce them when they appear.

   Without JavaScript the form posts normally to its action URL.
   ============================================================= */

(function () {
    "use strict";

    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    /* Kept here, not in the page markup, so the messages are not in the initial HTML. */
    var MESSAGES = {
        contactForm: {
            success: "Thanks for reaching out! I'll get back to you shortly.",
            failure: "Something went wrong. Please try again or email me directly at"
        },
        serviceForm: {
            success: "Thanks. Your inquiry has been sent and I will reply to the email address you gave.",
            failure: "Your inquiry could not be sent. Please try again, or email me directly at"
        }
    };

    function init(form) {
        var status = document.getElementById(form.getAttribute("data-status"));
        var text = MESSAGES[form.id];
        if (!status || !text) { return; }

        form.noValidate = true;

        var fields = Array.prototype.slice.call(form.querySelectorAll("[required]"));

        function problem(field) {
            var value = field.value.trim();
            var min = Number(field.getAttribute("minlength")) || 0;
            var ok = value.length > 0 && value.length >= min;
            if (ok && field.type === "email") { ok = EMAIL.test(value); }
            return ok ? "" : (field.getAttribute("data-error") || "Please complete this field.");
        }

        function setError(field, message) {
            var span = document.getElementById(field.id + "-error");
            if (message) {
                field.setAttribute("aria-invalid", "true");
                if (span) { span.textContent = message; }
            } else {
                field.removeAttribute("aria-invalid");
                if (span) { span.textContent = ""; }
            }
        }

        function show(kind, build) {
            status.textContent = "";
            var box = document.createElement("div");
            box.className = kind === "success" ? "success-message" : "error-message";
            box.setAttribute("role", kind === "success" ? "status" : "alert");
            build(box);
            status.appendChild(box);
        }

        fields.forEach(function (field) {
            field.addEventListener("input", function () {
                if (field.getAttribute("aria-invalid") === "true" && !problem(field)) { setError(field, ""); }
            });
        });

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            status.textContent = "";

            var firstInvalid = null;
            fields.forEach(function (field) {
                var message = problem(field);
                setError(field, message);
                if (message && !firstInvalid) { firstInvalid = field; }
            });
            if (firstInvalid) { firstInvalid.focus(); return; }

            var button = form.querySelector("[type=submit]");
            if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }

            fetch(form.action, {
                method: "POST",
                body: new FormData(form),
                headers: { Accept: "application/json" }
            }).then(function (response) {
                if (!response.ok) { throw new Error("HTTP " + response.status); }
                form.reset();
                show("success", function (box) { box.textContent = text.success; });
            }).catch(function () {
                show("error", function (box) {
                    var email = form.getAttribute("data-email");
                    var link = document.createElement("a");
                    link.href = "mailto:" + email;
                    link.textContent = email;
                    box.appendChild(document.createTextNode(text.failure + " "));
                    box.appendChild(link);
                    box.appendChild(document.createTextNode("."));
                });
            }).then(function () {
                if (button) { button.disabled = false; button.removeAttribute("aria-busy"); }
            });
        });
    }

    Array.prototype.forEach.call(document.querySelectorAll("form[data-ajax-form]"), init);
})();
