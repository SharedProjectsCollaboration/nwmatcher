(function(global) {
  var toString = Object.prototype.toString;

  global.Slick = function(from, selector, data) {
    NW.Dom.setQSA(!Slick.disableQSA);
    if (data) {
      NW.Dom.select(selector, from, function(element) { data.push(element); });
      return data;
    }
    return NW.Dom.select(selector, from);
  };

  global.document.search = function(selector) {
    return NW.Dom.select(selector, global.document);
  };

  Slick.match =
  Slick.deepMatch = NW.Dom.match;
  Slick.isXML = function(element){
    var ownerDocument = element.ownerDocument || element;
    return ownerDocument && !('body' in ownerDocument);
  };
})(this);
