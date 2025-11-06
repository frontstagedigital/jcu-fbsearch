/* === data/search-data.js === */
var SearchData = (function () {
  function extractUrlParameters(G) {
    var qs = (G && G.server_query_string) || "";
    var parsed = Url.parseQueryString(qs);
    return {
      query: (G && G.get_query) || "",
      sort: (G && G.get_sort) || "default",
      filters: parsed.filters || {},
      start_rank: parseInt((G && G.get_start_rank) || "", 10) || 1
    };
  }
  function relatedTerms(api) {
    var terms = [];
    var nav = Safe.get(api, "response.resultPacket.contextualNavigation", null);
    if (nav && nav.categories && nav.categories.length) {
      var clusters = nav.categories[0].clusters || [];
      for (var i = 0; i < clusters.length; i++) if (clusters[i].query) terms.push(clusters[i].query);
    }
    return terms.slice(0, 5);
  }
  function build(api, G) {
    var url = extractUrlParameters(G);
    return {
      facets: Facets.extract(api),
      pagination: {
        currStart: Safe.get(api, "response.resultPacket.resultsSummary.currStart", 1),
        currEnd: Safe.get(api, "response.resultPacket.resultsSummary.currEnd", 10),
        nextStart: Safe.get(api, "response.resultPacket.resultsSummary.nextStart", null),
        totalMatching: Safe.get(api, "response.resultPacket.resultsSummary.totalMatching", 0)
      },
      totalResults: Safe.get(api, "response.resultPacket.resultsSummary.totalMatching", 0),
      currentSort: url.sort || "default",
      currentQuery: url.query || "",
      related: relatedTerms(api)
    };
  }
  function selectedChips(sd) {
    var chips = [];
    for (var i = 0; i < sd.facets.length; i++) {
      var f = sd.facets[i];
      var vals = f.allValues || [];
      for (var j = 0; j < vals.length; j++) {
        var v = vals[j];
        if (v && v.selected) chips.push({ facet: f.name, label: v.label });
      }
    }
    return chips;
  }
  return { build: build, selectedChips: selectedChips };
})();
