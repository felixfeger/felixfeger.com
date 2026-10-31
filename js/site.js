// js/site.js
//
// Loaded on every page. Two jobs:
//   1. Holds the site-wide settings in one place (your socials + Pixelfed).
//   2. Puts your socials links in the footer of every page.
//
// To add, remove, or change a social link, edit the list below —
// every page's footer updates automatically.

window.SITE = {
  // ---- Pixelfed -----------------------------------------------------
  // instance: the server your account lives on (e.g. "pixelfed.social")
  // username: your handle WITHOUT the @
  // accountId: optional. Leave "" unless the Photos page can't find your
  //            account on its own.
  pixelfed: {
    instance: "pixelfed.social",
    username: "felix_traveler",
    accountId: "",
    // How each post is embedded on the Photos page:
    //   layout: "compact" or "full"   caption/likes: true or false
    embed: { layout: "compact", caption: false, likes: false }
  },

  // ---- Footer social links -----------------------------------------
  // Pixelfed is added automatically once a username is set above.
  socials: [
    { label: "Pixelfed", url: "https://pixelfed.com/felix_traveler" },
    { label: "YouTube", url: "https://www.youtube.com/@felix_traveler" },
    { label: "GitHub", url: "https://github.com/felixfeger" },
    { label: "Linktree", url: "https://linktr.ee/felix_traveler" }
  ]
};

(function () {
  function buildFooter() {
    var wrap = document.querySelector(".site-footer .wrap");
    if (!wrap || wrap.querySelector(".footer-socials")) return;

    var links = window.SITE.socials.slice();
    var pf = window.SITE.pixelfed || {};
    var user = String(pf.username || "").trim().replace(/^@/, "");
    var host = String(pf.instance || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (user && user !== "YOUR_USERNAME" && host) {
      links.splice(1, 0, { label: "Pixelfed", url: "https://" + host + "/@" + user });
    }

    var nav = document.createElement("nav");
    nav.className = "footer-socials";
    nav.setAttribute("aria-label", "Social links");

    links.forEach(function (item) {
      var a = document.createElement("a");
      a.href = item.url;
      a.textContent = item.label;
      a.target = "_blank";
      a.rel = "me noopener noreferrer";
      nav.appendChild(a);
    });

    wrap.insertBefore(nav, wrap.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildFooter);
  } else {
    buildFooter();
  }
})();
