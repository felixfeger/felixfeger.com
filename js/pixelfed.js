
/* ==========================================================
   FELIX FEGER — PIXELFED PHOTO GALLERY
   ==========================================================

   Source:
   Pixelfed public Atom feed

   API:
   /api/pixelfed/feed

   Features:
   - Same-domain Cloudflare Pages Function
   - Direct photo rendering
   - Automatic image cropping (CSS)
   - Responsive gallery
   - One photo per row on mobile
   - Multiple photos per post
   - Original Pixelfed post links
   - Post captions
   - Publication dates
   - Lazy image loading
   - XML/Atom parsing
   - Error handling

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

  var ATOM_NAMESPACE = "http://www.w3.org/2005/Atom";
  var MEDIA_NAMESPACE = "http://search.yahoo.com/mrss/";


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
  // CONVERT HTML INTO PLAIN TEXT
  // ========================================================

  function htmlToText(html) {
    if (!html) return "";

    var doc = new DOMParser().parseFromString(
      html,
      "text/html"
    );

    doc.querySelectorAll(
      "script, style, img, video, audio, iframe"
    ).forEach(function (element) {
      element.remove();
    });

    return (doc.body.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }


  // ========================================================
  // GET ATOM POST CONTENT
  // ========================================================

  function getContentHTML(entry) {
    var content = getChild(entry, "content");

    if (!content) return "";

    var type = content.getAttribute("type") || "text";

    if (
      type === "html" ||
      type === "text" ||
      type === "text/html"
    ) {
      return content.textContent || "";
    }

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
  // GET POST CAPTION
  // ========================================================

  function getCaption(entry) {

    // Try the Atom summary first.
    var summary = getText(entry, "summary");

    var caption = htmlToText(summary);

    if (caption) {
      return caption;
    }

    // Fall back to the full post content.
    var content = getContentHTML(entry);

    caption = htmlToText(content);

    if (caption) {
      return caption;
    }

    return "";
  }


  // ========================================================
  // GET PUBLICATION DATE
  // ========================================================

  function getEntryDate(entry) {

    // Prefer the original publication date.
    // Use updated only when published is unavailable.
    var raw =
      getText(entry, "published") ||
      getText(entry, "updated");

    if (!raw) {
      return {
        value: "",
        label: ""
      };
    }

    var date = new Date(raw);

    if (isNaN(date.getTime())) {
      return {
        value: "",
        label: ""
      };
    }

    return {
      value: date.toISOString(),

      // Format using the visitor's local timezone.
      label: new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
      }).format(date)
    };
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
    // 1. Extract images from Atom HTML content.
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

        // Try responsive image sources.
        if (!src) {
          var srcset = image.getAttribute("srcset");

          if (srcset) {
            var candidates = srcset
              .split(",")
              .map(function (item) {
                return item.trim().split(/\s+/)[0];
              });

            src = candidates[candidates.length - 1];
          }
        }

        addImage(
          src,
          image.getAttribute("alt") || ""
        );

      });
    }


    // ------------------------------------------------------
    // 2. Extract Media RSS images.
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
    // 3. Extract thumbnails if no full images were found.
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
    // 4. Extract image enclosure links.
    // ------------------------------------------------------

    if (!images.length) {

      getChildren(entry, "link").forEach(function (link) {

        var rel = link.getAttribute("rel") || "";
        var type = link.getAttribute("type") || "";

        if (
          rel === "enclosure" &&
          type.startsWith("image/")
        ) {
          addImage(
            link.getAttribute("href"),
            ""
          );
        }

      });

    }

    return images;
  }


  // ========================================================
  // GET ORIGINAL PIXELFED POST URL
  // ========================================================

  function getPostURL(entry) {

    var links = getChildren(entry, "link");

    for (var i = 0; i < links.length; i++) {

      var link = links[i];

      var rel = link.getAttribute("rel") || "alternate";

      if (rel === "alternate") {

        var url = safeURL(
          link.getAttribute("href")
        );

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
  // CREATE PHOTO TILE
  // ========================================================

  function createPhoto(imageData, postURL, caption, dateInfo) {

    if (loadedImages.has(imageData.url)) {
      return;
    }

    loadedImages.add(imageData.url);


    // ------------------------------------------------------
    // PHOTO CARD
    // ------------------------------------------------------

    var item = document.createElement("article");

    item.className = "pf-item";


    // ------------------------------------------------------
    // PHOTO LINK
    // ------------------------------------------------------

    var link = document.createElement("a");

    link.className = "pf-photo-link";
    link.href = postURL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    link.setAttribute(
      "aria-label",
      "View this photo on Pixelfed"
    );


    // ------------------------------------------------------
    // IMAGE
    // ------------------------------------------------------

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


    // ------------------------------------------------------
    // CAPTION AND DATE CONTAINER
    // ------------------------------------------------------

    var meta = document.createElement("div");

    meta.className = "pf-meta";


    // ------------------------------------------------------
    // CAPTION
    // ------------------------------------------------------

    if (caption) {

      var captionElement = document.createElement("p");

      captionElement.className = "pf-caption";

      captionElement.textContent = caption;

      meta.appendChild(captionElement);

    }


    // ------------------------------------------------------
    // DATE
    // ------------------------------------------------------

    if (dateInfo && dateInfo.label) {

      var dateElement = document.createElement("time");

      dateElement.className = "pf-date";

      dateElement.dateTime = dateInfo.value;

      dateElement.textContent = dateInfo.label;

      meta.appendChild(dateElement);

    }


    // Only add metadata when a caption or date exists.
    if (meta.childNodes.length) {
      item.appendChild(meta);
    }


    // ------------------------------------------------------
    // ADD TO GALLERY
    // ------------------------------------------------------

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

      var dateInfo = getEntryDate(entry);

      var added = false;


      // Each image receives its own tile.
      images.forEach(function (image) {

        if (!loadedImages.has(image.url)) {

          createPhoto(
            image,
            postURL,
            caption,
            dateInfo
          );

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


        // --------------------------------------------------
        // CHECK XML PARSING
        // --------------------------------------------------

        var parserError =
          documentXML.getElementsByTagName("parsererror")[0];

        if (parserError) {
          throw new Error("Invalid Atom XML received.");
        }


        // --------------------------------------------------
        // CHECK FEED ROOT
        // --------------------------------------------------

        var root = documentXML.documentElement;

        if (!root || root.localName !== "feed") {

          throw new Error(
            "The response is not a valid Atom feed."
          );

        }


        // --------------------------------------------------
        // GET ENTRIES
        // --------------------------------------------------

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


        // --------------------------------------------------
        // RENDER PHOTOS
        // --------------------------------------------------

        renderEntries(entries);


        // --------------------------------------------------
        // UPDATE STATUS
        // --------------------------------------------------

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

  if (
    !username ||
    username === "YOUR_USERNAME"
  ) {

    setStatus(
      "Pixelfed is not configured in js/site.js."
    );

    return;

  }


  // --------------------------------------------------------
  // PROFILE LINK
  // --------------------------------------------------------

  if (profileLink) {

    profileLink.href =
      base + "/@" + encodeURIComponent(username);

    profileLink.target = "_blank";

    profileLink.rel = "noopener noreferrer";

    profileLink.hidden = false;

  }


  // --------------------------------------------------------
  // HIDE OLD LOAD MORE BUTTON
  // --------------------------------------------------------

  // Atom feeds provide a limited recent-post collection,
  // rather than the paginated JSON API.

  if (moreBtn) {
    moreBtn.hidden = true;
  }


  // --------------------------------------------------------
  // START GALLERY
  // --------------------------------------------------------

  loadFeed();

})();
