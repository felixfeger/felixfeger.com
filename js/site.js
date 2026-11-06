// js/site.js
//
// Loaded on every page (first thing inside <body>). This file owns
// everything the pages share, so each page only holds its own content:
//
//   1. Site-wide settings (below).
//   2. The announcement bar (top of every page, can be switched on/off).
//   3. The header + navigation (desktop menu and mobile menu).
//   4. The footer (social links + copyright).
//   5. The support widget.
//
// Pixelfed posts are retrieved through the same-domain Cloudflare Pages
// Function at /api/pixelfed/feed (see functions/api/pixelfed/).
//
// To change the menu, the footer links, or the announcement, edit the
// settings below and every page updates at once.

window.SITE = {

  // ---- Brand (logo in the header) ------------------------------------

  brand: {
    href: "index.html",
    logo: "logo.png",
    alt: "Office of Felix Feger"
  },


  // ---- Announcement bar ----------------------------------------------
  //
  // A single line across the very top of every page, with an X so visitors
  // can dismiss it. Clicking the line opens a popup with the full details.
  //
  //   enabled:     true shows it, false hides it everywhere.
  //   text:        the one line shown in the bar. Long text is cut off with
  //                "..." on small screens, but it's shown in full in the popup.
  //   description: optional longer message shown in the popup under the text.
  //                Leave "" for none. Separate paragraphs with a blank line
  //                (write \n\n between them).
  //   id:          change this whenever you change the message. Anyone who
  //                dismissed the old message will see the new one.

  announcement: {
    enabled: true,
    id: "11-05-26",
    text: "Longer email response times on November 11th",
    description: "Due to the Veteran's Day Holiday on Wednesday, November 11th, please exect longer email response times. We appologize for an inconvience."
  },


  // ---- Navigation -----------------------------------------------------
  //
  // One entry per menu item, in menu order. This builds BOTH the desktop
  // menu and the mobile menu.
  //
  //   id:        matches <body data-page="..."> on that page, which is how
  //              the current page gets highlighted.
  //   published: optional. Set to false to hide a page you're still working
  //              on. It disappears from the menu, and visitors who open its
  //              address see a "not published yet" notice instead of the
  //              page. To look at it yourself, add ?preview to the address,
  //              for example about.html?preview
  //              To publish it, delete the published part (or set it to true).
  //              Example of a hidden page:
  //              { id: "about", label: "About", href: "about.html", published: false },

  pages: [

    { id: "welcome",       label: "Welcome",       href: "index.html" },

    { id: "travel",        label: "Travel",        href: "travel.html" },

    { id: "media",         label: "Media",         href: "media.html" },

    { id: "city-metro",    label: "City Metro",    href: "city-metro.html" },

    { id: "flights",       label: "Flights",       href: "https://flights.felixfeger.com" },

    { id: "blog",          label: "Blog",          href: "https://blog.felixfeger.com" },

    { id: "contact",       label: "Contact",       href: "contact.html" }

  ],


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

  ],


  // ---- Footer text ----------------------------------------------------

  copyright: "Copyright 2026 by Felix Feger.",


  // ---- Support widget -------------------------------------------------
  // Address of the support widget script. Leave "" to turn it off.

  support: "https://www.noupe.com/embed/01a1903b0f0070008fc9191dfc98971be058.js"

};


