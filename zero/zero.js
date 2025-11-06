/* === zero/zero.js === */
var Zero = (function () {
  function render(api, G) {
    var q = (G && G.get_query) || "";
    var baseUrl = (G && G.asset_url) || "";
    var spell = FB.spell(api);
    var b = Html.buffer();
    b.add('<div class="container"><div class="p-150 bg-white border">');
    if (q && q.length) b.add('<p>Sorry, no results found for <strong><em>' + Html.esc(q) + '</em></strong>.</p>');
    else b.add("<p>Type a keyword or phrase in the search box above to discover what you're looking for.</p>");
    if (spell) b.add('<p>Did you mean <a href="' + Html.esc(baseUrl) + '?query=' + encodeURIComponent(spell) + '">' + Html.esc(spell) + "</a>?</p>");
    b.add('<ul class="list-disc p-l-100"><li>Try using different or fewer keywords</li><li>Check your spelling</li><li>Try broader or general search terms</li></ul>');
    b.add('<p class="m-t-100"><a class="btn" href="' + Html.esc(baseUrl) + '">Try again?</a></p>');
    b.add("</div></div>");
    return b.toString();
  }
  return { render: render };
})();
