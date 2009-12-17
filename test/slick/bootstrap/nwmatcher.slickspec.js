(function(global) {
  global.SELECT =
  global.Slick = function(from, selector, data) {
    NW.Dom.setQSA(!Slick.disableQSA);
    if (data) {
      NW.Dom.select(selector, from, function(element) { data.push(element); });
      return data;
    }
    return NW.Dom.select(selector, from);
  };

	global.SELECT1 = function(from, selector){
		return global.Slick(from, selector)[0];
	};

  global.document.search = function(selector) {
    return global.Slick(global.document, selector);
  };

  global.MATCH =
  Slick.match =
  Slick.deepMatch = NW.Dom.match;

  Slick.isXML = function(element){
		var ownerDocument = element.ownerDocument || element;
		return !('body' in ownerDocument) || !('innerHTML' in ownerDocument.documentElement) ||
		  ownerDocument.createElement('DiV').nodeName === 'DiV';
	};
})(this);
