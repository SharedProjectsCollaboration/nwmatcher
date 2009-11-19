(function(global) {
  var doc     = global.document,
   isFunction = Object.isFunction,
   isString   = Object.isString,
   match      = NW.Dom.match,
   select     = NW.Dom.select,
   slice      = Array.prototype.slice;

  global.$$ = Element.extend == Prototype.K ?
    function() {
      return select(slice.call(arguments, 0).join(', '), doc);
    } :
    function() {
      return select(slice.call(arguments, 0).join(', '), doc, Element.extend);
    };

  Element.addMethods({
    'match': function(element, selector) {
      return !isString(selector) && isFunction(selector.match)
        ? selector.match($(element))
        : match(element, selector);
    }
  });
})(this);
