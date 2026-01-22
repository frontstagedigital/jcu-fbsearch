/* === init/fbsearch.js === */
var FBSearch = (function () {
  function render(rest, G) {
    var html = "";
    try {
      var api = FB.init(rest);
      if (!FB.valid(api)) return '<!-- <div class="' + CLASSNAMES.alert + '">Invalid API response structure.</div> -->';
      if (!FB.totals(api)) return Zero.render(api, G);
      var sd = SearchData.build(api, G);
      if (G && G.debug) html += Diagnostics.render(sd, api, G);
      html += Page.main(sd, api, G);
      return html;
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e);
      return '<div class="' + CLASSNAMES.alert + '">Error generating search results - ' + Html.esc(msg) + "</div>";
    }
  }
  return { render: render };
})();

/* === init/bootstrap.js === */
;(function(){
  try {
    // Ensure GLOBALS exists and featuredFacetNames has a sensible default
    if (typeof GLOBALS !== "object" || !GLOBALS) { window.GLOBALS = {}; }
    if (!Array.isArray(GLOBALS.featuredFacetNames)) {
      GLOBALS.featuredFacetNames = ["Student type", "Study level", "Study area", "Location"];
    }
  } catch (e) {
    // non-browser JS engine may not have window
    try {
      if (typeof GLOBALS !== "object" || !GLOBALS) { GLOBALS = {}; }
      if (!Array.isArray(GLOBALS.featuredFacetNames)) {
        GLOBALS.featuredFacetNames = ["Student type", "Study level", "Study area", "Location"];
      }
    } catch (_e) {}
  }

  function safeGroup(sd, featuredNames) {
    var out = { featured: [], other: [] };
    if (!sd || !Array.isArray(sd.facets)) return out;
    var want = Array.isArray(featuredNames) ? featuredNames : [];
    var wantMap = Object.create ? Object.create(null) : {};
    for (var i = 0; i < want.length; i++) wantMap[want[i]] = true;
    for (var j = 0; j < sd.facets.length; j++) {
      var f = sd.facets[j];
      if (!f) continue;
      if (wantMap[f.name]) out.featured.push(f); else out.other.push(f);
    }
    return out;
  }

  // Monkey-patch SearchData.groupFacets to always return a safe shape
  try {
    if (typeof SearchData === "object" && SearchData) {
      var _origGF = SearchData.groupFacets;
      SearchData.groupFacets = function(sd, featuredNames){
        var result;
        try { result = _origGF ? _origGF(sd, featuredNames) : null; } catch(e) { result = null; }
        if (result && (result.featured || result.other)) {
          return {
            featured: Array.isArray(result.featured) ? result.featured : [],
            other: Array.isArray(result.other) ? result.other : []
          };
        }
        return safeGroup(sd, featuredNames);
      };

      // Provide an explicit "ensure" helper some code may call
      SearchData.ensureFacetGroups = function(sd, featuredNames){
        var g = SearchData.groupFacets(sd, featuredNames);
        sd = sd || {};
        sd.facetsByGroup = sd.facetsByGroup || {};
        sd.facetsByGroup.featured = g.featured;
        sd.facetsByGroup.other = g.other;
        return g;
      };
    }
  } catch (e) {
    // swallow - safety only
  }
})();
