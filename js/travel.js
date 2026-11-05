// js/travel.js
//
// Used by travel.html and travel-archive.html. Both pages are drawn from
// the single list of trips below, so they always look and read the same.
// Change how a trip looks and it changes on both pages. (The styling itself
// lives in css/style.css, under the "Travel page" section.)
//
//   travel.html          shows the newest LATEST_COUNT trips
//   travel-archive.html  shows every trip in the list
//
// TO ADD A TRIP
//   1. Copy the commented-out template below, paste it at the TOP of the
//      TRIPS list (newest first), remove the // marks, and fill it in.
//   2. That's it. Travel shows your newest three automatically, and the
//      older ones stay in the archive. Nothing gets deleted.
//
// Where to find the two MyAlbum links:
//   album:  the album's web address, e.g. https://myalbum.com/album/XXXX/
//   invite: the code after "?invite=" in the album's share link
//           (optional; leave it out if the album has none)

(function () {

  "use strict";

  var LATEST_COUNT = 3;

  var TRIPS = [

    // ---- TEMPLATE: copy, paste at the top of this list, remove the // ----
    // {
    //   title: "Trip Name",
    //   date: "Month Year",
    //   blurb: "One line about the trip",
    //   album: "https://myalbum.com/album/ALBUM_ID/",
    //   invite: "INVITE_CODE"
    // },
    // -----------------------------------------------------------------------

    {
      title: "Maui, Hawaii",
      date: "June 2026",
      blurb: "Beaches, the Road to Hana, and sunrise at Haleak\u0101l\u0101",
      album: "https://myalbum.com/album/VWvnL6hRPBHpXx/",
      invite: "5a668f1a-1530-4791-b2ea-b8a29dc6ee97"
    },

    {
      title: "Sequoia National Park",
      date: "March 2026",
      blurb: "Giant sequoias and mountain air",
      album: "https://myalbum.com/album/jTndRV8FNsUWZU/",
      invite: "68902ca5-0946-4488-8332-28887c9a4b27"
    },

    {
      title: "Belgium & Paris, France",
      date: "January 2026",
      blurb: "Some of the best chocolate in Bruges, Belgium!",
      album: "https://myalbum.com/album/fK6YogaoCovWTS/",
      invite: "72f0f390-50ed-4c1e-bd18-b2afe21eed82"
    },

    {
      title: "Las Vegas, Nevada",
      date: "November 2025",
      blurb: "My first visit to the strip.",
      album: "https://myalbum.com/album/xJFNGtac5mVdki/",
      invite: "0942f44d-0cb2-4792-85f2-f47408cd2053"
    },

    {
      title: "Oahu, Hawaii",
      date: "June 2025",
      blurb: "My favorite island.",
      album: "https://myalbum.com/album/JxCCr99qMMBGng/",
      invite: "917c2c83-6e7b-4aab-a9f0-28a1f307da7c"
    }

  ];


  // --------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------

  function make(tag, className, text) {

    var node = document.createElement(tag);

    if (className) node.className = className;

    if (text) node.textContent = text;

    return node;

  }

  // Album addresses always end with a slash.
  function albumBase(trip) {
    return String(trip.album || "").replace(/\/*$/, "/");
  }

  function albumCover(trip) {
    return albumBase(trip) + "cover?size=1000";
  }

  function albumFullLink(trip) {
    return albumBase(trip) + (trip.invite ? "?invite=" + trip.invite : "");
  }


  // --------------------------------------------------------
  // TRAVEL PAGE: the latest trips, each with its album cover
  // --------------------------------------------------------

  function renderLatest(placeholder) {

    var fragment = document.createDocumentFragment();

    TRIPS.slice(0, LATEST_COUNT).forEach(function (trip) {

      var section = make("section");
      var wrap = make("div", "wrap");
      var block = make("div", "trip-block");

      block.appendChild(make("h2", null, trip.title));
      block.appendChild(make("p", "trip-meta", trip.blurb));

      var frame = make("div", "embed-frame");

      var a = make("a");

      a.href = albumBase(trip);
      a.target = "_blank";
      a.rel = "noopener noreferrer";

      var img = make("img");

      img.src = albumCover(trip);
      img.width = 850;
      img.alt = trip.title + " \u2014 album cover";
      img.loading = "lazy";

      a.appendChild(img);
      frame.appendChild(a);
      block.appendChild(frame);
      wrap.appendChild(block);
      section.appendChild(wrap);
      fragment.appendChild(section);

    });

    // Link to the archive once there is more than the latest few.
    if (TRIPS.length > LATEST_COUNT) {

      var ctaSection = make("section");
      var ctaWrap = make("div", "wrap");

      ctaWrap.style.textAlign = "center";

      var cta = make("a", "btn btn-teal", "View full archive \u203A");

      cta.href = "travel-archive.html";

      ctaWrap.appendChild(cta);
      ctaSection.appendChild(ctaWrap);
      fragment.appendChild(ctaSection);

    }

    // The sections replace the placeholder, so they sit directly inside
    // <main> next to the page header, exactly like hand-written ones.
    placeholder.replaceWith(fragment);

  }


  // --------------------------------------------------------
  // ARCHIVE PAGE: every trip, newest first
  // --------------------------------------------------------

  function renderArchive(list) {

    TRIPS.forEach(function (trip) {

      var article = make("article", "post-item");

      article.appendChild(make("div", "date", trip.date));
      article.appendChild(make("h2", null, trip.title));
      article.appendChild(make("p", null, trip.blurb));

      var a = make("a", "read-more", "View full album \u203A");

      a.href = albumFullLink(trip);

      article.appendChild(a);
      list.appendChild(article);

    });

  }


  // --------------------------------------------------------
  // START
  // --------------------------------------------------------

  function init() {

    var latest = document.querySelector('[data-travel="latest"]');

    if (latest) renderLatest(latest);

    var archive = document.querySelector('[data-travel="archive"]');

    if (archive) renderArchive(archive);

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();