
// js/site.js
//
// Loaded on every page.
//
// Responsibilities:
// 1. Holds site-wide settings.
// 2. Configures the Pixelfed Atom feed.
// 3. Automatically adds social links to every page footer.
//
// Pixelfed posts are retrieved through the same-domain
// Cloudflare Pages Function at /api/pixelfed/feed.
//
// No Pixelfed API key, OAuth token, or account lookup required.

window.SITE = {

  // ---- Pixelfed -----------------------------------------------------

  pixelfed: {

    // Pixelfed server
    instance: "pixelfed.social",

    // Username WITHOUT @
    username: "felix_traveler",

    // Same-domain Cloudflare Pages Function.
    // Retrieves the public Atom feed.
    apiBase: "/api/pixelfed/feed"

  },


  // ---- Footer social links -----------------------------------------

  // Pixelfed is inserted automatically using the configuration above.
  // Do not add Pixelfed here, or it will appear twice.

  socials: [

    {
      label: "Mastodon",
      url: "https://mastodon.social/@felix_traveler"
    },

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


  // --------------------------------------------------------
  // BUILD FOOTER
  // --------------------------------------------------------

  function buildFooter() {

    var wrap = document.querySelector(
      ".site-footer .wrap"
    );

    if (!wrap) return;


    // Prevent duplicate footer navigation.
    if (wrap.querySelector(".footer-socials")) {
      return;
    }


    // Copy configured social links.
    var links = (window.SITE.socials || []).slice();


    // ------------------------------------------------------
    // PIXELFED PROFILE LINK
    // ------------------------------------------------------

    var pf = window.SITE.pixelfed || {};

    var user = String(pf.username || "")
      .trim()
      .replace(/^@/, "");

    var host = String(pf.instance || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");


    // Automatically insert Pixelfed after City Metro.
    if (
      user &&
      user !== "YOUR_USERNAME" &&
      host
    ) {

      links.splice(1, 0, {
        label: "Pixelfed",
        url: "https://" + host + "/@" + user
      });

    }


    // ------------------------------------------------------
    // CREATE FOOTER NAVIGATION
    // ------------------------------------------------------

    var nav = document.createElement("nav");

    nav.className = "footer-socials";

    nav.setAttribute(
      "aria-label",
      "Social links"
    );


    // ------------------------------------------------------
    // ADD SOCIAL LINKS
    // ------------------------------------------------------

    links.forEach(function (item) {

      if (!item.label || !item.url) return;

      var a = document.createElement("a");

      a.href = item.url;

      a.textContent = item.label;

      a.target = "_blank";

      a.rel = "me noopener noreferrer";

      nav.appendChild(a);

    });


    // ------------------------------------------------------
    // INSERT BEFORE COPYRIGHT
    // ------------------------------------------------------

    wrap.insertBefore(
      nav,
      wrap.firstChild
    );

  }


  // --------------------------------------------------------
  // INITIALIZE
  // --------------------------------------------------------

  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      buildFooter
    );

  } else {

    buildFooter();

  }

})();