(function () {

  "use strict";

  var S = window.SITE;
  var body = document.body;

  var DISMISS_KEY = "site-announcement-dismissed";


  // --------------------------------------------------------
  // WHICH PAGE IS THIS, AND IS IT PUBLISHED?
  // --------------------------------------------------------

  var pageId = body.getAttribute("data-page") || "";

  var current = null;

  (S.pages || []).forEach(function (page) {
    if (page.id === pageId) current = page;
  });

  var unpublished = !!(current && current.published === false);

  var preview = /[?&]preview(?:=|&|$)/.test(window.location.search);

  var locked = unpublished && !preview;

  // Hides the page content right away, before it can flash on screen.
  if (locked) {
    document.documentElement.classList.add("site-locked");
  }


  // --------------------------------------------------------
  // SMALL HELPERS
  // --------------------------------------------------------

  function make(tag, className, text) {

    var node = document.createElement(tag);

    if (className) node.className = className;

    if (text) node.textContent = text;

    return node;

  }

  function link(href, label, extra) {

    var a = make("a", null, label);

    a.href = href;

    if (extra) {
      Object.keys(extra).forEach(function (key) {
        a[key] = extra[key];
      });
    }

    return a;

  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }


  // --------------------------------------------------------
  // ANNOUNCEMENT BAR
  // --------------------------------------------------------

  // The popup that shows the whole announcement.
  // Closes with the Close button, a click outside the box, or the Esc key.
  function openAnnouncement(headline, description, opener) {

    if (document.querySelector(".announcement-modal")) return;

    var previousOverflow = body.style.overflow;

    var overlay = make("div", "announcement-modal");

    var dialog = make("div", "announcement-dialog");

    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Announcement");

    var label = make("div", "announcement-dialog-label", "Announcement");

    var heading = make("h2", null, headline);

    var close = make("button", "btn btn-teal", "Close");

    close.type = "button";

    dialog.appendChild(label);
    dialog.appendChild(heading);

    // The longer description, one <p> per paragraph (blank line = new one).
    String(description || "").split(/\n\s*\n/).forEach(function (paragraph) {

      paragraph = paragraph.trim();

      if (paragraph) dialog.appendChild(make("p", null, paragraph));

    });

    dialog.appendChild(close);
    overlay.appendChild(dialog);

    function closeModal() {

      overlay.remove();

      document.removeEventListener("keydown", onKey);

      body.style.overflow = previousOverflow;

      if (opener && opener.focus) opener.focus();

    }

    function onKey(event) {

      if (event.key === "Escape") {
        closeModal();
      } else if (event.key === "Tab") {
        // The Close button is the only thing to focus in the popup.
        event.preventDefault();
        close.focus();
      }

    }

    close.addEventListener("click", closeModal);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeModal();
    });

    document.addEventListener("keydown", onKey);

    body.style.overflow = "hidden";

    body.appendChild(overlay);

    close.focus();

  }


  function buildAnnouncement() {

    var a = S.announcement || {};

    if (!a.enabled || !a.text) return null;

    var id = String(a.id || a.text);

    // Already dismissed in this browser.
    if (storageGet(DISMISS_KEY) === id) return null;

    var bar = make("div", "announcement-bar");

    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Announcement");

    // The text is a button: clicking it opens the full message in a popup.
    var text = make("button", "announcement-text", a.text);

    text.type = "button";
    text.title = "Click to read the full message";
    text.setAttribute("aria-haspopup", "dialog");

    text.addEventListener("click", function () {
      openAnnouncement(a.text, a.description, text);
    });

    var close = make("button", "announcement-close");

    close.type = "button";
    close.setAttribute("aria-label", "Dismiss announcement");
    close.textContent = "\u00D7";

    close.addEventListener("click", function () {
      storageSet(DISMISS_KEY, id);
      bar.remove();
    });

    bar.appendChild(text);
    bar.appendChild(close);

    return bar;

  }


  // --------------------------------------------------------
  // HEADER + NAVIGATION
  // --------------------------------------------------------

  function buildNav(className, label) {

    var nav = make("nav", className);

    nav.setAttribute("aria-label", label);

    (S.pages || []).forEach(function (page) {

      if (page.published === false) return;

      var a = link(page.href, page.label);

      if (page.id === pageId) {
        a.setAttribute("aria-current", "page");
      }

      nav.appendChild(a);

    });

    return nav;

  }

  function buildHeader() {

    var brand = S.brand || {};

    var header = make("header", "site-header");

    var wrap = make("div", "wrap");

    var logoLink = make("a", "brand");

    logoLink.href = brand.href || "index.html";

    var logo = make("img", "brand-logo");

    logo.src = brand.logo || "logo.png";
    logo.alt = brand.alt || "";

    logoLink.appendChild(logo);

    var toggle = make("button", "menu-toggle");

    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open menu");
    toggle.setAttribute("aria-expanded", "false");

    toggle.appendChild(make("span"));

    var desktop = buildNav("nav-desktop", "Primary");

    var mobile = buildNav("nav-mobile", "Mobile");

    wrap.appendChild(logoLink);
    wrap.appendChild(desktop);
    wrap.appendChild(toggle);

    header.appendChild(wrap);
    header.appendChild(mobile);

    // Mobile menu open / close.
    toggle.addEventListener("click", function () {

      var open = mobile.classList.toggle("open");

      toggle.setAttribute("aria-expanded", open ? "true" : "false");

    });

    Array.prototype.forEach.call(mobile.children, function (a) {
      a.addEventListener("click", function () {
        mobile.classList.remove("open");
      });
    });

    return header;

  }


  // --------------------------------------------------------
  // NOTICES FOR UNPUBLISHED PAGES
  // --------------------------------------------------------

  function buildLockedNotice() {

    var notice = make("div", "locked-notice");

    var hero = make("section", "page-hero");
    var wrap = make("div", "wrap");

    wrap.appendChild(make("div", "eyebrow", "Not published"));
    wrap.appendChild(make("h1", null, "This page isn\u2019t live yet"));

    var p = make("p", null, "Check back soon. ");

    p.appendChild(link("index.html", "\u2190 Back home"));

    wrap.appendChild(p);
    hero.appendChild(wrap);
    notice.appendChild(hero);

    return notice;

  }

  function buildPreviewBanner() {

    return make(
      "div",
      "preview-banner",
      "Preview: this page isn\u2019t published yet, so visitors can\u2019t see it."
    );

  }


  // --------------------------------------------------------
  // FOOTER
  // --------------------------------------------------------

  function buildFooter() {

    var links = (S.socials || []).slice();

    var pf = S.pixelfed || {};

    var user = String(pf.username || "").trim().replace(/^@/, "");

    var host = String(pf.instance || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");

    // Pixelfed is added automatically from the settings above.
    if (user && user !== "YOUR_USERNAME" && host) {

      links.splice(1, 0, {
        label: "Pixelfed",
        url: "https://" + host + "/@" + user
      });

    }

    var footer = make("footer", "site-footer");

    var wrap = make("div", "wrap");

    var nav = make("nav", "footer-socials");

    nav.setAttribute("aria-label", "Social links");

    links.forEach(function (item) {

      if (!item.label || !item.url) return;

      nav.appendChild(link(item.url, item.label, {
        target: "_blank",
        rel: "me noopener noreferrer"
      }));

    });

    if (nav.children.length) wrap.appendChild(nav);

    wrap.appendChild(document.createTextNode(S.copyright || ""));

    footer.appendChild(wrap);

    return footer;

  }


  // --------------------------------------------------------
  // PUT EVERYTHING ON THE PAGE
  // --------------------------------------------------------

  // Header, announcement, and notices go in immediately, before the
  // rest of the page loads, so nothing jumps around.
  //
  // Safety net: if a page still has an old hand-written header (for example
  // an old copy of a page is online next to this new file), don't add a
  // second one.

  var existingHeader = document.querySelector(".site-header");

  var header = existingHeader || buildHeader();

  if (!existingHeader) {
    body.insertBefore(header, body.firstChild);
  }

  if (locked) {

    header.insertAdjacentElement("afterend", buildLockedNotice());

  } else if (unpublished) {

    header.insertAdjacentElement("afterend", buildPreviewBanner());

  }

  var announcement = buildAnnouncement();

  if (announcement) {
    body.insertBefore(announcement, body.firstChild);
  }


  // The footer and support widget wait for the page content.

  function hasScript(src) {

    var scripts = document.getElementsByTagName("script");

    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].getAttribute("src") === src) return true;
    }

    return false;

  }

  function finish() {

    // Same safety net as the header: never add a second footer.
    if (!document.querySelector(".site-footer")) {

      var footer = buildFooter();

      var main = document.querySelector("main");

      if (main) {
        main.insertAdjacentElement("afterend", footer);
      } else {
        body.appendChild(footer);
      }

    }

    // ...and never load the support widget twice.
    if (S.support && !locked && !hasScript(S.support)) {

      var script = document.createElement("script");

      script.src = S.support;
      script.setAttribute("src", S.support);
      script.async = true;

      body.appendChild(script);

    }

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", finish);
  } else {
    finish();
  }

})();
