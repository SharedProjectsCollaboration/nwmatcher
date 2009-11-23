(function(global) {
  var toString = Object.prototype.toString;

  global.SELECT =
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

  global.MATCH =
  Slick.match =
  Slick.deepMatch = NW.Dom.match;

  Slick.isXML = function(element){
		var ownerDocument = element.ownerDocument || element;
		return (!!ownerDocument.xmlVersion)
			|| (!!ownerDocument.xml)
			|| (toString.call(ownerDocument) == '[object XMLDocument]')
			|| (ownerDocument.nodeType == 9 && ownerDocument.documentElement.nodeName != 'HTML');
	};
})(this);