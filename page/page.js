/* === page/page.js === */
var Page = (function () {
  function main(sd, api, G) {
    var b = Html.buffer();
    b.add('<div class="wrapper p-b-075 p-t-100-med bg-sand-3 container-wrapper"><div class="container">');
    b.add(HeaderRow.featured(sd, G));
    b.add(HeaderRow.selected(sd));
    b.add(CountBar.render(api, G));
    b.add(Results.render(api, G));
    b.add("</div></div>");
    b.add(FiltersModal.render(sd, G));
    return b.toString();
  }
  return { main: main };
})();
