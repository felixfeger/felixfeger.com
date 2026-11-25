// js/planes.js
//
// Live plane map for planes.html.
//
//   - Polls /api/adsb/aircraft (see functions/api/adsb/) every couple of
//     seconds. That's the Pi's dump1090 aircraft.json, relayed.
//   - Draws planes on an OpenFreeMap basemap using MapLibre GL.
//   - Everything you're likely to want to change is in CONFIG below.
//
// Testing without the Pi: open planes.html?demo  (fake planes, no network).
// Testing against a different feed: planes.html?src=https://example.com/aircraft.json

(function () {

  "use strict";

  // ---- Settings --------------------------------------------------------

  var CONFIG = {
    aircraftUrl: "/api/adsb/aircraft",
    receiverUrl: "/api/adsb/receiver",

    pollMs: 2000,            // how often to ask for new data
    staleSec: 60,            // hide aircraft not heard from in this long
    trailPoints: 80,         // positions remembered per aircraft
    offlineAfterMs: 15000,   // no fresh data for this long = "offline"

    // OpenFreeMap styles: positron (light, quiet), bright, liberty.
    style: "https://tiles.openfreemap.org/styles/positron",

    // Used until the receiver's own position is known.
    fallbackCenter: [-119.5, 36.7],
    fallbackZoom: 6,
    startZoom: 8,

    rangeRingsNm: [25, 50, 100, 150]
  };

  var params = new URLSearchParams(window.location.search);
  var DEMO = params.has("demo");
  if (params.get("src")) CONFIG.aircraftUrl = params.get("src");


  // ---- Tiny helpers ----------------------------------------------------

  function $(id) { return document.getElementById(id); }

  var NM_KM = 1.852;
  var R_KM = 6371.0088;

  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }

  // Great-circle distance in nautical miles.
  function distNm(lat1, lon1, lat2, lon2) {
    var dLat = rad(lat2 - lat1);
    var dLon = rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_KM * Math.asin(Math.sqrt(a)) / NM_KM;
  }

  // Points of a circle of `nm` nautical miles around a centre.
  function circle(lat, lon, nm, steps) {
    var d = nm * NM_KM / R_KM;
    var out = [];
    for (var i = 0; i <= steps; i++) {
      var b = 2 * Math.PI * i / steps;
      var la = Math.asin(Math.sin(rad(lat)) * Math.cos(d) +
                         Math.cos(rad(lat)) * Math.sin(d) * Math.cos(b));
      var lo = rad(lon) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(rad(lat)),
                                     Math.cos(d) - Math.sin(rad(lat)) * Math.sin(la));
      out.push([deg(lo), deg(la)]);
    }
    return out;
  }

  // Altitude -> colour. Low = orange, high = purple. Unknown = grey.
  function altColor(alt) {
    if (alt === "ground") return "hsl(0, 0%, 50%)";
    if (typeof alt !== "number") return "hsl(0, 0%, 58%)";
    var h = 15 + (Math.max(0, Math.min(alt, 42000)) / 42000) * 265;
    return "hsl(" + Math.round(h) + ", 85%, 50%)";
  }

  function num(v) { return typeof v === "number" && isFinite(v); }

  function fmtAlt(a) {
    if (a === "ground") return "On ground";
    if (!num(a)) return "–";
    return Math.round(a).toLocaleString() + " ft";
  }

  function fmtAltShort(a) {
    if (a === "ground") return "GND";
    if (!num(a)) return "–";
    return a >= 18000 ? "FL" + Math.round(a / 100) : Math.round(a).toLocaleString();
  }

  function fmtSpeed(s) { return num(s) ? Math.round(s) + " kt" : "–"; }

  function fmtTrack(t) { return num(t) ? Math.round(t) + "°" : "–"; }

  function fmtDist(d) { return num(d) ? d.toFixed(d < 10 ? 1 : 0) + " nm" : "–"; }

  function fmtVr(v) {
    if (!num(v)) return "–";
    if (Math.abs(v) < 64) return "Level";
    return (v > 0 ? "▲ " : "▼ ") + Math.abs(Math.round(v)).toLocaleString() + " ft/min";
  }

  function fmtSeen(s) {
    if (!num(s)) return "–";
    return s < 2 ? "just now" : Math.round(s) + " s ago";
  }


  // ---- State -----------------------------------------------------------

  var map = null;
  var mapReady = false;
  var receiver = null;          // { lat, lon }
  var receiverMarker = null;
  var planes = {};              // hex -> { d, marker, el, label, svg, trail }
  var selectedHex = null;
  var maxRangeNm = 0;
  var lastMessages = null;      // for msgs/sec
  var lastMessagesAt = 0;
  var lastNow = null;
  var lastNowChange = Date.now();
  var lastOk = 0;
  var centred = false;

  var opts = {
    trails: $("opt-trails"),
    rings: $("opt-rings"),
    labels: $("opt-labels"),
    follow: $("opt-follow")
  };


  // ---- Normalise a dump1090 aircraft record -----------------------------
  //
  // Newer dump1090-fa / readsb use alt_baro, gs, baro_rate, seen_pos.
  // Older dump1090 (mutability, data.json) uses altitude, speed, vert_rate.

  function norm(a) {
    return {
      hex: String(a.hex || "").toLowerCase(),
      flight: String(a.flight || "").trim(),
      alt: a.alt_baro !== undefined ? a.alt_baro : (a.altitude !== undefined ? a.altitude : null),
      gs: a.gs !== undefined ? a.gs : a.speed,
      track: a.track,
      lat: a.lat,
      lon: a.lon,
      seen: num(a.seen) ? a.seen : 0,
      seenPos: a.seen_pos,
      squawk: a.squawk,
      rssi: a.rssi,
      vr: a.baro_rate !== undefined ? a.baro_rate :
          (a.geom_rate !== undefined ? a.geom_rate : a.vert_rate),
      reg: a.r,
      type: a.t
    };
  }

  function hasPosition(d) {
    if (!num(d.lat) || !num(d.lon)) return false;
    if (num(d.seenPos) && d.seenPos > CONFIG.staleSec) return false;
    return true;
  }

  function title(d) {
    return d.flight || d.reg || d.hex.toUpperCase();
  }


  // ---- Map --------------------------------------------------------------

  function initMap() {
    map = new maplibregl.Map({
      container: "map",
      style: CONFIG.style,
      center: CONFIG.fallbackCenter,
      zoom: CONFIG.fallbackZoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();

    map.on("load", function () {
      map.addSource("trails", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "trails",
        type: "line",
        source: "trails",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2.2,
          "line-opacity": 0.8
        }
      });

      map.addSource("rings", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "rings",
        type: "line",
        source: "rings",
        paint: {
          "line-color": "#3E6B6B",
          "line-width": 1,
          "line-opacity": 0.55,
          "line-dasharray": [3, 3]
        }
      }, "trails");

      mapReady = true;
      drawRings();
      drawTrails();
      applyToggles();
    });

    map.on("click", function (e) {
      // A click on empty map (not on a plane marker) deselects.
      if (!e.originalEvent.target.closest(".plane-marker")) select(null);
    });

    // Dragging the map by hand stops "follow".
    map.on("dragstart", function () { opts.follow.checked = false; });
  }

  function emptyFC() { return { type: "FeatureCollection", features: [] }; }

  function drawRings() {
    if (!mapReady) return;
    var fc = emptyFC();
    if (receiver) {
      CONFIG.rangeRingsNm.forEach(function (nm) {
        fc.features.push({
          type: "Feature",
          properties: { nm: nm },
          geometry: { type: "LineString", coordinates: circle(receiver.lat, receiver.lon, nm, 120) }
        });
      });
    }
    map.getSource("rings").setData(fc);
  }

  function drawTrails() {
    if (!mapReady) return;
    var fc = emptyFC();
    Object.keys(planes).forEach(function (hex) {
      var t = planes[hex].trail;
      for (var i = 1; i < t.length; i++) {
        fc.features.push({
          type: "Feature",
          properties: { color: altColor(t[i][2]) },
          geometry: { type: "LineString", coordinates: [[t[i - 1][0], t[i - 1][1]], [t[i][0], t[i][1]]] }
        });
      }
    });
    map.getSource("trails").setData(fc);
  }

  function applyToggles() {
    if (!mapReady) return;
    map.setLayoutProperty("trails", "visibility", opts.trails.checked ? "visible" : "none");
    map.setLayoutProperty("rings", "visibility", opts.rings.checked ? "visible" : "none");
    $("map").classList.toggle("hide-labels", !opts.labels.checked);
  }

  function setReceiver(r) {
    if (!r || !num(r.lat) || !num(r.lon)) return;
    receiver = { lat: r.lat, lon: r.lon };

    if (!receiverMarker) {
      var el = document.createElement("div");
      el.className = "receiver-marker";
      el.title = "Receiver";
      receiverMarker = new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map);
    } else {
      receiverMarker.setLngLat([r.lon, r.lat]);
    }

    if (!centred) {
      centred = true;
      map.jumpTo({ center: [r.lon, r.lat], zoom: CONFIG.startZoom });
    }

    drawRings();
  }


  // ---- Markers ----------------------------------------------------------

  var PLANE_PATH = "M12 2 L13.5 9 L22 14 L22 16 L13.5 13.5 L13 19 L16 21 L16 22.5 L12 21.5 L8 22.5 L8 21 L11 19 L10.5 13.5 L2 16 L2 14 L10.5 9 Z";

  function makeMarker(hex) {
    var el = document.createElement("div");
    el.className = "plane-marker";

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", PLANE_PATH);
    path.setAttribute("stroke", "rgba(0,0,0,0.55)");
    path.setAttribute("stroke-width", "0.8");
    svg.appendChild(path);

    var label = document.createElement("span");
    label.className = "plane-label";

    el.appendChild(svg);
    el.appendChild(label);

    el.addEventListener("click", function (e) {
      e.stopPropagation();
      select(hex);
    });

    var marker = new maplibregl.Marker({ element: el }).setLngLat([0, 0]).addTo(map);

    return { marker: marker, el: el, svg: svg, path: path, label: label };
  }

  function updateMarker(p) {
    var d = p.d;
    p.marker.setLngLat([d.lon, d.lat]);
    p.path.setAttribute("fill", altColor(d.alt));
    p.svg.style.transform = "rotate(" + (num(d.track) ? d.track : 0) + "deg)";
    p.label.textContent = title(d) + " · " + fmtAltShort(d.alt);
    p.el.classList.toggle("selected", p.d.hex === selectedHex);
  }


  // ---- Selection and detail panel ---------------------------------------

  function select(hex) {
    selectedHex = hex && planes[hex] ? hex : null;

    Object.keys(planes).forEach(function (h) {
      planes[h].el.classList.toggle("selected", h === selectedHex);
    });

    if (!selectedHex) opts.follow.checked = false;

    if (selectedHex && num(planes[selectedHex].d.lat)) {
      map.easeTo({ center: [planes[selectedHex].d.lon, planes[selectedHex].d.lat], duration: 600 });
    }

    renderDetail();
    renderList();
  }

  function distOf(d) {
    return receiver && num(d.lat) ? distNm(receiver.lat, receiver.lon, d.lat, d.lon) : null;
  }

  function renderDetail() {
    var box = $("detail");
    if (!selectedHex || !planes[selectedHex]) { box.hidden = true; return; }

    var d = planes[selectedHex].d;
    box.hidden = false;

    $("d-title").textContent = title(d);

    var sub = [d.hex.toUpperCase()];
    if (d.reg && d.reg !== title(d)) sub.push(d.reg);
    if (d.type) sub.push(d.type);
    $("d-sub").textContent = sub.join(" · ");

    $("d-alt").textContent = fmtAlt(d.alt);
    $("d-gs").textContent = fmtSpeed(d.gs);
    $("d-track").textContent = fmtTrack(d.track);
    $("d-vr").textContent = fmtVr(d.vr);
    $("d-dist").textContent = fmtDist(distOf(d));
    $("d-squawk").textContent = d.squawk || "–";
    $("d-rssi").textContent = num(d.rssi) ? d.rssi.toFixed(1) + " dBFS" : "–";
    $("d-seen").textContent = fmtSeen(d.seen);
  }


  // ---- List -------------------------------------------------------------

  function renderList() {
    var tbody = $("list");
    var sortBy = $("sort").value;

    var rows = Object.keys(planes).map(function (h) {
      var d = planes[h].d;
      return { d: d, dist: distOf(d) };
    });

    function key(r) {
      if (sortBy === "alt") return num(r.d.alt) ? -r.d.alt : (r.d.alt === "ground" ? 1e9 : 1e9 + 1);
      if (sortBy === "gs") return num(r.d.gs) ? -r.d.gs : 1e9;
      return num(r.dist) ? r.dist : 1e9;
    }

    rows.sort(function (a, b) { return key(a) - key(b); });

    tbody.textContent = "";

    rows.forEach(function (r) {
      var d = r.d;
      var tr = document.createElement("tr");
      tr.setAttribute("data-hex", d.hex);
      if (d.hex === selectedHex) tr.className = "selected";

      var td1 = document.createElement("td");
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = altColor(d.alt);
      td1.appendChild(sw);
      td1.appendChild(document.createTextNode(title(d)));

      var td2 = document.createElement("td");
      td2.textContent = fmtAltShort(d.alt);

      var td3 = document.createElement("td");
      td3.textContent = num(d.gs) ? Math.round(d.gs) : "–";

      var td4 = document.createElement("td");
      td4.textContent = num(r.dist) ? (r.dist < 10 ? r.dist.toFixed(1) : Math.round(r.dist)) : "–";

      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
      tbody.appendChild(tr);
    });

    $("list-empty").hidden = rows.length > 0;
  }


  // ---- Applying a data update --------------------------------------------

  function handle(data) {
    var nowMs = Date.now();

    if (data.now !== lastNow) {
      lastNow = data.now;
      lastNowChange = nowMs;
    }

    var seen = {};
    var total = 0;
    var onMap = 0;

    (data.aircraft || []).forEach(function (raw) {
      var d = norm(raw);
      if (!d.hex) return;
      if (d.seen > CONFIG.staleSec) return;

      total++;
      if (!hasPosition(d)) return;
      onMap++;
      seen[d.hex] = true;

      var p = planes[d.hex];
      if (!p) {
        p = planes[d.hex] = makeMarker(d.hex);
        p.trail = [];
      }
      p.d = d;
      updateMarker(p);

      var last = p.trail[p.trail.length - 1];
      if (!last || last[0] !== d.lon || last[1] !== d.lat) {
        p.trail.push([d.lon, d.lat, d.alt]);
        if (p.trail.length > CONFIG.trailPoints) p.trail.shift();
      }

      var dn = distOf(d);
      if (num(dn) && dn > maxRangeNm && dn < 500) maxRangeNm = dn;
    });

    // Remove planes that dropped out of the feed.
    Object.keys(planes).forEach(function (hex) {
      if (!seen[hex]) {
        planes[hex].marker.remove();
        delete planes[hex];
        if (hex === selectedHex) { selectedHex = null; opts.follow.checked = false; }
      }
    });

    drawTrails();
    renderList();
    renderDetail();

    if (opts.follow.checked && selectedHex && planes[selectedHex]) {
      var sd = planes[selectedHex].d;
      map.easeTo({ center: [sd.lon, sd.lat], duration: 900, easing: function (t) { return t; } });
    }

    // Stats
    $("stat-total").textContent = total;
    $("stat-pos").textContent = onMap;
    $("stat-range").textContent = maxRangeNm ? Math.round(maxRangeNm) : "–";

    if (num(data.messages)) {
      if (lastMessages !== null && nowMs > lastMessagesAt && data.messages >= lastMessages) {
        var rate = (data.messages - lastMessages) / ((nowMs - lastMessagesAt) / 1000);
        $("stat-msgs").textContent = Math.round(rate);
      }
      lastMessages = data.messages;
      lastMessagesAt = nowMs;
    } else {
      $("stat-msgs").textContent = "–";
    }

    lastOk = nowMs;
    updateStatus();
  }

  function updateStatus() {
    var now = Date.now();
    var dot = $("stat-dot");
    var text = $("stat-text");

    if (DEMO) {
      dot.className = "dot ok";
      text.textContent = "Demo data";
    } else if (!lastOk) {
      dot.className = "dot";
      text.textContent = "Connecting…";
    } else if (now - lastOk > CONFIG.offlineAfterMs ||
               now - lastNowChange > CONFIG.offlineAfterMs * 2) {
      dot.className = "dot bad";
      text.textContent = "Receiver offline";
    } else {
      dot.className = "dot ok";
      text.textContent = "Live";
    }
  }


  // ---- Demo data (planes.html?demo) -------------------------------------

  var demo = null;

  function demoData() {
    var c = receiver || { lat: CONFIG.fallbackCenter[1], lon: CONFIG.fallbackCenter[0] };

    if (!demo) {
      demo = { t: Date.now(), messages: 0, list: [] };
      for (var i = 0; i < 16; i++) {
        var ang = Math.random() * 2 * Math.PI;
        var r = 8 + Math.random() * 90; // nm
        demo.list.push({
          hex: (0xa00000 + i * 977).toString(16),
          flight: ["DAL", "UAL", "SWA", "AAL", "ASA", "JBU"][i % 6] + (100 + i * 37),
          lat: c.lat + (r / 60) * Math.sin(ang),
          lon: c.lon + (r / 60) * Math.cos(ang) / Math.cos(rad(c.lat)),
          alt: Math.round((2000 + Math.random() * 38000) / 100) * 100,
          gs: 180 + Math.random() * 330,
          track: Math.random() * 360,
          baro_rate: Math.random() < 0.7 ? 0 : (Math.random() - 0.5) * 4000,
          rssi: -30 + Math.random() * 20,
          squawk: String(1000 + Math.floor(Math.random() * 6000))
        });
      }
    }

    var dt = (Date.now() - demo.t) / 1000;
    demo.t = Date.now();
    demo.messages += Math.round(dt * 380);

    demo.list.forEach(function (a) {
      var nm = a.gs / 3600 * dt;
      a.lat += (nm / 60) * Math.cos(rad(a.track));
      a.lon += (nm / 60) * Math.sin(rad(a.track)) / Math.cos(rad(a.lat));
      a.track = (a.track + (Math.random() - 0.5) * 0.4 + 360) % 360;
      a.seen = Math.random();
      a.seen_pos = a.seen;
    });

    return { now: Date.now() / 1000, messages: demo.messages, aircraft: demo.list };
  }


  // ---- Polling ----------------------------------------------------------

  function poll() {
    var next = function () { setTimeout(poll, CONFIG.pollMs); };

    if (DEMO) {
      handle(demoData());
      next();
      return;
    }

    fetch(CONFIG.aircraftUrl, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(handle)
      .catch(function () { updateStatus(); })
      .then(next);
  }

  function loadReceiver() {
    if (DEMO) {
      setReceiver({ lat: CONFIG.fallbackCenter[1], lon: CONFIG.fallbackCenter[0] });
      return Promise.resolve();
    }

    return fetch(CONFIG.receiverUrl)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(setReceiver)
      .catch(function () { /* the map still works without it */ });
  }


  // ---- Wire up the controls and start -------------------------------------

  ["trails", "rings", "labels"].forEach(function (k) {
    opts[k].addEventListener("change", applyToggles);
  });

  $("sort").addEventListener("change", renderList);
  $("detail-close").addEventListener("click", function () { select(null); });

  $("list").addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-hex]");
    if (tr) select(tr.getAttribute("data-hex"));
  });

  setInterval(updateStatus, 3000);

  initMap();

  map.on("load", function () {
    loadReceiver().then(poll);
  });

})();
