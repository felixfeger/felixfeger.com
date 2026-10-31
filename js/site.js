
// js/site.js
//
// Loaded on every page.
//
// Responsibilities:
// 1. Holds site-wide settings.
// 2. Configures the Pixelfed API connection.
// 3. Automatically adds social links to every page footer.
//
// Pixelfed photos are retrieved through the same-domain
// Cloudflare Pages Function at /api/pixelfed.

window.SITE = {

  // ---- Pixelfed -----------------------------------------------------

  pixelfed: {
    // Pixelfed server
    instance: "pixelfed.social",

    // Username WITHOUT @
    username: "felix_traveler",

    // Account ID (optional).
    // Leave empty to look it up automatically.
    accountId: "",

    // Same-domain Cloudflare Pages API proxy.
    // No external API hostname required.
    apiBase: "/api/pixelfed"
  },


  // ---- Footer social links -----------------------------------------

  // Pixelfed is inserted automatically using the configuration above.
  // Do not add Pixelfed here, or it will appear twice.

  socials: [
    {
      label: "YouTube",
      url: "https://www.youtube.com/@felix_traveler"
    },
    {
      label: "GitHub",
      url: "https://github.com/felixfeger"
    },
    {
      label: "Linktree",
      url: "https://linktr.ee/felix_traveler"
    }
  ]

};


// ==========================================================
// FOOTER SOCIAL LINKS
// ==========================================================

(function () {
  "use strict";

  function buildFooter() {

    var wrap = document.querySelector(
      ".site-footer .wrap"
    );

    if (!wrap) return;

    // Prevent duplicate footer navigation.
    if (wrap.querySelector(".footer-socials")) {
      return;
    }

    var links = (window.SITE.socials || []).slice();

    var pf = window.SITE.pixelfed || {};

    var user = String(pf.username || "")
      .trim()
      .replace(/^@/, "");

    var host = String(pf.instance || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");

    // Automatically add Pixelfed.
    if (
      user &&
      user !== "YOUR_USERNAME" &&
      host
    ) {
      links.unshift({
        label: "Pixelfed",
        url: "https://" + host + "/@" + user
      });
    }

    // Create footer navigation.
    var nav = document.createElement("nav");

    nav.className = "footer-socials";

    nav.setAttribute(
      "aria-label",
      "Social links"
    );

    // Add links.
    links.forEach(function (item) {

      if (!item.label || !item.url) return;

      var a = document.createElement("a");

      a.href = item.url;
      a.textContent = item.label;

      a.target = "_blank";

      a.rel = "me noopener noreferrer";

      nav.appendChild(a);

    });

    // Add navigation above the footer copyright.
    wrap.insertBefore(
      nav,
      wrap.firstChild
    );

  }


  // Initialize after the document is ready.
  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      buildFooter
    );

  } else {

    buildFooter();

  }

})();
