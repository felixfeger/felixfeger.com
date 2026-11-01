
/* ==========================================================================
   Felix Feger — Pixelfed Gallery
   Grouped posts, swipeable carousels, navigation dots and Load More.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     Configuration
     ------------------------------------------------------------------------ */

  const config = window.SITE?.pixelfed || {};

  const instance = config.instance || "pixelfed.social";
  const username = config.username || "felix_traveler";
  const apiBase = (config.apiBase || "/api/pixelfed").replace(/\/$/, "");

  const feedElement = document.getElementById("pixelfed-feed");
  const statusElement = document.getElementById("pixelfed-status");
  const moreButton = document.getElementById("pixelfed-more");

  if (!feedElement) return;

  const feedUrl = `${apiBase}/feed`;
  const profileUrl = `https://${instance}/@${username}`;

  const POSTS_PER_PAGE = 3;

  let allPosts = [];
  let visiblePosts = POSTS_PER_PAGE;

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */

  function setStatus(message, show = true) {
    if (!statusElement) return;

    statusElement.textContent = message;
    statusElement.hidden = !show;
  }

  function getElements(parent, selector) {
    return Array.from(parent.querySelectorAll(selector));
  }

  function getFirst(parent, selector) {
    return parent.querySelector(selector);
  }

  function cleanText(value) {
    const container = document.createElement("div");
    container.innerHTML = value || "";

    return (container.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getEntryText(entry, selector) {
    const element = getFirst(entry, selector);
    if (!element) return "";

    return element.textContent || "";
  }

  function normalizeUrl(url) {
    if (!url) return "";

    try {
      return new URL(url.trim(), `https://${instance}`).href;
    } catch {
      return "";
    }
  }

  function isImageUrl(url, type = "") {
    if (!url) return false;

    if (type.toLowerCase().startsWith("image/")) {
      return true;
    }

    return (
      /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(url) ||
      /\/(media|storage|photos|attachments)\//i.test(url) ||
      /[?&](format|fm)=(jpg|jpeg|png|webp|avif)/i.test(url)
    );
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  /* ------------------------------------------------------------------------
     Extract images from one Atom entry
     ------------------------------------------------------------------------ */

  function extractImages(entry) {
    const images = [];

    function addImage(url, type = "") {
      const normalized = normalizeUrl(url);

      if (!normalized || !isImageUrl(normalized, type)) {
        return;
      }

      images.push(normalized);
    }

    // Extract images from embedded HTML.
    ["content", "summary"].forEach((selector) => {
      const element = getFirst(entry, selector);
      if (!element) return;

      const html = element.textContent || "";
      const container = document.createElement("div");
      container.innerHTML = html;

      getElements(container, "img").forEach((img) => {
        addImage(
          img.getAttribute("src") ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-original"),
          img.getAttribute("type") || ""
        );
      });

      getElements(container, "source").forEach((source) => {
        addImage(
          source.getAttribute("src"),
          source.getAttribute("type") || ""
        );
      });
    });

    // Extract ActivityPub / Media RSS image elements.
    getElements(entry, "*").forEach((element) => {
      const name = (
        element.localName ||
        element.nodeName.split(":").pop()
      ).toLowerCase();

      const type = element.getAttribute("type") || "";

      const url =
        element.getAttribute("url") ||
        element.getAttribute("href");

      if (
        name === "content" ||
        name === "thumbnail" ||
        name === "image"
      ) {
        addImage(url, type);
      }
    });

    // Extract image enclosures and media links.
    getElements(entry, "link").forEach((link) => {
      const rel = (link.getAttribute("rel") || "").toLowerCase();
      const type = link.getAttribute("type") || "";
      const href = link.getAttribute("href");

      if (
        rel === "enclosure" ||
        type.toLowerCase().startsWith("image/")
      ) {
        addImage(href, type);
      }
    });

    return unique(images);
  }

  /* ------------------------------------------------------------------------
     Post information
     ------------------------------------------------------------------------ */

  function getPostLink(entry) {
    const links = getElements(entry, "link");

    const alternate = links.find((link) => {
      const rel = link.getAttribute("rel");
      return !rel || rel === "alternate";
    });

    if (alternate) {
      return normalizeUrl(alternate.getAttribute("href"));
    }

    const id = getEntryText(entry, "id");

    if (id.startsWith("http://") || id.startsWith("https://")) {
      return id;
    }

    return profileUrl;
  }

  function getPostDate(entry) {
    const published = getEntryText(entry, "published");
    const updated = getEntryText(entry, "updated");

    const value = published || updated;
    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(date) {
    if (!date) return "";

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(date);
  }

  function getPostCaption(entry) {
    const summary = getEntryText(entry, "summary");
    const content = getEntryText(entry, "content");

    return cleanText(summary || content);
  }

  /* ------------------------------------------------------------------------
     Create image carousel with navigation dots
     ------------------------------------------------------------------------ */

  function createMedia(images, postLink) {
    const wrapper = document.createElement("div");
    wrapper.className = "pf-media-wrapper";

    const media = document.createElement("div");
    media.className = "pf-post-media";

    if (images.length === 1) {
      media.classList.add("pf-single");
    }

    const dots = document.createElement("div");
    dots.className = "pf-dots";
    dots.setAttribute("aria-label", "Photo navigation");

    const dotButtons = [];

    images.forEach((imageUrl, index) => {
      const slide = document.createElement("div");
      slide.className = "pf-slide";

      const link = document.createElement("a");
      link.className = "pf-photo-link";
      link.href = postLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      link.setAttribute(
        "aria-label",
        `Open Pixelfed post, photo ${index + 1} of ${images.length}`
      );

      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = `Pixelfed post photo ${index + 1}`;
      image.loading = "lazy";
      image.decoding = "async";

      image.addEventListener("error", () => {
        slide.classList.add("pf-image-error");
      });

      link.appendChild(image);
      slide.appendChild(link);
      media.appendChild(slide);

      if (images.length > 1) {
        const dot = document.createElement("button");

        dot.type = "button";
        dot.className = index === 0
          ? "pf-dot is-active"
          : "pf-dot";

        dot.setAttribute("aria-label", `Show photo ${index + 1}`);
        dot.setAttribute(
          "aria-current",
          index === 0 ? "true" : "false"
        );

        dot.addEventListener("click", () => {
          slide.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "start"
          });
        });

        dots.appendChild(dot);
        dotButtons.push(dot);
      }
    });

    if (images.length > 1) {
      let scrollFrame = null;

      media.addEventListener("scroll", () => {
        if (scrollFrame) {
          cancelAnimationFrame(scrollFrame);
        }

        scrollFrame = requestAnimationFrame(() => {
          const slides = Array.from(
            media.querySelectorAll(".pf-slide")
          );

          const mediaRect = media.getBoundingClientRect();

          let activeIndex = 0;
          let smallestDistance = Infinity;

          slides.forEach((slide, index) => {
            const distance = Math.abs(
              slide.getBoundingClientRect().left - mediaRect.left
            );

            if (distance < smallestDistance) {
              smallestDistance = distance;
              activeIndex = index;
            }
          });

          dotButtons.forEach((dot, index) => {
            const active = index === activeIndex;

            dot.classList.toggle("is-active", active);
            dot.setAttribute(
              "aria-current",
              active ? "true" : "false"
            );
          });

          scrollFrame = null;
        });
      });

      wrapper.appendChild(media);
      wrapper.appendChild(dots);
    } else {
      wrapper.appendChild(media);
    }

    return wrapper;
  }

  /* ------------------------------------------------------------------------
     Create one complete post card
     ------------------------------------------------------------------------ */

  function createPost(entry) {
    const images = extractImages(entry);

    if (!images.length) {
      return null;
    }

    const postLink = getPostLink(entry);
    const caption = getPostCaption(entry);
    const date = getPostDate(entry);

    const article = document.createElement("article");
    article.className = "pf-item";

    article.appendChild(createMedia(images, postLink));

    const metadata = document.createElement("div");
    metadata.className = "pf-meta";

    if (caption) {
      const captionElement = document.createElement("p");
      captionElement.className = "pf-caption";
      captionElement.textContent = caption;

      metadata.appendChild(captionElement);
    }

    if (date) {
      const dateElement = document.createElement("time");
      dateElement.className = "pf-date";
      dateElement.dateTime = date.toISOString();
      dateElement.textContent = formatDate(date);

      metadata.appendChild(dateElement);
    }

    if (!caption && !date) {
      const fallback = document.createElement("a");

      fallback.className = "pf-date";
      fallback.href = postLink;
      fallback.target = "_blank";
      fallback.rel = "noopener noreferrer";
      fallback.textContent = "View on Pixelfed";

      metadata.appendChild(fallback);
    }

    article.appendChild(metadata);

    return article;
  }

  /* ------------------------------------------------------------------------
     Render visible posts
     ------------------------------------------------------------------------ */

  function renderPosts() {
    feedElement.replaceChildren();

    const visible = allPosts.slice(0, visiblePosts);

    visible.forEach((post) => {
      feedElement.appendChild(post);
    });

    if (moreButton) {
      const hasMore = visiblePosts < allPosts.length;

      moreButton.hidden = !hasMore;

      if (hasMore) {
        const remaining = allPosts.length - visiblePosts;

        moreButton.textContent = `Load more (${remaining} remaining)`;
      }
    }

    setStatus("", false);
  }

  /* ------------------------------------------------------------------------
     Load feed
     ------------------------------------------------------------------------ */

  async function loadPixelfed() {
    setStatus("Loading posts…");

    feedElement.setAttribute("aria-busy", "true");

    if (moreButton) {
      moreButton.hidden = true;
    }

    try {
      const response = await fetch(feedUrl, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/atom+xml, application/xml, text/xml"
        }
      });

      if (!response.ok) {
        throw new Error(`Feed request failed (${response.status})`);
      }

      const xmlText = await response.text();

      const parser = new DOMParser();

      const xml = parser.parseFromString(
        xmlText,
        "application/xml"
      );

      if (xml.querySelector("parsererror")) {
        throw new Error("The Pixelfed feed returned invalid XML.");
      }

      const entries = getElements(xml, "entry");

      allPosts = [];

      entries.forEach((entry) => {
        const post = createPost(entry);

        if (post) {
          allPosts.push(post);
        }
      });

      visiblePosts = POSTS_PER_PAGE;

      if (allPosts.length === 0) {
        setStatus(
          "No photo posts were found. Visit my Pixelfed profile to see more."
        );

        const profileLink = document.createElement("a");

        profileLink.href = profileUrl;
        profileLink.target = "_blank";
        profileLink.rel = "noopener noreferrer";
        profileLink.textContent = "View Pixelfed profile";

        statusElement?.appendChild(
          document.createTextNode(" ")
        );

        statusElement?.appendChild(profileLink);

        if (moreButton) {
          moreButton.hidden = true;
        }
      } else {
        renderPosts();
      }

    } catch (error) {
      console.error("Pixelfed gallery error:", error);

      feedElement.replaceChildren();

      setStatus(
        "Unable to load Pixelfed posts right now. Please try again later."
      );
    } finally {
      feedElement.setAttribute("aria-busy", "false");
    }
  }

  /* ------------------------------------------------------------------------
     Load More button
     ------------------------------------------------------------------------ */

  if (moreButton) {
    moreButton.addEventListener("click", () => {
      visiblePosts = Math.min(
        visiblePosts + POSTS_PER_PAGE,
        allPosts.length
      );

      renderPosts();
    });
  }

  /* ------------------------------------------------------------------------
     Initialize
     ------------------------------------------------------------------------ */

  loadPixelfed();

})();
