/* === facets/facets.js === */
var Facets = (function () {
  function getFacetDefinitions(profiles) {
    for (var name in profiles) {
      var defs = Safe.get(profiles[name], "facetedNavConfConfig.facetDefinitions", null);
      if (defs && defs.length) return defs;
    }
    return null;
  }
  function buildFacetMap(defs) {
    var map = {};
    for (var i = 0; i < defs.length; i++) {
      var cats = defs[i].categoryDefinitions || [];
      for (var j = 0; j < cats.length; j++) {
        var c = cats[j];
        if (!c.facetName || !c.queryStringParamName) continue;
        map[c.facetName] = map[c.facetName] || {};
        if (c.data) map[c.facetName][c.data] = c.queryStringParamName;
      }
    }
    return map;
  }
  function fallbackQSP(map, facetName) {
    if (!map[facetName]) return null;
    var keys = [];
    for (var k in map[facetName]) keys.push(k);
    return keys.length ? map[facetName][keys[0]] : null;
  }
  function encodeFacetLabel(label, facetName, api) {
    if (facetName === "Time period") {
      var dc = Safe.get(api, "response.resultPacket.dateCounts.d:" + label, {});
      return (dc && dc.queryTerm ? dc.queryTerm : "d=" + label) + " :: " + label;
    }
    return encodeURIComponent(label).replace(/%20/g, "+");
  }
  function processFacet(facet, facetMap, api) {
    var name = facet && facet.name;
    var values = facet && facet.allValues;
    if (!name || !values || !values.length) return null;

    var hidden = { "Document type": 1, "Page type": 1 };
    if (hidden[name]) return null;

    var qsp = fallbackQSP(facetMap, name);
    if (!qsp) return null;

    var labels = {};
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      var label = v && v.label;
      var dataValue = (v && v.data) ? v.data : label;
      if (!label) continue;
      //var enc = encodeFacetLabel(label, name, api);
      var enc = encodeURIComponent(String(dataValue)).replace(/%20/g, "+");
      var toUse = (facetMap[name] && facetMap[name][label]) || qsp;
      var encParam = String(toUse).replace(/ /g, "+").replace(/\|/g, "%7C");
      labels[label] = {
        queryParam: encParam + "=" + enc,
        count: v.count || 0,
        selected: !!v.selected,
        toggleUrl: v.toggleUrl || ""
      };
    }
    return {
      name: name,
      labels: labels,
      allValues: values,
      selected: !!facet.selected,
      guessedDisplayType: facet.guessedDisplayType
    };
  }
  function extract(api) {
    var out = [];
    var profiles = Safe.get(api, "question.collection.profiles", {});
    var defs = getFacetDefinitions(profiles);
    if (!defs) return out;
    var map = buildFacetMap(defs);
    var facets = Safe.get(api, "response.facets", []);
    for (var i = 0; i < facets.length; i++) {
      var pf = processFacet(facets[i], map, api);
      if (pf) out.push(pf);
    }
    return out;
  }
  return { extract: extract };
})();
