
// ==========================================================================
// Felix Feger — Pixelfed Gallery
// ==========================================================================
// Fetches the Atom feed through the same-domain Cloudflare Pages Function.
// One feed entry = one post.
// Multiple images belonging to a post stay grouped together.
// Tablet/mobile: horizontally swipeable photo carousel.
// Desktop: multi-column gallery.
// ==========================================================================

(function () {
  "use strict";

  var feed = document.getElementById("pixelfed-feed");
  if (!feed) return;

  var statusEl = document.getElementById("pixelfed-status");
  var profileLink = document.getElementById("pixelfed-profile-link");

  var cfg = (window.SITE && window.SITE.pixelfed) || {};

  var instance = String(cfg.instance || "pixelfed.social")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  var username = String(cfg.username || "")
    .trim()
    .replace(/^@/, "");

  var apiBase = String(cfg.apiBase || "/api/pixelfed")
    .replace(/\/+$/, "");

  var loaded = false;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message || "";
  }

  function getText(element) {
    return element ? (element.textContent || "").trim() : "";
  }

  function getFirst(parent, tag) {
    return parent.getElementsByTagName(tag)[0] || null;
  }

  function absoluteUrl(url) {
    if (!url) return "";

    try {
      return new URL(url, "https://" + instance).href;
    } catch (error) {
      return "";
    }
  }

  // Convert HTML captions into readable text.
  function cleanCaption(value) {
    if (!value) return "";

    var parser = new DOMParser();
    var doc = parser.parseFromString(value, "text/html");

    doc.querySelectorAll("script, style").forEach(function (el) {
      el.remove();
    });

    return (doc.body.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Extract image URLs from HTML embedded in an Atom entry.
  function imagesFromHTML(html) {
    if (!html) return [];

    var parser = new DOMParser();
    var doc = parser.parseFromString(html, "text/html");
    var urls = [];

    doc.querySelectorAll("img").forEach(function (img) {
      var src = img.getAttribute("src");

      if (!src) {
        var srcset = img.getAttribute("srcset");

        if (srcset) {
          src = srcset.split(",").pop().trim().split(/\s+/)[0];
        }
      }

      if (src) urls.push(src);
    });

    return urls;
  }

  // Find all media belonging to a single post.
  function extractImages(entry) {
    var urls = [];

    // Images embedded in Atom content.
    var content = getFirst(entry, "content");

    if (content) {
      urls = urls.concat(imagesFromHTML(getText(content)));
    }

    // Images embedded in Atom summary.
    var summary = getFirst(entry, "summary");

    if (summary) {
      urls = urls.concat(imagesFromHTML(getText(summary)));
    }

    // Pixelfed / ActivityPub media elements.
    var all = entry.getElementsByTagName("*");

    for (var i = 0; i < all.length; i++) {
      var el = all[i];

      if (
        el.localName === "content" &&
        el.namespaceURI !== "http://www.w3.org/2005/Atom"
      ) {
        var mediaUrl = el.getAttribute("url");

        if (mediaUrl) urls.push(mediaUrl);
      }

      if (el.localName === "thumbnail") {
        var thumbnailUrl = el.getAttribute("url");

        if (thumbnailUrl) urls.push(thumbnailUrl);
      }
    }

    // Enclosure links.
    entry.querySelectorAll("link").forEach(function (link) {
      if (link.getAttribute("rel") === "enclosure") {
        var href = link.getAttribute("href");
        if (href) urls.push(href);
      }
    });

    // Normalize and remove duplicates.
    var seen = {};

    return urls
      .map(absoluteUrl)
      .filter(function (url) {
        if (!url || seen[url]) return false;

        seen[url] = true;

        return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) ||
          url.indexOf("media") !== -1 ||
          url.indexOf("storage") !== -1;
      });
  }

  function getPostLink(entry) {
    var links = entry.getElementsByTagName("link");

    for (var i = 0; i < links.length; i++) {
      var link = links[i];

      if (
        link.getAttribute("rel") === "alternate" &&
        link.getAttribute("href")
      ) {
        return absoluteUrl(link.getAttribute("href"));
      }
    }

    var id = getText(getFirst(entry, "id"));

    return id && /^https?:\/\//i.test(id)
      ? id
      : "https://" + instance + "/@" + username;
  }

  function getPostDate(entry) {
    var published = getText(getFirst(entry, "published"));
    var updated = getText(getFirst(entry, "updated"));

    var value = published || updated;

    if (!value) return "";

    var date = new Date(value);

    if (isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  function getPostCaption(entry) {
    var summary = getFirst(entry, "summary");
    var content = getFirst(entry, "content");

    var value = summary ? getText(summary) : "";

    if (!value && content) {
      value = getText(content);
    }

    return cleanCaption(value);
  }

  // Create one grouped post card.
  function createPost(entry) {
    var images = extractImages(entry);

    if (!images.length) return null;

    var post = document.createElement("article");
    post.className = "pf-item";

    var postLink = getPostLink(entry);

    // Photo collection.
    var media = document.createElement("div");
    media.className = "pf-post-media";

    images.forEach(function (url, index) {
      var slide = document.createElement("div");
      slide.className = "pf-slide";

      var anchor = document.createElement("a");
      anchor.className = "pf-photo-link";
      anchor.href = postLink;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.setAttribute(
        "aria-label",
        "Open Pixelfed post, photo " + (index + 1)
      );

      var img = document.createElement("img");
      img.src = url;
      img.alt = "Photo " + (index + 1) + " from a Pixelfed post";
      img.loading = "lazy";
      img.decoding = "async";

      anchor.appendChild(img);
      slide.appendChild(anchor);
      media.appendChild(slide);
    });

    post.appendChild(media);

    // Swipe indicator for posts containing multiple photos.
    if (images.length > 1) {
      var hint = document.createElement("div");
      hint.className = "pf-swipe-hint";
      hint.textContent = "Swipe to see " + images.length + " photos";
      post.appendChild(hint);
    }

    // Post metadata.
    var meta = document.createElement("div");
    meta.className = "pf-meta";

    var caption = getPostCaption(entry);

    if (caption) {
      var captionEl = document.createElement("p");
      captionEl.className = "pf-caption";
      captionEl.textContent = caption;
      meta.appendChild(captionEl);
    }

    var date = getPostDate(entry);

    if (date) {
      var dateEl = document.createElement("time");
      dateEl.className = "pf-date";
      dateEl.textContent = date;

      var published = getText(getFirst(entry, "published"));

      if (published) {
        dateEl.dateTime = published;
      }

      meta.appendChild(dateEl);
    }

    post.appendChild(meta);

    return post;
  }

  // Fetch the same-domain feed.
  function loadFeed() {
    if (loaded) return;

    loaded = true;

    setStatus("Loading posts…");

    fetch(apiBase + "/feed", {
      method: "GET",
      headers: {
        "Accept": "application/atom+xml, application/xml, text/xml"
      },
      credentials: "same-origin"
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Feed request failed: HTTP " + response.status);
        }

        return response.text();
      })
      .then(function (xml) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(xml, "application/xml");

        if (doc.querySelector("parsererror")) {
          throw new Error("Invalid Atom feed.");
        }

        var entries = Array.from(doc.getElementsByTagName("entry"));

        var count = 0;

        entries.forEach(function (entry) {
          var post = createPost(entry);

          if (post) {
            feed.appendChild(post);
            count++;
          }
        });

        if (!count) {
          setStatus("No photos found in the Pixelfed feed.");
        } else {
          setStatus("");
        }
      })
      .catch(function (error) {
        console.error("Pixelfed gallery error:", error);

        loaded = false;

        setStatus(
          "Unable to load photos right now. Please try refreshing the page."
        );
      });
  }

  // Configure profile link.
  if (profileLink && instance && username) {
    profileLink.href = "https://" + instance + "/@" + username;
    profileLink.hidden = false;
  }

  if (!instance || !username) {
    setStatus("Pixelfed is not configured in js/site.js.");
    return;
  }

  loadFeed();

})();
