/*
 * Copyright (C) 2007-2009 Diego Perini
 * All rights reserved.
 *
 * nwmatcher.js - A fast CSS selector engine and matcher
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 1.2.0
 * Created: 20070722
 * Release: 20091201
 *
 * License:
 *  http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

(function(global) {

  var version = 'nwmatcher-1.2.0',

  // processing context
  doc = global.document,

  // context root element (HTML)
  root = doc.documentElement,

  // temporary vars
  isSupported, isBuggy, div = doc.createElement('DiV'),

  // persist last selector parsing data
  lastCalled, lastIndex, lastSelector, lastSlice,

  lastContext = doc,

  notHTML = !('body' in doc),

  // used in the RE_BUGGY_XXXXX regexp testers
  testFalse = { 'test': function() { return false; } },

  testTrue  = { 'test': function() { return true;  } },

  // http://www.w3.org/TR/css3-syntax/#characters
  // Unicode/ISO 10646 characters 161 and higher
  // NOTE: Safari 2.0.x crashes with escaped (\\)
  // Unicode ranges in regular expressions so we
  // use a negated character range class instead.

  // More correct but slower alternative:
  // '-?(?:[a-zA-Z_]|[^\\x00-\\xa0]|\\\\.)(?:[-\\w]|[^\\x00-\\xa0]|\\\\.)*'
  strIdentifier = '(?:[-\\w]|[^\\x00-\\xa0]|\\\\.)+',

  // used to match [ ] or ( ) groups
  // http://blog.stevenlevithan.com/archives/match-quoted-string/
  strGroups =
    '(?:' +
    '\\[(?:[-\\w]+:)?[-\\w]+(?:[~*^$|!]?=(["\']?)(?:(?!\\1)[^\\\\]|[^\\\\]|\\\\.)*?\\1)?\\]' +
    '|' +
    '\\((["\']?).*?(?:\\(.*\\))?[^\'"()]*?\\2\\)' +
    ')',

  // used to skip [ ] or ( ) groups
  // we use \2 and \3 because we assume \1 will be the captured group not being skipped
  strSkipGroups = strGroups.replace(/\\1/g, '\\2').replace('\\2', '\\3'),

  // used to skip "..." or '...' quoted attribute values
  // we use \2 because we assume \1 will be the captured group not being skipped
  strSkipQuotes = '(["\'])(?:(?!\\2)[^\\\\]|\\\\.)*\\2',

  strEdgeSpace = '[\\t\\n\\r\\f]',

  strLeadingSpace = '\\x20+([\\])=>+~,^$|!]|\\*=)',

  strMultiSpace = '\\x20{2,}',

  strTrailingSpace = '([[(=>+~,^$|!]|\\*=)\\x20+',

  strNameAttr = '\\*?\\[name=(["\']?)(?:(?!\\1)[^\\\\]|[^\\\\]|\\\\.)*?\\1\\]',

  // regexps used throughout nwmatcher
  reIdentifier = new RegExp(strIdentifier),

  reNameValue = /=(['"]?)((?:(?!\1)[^\\]|[^\\]|\\.)*?)\1\]$/,

  reSiblings = new RegExp('^(?:\\*|[.#]?' + strIdentifier + ')?[+~]'),

  reUseSafeNormalize = /[[(]/,

  reUnnormalized = /[\t\n\r\f]|\x20{2,}|\x20(?:[\]\)=>+~,^$|!]|\*=)|(?:[\[\(=>+~,^$|!]|\*=)\x20/,

  // split comma separated selector groups
  // exclude escaped commas and those inside '', "", (), []
  // example: `#div a, ul > li a` group 1 is `#div a`, group 2 is `ul > li a`
  reSplitGroup = new RegExp('(?:' + strGroups + '|(?!,)[^\\\\]|\\\\.)+', 'g'),

  // split last, right most, selector group token
  reLastToken = new RegExp('(?:(?:' + strGroups + '|(?![ >+~,()[\\]])[^\\\\]|\\\\.)+|[>+~])$');

  // simple check to ensure the first character of a selector is valid
  // http://www.w3.org/TR/css3-syntax/#characters
  reValidator = /^(?:[*>+~a-zA-Z]|\[[\x20\t\n\r\fa-zA-Z]|(?:[.:#_]|::)?(?!-?\d)-?(?:[a-zA-Z_]|[^\x00-\xa0]|\\.))/,

  // for use with the normilize method
  reEdgeSpaces     = new RegExp(strEdgeSpace, 'g'),
  reMultiSpaces    = new RegExp(strMultiSpace, 'g'),
  reLeadingSpaces  = new RegExp(strLeadingSpace, 'g'),
  reTrailingSpaces = new RegExp(strTrailingSpace, 'g'),

  reEdgeSpacesWithQuotes     = new RegExp('(' + strEdgeSpace  + ')|' + strSkipQuotes, 'g'),
  reMultiSpacesWithQuotes    = new RegExp('(' + strMultiSpace + ')|' + strSkipQuotes, 'g'),
  reLeadingSpacesWithQuotes  = new RegExp(strLeadingSpace  + '|' + strSkipQuotes, 'g'),
  reTrailingSpacesWithQuotes = new RegExp(strTrailingSpace + '|' + strSkipQuotes, 'g'),

  /*----------------------------- UTILITY METHODS ----------------------------*/

  clearElement =
    function(element) {
      while (element.lastChild) {
        element.removeChild(element.lastChild);
      }
      return element;
    },

  createElement =
    function(tagName) {
      return document.createElement(tagName);
    },

  createInput =
    function(type) {
      try {
        return createElement('<input type="' + type + '">');
      } catch(e) {
        var input = createElement('input');
        input.type = type;
        return input;
      }
    },

  // normalize whitespace and remove consecutive spaces
  // http://www.w3.org/TR/css3-selectors/#selector-syntax
  normalize =
    function(selector) {
      var index, match, origSelector, pattern, sequence, token, i = -1,
       cached = normalizedSelectors[selector];
      if (cached) return cached;

      origSelector = selector;
      if (reUseSafeNormalize.test(selector)) {
        sequence = [reLeadingSpacesWithQuotes, reTrailingSpacesWithQuotes, reMultiSpacesWithQuotes];
        while (match = reEdgeSpacesWithQuotes.exec(selector)) {
          if ((token = match[1])) {
            selector = selector.replace(token, ' ');
          }
        }

        selector = trim.call(selector);
        while (pattern = sequence[++i]) {
          while (match = pattern.exec(selector)) {
            if ((token = match[1])) {
              index = match.index;
              selector = selector.slice(0, index) +
                selector.slice(index).replace(match[0], token);
              pattern.lastIndex = index + 1;
            }
          }
        }
      }
      else {
        // do the same thing, without worrying about attribute values
        selector = trim.call(selector.replace(reEdgeSpaces, ' '))
          .replace(reLeadingSpaces, '$1').replace(reTrailingSpaces, '$1')
            .replace(reMultiSpaces, ' ');
      }

      return (
        normalizedSelectors[origSelector] =
        normalizedSelectors[selector] = selector);
    },

  slice = [].slice,

  // Safari 2 bug with innerText (gasp!)
  // used to strip tags from innerHTML
  stripTags = function(s) {
    return s.replace(/<\/?(?:(["'])(?:(?!\1)[^\\]|\\.)*\1|[^>])+>/gi, '');
  },

  // trim leading/trailing spaces
  trim = ''.trim && !' '.trim() ? ''.trim :
    function() { return this.replace(/^\x20+|\x20+$/g, ''); },

  /*------------------------------- DEBUGGING --------------------------------*/

  // enable/disable notifications
  VERBOSE = false,

  // a way to control user notification
  emit =
    function(message) {
      if (VERBOSE) {
        var console = global.console;
        if (console && console.log) {
          console.log(message);
        } else {
          if (/exception/i.test(message)) {
            global.status = message;
            global.defaultStatus = message;
          } else {
            global.status += message;
          }
        }
      }
    },

  /*----------------------------- FEATURE TESTING ----------------------------*/

  // detect native methods
  isNative = (function() {
    var s = (global.open + '').replace(/open/g, '');
    return function(object, method) {
      var m = object ? object[method] : false, r = new RegExp(method, 'g');
      return !!(m && typeof m != 'string' && s === (m + '').replace(r, ''));
    };
  })(),

  // Safari 2 missing document.compatMode property
  // makes it harder to detect Quirks vs. Strict
  isQuirks = doc.compatMode ?
    doc.compatMode === 'BackCompat' :
    (function() {
      return div.style && (div.style.width = 1) &&
        div.style.width == '1px';
    })(),


  // NOTE: NATIVE_XXXXX check for existance of method only
  // so through the code read it as "supported", maybe BUGGY

  // detect if DOM methods are native in browsers
  NATIVE_GEBID     = isNative(doc, 'getElementById'),
  NATIVE_GEBCN     = isNative(root, 'getElementsByClassName'),
  NATIVE_GEBN      = isNative(root, 'getElementsByName'),
  NATIVE_GEBTN     = isNative(root, 'getElementsByTagName'),
  NATIVE_HAS_FOCUS = isNative(doc, 'hasFocus'),
  NATIVE_QSA       = isNative(doc, 'querySelectorAll'),

  RE_BUGGY_MUTATION = testTrue,

  // check Seletor API implementations
  RE_BUGGY_QSAPI = NATIVE_QSA ?
    (function() {
      var pattern = [ ];

      // WebKit is correct with className case insensitivity (when no DOCTYPE)
      // obsolete bug https://bugs.webkit.org/show_bug.cgi?id=19047
      // so the bug is in all other browsers code now :-)
      // http://www.whatwg.org/specs/web-apps/current-work/#selectors

      // Safari 3.2 QSA doesnt work with mixedcase on quirksmode

      // Must test the attribute selector `[class~=xxx]`
      // before `.xXx` or else the bug may not present itself

      // <p class="xXx"></p><p class="xxx"></p>
      clearElement(div)
        .appendChild(createElement('p'))
        .className = 'xXx';

      div.appendChild(createElement('p')).className = 'xxx';

      if (isQuirks &&
         (div.querySelectorAll('[class~=xxx]').length != 2 ||
          div.querySelectorAll('.xXx').length != 2)) {
        pattern.push('(?:\\[[\\x20\\t\\n\\r\\f]*class\\b|\\.' + strIdentifier + ')');
      }

      // :enabled :disabled bugs with hidden fields (Firefox 3.5 QSA bug)
      // http://www.w3.org/TR/html5/interactive-elements.html#selector-enabled
      // IE8 throws error with these pseudos

      // <input type="hidden">
      clearElement(div)
        .appendChild(createInput('hidden'));

      isBuggy = true;
      try {
        isBuggy = div.querySelectorAll(':enabled').length === 1;
      } catch(e) { }

      isBuggy && pattern.push(':enabled', ':disabled');

      // :checked bugs whith checkbox fields (Opera 10beta3 bug)
      // <input type="checkbox" checked>
      clearElement(div)
        .appendChild(createInput('checkbox'))
        .checked = true;

      isBuggy = true;
      try {
        isBuggy = div.querySelectorAll(':checked').length !== 1;
      } catch(e) { }

      isBuggy && pattern.push(':checked');

      // :link bugs with hyperlinks matching (Firefox/Safari)
      // <a href="x"></a>
      clearElement(div)
        .appendChild(createElement('a'))
        .href = 'x';

      div.querySelectorAll(':link').length !== 1 && pattern.push(':link');

      return pattern.length ?
        new RegExp(pattern.join('|')) :
        testFalse;
    })() :
    testTrue,


  // detect native getAttribute/hasAttribute methods,
  // frameworks extend these to elements, but it seems
  // this does not work for XML namespaced attributes,
  // used to check both getAttribute/hasAttribute in IE
  NATIVE_HAS_ATTRIBUTE = isNative(root, 'hasAttribute'),

  // check for Mutation Events, DOMAttrModified should be
  // enough to ensure DOMNodeInserted/DOMNodeRemoved exist
  NATIVE_MUTATION_EVENTS = root.addEventListener ?
    (function() {
      function testSupport(attr, value) {
        // add listener and modify attribute
        var result, handler = function() { result = true; };
        input.addEventListener('DOMAttrModified', handler, false);
        input[attr] = value;
        // cleanup
        input.removeEventListener('DOMAttrModified', handler, false);
        handler = null;
        return !!result;
      }

      var input = document.createElement('input');
      if ((isSupported = testSupport('id', 'x'))) {
        RE_BUGGY_MUTATION = testSupport('disabled', true) ? testFalse :
          /(?:\[[\x20\t\n\r\f]*|:)(?:checked|disabled)/i;
      }
      return isSupported;
    })() :
    false,

  // check if slice() can convert nodelist to array
  // see http://yura.thinkweb2.com/cft/
  NATIVE_SLICE_PROTO =
    (function() {
      try {
        return slice.call(doc.childNodes, 0) instanceof Array;
      } catch(e) {
        return false;
      }
    })(),

  // supports the new traversal API
  NATIVE_TRAVERSAL_API =
    'nextElementSibling' in root &&
    'previousElementSibling' in root,


  // NOTE: BUGGY_XXXXX check both for existance and no known bugs.

  BUGGY_GEBN = true,

  BUGGY_GEBID = NATIVE_GEBID ?
    (function() {
      var x = 'x'+ String(+new Date);

      // <p id="x"></p>
      clearElement(div)
        .appendChild(createElement('p')).id = x;

      // check for a buggy GEBN, because unlike GEBID, it will
      // present the bug before the document has finished loading
      root.insertBefore(div, root.firstChild);
      isBuggy = !doc.getElementById(x) || !!doc.getElementsByName(x)[0];

      if (NATIVE_GEBN) BUGGY_GEBN = isBuggy;
      root.removeChild(div);

      return isBuggy;
    })() :
    true,

  // detect IE gEBTN comment nodes bug
  BUGGY_GEBTN = NATIVE_GEBTN ?
    (function() {
      clearElement(div).appendChild(doc.createComment(''));
      return !!div.getElementsByTagName('*')[0];
    })() :
    true,

  // detect Opera gEBCN second class and/or UTF8 bugs as well as Safari 3.2
  // caching class name results and not detecting when changed,
  // tests are based on the jQuery selector test suite
  BUGGY_GEBCN = NATIVE_GEBCN ?
    (function() {
      // Opera tests
      var method = 'getElementsByClassName', test = '\u53f0\u5317';

      // <p class="' + test + 'abc ' + test + '"></p><p class="x"></p>
      clearElement(div)
        .appendChild(createElement('p'))
        .className = test + 'abc ' + test;

      div.appendChild(createElement('p')).className = 'x';

      isBuggy = !div[method](test)[0];

      // Safari test
      div.lastChild.className = test;
      if (!isBuggy) isBuggy = div[method](test).length !== 2;
      return isBuggy;
    })() :
    true,

  // matches simple id, tagname & classname selectors
  RE_SIMPLE_SELECTOR = BUGGY_GEBTN || BUGGY_GEBCN
    ? new RegExp('^(?:#' + strIdentifier + '|' + strNameAttr + ')$')
    : new RegExp('^(?:\\*|[.#]?' + strIdentifier + '|' + strNameAttr + ')$'),

  /*----------------------------- LOOKUP OBJECTS -----------------------------*/

  LINK_NODES = { 'a': 1, 'A': 1, 'area': 1, 'AREA': 1, 'link': 1, 'LINK': 1 },

  QSA_NODE_TYPES = { '9': 1, '11': 1 },

  // attribute referencing URI values need special treatment in IE
  ATTRIBUTES_URI = {
    'action': 2, 'cite': 2, 'codebase': 2, 'data': 2, 'href': 2,
    'longdesc': 2, 'lowsrc': 2, 'src': 2, 'usemap': 2
  },

  // HTML 5 draft specifications
  // http://www.whatwg.org/specs/web-apps/current-work/#selectors
  HTML_TABLE = {
    // class attribute must be treated case-insensitive in HTML quirks mode
    'class': isQuirks ? 1 : 0,
    'accept': 1, 'accept-charset': 1, 'align': 1, 'alink': 1, 'axis': 1,
    'bgcolor': 1, 'charset': 1, 'checked': 1, 'clear': 1, 'codetype': 1, 'color': 1,
    'compact': 1, 'declare': 1, 'defer': 1, 'dir': 1, 'direction': 1, 'disabled': 1,
    'enctype': 1, 'face': 1, 'frame': 1, 'hreflang': 1, 'http-equiv': 1, 'lang': 1,
    'language': 1, 'link': 1, 'media': 1, 'method': 1, 'multiple': 1, 'nohref': 1,
    'noresize': 1, 'noshade': 1, 'nowrap': 1, 'readonly': 1, 'rel': 1, 'rev': 1,
    'rules': 1, 'scope': 1, 'scrolling': 1, 'selected': 1, 'shape': 1, 'target': 1,
    'text': 1, 'type': 1, 'valign': 1, 'valuetype': 1, 'vlink': 1
  },

  // The following attributes must be treated case insensitive in XHTML
  // See Niels Leenheer blog
  // http://rakaz.nl/item/css_selector_bugs_case_sensitivity
  XHTML_TABLE = {
    'accept': 1, 'accept-charset': 1, 'alink': 1, 'axis': 1,
    'bgcolor': 1, 'charset': 1, 'codetype': 1, 'color': 1,
    'enctype': 1, 'face': 1, 'hreflang': 1, 'http-equiv': 1,
    'lang': 1, 'language': 1, 'link': 1, 'media': 1, 'rel': 1,
    'rev': 1, 'target': 1, 'text': 1, 'type': 1, 'vlink': 1
  },

  INSENSITIVE_TABLE = div.nodeName === 'DiV' ?
    XHTML_TABLE : HTML_TABLE,

  // current CSS3 grouping of Pseudo-Classes
  // they allow implementing extensions
  // and improve error notifications;
  // the assigned value represent current spec status:
  // 3 = CSS3, 2 = CSS2, '?' = maybe implemented
  CSS3PseudoClasses = {
    Structural: {
      'root': 3, 'empty': 3,
      'first-child': 3, 'last-child': 3, 'only-child': 3,
      'first-of-type': 3, 'last-of-type': 3, 'only-of-type': 3,
      'first-child-of-type': 3, 'last-child-of-type': 3, 'only-child-of-type': 3,
      'nth-child': 3, 'nth-last-child': 3, 'nth-of-type': 3, 'nth-last-of-type': 3
      // (the 4rd line is not in W3C CSS specs but is an accepted alias of 3nd line)
    },

    // originally separated in different pseudo-classes
    // we have grouped them to optimize a bit size+speed
    // all are going through the same code path (switch)
    Others: {
      // Content
      // http://www.w3.org/TR/2001/CR-css3-selectors-20011113/#content-selectors
      'contains': '?',

      // UIElementStates
      // we group them to optimize
      'checked': 3, 'disabled': 3, 'enabled': 3, 'selected': 2, 'indeterminate': '?',

      // Dynamic
      'active': 3, 'focus': 3, 'hover': 3, 'link': 3, 'visited': 3,

      'target': 3,

      'lang': 3,

      'not': 3
    }
  },

  // attribute operators
  Operators = {
    // ! is not really in the specs
    // still unit tests have to pass
     '=': "%p==='%m'",
    '!=': "%p!=='%m'",
    '^=': "%p.indexOf('%m')==0",
    '*=': "%p.indexOf('%m')>-1",

    // sensitivity handled by compiler
    // NOTE: working alternative
    // '|=': "/%m-/i.test(%p+'-')",
    '|=': "(%p+'-').indexOf('%m-')==0",
    '~=': "(' '+%p+' ').indexOf(' %m ')>-1",

    // precompile in '%m' string length to optimize
    // NOTE: working alternative
    // '$=': "%p.lastIndexOf('%m')==%p.length-'%m'.length"
    '$=': "%p.substr(%p.length - '%m'.length) === '%m'"
  },

  // optimization expressions
  Optimize = {
    'id':        new RegExp("#("   + strIdentifier + ")|" + strSkipGroups),
    'className': new RegExp("\\.(" + strIdentifier + ")|" + strSkipGroups),
    'tagName':   new RegExp("(?:^|[>+~\\x20])(" + strIdentifier + ")|" + strSkipGroups)
  },

  // precompiled Regular Expressions
  Patterns = {
    // element attribute matcher
    'attribute': /^\[((?:[-\w]+\:)?[-\w]+)(?:([~*^$|!]?=)(["']?)((?:(?!\3)[^\\]|[^\\]|\\.)*?)\3)?\](.*)/,

    // structural pseudo-classes
    'spseudos': /^\:(root|empty|nth)?-?(first|last|only)?-?(child)?-?(of-type)?(?:\(([^\)]*)\))?(.*)/,

    // uistates + dynamic + negation pseudo-classes
    'dpseudos': /^\:((?:[-\w]|[^\x00-\xa0]|\\.)+)(?:\((["']?)(.*?(?:\(.*\))?[^'"()]*?)\2\))?(.*)/,

    // E > F
    'children': /^\>(.*)/,

    // E + F
    'adjacent': /^\+(.*)/,

    // E ~ F
    'relative': /^\~(.*)/,

    // E F
    'ancestor': /^\x20(.*)/,

    // universal
    'universal': /^\*(.*)/,

    // id
    'id': new RegExp("^#(" + strIdentifier + ")(.*)"),

    // tag
    'tagName': new RegExp("^(" + strIdentifier + ")(.*)"),

    // class
    'className': new RegExp("^\\.(" + strIdentifier + ")(.*)")
  },

  // place to add exotic functionalities
  Selectors = {
    // For example this will check for chars not in standard ascii table.
    // 'mySelectorCallback' will be invoked only after passing all other
    // standard checks and only if none of them worked.
    //
    // 'mySpecialSelector': {
    //    'Expression': /\u0080-\uffff/,
    //    'Callback': mySelectorCallback
    //  }
  },

  /*------------------------------ DOM METHODS -------------------------------*/

  // concat elements to data
  concatList =
    function(data, elements) {
      var element, i = -1, pad = data.length;
      if (!pad && Array.slice) return Array.slice(elements);
      while (element = elements[++i]) data[pad + i] = element;
      return data;
    },

  // concat elements to data and callback
  concatCall =
    function(data, elements, callback) {
      var element, i = -1, pad = data.length;
      while (element = elements[++i])
        callback(data[pad + i] = element);
      return data;
    },

  // iterate over data and callback
  forEachCall =
    function(data, callback) {
      var element, i = -1;
      while (element = data[++i]) callback(element);
    },

  // children position by nodeType
  // @return number
  getChildIndexes =
    function(element) {
      var indexes, i = 0,
       id = element[UID] || (element[UID] = ++UID_COUNT);

      if (!(indexes = childIndexes[id])) {
        indexes =
        childIndexes[id] = { };

        if ((element = element.firstChild)) {
          do {
            if (element.nodeName.charCodeAt(0) > 64) {
              indexes[element[UID] || (element[UID] = ++UID_COUNT)] = ++i;
            }
          } while ((element = element.nextSibling));
        }
        indexes.length = i;
      }
      return indexes;
    },

  // children position by nodeName
  // @return number
  getChildIndexesByTag =
    function(element, name) {
      var indexes, i = 0,
       id = element[UID] || (element[UID] = ++UID_COUNT),
       cache = childIndexesByTag[id] || (childIndexesByTag[id] = { });

      if (!(indexes = cache[name])) {
        indexes = cache[name] = { };
        if ((element = element.firstChild)) {
          do {
            if (element.nodeName.toUpperCase() == name) {
              indexes[element[UID] || (element[UID] = ++UID_COUNT)] = ++i;
            }
          } while ((element = element.nextSibling));
        }
        indexes.length = i;
      }
      return cache;
    },

  // attribute value
  // @return string
  getAttribute = NATIVE_HAS_ATTRIBUTE ?
    function(element, attribute) {
      return element.getAttribute(attribute) + '';
    } :
    function(element, attribute) {
      // specific URI attributes (parameter 2 to fix IE bug)
      if (ATTRIBUTES_URI[attribute]) {
        return element.getAttribute(attribute, 2) + '';
      }
      var node = element.getAttributeNode(attribute);
      return (node && node.value) + '';
    },

  // attribute presence
  // @return boolean
  hasAttribute = NATIVE_HAS_ATTRIBUTE ?
    function(element, attribute) {
      return element.hasAttribute(attribute);
    } :
    function(element, attribute) {
      // need to get at AttributeNode first on IE
      var node = element.getAttributeNode(attribute);
      // use both "specified" & "nodeValue" properties
      return !!(node && (node.specified || node.nodeValue));
    },

  isDisconnected = 'compareDocumentPosition' in root ?
    function(element, container) {
      return (container.compareDocumentPosition(element) & 1) == 1;
    } : 'contains' in root ?
    function(element, container) {
      return !container.contains(element);
    } :
    function(element, container) {
      while ((element = element.parentNode)) {
        if (element === container) return false;
      }
      return true;
    },

  // check if element matches the :link pseudo
  // @return boolean
  isLink =
    function(element) {
      return hasAttribute(element,'href') && LINK_NODES[element.nodeName];
    },

  // elements by class
  // @return nodeList (native GEBCN)
  // @return array (non native GEBCN)
  byClass =
    function(className, from) {
      if (notHTML) {
        return select('*[class~="' + className + '"]', from || doc);
      }
      if (BUGGY_GEBCN) {
        var element, i = -1, j = i, results = [ ],
         elements = byTag('*', from),
         cn = isQuirks ? className.toLowerCase() : className;

        className = ' ' + cn.replace(/\\/g, '') + ' ';
        while ((element = elements[++i])) {
          if ((cn = element.className) && cn.length &&
              (' ' + (isQuirks ? cn.toLowerCase() : cn) + ' ')
              .replace(reEdgeSpaces, ' ').indexOf(className) > -1) {
            results[++j] = element;
          }
        }
        return results;
      }

      return (from || doc).getElementsByClassName(className.replace(/\\/g, ''));
    },

  // element by id
  // @return element reference or null
  byId =
    function(id, from) {
      var element, elements, node, i = -1;
      from || (from = doc);
      id = id.replace(/\\/g, '');

      if (!notHTML && from.getElementById) {
        if ((element = from.getElementById(id)) && BUGGY_GEBID &&
            id != getAttribute(element, 'id')) {
          elements = from.getElementsByName(id);
          while ((element = elements[++i])) {
            if (element.getAttribute('id') == id) {
              return element;
            }
          }
          return null;
        }
        return element;
      }

      // fallback to manual
      elements = byTag('*', from);
      while ((element = elements[++i])) {
        if (element.getAttribute('id') == id) {
          return element;
        }
      }
      return null;
    },

  // elements by name
  // @return array
  byName =
    function(name, from) {
      if (notHTML) {
        // prefix with a <space> so it isn't caught by RE_SIMPLE_SELECTOR
        return select(' *[name="' + name + '"]', from || doc);
      }
      name = name.replace(/\\/g, '');
      if (BUGGY_GEBN) {
        var element, results = [ ], i = -1,
         elements = (from || doc).getElementsByName(name);
        while ((element = elements[++i])) {
          if (element.getAttribute('name') == name) {
            results.push(element);
          }
        }
        return results;
      }

      return (from || doc).getElementsByName(name);
    },

  // elements by tag
  // @return nodeList (live)
  byTag =
    function(tag, from) {
      // support document fragments
      if (from && typeof from.getElementsByTagName == 'undefined') {
        var child, isUniversal, upperCased, results = [ ];
        if ((child = from.firstChild)) {
          isUniversal = tag === '*';
          upperCased = tag.toUpperCase();
          do {
            if (isUniversal || child.nodeName.toUpperCase() === upperCased) {
              results.push(child);
            }
            if (child.getElementsByTagName) {
              results = concatList(results, child.getElementsByTagName(tag));
            }
          } while ((child = child.nextSibling));
        }
        return results;
      }

      return (from || doc).getElementsByTagName(tag);
    },

  /*---------------------------- COMPILER METHODS ----------------------------*/

  // a common chunk of code used a couple times in compiled functions
  ACCEPT_NODE = 'f&&f(N);r[r.length]=N;continue main;',

  // conditionals optimizers for the compiler

  // checks if nodeName comparisons need to be upperCased
  TO_UPPER_CASE =
    typeof doc.createElementNS == 'function' ? '.toUpperCase()' : '',

  // filter IE gEBTN('*') results containing non-elements like comments and `/video`
  ELEMENTS_ONLY = BUGGY_GEBTN ? 'e.nodeName.charCodeAt(0)>64' : 'e',

  ELEMENTS_ONLY_AND = BUGGY_GEBTN ? ELEMENTS_ONLY + '&&' : '',

  AND_ELEMENTS_ONLY = BUGGY_GEBTN ? '&&' + ELEMENTS_ONLY : '',

  // Use the textContent or innerText property to check CSS3 :contains
  // Safari 2 has a bug with innerText and hidden content, using an
  // internal replace on the innerHTML property avoids trashing it.
  // ** This solution will not work in XML or XHTML documents **
  CONTAINS_TEXT =
    'textContent' in root ?
    'e.textContent' :
    (function() {
      // <p>p</p>
      clearElement(div)
        .appendChild(createElement('p'))
        .appendChild(document.createTextNode('p'));

      div.style.display = 'none';
      return div.innerText ?
        'e.innerText' :
        's.stripTags(e.innerHTML)';
    })(),

  // compile a comma separated selector
  // @mode boolean true for select, false for match
  // @return function (compiled)
  compileGroup =
    function(selector, source, mode) {
      var parts, token, i = -1, seen = { };
      if ((parts = selector.match(reSplitGroup))) {
        // for each selector in the group
        while ((token = parts[++i])) {
          // avoid repeating the same token in comma separated group (p, p)
          if (!seen[token]) {
            seen[token] = true;
            // reset `e` to begin another selector
            source += (i ? 'e=N;' : '') +
              compileSelector(token, mode ? ACCEPT_NODE : 'f&&f(N);return true;');
          }
        }
      }

      // for select method
      if (mode) {
        // (c-ollection, s-napshot, d-ocument, h-root, g-from, f-callback, x-notHTML)
        return new Function('c,s,d,h,g,f,x',
          'var e,n,N,t,i=-1,j=-1,r=[];main:while(N=e=c[++i]){' + source + '}return r;');
      }
      // for match method
      else {
        // (e-element, s-napshot, d-ocument, h-root, g-from, f-callback, x-notHTML)
        return new Function('e,s,d,h,g,f,x',
          'var n,t,N=e;' + source + 'return false;');
      }
    },

  // compile a single selector for use with select()
  // @return function (compiled)
  compileSingle =
    function(selector) {
      var source = compileSelector(selector, ACCEPT_NODE);
      return new Function('c,s,d,h,g,f,x',
        'var e,n,N,t,i=-1,j=-1,r=[];main:while(N=e=c[++i]){' + source + '}return r;');
    },

  // compile a CSS3 string selector into ad-hoc javascript matching function
  // @return string (to be compiled)
  compileSelector =
    function(selector, source) {

      // assume matching `*` if F is not provided
      if (/[>+~]$/.test(selector)) {
        selector += '*';
      }

      var i, a, b, n, expr, match, result, status, test, type,
       origSelector = selector,
       pseudoStructural = CSS3PseudoClasses.Structural,
       pseudoOthers = CSS3PseudoClasses.Others,
       ptnAdjacent  = Patterns.adjacent,
       ptnAncestor  = Patterns.ancestor,
       ptnAttribute = Patterns.attribute,
       ptnClassName = Patterns.className,
       ptnChildren  = Patterns.children,
       ptnDpseudos  = Patterns.dpseudos,
       ptnId        = Patterns.id,
       ptnRelative  = Patterns.relative,
       ptnSpseudos  = Patterns.spseudos,
       ptnTagName   = Patterns.tagName,
       ptnUniversal = Patterns.universal,
       k = 0;

      while (selector) {
        // *** Universal selector
        // * match all (empty block, do not remove)
        if ((match = selector.match(ptnUniversal))) {
          // BUGGY_GEBTN return comment nodes (ex: IE)
          source = 'if(' + ELEMENTS_ONLY + '){' + source + '}';
        }

        // *** ID selector
        // #Foo Id case sensitive
        else if ((match = selector.match(ptnId))) {
          // document can contain conflicting elements (id/name)
          // prototype selector unit need this method to recover bad HTML forms
          source = 'if((e.submit?s.getAttribute(e,"id"):e.id)=="' +
            match[1] + '"){' + source + '}';
        }

        // *** Type selector
        // Foo Tag (case insensitive)
        else if ((match = selector.match(ptnTagName))) {
          // both tagName and nodeName properties may be upper or lower case
          // depending on their creation NAMESPACE in createElementNS()
          source = 'if(e.nodeName' + TO_UPPER_CASE + '=="' +
            match[1].toUpperCase() + '"){' + source + '}';
        }

        // *** Class selector
        // .Foo Class
        // case sensitivity is treated differently depending on the document type (see map)
        else if ((match = selector.match(ptnClassName))) {
          // W3C CSS3 specs: element whose "class" attribute has been assigned a
          // list of whitespace-separated values, see section 6.4 Class selectors
          // and notes at the bottom; explicitly non-normative in this specification.
          source =
            't = x ? s.getAttribute(e,"class") : e.className;' +
            'if(t && (" "+t+" ")' +
            (isQuirks ? '.toLowerCase()' : '') +
            '.replace(/' + strEdgeSpace + '/g," ").indexOf(" ' +
            (isQuirks ? match[1].toLowerCase() : match[1]) +
            ' ")>-1){' + source + '}';
        }

        // *** Attribute selector
        // [attr] [attr=value] [attr="value"] [attr='value'] and !=, *=, ~=, |=, ^=, $=
        // case sensitivity is treated differently depending on the document type (see map)
        else if ((match = selector.match(ptnAttribute))) {
          // check case treatment from INSENSITIVE_TABLE
          if (match[2]) {
            // xml namespaced attribute ?
            expr = match[1].split(':');
            expr = expr.length == 2 ? expr[1] : expr[0];
            test = INSENSITIVE_TABLE[expr.toLowerCase()];

            source =
              'n=s.getAttribute(e,"' + match[1] + '");' +
              'if(' + Operators[match[2]].replace(/\%p/g, 'n' +
                (test ? '.toLowerCase()' : ''))
                .replace(/\%m/g, test ? match[4].toLowerCase() : match[4]) +
              '){' + source + '}';
          }
          else {
            source = 'if(s.hasAttribute(e,"' + match[1] + '")){' + source + '}';
          }
        }

        // *** Adjacent sibling combinator
        // E + F (F adiacent sibling of E)
        else if ((match = selector.match(ptnAdjacent))) {
          // assume matching context if E is not provided
          if (match[0] == origSelector) {
            source = 'if(e===g){' + source + '}';
          }

          source = NATIVE_TRAVERSAL_API ?
            'if((e=e.previousElementSibling)){' + source + '}' :
            'while((e=e.previousSibling)){' + source + 'if(!e||e.nodeType==1)break;}';
        }

        // *** General sibling combinator
        // E ~ F (F relative sibling of E)
        else if ((match = selector.match(ptnRelative))) {
          k++;

          // assume matching context if E is not provided
          if (match[0] == origSelector) {
            source = 'if(e===g){' + source + '}';
          }

          // previousSibling particularly slow on Gecko based browsers prior to FF3.1
          if (NATIVE_TRAVERSAL_API) {
            source =
              'var N' + k + '=e;e=e==h?h:e.parentNode.firstElementChild;' +
              'while(e&&e!=N' + k +'){' + source + 'e=e.nextElementSibling;}';
          } else {
            source =
              'var N' + k + '=e;e=e.parentNode.firstChild;' +
              'while(e&&e!=N' + k +'){' + source + 'e=e.nextSibling;}';
          }
        }

        // *** Child combinator
        // E > F (F children of E)
        else if ((match = selector.match(ptnChildren))) {
          // assume matching context if E is not provided
          if (match[0] == origSelector) {
            source = 'if(e===g){' + source + '}';
          }

          source = 'if(e!==g&&(e=e.parentNode)&&e.nodeType==1){' + source + '}';
        }

        // *** Descendant combinator
        // E F (E ancestor of F)
        else if ((match = selector.match(ptnAncestor))) {
          source = 'while(e!==g&&(e=e.parentNode)&&e.nodeType==1){' + source + '}';
        }

        // *** Structural pseudo-classes
        // :root, :empty,
        // :first-child, :last-child, :only-child,
        // :first-of-type, :last-of-type, :only-of-type,
        // :nth-child(), :nth-last-child(), :nth-of-type(), :nth-last-of-type()
        else if ((match = selector.match(ptnSpseudos)) &&
          pseudoStructural[selector.match(reIdentifier)[0]]) {

          switch (match[1]) {
            case 'root':
              // element root of the document
              source = 'if(e===h){' + source + '}';
              break;

            case 'empty':
              // element that has no children
              source = 'if(' + ELEMENTS_ONLY_AND +
                '!e.firstChild){' + source + '}';
              break;

            default:
              if (match[1] && match[5]) {
                if (match[5] == 'even') {
                  a = 2;
                  b = 0;
                } else if (match[5] == 'odd') {
                  a = 2;
                  b = 1;
                } else {
                  // assumes correct "an+b" format, "b" before "a" to keep "n" values
                  b = (n = match[5].match(/(-?\d+)$/)) ? parseInt(n[1], 10) : 0;
                  a = (n = match[5].match(/(-?\d*)n/)) ? parseInt(n[1], 10) : 0;
                  if (n && n[1] == '-') a = -1;
                }

                // executed after the count is computed
                type = match[4] ? 'n[t]' : 'n';
                expr = match[2] == 'last' ? type + '.length-' + (b - 1) : b;

                // shortcut check for of-type selectors
                type += '[e.' + UID + ']';

                // build test expression out of structural pseudo (an+b) parameters
                // see here: http://www.w3.org/TR/css3-selectors/#nth-child-pseudo
                test = b < 1 && a > 1 ? '(' + type + '-(' + b + '))%' + a + '==0' :
                  a > +1  ? type + '>=' + b + '&&(' + type + '-(' + b + '))%' + a + '==0' :
                  a < -1  ? type + '<=' + b + '&&(' + type + '-(' + b + '))%' + a + '==0' :
                  a === 0 ? type + '==' + expr : a == -1 ? type + '<=' + b : type + '>=' + b;

                // 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
                source =
                  'if(e!==h' + AND_ELEMENTS_ONLY + '){' +
                    't=e.nodeName' + TO_UPPER_CASE +
                    ';n=s.getChildIndexes' + (match[4] ? 'ByTag' : '') +
                    '(e.parentNode' + (match[4] ? ',t' : '') + ');' +
                    'if(' + test + '){' + source + '}' +
                  '}';

              } else {
                // 6 cases: 3 (first, last, only) x 1 (child) x 2 (-of-type)
                a = match[2] == 'first' ? 'previous' : 'next';
                n = match[2] == 'only'  ? 'previous' : 'next';
                b = match[2] == 'first' || match[2] == 'last';

                type = match[4] ? '&&n.nodeName!=e.nodeName' : '&&n.nodeName.charCodeAt(0)<65';

                if (NATIVE_TRAVERSAL_API) {
                  a += 'Element';
                  n += 'Element';
                  if (!match[4]) type = '&&false';
                }

                source =
                  'if(e!==h' + AND_ELEMENTS_ONLY + '){' +
                    ( 'n=e;while((n=n.' + a + 'Sibling)' + type + ');if(!n){' + (b ? source :
                      'n=e;while((n=n.' + n + 'Sibling)' + type + ');if(!n){' + source + '}') + '}' ) +
                  '}';
              }
              break;
          }
        }

        // *** negation, user action and target pseudo-classes
        // *** UI element states and dynamic pseudo-classes
        // CSS3 :not, :checked, :enabled, :disabled, :target
        // CSS3 :active, :hover, :focus
        // CSS3 :link, :visited
        else if ((match = selector.match(ptnDpseudos)) &&
          pseudoOthers[selector.match(reIdentifier)[0]]) {

          switch (match[1]) {
            // CSS3 negation pseudo-class
            case 'not':
              // compile nested selectors, need to escape double quotes characters
              // since the string we are inserting into already uses double quotes
              source = 'if(' + ELEMENTS_ONLY_AND +
                '!s.match(e, "' + match[3].replace(/\x22/g, '\\"') + '")){' + source +'}';
              break;

            // CSS3 UI element states
            case 'checked':
              // only radio buttons and check boxes
              source = 'if("form" in e&&/^(?:radio|checkbox)$/i.test(e.type)&&e.checked){' + source + '}';
              break;
            case 'enabled':
              // we assume form controls have a `form` and `type` property.
              // does not consider hidden input fields
              source = 'if((("form" in e&&e.type&&e.type.toLowerCase()!=="hidden")||s.isLink(e))&&!e.disabled){' + source + '}';
              break;
            case 'disabled':
              // does not consider hidden input fields
              source = 'if("form" in e&&e.type&&e.type.toLowerCase()!=="hidden"&&e.disabled){' + source + '}';
              break;

            // CSS3 target pseudo-class
            case 'target':
              n = global.location.hash;
              source = 'if(e.id=="' + n + '"&&e.href!=void 0){' + source + '}';
              break;

            // CSS3 dynamic pseudo-classes
            case 'link':
              source = 'if(s.isLink(e)&&!e.visited){' + source + '}';
              break;
            case 'visited':
              source = 'if(s.isLink(e)&&!!e.visited){' + source + '}';
              break;

            // CSS3 user action pseudo-classes IE & FF3 have native support
            // these capabilities may be emulated by some event managers
            case 'active':
              source = 'if(e===d.activeElement){' + source + '}';
              break;
            case 'hover':
              source = 'if(e===d.hoverElement){' + source + '}';
              break;
            case 'focus':
              source = NATIVE_HAS_FOCUS ?
                'if(e===d.activeElement&&d.hasFocus()){' + source + '}' :
                'if(e===d.activeElement){' + source + '}';
              break;

            // CSS2 :contains and :selected pseudo-classes
            // not currently part of CSS3 drafts
            case 'contains':
              source = 'if(' + CONTAINS_TEXT + '.indexOf("' + match[3] + '")>-1){' + source + '}';
              break;
            case 'selected':
              // fix Safari selectedIndex property bug
              if (typeof doc.getElementsByTagName !== 'undefined') {
                n = doc.getElementsByTagName('select');
                for (i = 0; n[i]; i++) {
                  n[i].selectedIndex;
                }
              }
              source = 'if(e.selected){' + source + '}';
              break;

            default:
              break;
          }
        } else {

          // this is where external extensions are
          // invoked if expressions match selectors
          expr = false;
          status = true;

          for (expr in Selectors) {
            if ((match = selector.match(Selectors[expr].Expression))) {
              result = Selectors[expr].Callback(match, source);
              source = result.source;
              status |= result.status;
            }
          }

          // if an extension fails to parse the selector
          // it must return a false boolean in "status"
          if (!status) {
            // log error but continue execution, don't throw real exceptions
            // because blocking following processes maybe is not a good idea
            emit('DOMException: unknown pseudo selector "' + selector + '"');
            return source;
          }

          if (!expr) {
            // see above, log error but continue execution
            emit('DOMException: unknown token in selector "' + selector + '"');
            return source;
          }
        }

        // ensure "match" is not null or empty since
        // we do not throw real DOMExceptions above
        selector = match && match[match.length - 1];
      }

      return source;
    },

  /*----------------------------- QUERY METHODS ------------------------------*/

  // match element with selector
  // @return boolean
  match =
    function(element, selector, from, callback) {
      // make sure an element node was passed
      var compiled, origSelector = selector;
      doc = element.ownerDocument;
      if (!doc && (doc = element)) return false;

      from || (from = doc);
      if (lastContext != from) {
        root = doc.documentElement;
        notHTML = !('body' in doc);
        lastContext = from;
      }

      if (!(compiled = compiledMatchers[origSelector])) {
        if (reValidator.test(selector)) {
          // remove extraneous whitespace
          if (reUnnormalized.test(selector))
            selector = normalize(selector);

          // save compiled matchers
          if (!(compiled = compiledMatchers[selector])) {
            compiled =
            compiledMatchers[selector] =
            compiledMatchers[origSelector] = compileGroup(selector, '', false);
          } else {
            compiledMatchers[origSelector] = compiled;
          }
        }
        else {
          emit('DOMException: "' + selector + '" is not a valid CSS selector.');
          return false;
        }
      }

      // re-initialize indexes
      childIndexes = { };
      childIndexesByTag = { };

      return compiled(element, snap, doc, root, from, callback, notHTML);
    },

  // select elements matching simple
  // selectors using cross-browser client APIs
  // @return array
  select_simple =
    function(selector, from, callback) {
      var data, element;

      switch (selector.charAt(0)) {
        case '#':
          if ((element = byId(selector.slice(1), from))) {
            callback && callback(element);
            return [ element ];
          } else {
            return [ ];
          }

        case '.':
          // only ran if non BUGGY_GEBCN
          data = byClass(selector.slice(1), from);
          break;

        case '[':
          data = byName(selector.match(reNameValue)[2], from);
          break;

        default:
          if (selector.charAt(1) == '[') {
            data = byName(selector.match(reNameValue)[2], from);
          } else {
            // only ran if non BUGGY_GEBTN
            data = byTag(selector, from);
          }
      }

      if (data.item) {
        return callback ? concatCall([ ], data, callback) : concatList([ ], data);
      }
      callback && forEachCall(data, callback);
      return data;
    },

  // select elements matching selector
  // using the new Query Selector API
  // @return array
  select_qsa =
    function (selector, from, callback) {
      var element, elements;
      if (lastContext != (from || doc)) {
        from || (from = doc);
        root = (doc = from.ownerDocument || from).documentElement;
        notHTML = !('body' in doc);
        lastContext = from;
      }

      if (RE_SIMPLE_SELECTOR.test(selector)) {
        return select_simple(selector, from, callback);
      }
      if (!compiledSelectors[selector] &&
          !notHTML && !RE_BUGGY_QSAPI.test(selector) &&
          (!from || QSA_NODE_TYPES[from.nodeType])) {
        try {
          elements = (from || doc).querySelectorAll(selector);
        } catch(e) { }

        if (elements) {
          switch (elements.length) {
            case 0:
              return [ ];

            case 1:
              element = elements[0];
              callback && callback(element);
              return [ element ];

            default:
              if (callback)
                return concatCall([ ], elements, callback);
              return NATIVE_SLICE_PROTO ?
                slice.call(elements, 0) :
                concatList([ ], elements);
          }
        }
      }

      // fall back to NWMatcher select
      return client_api(selector, from, callback);
    },

  // select elements matching selector
  // using cross-browser client APIs
  // @return array
  client_api =
    function (selector, from, callback) {
      var Contexts, Results, className, compiled, data,
       element, elements, hasChanged, isCacheable, isSingle,
       now, normSelector, origFrom, origSelector, parts, token;

      // extract context if changed
      // avoid setting `from` before calling select_simple()
      if (lastContext != (from || doc)) {
        from || (from = doc);
        // reference context ownerDocument and document root (HTML)
        root = (doc = from.ownerDocument || from).documentElement;
        // check if context is not (X)HTML
        notHTML = !('body' in doc);
        // save passed context
        lastContext = from;
      }

      if (RE_SIMPLE_SELECTOR.test(selector)) {
        return select_simple(selector, from, callback);
      }

      from || (from = doc);

      // avoid caching disconnected nodes
      isCacheable = isCachingEnabled && !isCachingPaused &&
        !RE_BUGGY_MUTATION.test(selector) &&
        !(from.nodeType != 9 && isDisconnected(from, root));

      if (isCacheable) {
        snap = doc.snapshot;
        // valid base context storage
        if (snap && !snap.isExpired) {
          if ((elements = snap.Results[selector]) &&
            snap.Contexts[selector] == from) {
            callback && forEachCall(elements, callback);
            return elements;
          }
        } else {
          // temporarily pause caching while we are getting hammered with dom mutations (jdalton)
          now = new Date;
          if ((now - lastCalled) < minCacheRest) {
            isCacheable = false;
            isCachingPaused =
              (doc.snapshot = new Snapshot).isExpired = true;
            setTimeout(function() { isCachingPaused = false; }, minCacheRest);
          } else setCache(true, doc);
          snap = doc.snapshot;
          lastCalled = now;
        }

        Contexts = snap.Contexts;
        Results  = snap.Results;
      }

      // normalize and validate selector
      normSelector = origSelector = selector;
      if ((hasChanged = lastSelector != selector)) {
        // process valid selector strings
        if (reValidator.test(selector)) {

          // save passed selector
          lastSelector = selector;

          // remove extraneous whitespace
          if (reUnnormalized.test(selector))
            normSelector = selector = normalize(selector);
        }
        else {
          emit('DOMException: "' + selector + '" is not a valid CSS selector.');
          return [ ];
        }
      }

      /* pre-filtering pass allow to scale proportionally with big DOM trees */

      // commas separators are treated sequentially to maintain order
      if ((isSingle = selector.match(reSplitGroup).length < 2)) {

        if (hasChanged) {
          // get right most selector token
          token = selector.match(reLastToken)[0];

          // index where the last token was found
          // (avoids non-standard/deprecated RegExp.leftContext)
          lastIndex = selector.length - token.length;

          // only last slice before :not rules
          lastSlice = token.split(':not')[0];
        }

        // ID optimization RTL
        if ((parts = lastSlice.match(Optimize.id)) && (token = parts[1])) {
          if ((element = byId(token, from))) {
            if (match(element, selector)) {
              data = [ element ];
              callback && callback(element);
            }
          }

          if (isCacheable) {
            Contexts[normSelector] =
            Contexts[origSelector] = from;
            return (
              Results[selector] =
              Results[origSelector] = data || [ ]);
          }
          return data || [ ];
        }

        // ID optimization LTR by reducing the selection context
        else if ((parts = selector.match(Optimize.id)) && (token = parts[1])) {
          if ((element = byId(token, from))) {
            origFrom = from;
            if (!/[>+~]/.test(selector)) {
              selector = selector.replace('#' + token, '*');
              from = element;
            } else from = element.parentNode;
            elements = byTag('*', from);
          }
          else elements = 1;
        }

        // CLASS optimization RTL
        else if ((parts = lastSlice.match(Optimize.className)) && (token = parts[1])) {
          if ((elements = byClass(token, from)).length) {
            selector = selector.slice(0, lastIndex) +
              selector.slice(lastIndex).replace('.' + token, '*');
          }
        }

        // TAG optimization RTL
        else if ((parts = lastSlice.match(Optimize.tagName)) && (token = parts[1])) {
          if ((elements = byTag(token, from)).length) {
            selector = selector.slice(0, lastIndex) +
              selector.slice(lastIndex).replace(token, '*');
          }
        }
      }

      if (!elements) {
        // grab elements from parentNode to cover sibling and adjacent selectors
        elements = byTag('*', reSiblings.test(selector) && from.parentNode || from);
      }

      if (!elements.length) {
        if (isCacheable) {
          Contexts[normSelector] =
          Contexts[origSelector] = origFrom || from;
          return (
            Results[normSelector] =
            Results[origSelector] = [ ]);
        }
        return [ ];
      }

      /* end of prefiltering pass */

      // re-initialize indexes
      childIndexes = { };
      childIndexesByTag = { };

      // save compiled selectors
      if ((compiled = compiledSelectors[normSelector])) {
        compiledSelectors[origSelector] = compiled;
      } else {
        compiled =
        compiledSelectors[normSelector] =
        compiledSelectors[origSelector] = isSingle
          ? compileSingle(selector)
          : compileGroup(selector, '', true);
      }

      data = compiled(elements, snap, doc, root, from, callback, notHTML);

      if (isCacheable) {
        // a cached result set for the requested selector
        Contexts[normSelector] =
        Contexts[origSelector] = origFrom || from;
        return (
          Results[normSelector] =
          Results[origSelector] = data);
      }

      return data;
    },

  // use the new native Selector API if available,
  // if missing, use the cross-browser client api
  // @return array
  select = NATIVE_QSA ?
    select_qsa :
    client_api,

  /*------------------------------- DEBUG API --------------------------------*/

  // compile selectors to functions resolvers
  // @selector string
  // @mode boolean
  // false = select resolvers
  // true = match resolvers
  compile =
    function(selector, mode) {
      return String(compileGroup(normalize(selector), '', mode));
    },

  // use client_api() or select_qsa() for select()
  // @enable boolean
  // false = disable QSA
  // true = enable QSA
  setQSA =
    function(enable) {
      this.select = enable && NATIVE_QSA
        ? select_qsa
        : client_api;
    },

  /*-------------------------------- CACHING ---------------------------------*/

  // UID expando on elements,
  // used to keep child indexes
  // during a selection session
  UID_COUNT = 1,

  UID = 'uniqueID' in root ? 'uniqueID' : 'NWID_' + String(+new Date),

  isCachingEnabled = NATIVE_MUTATION_EVENTS,

  isCachingPaused = false,

  // minimum time allowed between calls to the cache initialization
  minCacheRest = 15, //ms

  // ordinal position by nodeType or nodeName
  childIndexes = { },

  childIndexesByTag = { },

  // compiled select functions returning collections
  compiledSelectors = { },

  // compiled match functions returning booleans
  compiledMatchers  = { },

  normalizedSelectors = { },

  // Keep caching states for each context document
  // set manually by using setCache(true, context)
  // expired by Mutation Events on DOM tree changes
  Snapshot = (function() {
    function Snapshot() {
      // result sets and related root contexts
      this.Results  = [ ];
      this.Contexts = [ ];
    }

    // must exist for compiled functions
    Snapshot.prototype = {
      // validation flag, creating if already expired,
      // code validation will set it valid first time
      'isExpired': false,

      'isLink':    isLink,
      'stripTags': stripTags,

      // element inspection methods
      'getAttribute': getAttribute,
      'hasAttribute': hasAttribute,

      // element indexing methods
      'getChildIndexes':      getChildIndexes,
      'getChildIndexesByTag': getChildIndexesByTag,

       // retrieval methods
      'byClass': byClass,
      'byId':    byId,
      'byName':  byName,
      'byTag':   byTag,

      // selection/matching
      'select': select,
      'match':  match
    };

    return Snapshot;
  })(),

  // enable/disable context caching system
  // @d optional document context (iframe, xml document)
  // script loading context will be used as default context
  setCache =
    function(enable, d) {
      d || (d = doc);
      if (!!enable) {
        d.snapshot = new Snapshot;
        startMutation(d);
      } else {
        stopMutation(d);
      }
      isCachingEnabled = !!enable;
    },

  // invoked by mutation events to expire cached parts
  mutationWrapper =
    function(event) {
      var d = event.target.ownerDocument || event.target;
      stopMutation(d);
      expireCache(d);
    },

  // append mutation events
  startMutation =
    function(d) {
      if (!d.isCaching) {
        // FireFox/Opera/Safari/KHTML have support for Mutation Events
        d.addEventListener('DOMAttrModified', mutationWrapper, false);
        d.addEventListener('DOMNodeInserted', mutationWrapper, false);
        d.addEventListener('DOMNodeRemoved',  mutationWrapper, false);
        d.isCaching = true;
      }
    },

  // remove mutation events
  stopMutation =
    function(d) {
      if (d.isCaching) {
        d.removeEventListener('DOMAttrModified', mutationWrapper, false);
        d.removeEventListener('DOMNodeInserted', mutationWrapper, false);
        d.removeEventListener('DOMNodeRemoved',  mutationWrapper, false);
        d.isCaching = false;
      }
    },

  // expire complete cache
  // can be invoked by Mutation Events or
  // programmatically by other code/scripts
  // document context is mandatory no checks
  expireCache =
    function(d) {
      if (d && d.snapshot) {
        d.snapshot.isExpired = true;
      }
    },

  // local indexes, cleared
  // between selection calls
  snap = new Snapshot;

  // clear temp variables
  div = isSupported = isBuggy = null;

  /*------------------------------- PUBLIC API -------------------------------*/

  global.NW || (global.NW = { });

  global.NW.Dom = {
    // retrieve elements by class name
    'byClass': BUGGY_GEBCN ? byClass :
      function(className, from) {
        var elements = byClass(className, from);
        return elements.item ? concatList([ ], elements) : elements;
      },

    // retrieve element by id attr
    'byId': byId,

    // retrieve elements by name attr
    'byName': BUGGY_GEBN ? byName :
      function(name, from) {
        var elements = byName(name, from);
        return elements.item ? concatList([ ], elements) : elements;
      },

    // retrieve elements by tag name
    'byTag':
      function(tag, from) {
        var elements = byTag(tag, from);
        return elements.item ? concatList([ ], elements) : elements;
      },

    // for debug only
    'compile': compile,

    // forced expire of DOM tree cache
    'expireCache': expireCache,

    // read the value of the attribute
    // as was in the original HTML code
    'getAttribute': getAttribute,

    // check for the attribute presence
    // as was in the original HTML code
    'hasAttribute': hasAttribute,

    // element match selector, return boolean true/false
    'match': match,

    // for debug only
    'normalize': normalize,

    // add selector patterns for user defined callbacks
    'registerSelector':
      function (name, rexp, func) {
        if (!Selectors[name]) {
          var entry = Selectors[name] = { };
          entry.Expression = rexp;
          entry.Callback = func;
        }
      },

    // add or overwrite user defined operators
    'registerOperator':
      function (symbol, resolver) {
        if (!Operators[symbol]) {
          Operators[symbol] = resolver;
        }
      },

    // elements matching selector, starting from element
    'select': select,

    // enable/disable cache
    'setCache': setCache,

    // for debug only
    'setQSA': setQSA
  };
})(this);
