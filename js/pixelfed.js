
/* ==========================================================
   FELIX FEGER — PIXELFED PHOTO GALLERY
   ==========================================================

   Source:
   Pixelfed public Atom feed

   API:
   /api/pixelfed/feed

   Features:
   - Direct image rendering
   - Automatic image cropping
   - Responsive layout
   - Multiple images per post
   - Click to open original Pixelfed post
   - Lazy image loading
   - XML parsing
   - Error handling
   - No OAuth or API account lookup
   - No individual Pixelfed embeds

   ========================================================== */

(function () {
  "use strict";

  // ========================================================
  // ELEMENTS
  // ========================================================

  var feed = document.getElementById("pixelfed-feed");
  if (!feed) return;

  var statusEl = document.getElementById("pixelfed-status");
  var moreBtn = document.getElementById("pixelfed-more");
  var profileLink = document.getElementById("pixelfed-profile-link");


  // ========================================================
  // CONFIGURATION
  // ========================================================

  var cfg = (window.SITE && window.SITE.pixelfed) || {};

  var instance = String(cfg.instance || "pixelfed.social")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  var username = String(cfg.username || "")
    .trim()
    .replace(/^@/, "");

  var apiBase = String(
    cfg.apiBase || "/api/pixelfed/feed"
  ).trim();

  var base = "https://" + instance;

  var ATOM_NAMESPACE =
    "http://www.w3.org/2005/Atom";

  var MEDIA_NAMESPACE =
    "http://search.yahoo.com/mrss/";


  // ========================================================
  // STATE
  // ========================================================

  var loadedImages = new Set();
  var photoCount = 0;
  var postCount = 0;


  // ========================================================
  // STATUS
  // ========================================================

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = message || "";
    }
  }


  // ========================================================
  // URL VALIDATION
  // ========================================================

  function safeURL(value) {
    if (!value) return null;

    try {
      var url = new URL(value, base + "/");

      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
      ) {
        return null;
      }

      return url.href;

    } catch (error) {
      return null;
    }
  }


  // ========================================================
  // XML HELPERS
  // ========================================================

  function getChildren(element, name) {
    return Array.from(element.children || []).filter(
      function (child) {
        return child.localName === name;
      }
    );
  }

  function getChild(element, name) {
    return getChildren(element, name)[0] || null;
  }

  function getText(element, name) {
    var child = getChild(element, name);

    return child
      ? child.textContent.trim()
      : "";
  }


  // ========================================================
  // GET ATOM POST CONTENT
  // ========================================================

  function getContentHTML(entry) {
    var content = getChild(entry, "content");

    if (!content) return "";

    var type = content.getAttribute("type") || "text";

    // HTML content is normally escaped or stored in CDATA.
    if (
      type === "html" ||
      type === "text" ||
      type === "text/html"
    ) {
      return content.textContent || "";
    }

    // Handle XHTML content.
    if (type === "xhtml") {
      var serializer = new XMLSerializer();

      return Array.from(content.childNodes)
        .map(function (node) {
          return serializer.serializeToString(node);
        })
        .join("");
    }

    return content.textContent || "";
  }


  // ========================================================
  // EXTRACT IMAGES FROM POST
  // ========================================================

  function extractImages(entry) {
    var images = [];

    function addImage(url, description) {
      var safe = safeURL(url);

      if (!safe) return;

      if (!images.some(function (item) {
        return item.url === safe;
      })) {
        images.push({
          url: safe,
          alt: description || ""
        });
      }
    }

    // ------------------------------------------------------
    // 1. Extract images embedded in Atom HTML content.
    // ------------------------------------------------------

    var html = getContentHTML(entry);

    if (html) {
      var htmlDoc = new DOMParser().parseFromString(
        html,
        "text/html"
      );

      var imageElements =
        htmlDoc.querySelectorAll("img");

      imageElements.forEach(function (image) {
        var src =
          image.getAttribute("src") ||
          image.getAttribute("data-src") ||
          image.getAttribute("data-original");

        // Support responsive image source sets.
        if (!src) {
          var srcset = image.getAttribute("srcset");

          if (srcset) {
            src = srcset.split(",")[0].trim().split(/\s+/)[0];
          }
        }

        addImage(
          src,
          image.getAttribute("alt") || ""
        );
      });
    }

    // ------------------------------------------------------
    // 2. Extract Media RSS content.
    // ------------------------------------------------------

    var mediaContent = entry.getElementsByTagNameNS(
      MEDIA_NAMESPACE,
      "content"
    );

    Array.from(mediaContent).forEach(function (media) {
      var type = media.getAttribute("type") || "";
      var medium = media.getAttribute("medium") || "";

      if (
        type.startsWith("image/") ||
        medium === "image"
      ) {
        addImage(
          media.getAttribute("url"),
          media.getAttribute("title") || ""
        );
      }
    });

    // ------------------------------------------------------
    // 3. Extract Media RSS thumbnails if necessary.
    // ------------------------------------------------------

    if (!images.length) {
      var thumbnails = entry.getElementsByTagNameNS(
        MEDIA_NAMESPACE,
        "thumbnail"
      );

      Array.from(thumbnails).forEach(function (thumbnail) {
        addImage(
          thumbnail.getAttribute("url"),
          thumbnail.getAttribute("title") || ""
        );
      });
    }

    // ------------------------------------------------------
    // 4. Extract Atom enclosure links if necessary.
    // ------------------------------------------------------

    if (!images.length) {
      getChildren(entry, "link").forEach(function (link) {
        var rel = link.getAttribute("rel") || "";
        var type = link.getAttribute("type") || "";

        if (
          rel === "enclosure" &&
          type.startsWith("image/")
        ) {
          addImage(link.getAttribute("href"), "");
        }
      });
    }

    return images;
  }


  // ========================================================
  // GET ORIGINAL POST URL
  // ========================================================

  function getPostURL(entry) {
    var links = getChildren(entry, "link");

    for (var i = 0; i < links.length; i++) {
      var link = links[i];

      var rel = link.getAttribute("rel") || "alternate";

      if (rel === "alternate") {
        var url = safeURL(link.getAttribute("href"));

        if (url) return url;
      }
    }

    var id = getText(entry, "id");
    var idURL = safeURL(id);

    if (idURL && /^https?:/.test(id)) {
      return idURL;
    }

    return base + "/@" + encodeURIComponent(username);
  }


  // ========================================================
  // GET POST CAPTION
  // ========================================================

  function getCaption(entry) {
    var summary = getText(entry, "summary");
    var title = getText(entry, "title");

    var caption = summary || title;

    if (!caption) {
      var html = getContentHTML(entry);

      if (html) {
        var doc = new DOMParser().parseFromString(
          html,
          "text/html"
        );

        caption = doc.body.textContent.trim();
      }
    }

    return caption
      .replace(/\s+/g, " ")
      .trim();
  }


  // ========================================================
  // CREATE PHOTO TILE
  // ========================================================

  function createPhoto(imageData, postURL, caption) {
    if (loadedImages.has(imageData.url)) {
      return;
    }

    loadedImages.add(imageData.url);

    var item = document.createElement("article");
    item.className = "pf-item";

    var link = document.createElement("a");

    link.className = "pf-photo-link";
    link.href = postURL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    var image = document.createElement("img");

    image.src = imageData.url;

    image.alt =
      imageData.alt ||
      caption ||
      "Photo from Pixelfed";

    image.loading = "lazy";
    image.decoding = "async";

    image.addEventListener("error", function () {
      item.remove();

      photoCount--;

      loadedImages.delete(imageData.url);
    });

    link.appendChild(image);
    item.appendChild(link);

    feed.appendChild(item);

    photoCount++;
  }


  // ========================================================
  // PROCESS ATOM ENTRIES
  // ========================================================

  function renderEntries(entries) {
    entries.forEach(function (entry) {
      var images = extractImages(entry);

      if (!images.length) return;

      var postURL = getPostURL(entry);
      var caption = getCaption(entry);

      var added = false;

      images.forEach(function (image) {
        if (!loadedImages.has(image.url)) {
          createPhoto(image, postURL, caption);
          added = true;
        }
      });

      if (added) {
        postCount++;
      }
    });
  }


  // ========================================================
  // LOAD ATOM FEED
  // ========================================================

  function loadFeed() {
    setStatus("Loading photos…");

    fetch(apiBase, {
      method: "GET",
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml"
      }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error(
            "Feed request failed: HTTP " + response.status
          );
        }

        return response.text();
      })
      .then(function (xml) {
        var parser = new DOMParser();

        var documentXML = parser.parseFromString(
          xml,
          "application/xml"
        );

        // Check for XML parsing errors.
        var parserError =
          documentXML.getElementsByTagName("parsererror")[0];

        if (parserError) {
          throw new Error("Invalid Atom XML received.");
        }

        var root = documentXML.documentElement;

        if (!root || root.localName !== "feed") {
          throw new Error("The response is not an Atom feed.");
        }

        // Obtain all Atom entries.
        var entries = Array.from(
          documentXML.getElementsByTagNameNS(
            ATOM_NAMESPACE,
            "entry"
          )
        );

        // Fallback for feeds without namespace recognition.
        if (!entries.length) {
          entries = Array.from(
            documentXML.getElementsByTagName("entry")
          );
        }

        if (!entries.length) {
          setStatus("No recent posts were found.");
          return;
        }

        renderEntries(entries);

        if (photoCount === 0) {
          setStatus(
            "No photos could be extracted from the feed."
          );

          return;
        }

        setStatus(
          "Showing " +
          photoCount +
          " photos from " +
          postCount +
          " recent posts."
        );
      })
      .catch(function (error) {
        console.error(
          "Pixelfed gallery error:",
          error
        );

        setStatus(
          "Unable to load Pixelfed photos. " +
          (error.message || "Please try again later.")
        );
      });
  }


  // ========================================================
  // INITIALIZE
  // ========================================================

  if (!username || username === "YOUR_USERNAME") {
    setStatus("Pixelfed is not configured in js/site.js.");
    return;
  }

  // Profile link.
  if (profileLink) {
    profileLink.href =
      base + "/@" + encodeURIComponent(username);

    profileLink.target = "_blank";
    profileLink.rel = "noopener noreferrer";
    profileLink.hidden = false;
  }

  // Atom feeds are a recent-post source rather than a
  // paginated archive, so hide the old Load More button.
  if (moreBtn) {
    moreBtn.hidden = true;
  }

  // Start gallery.
  loadFeed();

})();
