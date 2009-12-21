(function(global, jQuery) {
  global.Sizzle = function(selector, from, data) {
    if (data) {
      NW.Dom.select(selector, from, function(element) { data.push(element); });
      return data;
    }
    return NW.Dom.select(selector, from);
  };

  global.Sizzle.selectors = { };

  global.Sizzle.uniqueSort = function(results) {
    return results;
  };

  jQuery.find = global.Sizzle;
  jQuery.expr = global.Sizzle.selectors;
  jQuery.unique = global.Sizzle.uniqueSort;

})(this, this.jQuery);
