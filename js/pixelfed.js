// js/pixelfed.js
//
// Used only by photos.html. Reads your Pixelfed account from js/site.js,
// pulls your public posts, and shows each one with Pixelfed's own embed.
// More posts load automatically as you scroll, so new posts show up on
// their own — nothing to update here when you post.
//
// If your instance doesn't allow this, the page falls back to Pixelfed's
// official profile embed (your most recent posts) instead of going blank.

(function () {
  "use strict";

  var feed = document.getElementById("pixelfed-feed");
  if (!feed) return;

  var statusEl = document.getElementById("pixelfed-status");
  var moreBtn = document.getElementById("pixelfed-more");
  var profileLink = document.getElementById("pixelfed-profile-link");

  var cfg = (window.SITE && window.SITE.pixelfed) || {};
  var instance = String(cfg.instance || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  var username = String(cfg.username || "").trim().replace(/^@/, "");
  var embed = Object.assign({ layout: "compact", caption: false, likes: false }, cfg.embed || {});
  var PAGE_SIZE = 12;

  function setStatus(msg) {
    statusEl.textContent = msg || "";
  }

  if (!instance || !username || username === "YOUR_USERNAME") {
    setStatus("Pixelfed isn’t connected yet. Set your instance and username in js/site.js.");
    return;
  }

  var base = "https://" + instance;
  profileLink.href = base + "/@" + username;
  profileLink.hidden = false;

  var accountId = cfg.accountId ? String(cfg.accountId) : null;
  var statusesPath = null; // remembers which API path worked
  var nextMaxId = null;
  var loading = false;
  var done = false;
  var seen = {};
  var shown = 0;
  var embedScriptAdded = false;

  function getJSON(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error(res.status + " " + url);
      return res.json();
    });
  }

  // Try each URL in order; resolve with the first usable result.
  function firstSuccess(urls, pick) {
    return urls.reduce(function (chain, url) {
      return chain.catch(function () {
        return getJSON(url).then(function (json) {
          var value = pick(json, url);
          if (!value) throw new Error("Unusable response from " + url);
          return value;
        });
      });
    }, Promise.reject(new Error("start")));
  }

  function resolveAccountId() {
    if (accountId) return Promise.resolve(accountId);
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

  function fetchStatuses(maxId) {
    var query = "?limit=" + PAGE_SIZE + "&only_media=true" + (maxId ? "&max_id=" + encodeURIComponent(maxId) : "");
    var paths = ["/api/v1/accounts/" + accountId + "/statuses", "/api/pixelfed/v1/accounts/" + accountId + "/statuses"];
    if (statusesPath) paths = [statusesPath];
    return firstSuccess(
      paths.map(function (p) {
        return base + p + query;
      }),
      function (json, url) {
        if (!Array.isArray(json)) return null;
        statusesPath = url.replace(base, "").split("?")[0];
        return { list: json };
      }
    );
  }

  function addEmbedScript() {
    if (embedScriptAdded) return;
    embedScriptAdded = true;
    var s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = base + "/embed.js";
    document.head.appendChild(s);
  }

  function embedSrc(status) {
    var author = (status.account && status.account.username) || username;
    return (
      base + "/p/" + encodeURIComponent(author) + "/" + encodeURIComponent(status.id) + "/embed" +
      "?caption=" + (embed.caption ? "true" : "false") +
      "&likes=" + (embed.likes ? "true" : "false") +
      "&layout=" + encodeURIComponent(embed.layout)
    );
  }

  // Adds new posts to the page. Returns how many posts were new to us.
  function render(list) {
    var fresh = 0;
    list.forEach(function (status) {
      if (!status || !status.id || seen[status.id]) return;
      seen[status.id] = true;
      fresh++;
      if (status.reblog || status.in_reply_to_id) return; // only my own top-level posts

      var item = document.createElement("div");
      item.className = "pf-item";
      var frame = document.createElement("iframe");
      frame.className = "pixelfed__embed";
      frame.title = "Pixelfed post";
      frame.src = embedSrc(status);
      frame.loading = "lazy";
      frame.setAttribute("width", "100%");
      frame.setAttribute("allowfullscreen", "allowfullscreen");
      item.appendChild(frame);
      feed.appendChild(item);
      shown++;
    });
    return fresh;
  }

  function showFallback() {
    done = true;
    moreBtn.hidden = true;
    feed.innerHTML = "";
    feed.className = "pf-fallback";
    var frame = document.createElement("iframe");
    frame.className = "pixelfed__embed";
    frame.title = "Pixelfed profile";
    frame.src = base + "/" + encodeURIComponent(username) + "/embed";
    frame.loading = "lazy";
    frame.setAttribute("width", "100%");
    frame.setAttribute("allowfullscreen", "allowfullscreen");
    feed.appendChild(frame);
    addEmbedScript();
    setStatus("Showing my most recent posts. The full archive is on my Pixelfed profile.");
  }

  function loadMore() {
    if (loading || done) return Promise.resolve();
    loading = true;
    moreBtn.disabled = true;
    setStatus(shown ? "Loading more…" : "Loading posts…");

    return resolveAccountId()
      .then(function () {
        return fetchStatuses(nextMaxId);
      })
      .then(function (result) {
        var list = result.list;
        if (list.length) nextMaxId = list[list.length - 1].id;
        var fresh = render(list);
        addEmbedScript();
        if (!list.length || !fresh) {
          done = true;
          moreBtn.hidden = true;
          setStatus(shown ? "That’s every post, " + shown + " in total." : "No posts yet.");
        } else {
          moreBtn.hidden = false;
          setStatus("");
        }
      })
      .catch(function () {
        if (shown) {
          moreBtn.hidden = false;
          setStatus("Couldn’t load more posts right now.");
        } else {
          showFallback();
        }
      })
      .then(function () {
        loading = false;
        moreBtn.disabled = false;
      });
  }

  moreBtn.addEventListener("click", loadMore);

  // Load the next batch automatically as the button nears the screen.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entries) {
        if (entries[0].isIntersecting && !moreBtn.hidden) loadMore();
      },
      { rootMargin: "600px" }
    ).observe(moreBtn);
  }

  loadMore();
})();
