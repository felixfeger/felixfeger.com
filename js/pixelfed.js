// js/pixelfed.js
//
// Pixelfed photo gallery for photos.html.
//
// Uses Pixelfed's API to retrieve actual photo attachments.
// Images are rendered directly instead of using individual iframes,
// allowing CSS to crop them consistently.
//
// Features:
// - Automatic image cropping
// - Responsive gallery
// - One photo per row on mobile
// - Automatic infinite scrolling
// - Multiple photos per post
// - Click photos to open the original Pixelfed post
// - Fallback to the official Pixelfed profile embed

(function () {
  "use strict";

  var feed = document.getElementById("pixelfed-feed");
  if (!feed) return;

  var statusEl = document.getElementById("pixelfed-status");
  var moreBtn = document.getElementById("pixelfed-more");
  var profileLink = document.getElementById("pixelfed-profile-link");

  var cfg = (window.SITE && window.SITE.pixelfed) || {};

  var instance = String(cfg.instance || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  var username = String(cfg.username || "")
    .trim()
    .replace(/^@/, "");

  var PAGE_SIZE = 12;

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = message || "";
    }
  }

  if (!instance || !username || username === "YOUR_USERNAME") {
    setStatus(
      "Pixelfed isn't connected yet. Set your instance and username in js/site.js."
    );
    return;
  }

  var base = "https://" + instance;

  if (profileLink) {
    profileLink.href = base + "/@" + username;
    profileLink.hidden = false;
  }

  var accountId = cfg.accountId ? String(cfg.accountId) : null;

  var statusesPath = null;
  var nextMaxId = null;

  var loading = false;
  var done = false;

  var seen = {};
  var shown = 0;
  var embedScriptAdded = false;

  // Convert media URLs into safe absolute HTTP(S) URLs.
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

  // Retrieve JSON from Pixelfed.
  function getJSON(url) {
    return fetch(url, {
      headers: {
        Accept: "application/json"
      }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error(response.status + " " + url);
      }

      return response.json();
    });
  }

  // Try several API endpoints until one works.
  function firstSuccess(urls, pick) {
    return urls.reduce(function (chain, url) {
      return chain.catch(function () {
        return getJSON(url).then(function (json) {
          var value = pick(json, url);

          if (!value) {
            throw new Error("Unusable response");
          }

          return value;
        });
      });
    }, Promise.reject(new Error("start")));
  }

  // Find the Pixelfed account ID.
  function resolveAccountId() {
    if (accountId) {
      return Promise.resolve(accountId);
    }

    var name = encodeURIComponent(username);

    return firstSuccess(
      [
        base + "/api/v1/accounts/lookup?acct=" + name,
        base + "/api/v1.1/accounts/username/" + name
      ],
      function (json) {
        return json && json.id ? String(json.id) : null;
      }
    ).then(function (id) {
      accountId = id;
      return id;
    });
  }

  // Retrieve a page of photo posts.
  function fetchStatuses(maxId) {
    var query =
      "?limit=" +
      PAGE_SIZE +
      "&only_media=true" +
      (maxId ? "&max_id=" + encodeURIComponent(maxId) : "");

    var paths = [
      "/api/v1/accounts/" + accountId + "/statuses",
      "/api/pixelfed/v1/accounts/" + accountId + "/statuses"
    ];

    if (statusesPath) {
      paths = [statusesPath];
    }

    return firstSuccess(
      paths.map(function (path) {
        return base + path + query;
      }),
      function (json, url) {
        if (!Array.isArray(json)) {
          return null;
        }

        statusesPath = url.replace(base, "").split("?")[0];

        return {
          list: json
        };
      }
    );
  }

  // Generate the original Pixelfed post URL.
  function getPostURL(status) {
    if (status.url) {
      var originalURL = getMediaURL(status.url);

      if (originalURL) {
        return originalURL;
      }
    }

    var author =
      (status.account && status.account.username) || username;

    return (
      base +
      "/p/" +
      encodeURIComponent(author) +
      "/" +
      encodeURIComponent(status.id)
    );
  }

  // Create one gallery tile for each photo attachment.
  function createPhoto(status, attachment) {
    var imageURL = getMediaURL(
      attachment.preview_url || attachment.url
    );

    if (!imageURL) return false;

    // Don't try to display an unpreviewable video as an image.
    if (
      attachment.type &&
      attachment.type !== "image" &&
      !attachment.preview_url
    ) {
      return false;
    }

    var item = document.createElement("article");
    item.className = "pf-item";

    var link = document.createElement("a");
    link.className = "pf-photo-link";
    link.href = getPostURL(status);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute(
      "aria-label",
      "Open this photo on Pixelfed"
    );

    var image = document.createElement("img");

    image.src = imageURL;
    image.alt = attachment.description || "Photo from Pixelfed";
    image.loading = "lazy";
    image.decoding = "async";

    link.appendChild(image);
    item.appendChild(link);

    feed.appendChild(item);

    shown++;

    return true;
  }

  // Render posts into the gallery.
  function render(list) {
    var added = 0;

    list.forEach(function (status) {
      if (!status || !status.id || seen[status.id]) {
        return;
      }

      seen[status.id] = true;

      // Ignore boosts and replies.
      if (status.reblog || status.in_reply_to_id) {
        return;
      }

      var attachments = status.media_attachments || [];

      attachments.forEach(function (attachment) {
        if (createPhoto(status, attachment)) {
          added++;
        }
      });
    });

    return added;
  }

  // Load Pixelfed's official profile embed if the API fails.
  function addEmbedScript() {
    if (embedScriptAdded) return;

    embedScriptAdded = true;

    var script = document.createElement("script");

    script.async = true;
    script.defer = true;
    script.src = base + "/embed.js";

    document.head.appendChild(script);
  }

  function showFallback() {
    done = true;

    if (moreBtn) {
      moreBtn.hidden = true;
    }

    feed.innerHTML = "";
    feed.className = "pf-fallback";

    var frame = document.createElement("iframe");

    frame.className = "pixelfed__embed";
    frame.title = "Pixelfed profile";
    frame.src = base + "/" + encodeURIComponent(username) + "/embed";

    frame.loading = "lazy";

    frame.setAttribute("allowfullscreen", "allowfullscreen");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");

    feed.appendChild(frame);

    addEmbedScript();

    setStatus(
      "Showing my most recent posts. The full archive is on my Pixelfed profile."
    );
  }

  // Load the next page.
  function loadMore() {
    if (loading || done) {
      return Promise.resolve();
    }

    loading = true;

    if (moreBtn) {
      moreBtn.disabled = true;
    }

    setStatus(shown ? "Loading more photos…" : "Loading photos…");

    var previousCursor = nextMaxId;

    return resolveAccountId()
      .then(function () {
        return fetchStatuses(nextMaxId);
      })
      .then(function (result) {
        var list = result.list;

        if (list.length) {
          nextMaxId = String(list[list.length - 1].id);
        }

        var added = render(list);

        // Stop when there are no more posts or pagination
        // is no longer advancing.
        if (
          !list.length ||
          (previousCursor && nextMaxId === previousCursor)
        ) {
          done = true;

          if (moreBtn) {
            moreBtn.hidden = true;
          }

          setStatus(
            shown
              ? "That's every photo! " + shown + " photos in total."
              : "No photos yet."
          );

        } else {
          if (moreBtn) {
            moreBtn.hidden = false;
          }

          setStatus(
            added ? "" : "Looking for more photos…"
          );
        }
      })
      .catch(function () {
        if (shown) {
          if (moreBtn) {
            moreBtn.hidden = false;
          }

          setStatus("Couldn't load more photos right now.");
        } else {
          showFallback();
        }
      })
      .then(function () {
        loading = false;

        if (moreBtn) {
          moreBtn.disabled = false;
        }
      });
  }

  // Manual Load More button.
  if (moreBtn) {
    moreBtn.addEventListener("click", loadMore);
  }

  // Automatically load additional photos when the
  // Load More button approaches the visible screen.
  if ("IntersectionObserver" in window && moreBtn) {
    var observer = new IntersectionObserver(
      function (entries) {
        if (
          entries[0].isIntersecting &&
          !moreBtn.hidden &&
          !done
        ) {
          loadMore();
        }
      },
      {
        rootMargin: "600px"
      }
    );

    observer.observe(moreBtn);
  }

  // Initial load.
  loadMore();

})();
