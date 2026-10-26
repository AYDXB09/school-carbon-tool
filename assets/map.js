/* =============================================================================
   School Carbon — optional campus map
   Lets a school trace building roofs on satellite imagery to estimate floor
   area, when they do not know it. Libraries load only when the user opens the
   map, so the core tool stays lean and works with no network.

   Honesty note baked into the UI: building FOOTPRINT is not floor AREA. We
   multiply traced roof area by the number of storeys, and we tell the user to
   trace buildings only, never fields or car parks, or the estimate inflates.

   All libraries here are open source and free to host on GitHub Pages:
     Leaflet (BSD), Leaflet-Geoman free (MIT), Turf (MIT).
   Basemap: Esri World Imagery (free, attribution shown). Search: OSM Nominatim.
   ============================================================================= */
(function (root) {
  "use strict";
  var loaded = false, loadingPromise = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("failed " + src)); }; document.head.appendChild(s); }); }
  function loadCss(href) { return new Promise(function (res) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); }); }

  function ensureLibs() {
    if (loaded) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    var CDN = "https://cdn.jsdelivr.net/npm/";
    loadingPromise = Promise.all([
      loadCss(CDN + "leaflet@1.9.4/dist/leaflet.css"),
      loadCss(CDN + "@geoman-io/leaflet-geoman-free@2.17.0/dist/leaflet-geoman.css")
    ]).then(function () { return loadScript(CDN + "leaflet@1.9.4/dist/leaflet.js"); })
      .then(function () { return Promise.all([
        loadScript(CDN + "@geoman-io/leaflet-geoman-free@2.17.0/dist/leaflet-geoman.min.js"),
        loadScript(CDN + "@turf/turf@6.5.0/turf.min.js")
      ]); })
      .then(function () { loaded = true; });
    return loadingPromise;
  }

  var map, storeys = 2, footprintM2 = 0, onDone, meMarker;

  /* Nominatim rejects requests whose Referer header looks like local/test
     traffic with a plain 403 "Access denied" page (confirmed by testing
     directly). Browsers attach Referer to cross-origin fetches by default, so
     we must explicitly ask for no-referrer, and always check response.ok
     rather than silently swallowing the error as "no results". */
  function geoFetch(url, extraHeaders) {
    return fetch(url, {
      referrerPolicy: "no-referrer",
      headers: Object.assign({ "Accept-Language": "en" }, extraHeaders || {})
    }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  function recompute() {
    if (!root.turf) return;
    var total = 0;
    map.eachLayer(function (layer) {
      if (layer.toGeoJSON && layer.pm && layer instanceof root.L.Polygon) {
        try { total += root.turf.area(layer.toGeoJSON()); } catch (e) {}
      }
    });
    footprintM2 = total;
    updateReadout();
  }
  function updateReadout() {
    var floor = footprintM2 * storeys;
    var r = document.getElementById("map-readout");
    if (r) r.innerHTML = 'Traced roof area: <span class="mr-num">' + Math.round(footprintM2).toLocaleString() + ' m2</span>. ' +
      'At ' + storeys + ' storey' + (storeys > 1 ? 's' : '') + ', estimated floor area is <span class="mr-num">' + Math.round(floor).toLocaleString() + ' m2</span>.';
    var btn = document.getElementById("map-use");
    if (btn) btn.disabled = footprintM2 <= 0;
  }

  function open(data, done) {
    onDone = done;
    var host = document.getElementById("map-host");
    if (!host) return;
    host.innerHTML = '<p class="field-hint" style="margin:12px 0">Loading map...</p>';
    ensureLibs().then(function () {
      host.innerHTML =
        '<div class="map-wrap" style="margin-top:12px">' +
          '<div style="position:relative;margin-bottom:8px">' +
            '<input id="map-search" type="text" placeholder="Search your school name, address or town" autocomplete="off" style="width:100%">' +
            '<div id="map-results" style="display:none"></div>' +
          '</div>' +
          '<p id="map-loc-status" class="field-hint" style="margin:0 0 8px">Finding your approximate location...</p>' +
          '<div id="campus-map"></div>' +
          '<div class="map-toolbar">' +
            '<button class="btn btn-secondary" id="map-draw" type="button">Start tracing a building</button>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:.9rem">Storeys <input id="map-storeys" type="number" min="1" max="30" value="2" style="width:64px"></label>' +
            '<button class="btn btn-secondary" id="map-clear" type="button">Clear</button>' +
          '</div>' +
          '<p id="map-readout" class="map-result" style="margin:12px 0 6px">Trace one or more building roofs to see an estimate.</p>' +
          '<button class="btn btn-primary" id="map-use" type="button" disabled>Use this floor area</button>' +
        '</div>';
      initMap(data);
    }).catch(function () {
      host.innerHTML = '<p class="field-hint" style="margin:12px 0;color:var(--high)">The map could not load (it needs an internet connection). You can still type your floor area above, or leave it blank and we will estimate it.</p>';
    });
  }

  function initMap(data) {
    var L = root.L;
    map = L.map("campus-map").setView([30, 0], 2); // world, until we locate the user
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Imagery: Esri, Maxar, Earthstar Geographics"
    }).addTo(map);

    // Center on the user's approximate location from their IP, no permission
    // prompt needed. Drop a draggable pin there so it reads as "is this your
    // school, or drag me" rather than silently recentering the map. Two
    // providers in sequence since either can be rate limited or blocked from
    // a given network.
    var locStatus = document.getElementById("map-loc-status");
    function placeMe(lat, lon, approx) {
      map.setView([lat, lon], approx ? 12 : 16);
      if (meMarker) map.removeLayer(meMarker);
      meMarker = L.marker([lat, lon], { draggable: true, title: "Approximate location, drag to your school" }).addTo(map);
      if (locStatus) locStatus.textContent = "Pin set to your approximate location from your network. Drag it to your school, or use search above.";
    }
    geoFetch("https://ipwho.is/")
      .then(function (j) { if (j && j.success !== false && j.latitude && j.longitude) return j; throw new Error("ipwho failed"); })
      .catch(function () { return geoFetch("https://ipapi.co/json/").then(function (j) { if (j && j.latitude) return j; throw new Error("ipapi failed"); }); })
      .then(function (j) { placeMe(j.latitude, j.longitude, false); })
      .catch(function () { if (locStatus) locStatus.textContent = "Could not detect your location automatically. Search for your school or town above, or pan and zoom to find it."; });

    map.pm.setGlobalOptions({ snappable: true });
    map.pm.setPathOptions({ color: "#e8833a", fillColor: "#e8833a", fillOpacity: 0.28 });

    map.on("pm:create", function (e) { e.layer.on("pm:edit", recompute); e.layer.on("pm:dragend", recompute); recompute(); });
    map.on("pm:remove", recompute);

    document.getElementById("map-draw").addEventListener("click", function () { map.pm.enableDraw("Polygon"); });
    document.getElementById("map-clear").addEventListener("click", function () {
      map.eachLayer(function (layer) { if (layer instanceof L.Polygon) map.removeLayer(layer); });
      footprintM2 = 0; updateReadout();
    });
    document.getElementById("map-storeys").addEventListener("input", function () { storeys = Math.max(1, parseInt(this.value, 10) || 1); updateReadout(); });
    document.getElementById("map-use").addEventListener("click", function () {
      if (onDone && footprintM2 > 0) { onDone(footprintM2 * storeys); document.getElementById("map-readout").innerHTML = '<span class="mr-num">Applied.</span> Your floor area field is now set to ' + Math.round(footprintM2 * storeys).toLocaleString() + ' m2.'; }
    });
    // Search via Nominatim. Show the top matches and let the user pick the right
    // one, rather than guessing a single result (which sent people to the wrong
    // town). Bias results toward the country they chose earlier, if any.
    var search = document.getElementById("map-search");
    var results = document.getElementById("map-results");
    var cc = (data && data.country && data.country !== "__WORLD__" && data.country !== "__OTHER__") ? data.country.toLowerCase() : "";
    var timer = null;

    function hideResults() { results.style.display = "none"; results.innerHTML = ""; }
    function showMsg(msg) { results.innerHTML = '<div class="map-res-empty">' + esc(msg) + '</div>'; results.style.display = "block"; }
    function runSearch() {
      var q = search.value.trim();
      if (q.length < 3) { hideResults(); return; }
      showMsg("Searching...");
      // Try with the country filter first (sharper results); if that comes back
      // empty, retry without it, since a wrong or stale country filter should
      // never make a real place look unfindable.
      var base = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=" + encodeURIComponent(q);
      geoFetch(base + (cc ? "&countrycodes=" + cc : ""))
        .then(function (list) { return (list && list.length) ? list : (cc ? geoFetch(base) : list); })
        .then(function (list) {
          if (!list || !list.length) { showMsg("No matches for \"" + q + "\". Try just the town or country name."); return; }
          results.innerHTML = list.map(function (p) {
            return '<button type="button" class="map-res" data-lat="' + p.lat + '" data-lon="' + p.lon + '">' + esc(p.display_name) + '</button>';
          }).join("");
          results.style.display = "block";
        })
        .catch(function (e) { showMsg("Search is temporarily unavailable (" + e.message + "). You can still pan and zoom the map by hand."); });
    }
    search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(runSearch, 350); });
    search.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); clearTimeout(timer); runSearch(); } });
    results.addEventListener("click", function (ev) {
      var b = ev.target.closest(".map-res"); if (!b) return;
      map.setView([parseFloat(b.getAttribute("data-lat")), parseFloat(b.getAttribute("data-lon"))], 18);
      search.value = b.textContent; hideResults();
    });
    document.addEventListener("click", function (ev) { if (!results.contains(ev.target) && ev.target !== search) hideResults(); });
    setTimeout(function () { map.invalidateSize(); }, 60);
  }

  root.SCHOOLCARBON = root.SCHOOLCARBON || {};
  root.SCHOOLCARBON.map = { open: open };
})(typeof window !== "undefined" ? window : this);
