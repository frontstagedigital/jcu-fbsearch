/* === diagnostics/diagnostics.js === */
var Diagnostics = (function () {
  function render(sd, api, G) {
    var b = Html.buffer();
    b.add('<div style="padding:8px;margin-bottom:12px;border:1px dashed #aaa;background:#fffef5;font-family:monospace;font-size:12px;">');
    b.add("<div><strong>FBSearch diagnostics</strong></div>");
    b.add("<div>query: " + Html.esc((G && G.get_query) || "") + "</div>");
    b.add("<div>sort: " + Html.esc((G && G.get_sort) || "") + "</div>");
    b.add("<div>start_rank: " + Html.esc((G && G.get_start_rank) || "") + "</div>");
    var sum = Safe.get(api, "response.resultPacket.resultsSummary", {});
    b.add("<div>currStart / currEnd / total: " + Html.esc([sum.currStart, sum.currEnd, sum.totalMatching].join(" / ")) + "</div>");
    b.add("<div>facets: " + Html.esc(sd.facets.length) + "</div>");
    var names = []; for (var i = 0; i < sd.facets.length; i++) names.push(sd.facets[i].name);
    b.add("<div>facet names: " + Html.esc(names.join(", ")) + "</div>");
    var chips = SearchData.selectedChips(sd);
    var chipLabels = []; for (var j = 0; j < chips.length; j++) chipLabels.push(chips[j].facet + ":" + chips[j].label);
    b.add("<div>selected chips: " + Html.esc(chipLabels.join(", ")) + "</div>");
    b.add("</div>");
    return b.toString();
  }
  return { render: render };
})();
