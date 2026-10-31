
// js/pixelfed.js
//
// Felix Feger — Pixelfed Photo Gallery
//
// Features:
// - Same-domain Cloudflare Pages API proxy
// - Direct photo rendering (no individual post iframes)
// - Automatic image cropping
// - Responsive gallery
// - Infinite scrolling
// - Multiple photos per post
// - Click photos to open original Pixelfed posts
// - Manual Load More button
// - Error handling
//
// API:
// https://felixfeger.com/api/pixelfed/
//
// Configuration is read from js/site.js.

(function () {
  "use strict";

  var feed = document.getElementById("pixelfed-feed");
  if (!feed) return;

  var statusEl = document.getElementById("pixelfed-status");
  var moreBtn = document.getElementById("pixelfed-more");
  var profileLink = document.getElementById("pixelfed-profile-link");

  // =========================================
  // CONFIGURATION
  // =========================================

  var cfg = (window.SITE && window.SITE.pixelfed) || {};

  var instance = String(cfg.instance || "pixelfed.social")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  var username = String(cfg.username || "")
    .trim()
    .replace(/^@/, "");

  var apiBase = String(
    cfg.apiBase || "/api/pixelfed"
  ).trim().replace(/\/+$/, "");

  var PAGE_SIZE = 12;

  var base = "https://" + instance;

  // =========================================
  // STATE
  // =========================================

  var accountId = cfg.accountId
    ? String(cfg.accountId)
    : null;

  var statusesPath = null;
  var nextMaxId = null;

  var loading = false;
  var done = false;

  var seen = new Set();
  var shown = 0;

  var observer = null;

  // =========================================
  // HELPERS
  // =========================================

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = message || "";
    }
  }

  function setLoadMoreVisible(visible) {
    if (moreBtn) {
      moreBtn.hidden = !visible;
    }
  }

  function setLoading(value) {
    loading = value;

    if (moreBtn) {
      moreBtn.disabled = value;
    }
  }

  function getJSON(url) {
    return fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error(
          "API request failed: HTTP " + response.status
        );
      }

      return response.json();
    });
  }

  // Try API endpoints in order.
  function firstSuccess(urls, pick) {
    return urls.reduce(function (chain, url) {
      return chain.catch(function () {
        return getJSON(url).then(function (json) {
          var value = pick(json, url);

          if (!value) {
            throw new Error("Invalid API response");
          }

          return value;
        });
      });
    }, Promise.reject(new Error("Starting API lookup")));
  }

  // =========================================
  // ACCOUNT LOOKUP
  // =========================================

  function resolveAccountId() {
    if (accountId) {
      return Promise.resolve(accountId);
    }

    var name = encodeURIComponent(username);

    return firstSuccess(
      [
        apiBase +
          "/api/v1/accounts/lookup?acct=" + name,

        apiBase +
          "/api/v1.1/accounts/username/" + name
      ],
      function (json) {
        return json && json.id
          ? String(json.id)
          : null;
      }
    ).then(function (id) {
      accountId = id;
      return id;
    });
  }

  // =========================================
  // FETCH POSTS
  // =========================================

  function fetchStatuses(maxId) {
    var query =
      "?limit=" + PAGE_SIZE +
      "&only_media=true" +
      (maxId
        ? "&max_id=" + encodeURIComponent(maxId)
        : "");

    var paths = [
      "/api/v1/accounts/" +
        accountId +
        "/statuses",

      "/api/pixelfed/v1/accounts/" +
        accountId +
        "/statuses"
    ];

    if (statusesPath) {
      paths = [statusesPath];
    }

    return firstSuccess(
      paths.map(function (path) {
        return apiBase + path + query;
      }),
      function (json, url) {
        if (!Array.isArray(json)) {
          return null;
        }

        statusesPath = url
          .replace(apiBase, "")
          .split("?")[0];

        return {
          list: json
        };
      }
    );
  }

  // =========================================
  // PHOTO URLS
  // =========================================

  function getMediaURL(value) {
    if (!value) return "";

    try {
      var url = new URL(value, base + "/");

      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
      ) {
        return "";
      }

      return url.href;

    } catch (error) {
      return "";
    }
  }

  function getPostURL(status) {
    var author =
      (status.account && status.account.username) ||
      username;

    var originalURL = getMediaURL(status.url);

    if (originalURL) {
      return originalURL;
    }

    return (
      base +
      "/p/" +
      encodeURIComponent(author) +
      "/" +
      encodeURIComponent(status.id)
    );
  }

  // =========================================
  // CREATE PHOTO TILE
  // =========================================

  function createPhoto(status, attachment) {
    if (!attachment) return false;

    // Only display image attachments.
    // Videos can be added separately later.
    if (
      attachment.type &&
      attachment.type !== "image"
    ) {
      return false;
    }

    var imageURL = getMediaURL(
      attachment.preview_url || attachment.url
    );

    if (!imageURL) return false;

    var item = document.createElement("article");
    item.className = "pf-item";

    var link = document.createElement("a");

    link.className = "pf-photo-link";
    link.href = getPostURL(status);
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    link.setAttribute(
      "aria-label",
      "View photo on Pixelfed"
    );

    var image = document.createElement("img");

    image.src = imageURL;

    image.alt =
      attachment.description ||
      status.content?.replace(/<[^>]*>/g, "").trim() ||
      "Photo from Pixelfed";

    image.loading = "lazy";
    image.decoding = "async";

    image.addEventListener("error", function () {
      item.remove();
    });

    link.appendChild(image);
    item.appendChild(link);

    feed.appendChild(item);

    shown++;

    return true;
  }

  // =========================================
  // RENDER POSTS
  // =========================================

  function render(list) {
    var added = 0;

    list.forEach(function (status) {
      if (
        !status ||
        !status.id ||
        seen.has(String(status.id))
      ) {
        return;
      }

      seen.add(String(status.id));

      // Ignore boosts and replies.
      if (
        status.reblog ||
        status.in_reply_to_id
      ) {
        return;
      }

      var attachments =
        status.media_attachments || [];

      attachments.forEach(function (attachment) {
        if (createPhoto(status, attachment)) {
          added++;
        }
      });
    });

    return added;
  }

  // =========================================
  // LOAD MORE POSTS
  // =========================================

  function loadMore() {
    if (loading || done) {
      return Promise.resolve();
    }

    setLoading(true);

    setStatus(
      shown
        ? "Loading more photos…"
        : "Loading photos…"
    );

    var previousCursor = nextMaxId;

    return resolveAccountId()
      .then(function () {
        return fetchStatuses(nextMaxId);
      })
      .then(function (result) {
        var list = result.list;

        if (list.length) {
          nextMaxId = String(
            list[list.length - 1].id
          );
        }

        var added = render(list);

        // No more posts.
        if (
          !list.length ||
          (
            previousCursor &&
            nextMaxId === previousCursor
          )
        ) {
          done = true;

          setLoadMoreVisible(false);

          setStatus(
            shown
              ? "You've reached the end! " +
                shown +
                " photos displayed."
              : "No photos found."
          );

          return;
        }

        // Continue pagination even if a page contained
        // posts without usable images.
        setLoadMoreVisible(true);

        setStatus(
          added
            ? ""
            : "Looking for more photos…"
        );

      })
      .catch(function (error) {
        console.error(
          "Pixelfed gallery error:",
          error
        );

        setStatus(
          "Unable to load photos. " +
          (error.message || "Please try again later.")
        );

        setLoadMoreVisible(true);

      })
      .then(function () {
        setLoading(false);
      });
  }

  // =========================================
  // LOAD MORE BUTTON
  // =========================================

  if (moreBtn) {
    moreBtn.addEventListener("click", function () {
      loadMore();
    });
  }

  // =========================================
  // AUTOMATIC INFINITE SCROLL
  // =========================================

  if (
    "IntersectionObserver" in window &&
    moreBtn
  ) {
    observer = new IntersectionObserver(
      function (entries) {
        if (
          entries[0].isIntersecting &&
          !moreBtn.hidden &&
          !loading &&
          !done
        ) {
          loadMore();
        }
      },
      {
        rootMargin: "600px 0px"
      }
    );

    observer.observe(moreBtn);
  }

  // =========================================
  // PROFILE LINK
  // =========================================

  if (profileLink) {
    profileLink.href =
      base + "/@" + encodeURIComponent(username);

    profileLink.target = "_blank";
    profileLink.rel = "noopener noreferrer";
    profileLink.hidden = false;
  }

  // =========================================
  // INITIALIZE
  // =========================================

  if (!username || username === "YOUR_USERNAME") {
    setStatus(
      "Pixelfed isn't configured. Check js/site.js."
    );

    return;
  }

  setLoadMoreVisible(false);

  loadMore();

})();
