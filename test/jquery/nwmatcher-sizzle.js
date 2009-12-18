(function(global) {
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
})(this);
