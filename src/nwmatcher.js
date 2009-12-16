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

  var VERSION = 'nwmatcher-1.2.0',

  // host documents feature signature
  HOST_SIGNATURE,

  HOST_DOC = global.document,

  // temporary vars
  isSupported, isBuggy, k,

  // persist last selector parsing data
  lastCalled, lastIndex, lastNormalized, lastSelector, lastSlice,

  // context specific variables
  ctx_data, ctx_last, ctx_notHTML, ctx_nocache, ctx_snap,

  // attribute case-insensitivity map for (X)HTML
  ctx_attrCaseTable,

  // boolean if current `doc` is in quirks mode
  ctx_quirks,

  // checks if nodeName comparisons need to be upperCased
  ctx_cplUpperCase,

  // processing context
  ctx_doc = global.document,

  // context root element (HTML)
  ctx_root = ctx_doc.documentElement,

  // dummy div used in feature tests
  ctx_div = ctx_doc.createElement('DiV'),

  // used in the RE_BUGGY_XXXXX testers
  test_false = { 'test': function() { return false; } },
  test_true  = { 'test': function() { return true;  } },

  // http://www.w3.org/TR/css3-syntax/#characters
  // Unicode/ISO 10646 characters 161 and higher
  // NOTE: Safari 2.0.x crashes with escaped (\\)
  // Unicode ranges in regular expressions so we
  // use a negated character range class instead.
  //
  // A more correct but slower alternative:
  // '-?(?:[a-zA-Z_]|[^\\x00-\\xa0]|\\\\.)(?:[-\\w]|[^\\x00-\\xa0]|\\\\.)*'
  str_identifier = '(?:[-\\w]|[^\\x00-\\xa0]|\\\\.)+',

  // used to match [ ] or ( ) groups
  // http://blog.stevenlevithan.com/archives/match-quoted-string/
  str_groups =
    '(?:' +
    '\\[(?:[-\\w]+:)?[-\\w]+(?:[~*^$|!]?=(["\']?)(?:(?!\\1)[^\\\\]|[^\\\\]|\\\\.)*?\\1)?\\]' +
    '|' +
    '\\((["\']?).*?(?:\\(.*\\))?[^\'"()]*?\\2\\)' +
    ')',

  // used to skip [ ] or ( ) groups
  // we use \2 and \3 because we assume \1 will be the captured group not being skipped
  str_skipGroups = str_groups.replace('\\2', '\\3').replace(/\\1/g, '\\2'),

  // used to skip "..." or '...' quoted attribute values
  // we use \2 because we assume \1 will be the captured group not being skipped
  str_skipQuotes = '(["\'])(?:(?!\\2)[^\\\\]|\\\\.)*\\2',

  // pattern to match the name attribute selector `[name=value]`
  str_nameAttr = '\\[name=(["\']?)(?:(?!\\1)[^\\\\]|[^\\\\]|\\\\.)*?\\1\\]',

  // whitespace related patterns
  str_edgeSpace     = '[\\t\\n\\r\\f]',
  str_leadingSpace  = '\\x20+([\\])=>+~,^$|!]|\\*=)',
  str_multiSpace    = '\\x20{2,}',
  str_trailingSpace = '([[(=>+~,^$|!]|\\*=)\\x20+',

  /*-------------------------------- REGEXPS ---------------------------------*/

  // parse name value from name selector `[name=value]`
  re_nameValue = /=(['"]?)((?:(?!\1)[^\\]|[^\\]|\\.)*?)\1\]$/,

  // detect sibling selectors + and ~
  re_siblings = new RegExp('^(?:\\*|[.#]?' + str_identifier + ')?[+~]'),

  // split comma separated selector groups
  // exclude escaped commas and those inside '', "", (), []
  // example: `#div a, ul > li a` group 1 is `#div a`, group 2 is `ul > li a`
  re_splitGroup = new RegExp('(?:' + str_groups + '|(?!,)[^\\\\]|\\\\.)+', 'g'),

  // split last, right most, selector group token
  re_lastToken = new RegExp('(?:(?:' + str_groups + '|(?![ >+~,()[\\]])[^\\\\]|\\\\.)+|[>+~])$'),

  // simple check to ensure the first character of a selector is valid
  // http://www.w3.org/TR/css3-syntax/#characters
  re_validator = /^[\x20\t\n\r]*(?:[*>+~a-zA-Za-zA-Z]|\[[\x20\t\n\r\fa-zA-Z]|[.:#_]?(?!-?\d)-?(?:[a-zA-Z_]|[^\x00-\xa0]|\\.))/,

  // optimization expressions
  re_optimizeId        = new RegExp("#(" + str_identifier + ")|" + str_skipGroups),
  re_optimizeIdAtEnd   = new RegExp("#(" + str_identifier + ")$|" + str_skipGroups),
  re_optimizeClass     = new RegExp("\\.(" + str_identifier + ")|" + str_skipGroups),
  re_optimizeName      = new RegExp("(" + str_nameAttr.replace(/\\1/g, '\\2') + ")|" + str_skipGroups, 'i'),
  re_optimizeTag       = new RegExp("(?:^|[>+~\\x20])(" + str_identifier + ")|" + str_skipGroups),
  re_optimizeByRemoval = new RegExp(str_identifier.slice(0, -1) + '|^$'),

  // for use with the normilize method
  re_attrNormalize = /[[(]/,
  re_unnormalized  = /^\x20|[\t\n\r\f]|\x20{2,}|\x20(?:[\]\)=>+~,^$|!]|\*=)|(?:[\[\(=>+~,^$|!]|\*=)\x20|\x20$/,

  re_edgeSpaces     = new RegExp(str_edgeSpace, 'g'),
  re_multiSpaces    = new RegExp(str_multiSpace, 'g'),
  re_leadingSpaces  = new RegExp(str_leadingSpace, 'g'),
  re_trailingSpaces = new RegExp(str_trailingSpace, 'g'),

  re_edgeSpacesWithQuotes     = new RegExp('(' + str_edgeSpace  + ')|' + str_skipQuotes, 'g'),
  re_multiSpacesWithQuotes    = new RegExp('(' + str_multiSpace + ')|' + str_skipQuotes, 'g'),
  re_leadingSpacesWithQuotes  = new RegExp(str_leadingSpace  + '|' + str_skipQuotes, 'g'),
  re_trailingSpacesWithQuotes = new RegExp(str_trailingSpace + '|' + str_skipQuotes, 'g'),

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
    // initialized by default to Standard Mode (case-sensitive),
    // it will be set dynamically by getAttributeCaseMap
    'class': 0,
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

  /*----------------------------- UTILITY METHODS ----------------------------*/

  clearElement =
    function(element) {
      if ('innerHTML' in element) {
        // avoid IE leaks associated with removeChild()
        element.innerHTML = '';
      } else {
        while (element.lastChild) {
          element.removeChild(element.lastChild);
        }
      }
      return element;
    },

  createElement =
    function(tagName) {
      return ctx_doc.createElement(tagName);
    },

  createInput =
    function(type) {
      try {
        return createElement('<input type="' + type + '">');
      } catch (e) {
        var input = createElement('input');
        input.type = type;
        return input;
      }
    },

  // normalize whitespace and remove consecutive spaces
  // http://www.w3.org/TR/css3-selectors/#selector-syntax
  normalize =
    function(selector) {
      var index, match, normalized, pattern, sequence, token, i = -1,
       cached = cache_normalized[selector];
      if (cached) return cached;

      normalized = selector;
      if (re_attrNormalize.test(normalized)) {
        sequence = [re_leadingSpacesWithQuotes, re_trailingSpacesWithQuotes, re_multiSpacesWithQuotes];
        while (match = re_edgeSpacesWithQuotes.exec(normalized)) {
          if ((token = match[1])) {
            normalized = normalized.replace(token, ' ');
          }
        }

        normalized = trim.call(normalized);
        while (pattern = sequence[++i]) {
          while (match = pattern.exec(normalized)) {
            if ((token = match[1])) {
              index = match.index;
              normalized = normalized.slice(0, index) +
                normalized.slice(index).replace(match[0], token);
              pattern.lastIndex = index + 1;
            }
          }
        }
      }
      else {
        // do the same thing, without worrying about attribute values
        normalized = trim.call(normalized.replace(re_edgeSpaces, ' '))
          .replace(re_leadingSpaces, '$1').replace(re_trailingSpaces, '$1')
            .replace(re_multiSpaces, ' ');
      }

      return (
        cache_normalized[selector] =
        cache_normalized[normalized] = normalized);
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

  /*----------------------------- FEATURE TESTING ----------------------------*/

  // detect native methods
  isNative =
    (function() {
      var s = (global.open + '').replace(/open/g, '');
      return function(object, method) {
        var m = object ? object[method] : false, r = new RegExp(method, 'g');
        return !!(m && typeof m != 'string' && s === (m + '').replace(r, ''));
      };
    })(),

  // NOTE: NATIVE_XXXXX checks for the existance of method only
  // even though it is supported it may still be buggy

  // detect DOM methods
  NATIVE_GEBID     = isNative(ctx_doc,  'getElementById'),
  NATIVE_GEBCN     = isNative(ctx_root, 'getElementsByClassName'),
  NATIVE_GEBN      = isNative(ctx_doc,  'getElementsByName'),
  NATIVE_GEBTN     = isNative(ctx_root, 'getElementsByTagName'),
  NATIVE_HAS_FOCUS = isNative(ctx_doc,  'hasFocus'),
  NATIVE_QSA       = isNative(ctx_doc,  'querySelectorAll'),

  CLASS_ATTRIBUTE_NAME =
    (ctx_div.className = 'x') && ctx_div.getAttribute('className') === 'x' ?
    'className' : 'class',

  RE_BUGGY_MUTATION = test_true,

  RE_BUGGY_QSA = NATIVE_QSA ?
    (function() {
      var pattern = [ ];

      // WebKit is correct with className case insensitivity (when no DOCTYPE)
      // obsolete bug https://bugs.webkit.org/show_bug.cgi?id=19047
      // so the bug is in all other browsers code now :-)
      // http://www.whatwg.org/specs/web-apps/current-work/#selectors
      //
      // Safari 3.2 QSA doesnt work with mixedcase on quirksmode
      //
      // Must test the attribute selector `[class~=xxx]`
      // before `.xXx` or else the bug may not present itself

      // <p class="xXx"></p><p class="xxx"></p>
      clearElement(ctx_div)
        .appendChild(createElement('p'))
        .className = 'xXx';

      ctx_div.appendChild(createElement('p')).className = 'xxx';

      if (ctx_doc.compatMode == 'BackCompat' &&
         (ctx_div.querySelectorAll('[class~=xxx]').length != 2 ||
          ctx_div.querySelectorAll('.xXx').length != 2)) {
        pattern.push('(?:\\[[\\x20\\t\\n\\r\\f]*class\\b|\\.' + str_identifier + ')');
      }

      // :enabled :disabled bugs with hidden fields (Firefox 3.5 QSA bug)
      // http://www.w3.org/TR/html5/interactive-elements.html#selector-enabled
      // IE8 throws error with these pseudos

      // <input type="hidden">
      clearElement(ctx_div)
        .appendChild(createInput('hidden'));

      isBuggy = true;
      try {
        isBuggy = ctx_div.querySelectorAll(':enabled').length === 1;
      } catch(e) { }

      isBuggy && pattern.push(':enabled', ':disabled');

      // :checked bugs whith checkbox fields (Opera 10beta3 bug)
      // <input type="checkbox" checked>
      clearElement(ctx_div)
        .appendChild(createInput('checkbox'))
        .checked = true;

      isBuggy = true;
      try {
        isBuggy = ctx_div.querySelectorAll(':checked').length !== 1;
      } catch(e) { }

      isBuggy && pattern.push(':checked');

      // :link bugs with hyperlinks matching (Firefox/Safari)
      // <a href="x"></a>
      clearElement(ctx_div)
        .appendChild(createElement('a'))
        .href = 'x';

      ctx_div.querySelectorAll(':link').length !== 1 &&
        pattern.push(':link');

      // [valign=TOP] case insensitivity bug wih valign values in HTML (Opera)
      // <table><tbody valign="top"></tbody></table>
      clearElement(ctx_div)
        .appendChild(createElement('table'))
        .appendChild(createElement('tbody'))
        .setAttribute('valign', 'top');

      ctx_div.querySelectorAll('[valign=TOP]').length !== 1 &&
        pattern.push('\\[[\\x20\\t\\n\\r\\f]*valign[\\x20\\t\\n\\r\\f]*=');

      return pattern.length ?
        new RegExp(pattern.join('|')) :
        test_false;
    })() :
    test_true,


  // detect native getAttribute/hasAttribute methods,
  // frameworks extend these to elements, but it seems
  // this does not work for XML namespaced attributes,
  // used to check both getAttribute/hasAttribute in IE
  NATIVE_HAS_ATTRIBUTE = isNative(ctx_root, 'hasAttribute'),

  // check for Mutation Events, DOMAttrModified should be
  // enough to ensure DOMNodeInserted/DOMNodeRemoved exist
  NATIVE_MUTATION_EVENTS = ctx_root.addEventListener ?
    (function() {
      function testSupport(attr, value) {
        // add listener and modify attribute
        var count = 0, handler = function() { count++; };
        input.addEventListener('DOMAttrModified', handler, false);
        input.setAttribute(attr, value || attr);
        input.removeAttribute(attr, value || attr);
        input[attr] = value || true;

        // cleanup
        input.removeEventListener('DOMAttrModified', handler, false);
        handler = null;
        return count === 3;
      }

      var input = clearElement(ctx_div).appendChild(createInput('input'));
      if ((isSupported = testSupport('id', 'x'))) {
        RE_BUGGY_MUTATION = testSupport('disabled') ? test_false :
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
        return !!slice.call(ctx_doc.childNodes, 0)[0];
      } catch(e) {
        return false;
      }
    })(),

  // supports the new traversal API
  NATIVE_TRAVERSAL_API =
    'nextElementSibling' in ctx_root &&
    'previousElementSibling' in ctx_root,


  // NOTE: BUGGY_XXXXX check both for existance and no known bugs.

  BUGGY_GEBN_MATCH_ID = true,

  BUGGY_GEBID =
    (function() {
      // <a id="x"></p>
      var x = 'x' + String(+new Date);
      clearElement(ctx_div).appendChild(createElement('a')).id = x;
      ctx_root.insertBefore(ctx_div, ctx_root.firstChild);

      isBuggy = !NATIVE_GEBID || !ctx_doc.getElementById(x);

      // reuse test div for BUGGY_GEBN
      if (NATIVE_GEBN) {
        // check for a buggy GEBN with id, because unlike GEBID, it will
        // present the bug before the document has finished loading
        BUGGY_GEBN_MATCH_ID = !!ctx_doc.getElementsByName(x)[0];
        if (!isBuggy) isBuggy = BUGGY_GEBN_MATCH_ID;
      }

      ctx_root.removeChild(ctx_div);
      return isBuggy;
    })(),

  // detect IE gEBTN comment nodes bug
  BUGGY_GEBTN = NATIVE_GEBTN ?
    (function() {
      clearElement(ctx_div).appendChild(ctx_doc.createComment(''));
      return !!ctx_div.getElementsByTagName('*')[0];
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
      clearElement(ctx_div)
        .appendChild(createElement('p'))
        .className = test + 'abc ' + test;

      ctx_div.appendChild(createElement('p')).className = 'x';

      isBuggy = !ctx_div[method](test)[0];

      // Safari test
      ctx_div.lastChild.className = test;
      if (!isBuggy) isBuggy = ctx_div[method](test).length !== 2;
      return isBuggy;
    })() :
    true,

  // matches simple id, tagName & className selectors
  RE_SIMPLE_SELECTOR = new RegExp('^(?:\\*|' +
    // IE8 QSA is faster than shortcut
    (BUGGY_GEBCN && NATIVE_QSA ? '#' : '[.#]') + '?' +
    str_identifier + '|\\*?' + str_nameAttr +
  ')$'),

  /*------------------------------- SELECTORS --------------------------------*/

  // attribute operators
  Operators = {
    // ! is not really in the specs
    // still unit tests have to pass
     '=': "n==='%m'",
    '!=': "n!=='%m'",
    '^=': "n.indexOf('%m')==0",
    '*=': "n.indexOf('%m')>-1",

    // sensitivity handled by compiler
    // NOTE: working alternative
    // '|=': "/%m-/i.test(n+'-')",
    '|=': "(n+'-').indexOf('%m-')==0",
    '~=': "(' '+n+' ').indexOf(' %m ')>-1",

    // precompile in '%m' string length to optimize
    // NOTE: working alternative
    // '$=': "n.lastIndexOf('%m')==n.length-'%m'.length"
    '$=': "n.substr(n.length - '%m'.length) === '%m'"
  },

  // default supported selectors
  Selectors = {
    // Each type of selector has an expression and callback.
    // The callback should return the modified source argument or
    // an undefined/falsy value for invalid matches.

    // *** Attribute selector
    // [attr] [attr=value] [attr="value"] [attr='value'] and !=, *=, ~=, |=, ^=, $=
    // case sensitivity is treated differently depending on the document type (see map)
    'attribute': {
      'expression': /^\[((?:[-\w]+\:)?[-\w]+)(?:([~*^$|!]?=)(["']?)((?:(?!\3)[^\\]|[^\\]|\\.)*?)\3)?\](.*)/,
      'callback':
        function(match, source) {
          // check case treatment from ctx_attrCaseTable
          if (match[2]) {
            // split by `:` to allow xml namespaced attributes
            var test = ctx_attrCaseTable[match[1].split(':').pop().toLowerCase()],
            // adjust case, remove backslashes, and escape double quotes
            value = (test ? match[4].toLowerCase() : match[4]).replace(/\\/g, '').replace(/\x22/g, '\\"');

            return (
              'n=' + CPL_HAS_ATTRIBUTE_API + 's.getAttribute(e,"' + match[1] + '")' +
                (test ? '.toLowerCase()' : '') + '||"";' +
              'if(' +
                Operators[match[2]].replace(/\%m/g, value) +
              '){' + source + '}');
          }
          return 'if(' + CPL_HAS_ATTRIBUTE_API + 's.hasAttribute(e,"' + match[1] + '")){' + source + '}';
        }
    },

    // *** Structural CSS3 pseudo-classes
    // :root, :empty,
    // :first-child, :last-child, :only-child,
    // :first-of-type, :last-of-type, :only-of-type,
    // :nth-child, :nth-last-child, :nth-of-type, :nth-last-of-type
    // :first-child-of-type, :last-child-of-type, only-child-of-type (custom)
    'spseudos': {
      'expression': /^\:(root|empty|(?:first|last|only)-(?:child(?:-of-type)?|of-type)|nth-(?:last-)?(?:child|of-type))(?:\(([^\)]*)\))?(.*)/,
      'callback':
        function(match, source) {
          var a, b, n, expr, test, type,
           isLast  = match[1].indexOf('last') > -1,
           parts   = match[1].split('-'),
           pseudo  = parts[0],
           ofType  = parts.pop() == 'type';
           formula = match[2];

          switch (pseudo) {
            case 'root':
              // element root of the document
              return 'if(e===h){' + source + '}';

            case 'empty':
              // element that has no children
              return 'if(!e.firstChild){' + source + '}';

            default:
              if (formula) {
                if (formula == 'even') {
                  a = 2;
                  b = 0;
                } else if (formula == 'odd') {
                  a = 2;
                  b = 1;
                } else {
                  // assumes correct "an+b" format, "b" before "a" to keep "n" values
                  b = (n = formula.match(/(-?\d+)$/)) ? parseInt(n[1], 10) : 0;
                  a = (n = formula.match(/(-?\d*)n/)) ? parseInt(n[1], 10) : 0;
                  if (n && n[1] == '-') a = -1;
                }

                // executed after the count is computed
                type = ofType ? 'n[t]' : 'n';
                expr = isLast ? type + '.length-' + (b - 1) : b;

                // shortcut check for of-type selectors
                type += '[e.' + UID + ']';

                // build test expression out of structural pseudo (an+b) parameters
                // see here: http://www.w3.org/TR/css3-selectors/#nth-child-pseudo
                test = b < 1 && a > 1 ? '(' + type + '-(' + b + '))%' + a + '==0' :
                  a > +1  ? type + '>=' + b + '&&(' + type + '-(' + b + '))%' + a + '==0' :
                  a < -1  ? type + '<=' + b + '&&(' + type + '-(' + b + '))%' + a + '==0' :
                  a === 0 ? type + '==' + expr : a == -1 ? type + '<=' + b : type + '>=' + b;

                // 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
                return (
                  'if(e!==h){' +
                    't=e.nodeName' + ctx_cpl_upperCase +
                    ';n=s.getChildIndexes' + (ofType ? 'ByTag' : '') +
                    '(e.parentNode' + (ofType ? ',t' : '') + ');' +
                    'if(' + test + '){' + source + '}' +
                  '}');
              }

              // 6 cases: 3 (first, last, only) x 1 (child) x 2 (-of-type)
              a = pseudo == 'first' ? 'previous' : 'next';
              n = pseudo == 'only'  ? 'previous' : 'next';
              b = pseudo == 'first' || isLast;

              type = ofType ? '&&n.nodeName!=e.nodeName' : '&&n.nodeName.charCodeAt(0)<65';

              if (NATIVE_TRAVERSAL_API) {
                a += 'Element';
                n += 'Element';
                if (!ofType) type = '&&false';
              }

              return (
                'if(e!==h){' +
                  ( 'n=e;while((n=n.' + a + 'Sibling)' + type + ');if(!n){' + (b ? source :
                    'n=e;while((n=n.' + n + 'Sibling)' + type + ');if(!n){' + source + '}') + '}' ) +
                '}');
          }
        }
    },

    // *** negation, user action and target pseudo-classes
    // *** UI element states and dynamic pseudo-classes
    // CSS3 :not, :checked, :enabled, :disabled, :target
    // CSS3 :active, :hover, :focus
    // CSS3 :link, :visited
    //
    // CSS2 :contains, :selected (deprecated)
    // http://www.w3.org/TR/2001/CR-css3-selectors-20011113/#content-selectors
    //
    // TODO: :indeterminate
    'dpseudos': {
      'expression': /^\:((?:active|checked|disabled|enabled|focus|hover|link|selected|target|visited)(?!\()|(?:contains|lang|not)(?=\())(?:\((["']?)(.*?(?:\(.*\))?[^'"()]*?)\2\))?(.*)/,
      'callback':
        function(match, source) {
          // escape double quotes if not already
          var value = match[3] && match[3].replace(/([^\\]?)\x22/g, '$1\\"');

          switch (match[1]) {
            /* CSS3 negation pseudo-class */
            case 'not':
              // compile nested selectors
              return value && 'if(!s.match(e,"' + value + '",g)){' + source +'}';

            /* CSS3 UI element states */
            case 'checked':
              // only radio buttons and check boxes
              return 'if("form" in e&&/^(?:radio|checkbox)$/i.test(e.type)&&e.checked){' + source + '}';

            case 'enabled':
              // we assume form controls have a `form` and `type` property.
              // does not consider hidden input fields
              return 'if(((e.type&&"form" in e&&e.type.toLowerCase()!=="hidden")||s.isLink(e))&&!e.disabled){' + source + '}';

            case 'disabled':
              // does not consider hidden input fields
              return 'if(e.type&&"form" in e&&e.type.toLowerCase()!=="hidden"&&e.disabled){' + source + '}';

            /* CSS3 lang pseudo-class */
            case 'lang':
              return !ctx_notHTML && value && (
                'do{n=e.lang;' +
                'if(n=="' + value + '"||n.indexOf("' + value + '-")==0)' +
                '{' + source + 'break;}}while((e=e.parentNode)&&e!==g)');

            /* CSS3 target pseudo-class */
            case 'target':
              // doc.location is *not* technically standard, but it might as well be.
              return 'if(e.id=="' + (ctx_doc.location ? ctx_doc.location.hash : '') + '"&&e.href!=void 0){' + source + '}';

            /* CSS3 dynamic pseudo-classes */
            case 'link':
              return 'if(s.isLink(e)&&!e.visited){' + source + '}';

            case 'visited':
              return 'if(s.isLink(e)&&e.visited){' + source + '}';

            /* CSS3 user action pseudo-classes */
            // IE & FF3 have native support
            // these capabilities may be emulated by some event managers
            case 'active':
              return !ctx_notHTML && 'if(e===d.activeElement){' + source + '}';

            case 'hover':
              return !ctx_notHTML && 'if(e===d.hoverElement){' + source + '}';

            case 'focus':
              return !ctx_notHTML && (NATIVE_HAS_FOCUS ?
                'if(e===d.activeElement&&d.hasFocus()){' + source + '}' :
                'if(e===d.activeElement){' + source + '}');

            /* CSS2 :contains and :selected pseudo-classes */
            // not currently part of CSS3 drafts
            case 'contains':
              return value && 'if(' + CPL_CONTAINS_TEXT + '.indexOf("' + value + '")>-1){' + source + '}';

            case 'selected':
              // fix Safari selectedIndex property bug
              if (typeof ctx_doc.getElementsByTagName !== 'undefined') {
                var i = 0, n = ctx_doc.getElementsByTagName('select');
                while (n[i]) { n[i++].selectedIndex; }
              }
              return 'if(e.selected){' + source + '}';
          }
        }
    },

    // *** Child combinator
    // E > F (F children of E)
    'children': {
      'expression': /^\>(.*)/,
      'callback':
        function(match, source, mode, selector) {
          // assume matching context if E is not provided
          if (match[0] == selector) {
            return 'if(e!==h&&(e=e.parentNode)==g){' + source + '}';
          }
          return 'if((e=e.parentNode)&&e!==g&&e!==h){' + source + '}';
        }
    },

    // *** Adjacent sibling combinator
    // E + F (F adiacent sibling of E)
    'adjacent': {
      'expression': /^\+(.*)/,
      'callback':
        function(match, source, mode, selector) {
          // assume matching context if E is not provided
          if (match[0] == selector) {
            source = 'if(e===g){' + source + '}';
          }
          return NATIVE_TRAVERSAL_API ?
            'if((e=e.previousElementSibling)){' + source + '}' :
            'while((e=e.previousSibling)){' + source + 'if(!e||e.nodeType==1)break;}';
        }
    },

    // *** General sibling combinator
    // E ~ F (F relative sibling of E)
    'relative': {
      'expression': /^\~(.*)/,
      'callback':
        function(match, source, mode, selector) {
          // increment private counter
          k++;

          // assume matching context if E is not provided
          if (match[0] == selector) {
            source = 'if(e===g){' + source + '}';
          }

          // previousSibling particularly slow on Gecko based browsers prior to FF3.1
          return NATIVE_TRAVERSAL_API ?
            ('var N' + k + '=e;e=e==h?h:e.parentNode.firstElementChild;' +
             'while(e&&e!=N' + k +'){' + source + 'e=e.nextElementSibling;}') :
            ('var N' + k + '=e;e=e.parentNode.firstChild;' +
             'while(e&&e!=N' + k +'){' + source + 'e=e.nextSibling;}');
        }
    },

    // *** Descendant combinator
    // E F (E ancestor of F)
    'ancestor': {
      'expression': /^\x20(.*)/,
      'callback':
        function(match, source) {
          return 'while((e=e.parentNode)&&e!==g&&e!==h){' + source + '}';
        }
    },

    // *** Universal selector
    // * match all elements
    'universal': {
      'expression': /^\*(.*)/,
      'callback':
        function(match, source) {
          return source;
        }
    },

    // *** ID selector
    // #Foo Id case sensitive
    'id': {
      'expression': new RegExp("^#(" + str_identifier + ")(.*)"),
      'callback':
        function(match, source) {
          // document can contain conflicting elements (id/name)
          // prototype selector unit need this method to recover bad HTML forms
          return ctx_notHTML ?
            'if(s.getAttribute(e, "id")=="' + match[1] + '"){' + source + '}' :
            'if((e.submit?s.getAttribute(e, "id"):e.id)=="' + match[1] + '"){' + source + '}';
        }
    },

    // *** Type selector
    // Foo Tag (case insensitive)
    'tagName': {
      'expression': new RegExp("^(?!not\\()(" + str_identifier + ")(.*)"),
      'callback':
        function(match, source) {
          // both tagName and nodeName properties may be upper or lower case
          // depending on their creation NAMESPACE in createElementNS()
          return 'if(e.nodeName' + ctx_cpl_upperCase + '=="' +
            match[1].toUpperCase() + '"){' + source + '}';
        }
    },

    // *** Class selector
    // .Foo Class
    // case sensitivity is treated differently depending on the document type (see map)
    'className': {
      'expression': new RegExp("^\\.(" + str_identifier + ")(.*)"),
      'callback':
        function(match, source) {
          // W3C CSS3 specs: element whose "class" attribute has been assigned a
          // list of whitespace-separated values, see section 6.4 Class selectors
          // and notes at the bottom; explicitly non-normative in this specification.
          return (
            't=' + (ctx_notHTML ?
              's.getAttribute(e,"class")' :
              '(e.submit?s.getAttribute(e,"' + CLASS_ATTRIBUTE_NAME + '"):e.className)') +
            ';if(t&&(" "+t+" ")' +
            (ctx_quirks ? '.toLowerCase()' : '') +
            '.replace(/' + str_edgeSpace + '/g," ").indexOf(" ' +
            (ctx_quirks ? match[1].toLowerCase() : match[1]) +
            ' ")>-1){' + source + '}');
        }
    }
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

      if (!(indexes = cache_childIndexes[id])) {
        indexes =
        cache_childIndexes[id] = { };

        if ((element = element.firstChild)) {
          do {
            if (element.nodeName > '@') {
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
       cache = cache_childIndexesByTag[id] || (cache_childIndexesByTag[id] = { });

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
    function(node, attribute) {
      return node.getAttribute(attribute) + '';
    } :
    function(node, attribute) {
      // specific URI attributes (parameter 2 to fix IE bug)
      if (ATTRIBUTES_URI[attribute]) {
        return node.getAttribute(attribute, 2) + '';
      }
      return (node = node.getAttributeNode(attribute)) ? node.value + '' : '';
    },

  // attribute presence
  // @return boolean
  hasAttribute = NATIVE_HAS_ATTRIBUTE ?
    function(node, attribute) {
      return node.hasAttribute(attribute);
    } :
    function(node, attribute) {
      // use both "specified" & "nodeValue" properties
      node = node.getAttributeNode(attribute);
      return !!(node && (node.specified || node.nodeValue));
    },

  isDisconnected = 'compareDocumentPosition' in ctx_root ?
    function(element, container) {
      return (container.compareDocumentPosition(element) & 1) == 1;
    } : 'contains' in ctx_root ?
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
  // @return nodeList (non buggy native GEBCN)
  // @return array (non native/buggy GEBCN)
  byClass = NATIVE_SLICE_PROTO && !BUGGY_GEBCN ?
    function(className, from) {
      return ctx_notHTML ?
        select_regular('*[class~="' + className + '"]', from || ctx_doc) :
        // convert to array because accessing elements is faster with arrays
        slice.call((from || ctx_doc).getElementsByClassName(className.replace(/\\/g, '')), 0);
    } :
    function(className, from) {
      if (ctx_notHTML) {
        return select_regular('*[class~="' + className + '"]', from || ctx_doc);
      }

      var element, i = -1, j = i, results = [ ],
       elements = (from || ctx_doc).getElementsByTagName('*'),
       n = ctx_quirks ? className.toLowerCase() : className;

      className = ' ' + n.replace(/\\/g, '') + ' ';
      while ((element = elements[++i])) {
        // use getAttribute() with forms to avoid issues with children that have name="className"
        if ((n = element.submit ? element.getAttribute(CLASS_ATTRIBUTE_NAME) : element.className) &&
            (' ' + (ctx_quirks ? n.toLowerCase() : n) + ' ')
            .replace(re_edgeSpaces, ' ').indexOf(className) > -1) {
          results[++j] = element;
        }
      }
      return results;
    },

  // element by id
  // @return element reference or null
  byId =
    function(id, from) {
      if (ctx_notHTML) {
        // prefix a <space> so it isn't caught by RE_SIMPLE_SELECTOR
        return select_regular(' *[id="' + id + '"]', from || ctx_doc)[0];
      }

      var element, elements, node, i = -1;
      from || (from = ctx_doc);
      id = id.replace(/\\/g, '');

      if (!from.getElementById) {
        elements = from.getElementsByTagName('*');
      }
      else if ((element = from.getElementById(id)) && BUGGY_GEBID) {
        if (element.id != id) {
          elements = from.getElementsByName(id);
        } else {
          return element;
        }
      } else {
        return element;
      }

      while ((element = elements[++i])) {
        if (element.submit) {
          if ((node = element.getAttributeNode('id')) && node.value == id) {
            return element;
          }
        } else if (element.id == id) {
          return element;
        }
      }
      return null;
    },

  // elements by name
  // @return nodeList (non buggy native GEBN)
  // @return array (non native/buggy GEBN)
  byName = NATIVE_SLICE_PROTO && !BUGGY_GEBN_MATCH_ID ?
    function(name, from) {
      return ctx_notHTML ?
        select_regular(' *[name="' + name + '"]', from || ctx_doc) :
        slice.call(ctx_doc.getElementsByName(name), 0);
    } :
    function(name, from) {
      if (ctx_notHTML) {
        return select_regular(' *[name="' + name + '"]', from || ctx_doc);
      }

      name = name.replace(/\\/g, '');
      from || (from = ctx_doc);

      var element, node, results = [ ], i = -1, j = i,
       elements = ctx_doc.getElementsByName(name),
       length = elements.length;

      // use gEBTN if no results to catch elements with
      // names that don't officially support name attributes OR
      // if results contain an element with id="length" because
      // it will produce incorrect results
      if (!length || length.nodeType) {
        elements = from.getElementsByTagName('*');
      }
      // elements with an id equal to the name may stop
      // other elements with the same name from being matched
      else if (length == 1 && (element = elements.item(0)).id == name) {
        element.id = '';
        elements = ctx_doc.getElementsByName(name);
        if (!(length = elements.length) || length.nodeType) {
          elements = from.getElementsByTagName('*');
        }
        element.id = name;
      }

      while ((element = elements[++i])) {
        if (element.submit) {
          if ((node = element.getAttributeNode('name')) && node.value == name) {
            results[++j] = element;
          }
        } else if (element.name == name) {
          results[++j] = element;
        }
      }
      return results;
    },

  // elements by tag
  // @return nodeList (native GEBTN)
  // @return array (document fragments)
  byTag = NATIVE_SLICE_PROTO && !BUGGY_GEBTN ?
    function(tag, from) {
      return ctx_notHTML && typeof from.getElementsByTagName == 'undefined' ?
        byTagInFragments(tag, from) :
        slice.call((from || ctx_doc).getElementsByTagName(tag), 0);
    } :
    function(tag, from) {
      // support document fragments
      if (ctx_notHTML && typeof from.getElementsByTagName == 'undefined') {
        return byTagInFragments(tag, from);
      }
      if (tag == '*') {
        var element, i = -1, j = i, results = [ ],
         elements = (from || ctx_doc).getElementsByTagName(tag);
        while (element = elements[++i]) {
          if (element.nodeName > '@') results[++j] = element;
        }
        return results;
      }
      return (from || ctx_doc).getElementsByTagName(tag);
    },

  // elements in document fragments by tag
  // @return array
  byTagInFragments = function(tag, from) {
    var child, isUniversal, upperCased, results = [ ];
    if ((child = from.firstChild)) {
      isUniversal = tag === '*';
      upperCased = tag.toUpperCase();
      do {
        if (child.nodeType == 1) {
          if (isUniversal || child.nodeName.toUpperCase() === upperCased) {
            results.push(child);
          }
          if (child.getElementsByTagName) {
            results = concatList(results, child.getElementsByTagName(tag));
          }
        }
      } while ((child = child.nextSibling));
    }
    return results;
  },

  /*---------------------------- COMPILER METHODS ----------------------------*/

  /* static compiler variables */

  // a common chunk of code used a couple times in compiled functions
  CPL_ACCEPT_NODE = 'f&&f(N);r[r.length]=N;continue main;',

  // IE can get attributes from comment nodes and
  // Opera 9.25 textNodes don't have the getAttribute method
  CPL_HAS_ATTRIBUTE_API = BUGGY_GEBTN ||
    !isNative(ctx_div.appendChild(ctx_doc.createTextNode('p')), 'getAttribute') ?
      'e.nodeType==1&&' : '',

  // Use the textContent or innerText property to check CSS3 :contains
  // Safari 2 has a bug with innerText and hidden content, using an
  // internal replace on the innerHTML property avoids trashing it.
  // ** This solution will not work in XML or XHTML documents **
  CPL_CONTAINS_TEXT =
    'textContent' in ctx_root ?
    'e.textContent' :
    (function() {
      // <p>p</p>
      clearElement(ctx_div)
        .appendChild(createElement('p'))
        .appendChild(ctx_doc.createTextNode('p'));

      ctx_div.style.display = 'none';
      return ctx_div.innerText ?
        'e.innerText' :
        's.stripTags(e.innerHTML)';
    })(),

  // compile a CSS3 string selector into ad-hoc javascript matching function
  // @selector string
  // @mode boolean true for select, false for match
  // @single boolean true for single, false for group selector
  // @return function (compiled)
  compileSelector =
    function(selector, mode, single) {
      var expr, inner, match, output, remaining, token, i = -1,
       seen    = { },
       footer  = '',
       header  = '',
       source  = '',
       footers = [ ],
       headers = [mode ? 'var e,n,N,t,i=-1,j=-1,r=[];' : 'var c,i,j,n,r,t,N=e;'],
       parts   = single ? [selector] : selector.match(re_splitGroup);

      // for each selector in the group
      while ((selector = parts[++i])) {

        if (/[>+~]$/.test(selector)) {
          // assume matching `*` if F is not provided
          selector += '*';
        } else if (/^[\x20*]+$/.test(selector)) {
          // convert something like `* * *` to `*`
          selector = '*';
        }

        // avoid repeating the same selector in comma separated groups (p, p)
        if (seen[selector]) { continue; }

        seen[selector] = true;

        // reset `e` to begin another selector
        source += source ? 'e=N;' : '';

        // begin building inner source for current selector
        inner = mode ? CPL_ACCEPT_NODE : 'f&&f(N);return true;';

        // quickly process `*` selectors
        if (selector == '*') {
          source += BUGGY_GEBTN ? 'if(e.nodeName>"@"){' + inner + '}' : inner;
          continue;
        }

        // add element node checks for selectors like `* + *` or `* ~ *`
        if (/^\W+$/.test(selector)) {
          inner = 'if(e.nodeName>"@"){' + inner + '}';
        }

        // reset private counter
        // used by sibling combinator
        // E ~ F (F relative sibling of E)
        k = 0;

        // the selector is whittled down match by match
        remaining = selector;

        while (remaining) {
          output = null;
          for (expr in Selectors) {
            if ((match = remaining.match(Selectors[expr].expression))) {
              output = Selectors[expr].callback(match, inner, mode, selector);
              if (!output) {
                break;
              } else if (typeof output === 'object') {
                output.header && headers.push(output.header);
                output.footer && footers.push(output.footer);
                inner = output.source;
              } else {
                inner = output;
              }

              remaining = match[match.length - 1];
              if (!remaining) { break; }
            }
          }
          if (!output) {
            // log error but continue execution
            emit('DOMException: unknown selector "' + remaining + '"');
            // return empty array or false depending on mode
            inner = mode ? 'return r;' : '';
            break;
          }
        }
        source += inner;
      }

      // append default footer
      footers.push(mode ? 'return r;' : 'return false;');

      // insert before primary iterator
      i = -1;
      while ((token = headers[++i])) {
        if (!seen[token]) {
          header += token;
          seen[token] = true;
        }
      }

      // insert after primary iterator
      i = -1;
      while ((token = footers[++i])) {
        if (!seen[token]) {
          footer += token;
          seen[token] = true;
        }
      }

      // create primary iterator if there is source
      if (mode && source) {
        source = 'main:while(N=e=c[++i]){' + source + '}';
      }

      // (c-ollection OR e-element, s-napshot, d-ocument, h-root, g-from, f-callback)
      return new Function((mode ? 'c' : 'e') + ',s,d,h,g,f',
        header + source + footer);
    },

  /*----------------------------- QUERY METHODS ------------------------------*/

  // match element with selector
  // @return boolean
  match =
    function(element, selector, from, callback) {
      // make sure an element node was passed
      var compiled, normalized;
      if (!element || !(ctx_doc = element.ownerDocument) &&
          (ctx_doc = element)) {
        return false;
      }

      selector || (selector = '');
      if (ctx_last != (from || HOST_DOC)) {
        from = changeContext(from);
      }

      if (ctx_nocache || !(compiled = cache_compiledMatchers[selector])) {
        if (re_validator.test(selector)) {
          normalized = re_unnormalized.test(selector) ?
            normalize(selector) : selector;
        } else {
          emit('DOMException: "' + selector + '" is not a valid CSS selector.');
          return false;
        }

        // only cache compiled matchers for contexts
        // that are the same type of document as the host
        // (new context xhtml B is like host xhtml A)
        if (ctx_nocache) {
          compiled = compileGroup(normalized, '', false);
        } else if (!(compiled = cache_compiledMatchers[normalized])) {
          compiled =
          cache_compiledMatchers[selector] =
          cache_compiledMatchers[normalized] = compileSelector(normalized);
        } else {
          cache_compiledMatchers[normalized] = compiled;
        }
      }

      // re-initialize indexes
      cache_childIndexes = { };
      cache_childIndexesByTag = { };

      return compiled(element, Util, ctx_doc, ctx_root, from, callback);
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
          // only ran if not BUGGY_GEBCN
          data = byClass(selector.slice(1), from);
          break;

        case '[':
          data = byName(selector.match(re_nameValue)[2], from);
          break;

        default:
          if (selector.charAt(1) == '[') {
            data = byName(selector.match(re_nameValue)[2], from);
          } else {
            // only ran if not BUGGY_GEBTN
            data = byTag(selector, from);
          }
      }

      if (data.push) {
        callback && forEachCall(data, callback);
        return data;
      }
      return callback ? concatCall([ ], data, callback) : concatList([ ], data);
    },

  // select elements matching selector
  // using the new Query Selector API
  // @return array
  select_qsa =
    function (selector, from, callback) {
      var element, elements;
      selector || (selector = '');
      if (ctx_last != (from || HOST_DOC)) {
        from = changeContext(from);
      }
      if (RE_SIMPLE_SELECTOR.test(selector)) {
        return select_simple(selector, from, callback);
      }
      if (!cache_compiledSelectors[selector] &&
          !ctx_notHTML && !RE_BUGGY_QSA.test(selector) &&
          (!from || QSA_NODE_TYPES[from.nodeType])) {
        try {
          elements = (from || ctx_doc).querySelectorAll(selector);
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
              return callback ?
                concatCall([ ], elements, callback) :
                (NATIVE_SLICE_PROTO ? slice.call(elements, 0) : concatList([ ], elements));
          }
        }
      }

      // fall back to NWMatcher select
      return select_regular(selector, from, callback);
    },

  // select elements matching selector
  // using cross-browser client APIs
  // @return array
  select_regular =
    function (selector, from, callback) {
      var Contexts, Results, backupFrom, backupSelector, className,
       compiled, data, element, elements, hasChanged, isCacheable,
       isSingle, normalized, now, parts, token;

      // extract context if changed
      // avoid setting `from` before calling select_simple()
      if (ctx_last != (from || HOST_DOC)) {
        from = changeContext(from);
      }

      selector || (selector = '');
      if (RE_SIMPLE_SELECTOR.test(selector)) {
        return select_simple(selector, from, callback);
      }

      from || (from = HOST_DOC);

      // avoid caching disconnected nodes
      isCacheable = cache_enabled && !ctx_nocache && !cache_paused &&
        !RE_BUGGY_MUTATION.test(selector) &&
        !(from != ctx_doc && isDisconnected(from, ctx_root));

      if (isCacheable) {
        // valid base context storage
        if (ctx_snap && !ctx_snap.isExpired) {
          if ((elements = ctx_snap.Results[selector]) &&
            ctx_snap.Contexts[selector] == from) {
            callback && forEachCall(elements, callback);
            return elements;
          }
        } else {
          // temporarily pause caching while we are getting hammered with dom mutations (jdalton)
          now = new Date;
          if ((now - lastCalled) < cache_minRest) {
            isCacheable = false;
            cache_paused = (ctx_data.snapshot = new Snapshot).isExpired = true;
            global.setTimeout(function() { cache_paused = false; }, cache_minRest);
          }
          else setCache(true, ctx_doc);

          ctx_snap = ctx_data.snapshot;
          lastCalled = now;
        }

        Contexts = ctx_snap.Contexts;
        Results  = ctx_snap.Results;
      }

      // normalize and validate selector
      if ((hasChanged = lastSelector != selector)) {
        // process valid selector strings
        if (re_validator.test(selector)) {
          // save passed selector
          lastSelector = selector;

          // remove extraneous whitespace
          normalized =
          lastNormalized = re_unnormalized.test(selector) ?
            normalize(selector) : selector;
        }
        else {
          emit('DOMException: "' + selector + '" is not a valid CSS selector.');
          return [ ];
        }
      } else {
        normalized = lastNormalized;
      }

      /* pre-filtering pass allow to scale proportionally with big DOM trees */

      // commas separators are treated sequentially to maintain order
      if ((isSingle = (parts = normalized.match(re_splitGroup)).length < 2) && !ctx_notHTML) {

        if (hasChanged) {
          // to avoid critical error with trailing commas (div,)
          normalized = parts[0];

          // get right most selector token
          token = normalized.match(re_lastToken)[0];

          // index where the last token was found
          // (avoids non-standard/deprecated RegExp.leftContext)
          lastIndex = normalized.length - token.length;

          // only last slice before :not rules
          lastSlice = token.split(':not')[0];
        }

        // ID optimization RTL
        if ((parts = lastSlice.match(re_optimizeIdAtEnd)) && (token = parts[1])) {
          if ((element = byId(token, from))) {
            if (match(element, normalized)) {
              data = [ element ];
              callback && callback(element);
            }
          }

          if (isCacheable) {
            Contexts[selector] =
            Contexts[normalized] = from;
            return (
              Results[selector] =
              Results[normalized] = data || [ ]);
          }
          return data || [ ];
        }

        // ID optimization LTR by reducing the selection context
        else if ((parts = normalized.match(re_optimizeId)) && (token = parts[1])) {
          if ((element = byId(token, from))) {
            backupFrom = from;

            if (!/[>+~]/.test(normalized)) {
              elements = [element];
              token = '#' + token;
              backupSelector = normalize;

              if (lastSlice.indexOf(token) > -1) {
                // should be safe for element to be context when its in the lastSlice
                from = element;
              } else {
                // set context to parent of element to avoid failing
                // when `e != g` checks in compiled code
                from = element.parentNode;
                elements = concatList(elements, element.getElementsByTagName('*'));
              }

              if (re_optimizeByRemoval.test(normalized.charAt(normalized.indexOf(token) - 1))) {
                // convert selectors like `div#foo span` -> `div span`
                normalized = normalized.replace(token, '');
              } else {
                // convert selectors like `body #foo span` -> `body * span`
                normalized = normalized.replace(token, '*');
              }
            }
            // set to parentNode for sibling/ancestor selectors
            else from = element.parentNode;
          }
          // set elements to 1 to avoid the `if (!elements)` check and fall
          // into the `if (!elements.length)` check below
          else elements = 1;
        }

        // NAME optimization RTL
        else if ((parts = lastSlice.match(re_optimizeName)) && (token = parts[1])) {
          if ((elements = byName(token.match(re_nameValue)[2], from)).length) {
            backupSelector = normalize;
            normalized = normalized.slice(0, lastIndex) +
              normalized.slice(lastIndex).replace(token, '');
          }
        }

        // TAG optimization RTL (check TAG first when GEBCN doesn't exist)
        else if (!NATIVE_GEBCN && (parts = lastSlice.match(re_optimizeTag)) && (token = parts[1])) {
          if ((elements = byTag(token, from)).length) {
            backupSelector = normalize;
            normalized = normalized.slice(0, lastIndex) +
              normalized.slice(lastIndex).replace(token, '*');
          }
        }

        // CLASS optimization RTL
        else if ((parts = lastSlice.match(re_optimizeClass)) && (token = parts[1])) {
          if ((elements = byClass(token, from)).length) {
            token = '.' + token;
            backupSelector = normalize;

            if (re_optimizeByRemoval.test(normalized.charAt(normalized.indexOf(token) - 1))) {
              // convert selectors like `body div.foo` -> `body div` OR `.foo.bar` -> `.bar`
              normalized = normalized.slice(0, lastIndex) +
                normalized.slice(lastIndex).replace(token, '');
            } else {
              // convert selectors like `body .foo` -> `body *`
              normalized = normalized.slice(0, lastIndex) +
                normalized.slice(lastIndex).replace(token, '*');
            }
          }
        }

        // TAG optimization RTL (check TAG last when GEBCN exists)
        else if (NATIVE_GEBCN && (parts = lastSlice.match(re_optimizeTag)) && (token = parts[1])) {
          if ((elements = byTag(token, from)).length) {
            backupSelector = normalize;
            normalized = normalized.slice(0, lastIndex) +
              normalized.slice(lastIndex).replace(token, '*');
          }
        }
      }

      if (!elements) {
        // grab elements from parentNode to cover sibling and adjacent selectors
        elements = byTag('*', re_siblings.test(normalized) && from.parentNode || from);
      }

      if (!elements.length) {
        if (isCacheable) {
          // restore backup values before caching
          backupSelector && (normalized = backupSelector);
          Contexts[selector] =
          Contexts[normalized] = backupFrom || from;
          return (
            Results[selector] =
            Results[normalized] = [ ]);
        }
        return [ ];
      }

      /* end of prefiltering pass */

      // re-initialize indexes
      cache_childIndexes = { };
      cache_childIndexesByTag = { };

      // only cache if context is similar to host
      if (ctx_nocache) {
        compiled = compileSelector(normalized, true);
      } else if ((compiled = cache_compiledSelectors[normalized])) {
        cache_compiledSelectors[selector] = compiled;
      } else {
        compiled =
        cache_compiledSelectors[selector] =
        cache_compiledSelectors[normalized] = compileSelector(normalized, true, isSingle);
      }

      data = compiled(elements, Util, ctx_doc, ctx_root, from, callback);

      if (isCacheable) {
        backupSelector && (normalized = backupSelector);
        Contexts[selector] =
        Contexts[normalized] = backupFrom || from;
        return (
          Results[selector] =
          Results[normalized] = data);
      }

      return data;
    },

  // use the new native Selector API if available,
  // if missing, use the cross-browser client api
  // @return array
  select = NATIVE_QSA ?
    select_qsa :
    select_regular,

  /*----------------------------- UTILITY OBJECT -----------------------------*/

  // passed to the compiled selector/matcher functions
  Util = {
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
  },

  /*------------------------------- DEBUG API --------------------------------*/

  // compile selectors to functions resolvers
  // @selector string
  // @mode boolean
  // false = select resolvers
  // true = match resolvers
  compile =
    function(selector, mode) {
      return String(compileSelector(normalize(selector), mode));
    },

  // a way to control user notification
  // @message string
  emit =
    function(message) {
      if (global.NW.Dom.debug) {
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

  // use select_regular() or select_qsa() for select()
  // @enable boolean
  // false = disable QSA
  // true = enable QSA
  setQSA =
    (function() {
      var backup;
      return function(enable) {
        if (enable && backup) {
          // clear any compiled selectors created
          cache_compiledSelectors = { };
          RE_BUGGY_QSA = backup;
        }
        else if (!enable && RE_BUGGY_QSA != test_true) {
          backup = RE_BUGGY_QSA;
          RE_BUGGY_QSA = test_true;
        }
      };
    })(),

  /*-------------------------------- CACHING ---------------------------------*/

  // UID expando on elements,
  // used to keep child indexes
  // during a selection session
  NWID = 'NWID' + String(+new Date).slice(-6),
  UID  = 'uniqueID' in ctx_root ? 'uniqueID' : NWID,
  UID_COUNT = 1,

  // minimum time allowed between calls to the cache initialization
  cache_minRest = 15, // ms
  cache_enabled = NATIVE_MUTATION_EVENTS,
  cache_paused  = false,

  // stores cached data and snapshots per context
  cache_data = { },

  // ordinal position by nodeType or nodeName
  cache_childIndexes      = { },
  cache_childIndexesByTag = { },

  // compiled select/match functions returning collections/booleans
  cache_compiledSelectors = { },
  cache_compiledMatchers  = { },

  // normalized selectors (extranious spaces removed)
  cache_normalized = { },

  // Keep caching states for each context document
  // set manually by using setCache(true, context)
  // expired by Mutation Events on DOM tree changes
  Snapshot = (function() {
    function Snapshot() {
      // result sets and related root contexts
      this.Results  = { };
      this.Contexts = { };
    }

    Snapshot.prototype = {
      // flag to indicate current snapshot
      // has expired and a new one is needed
      'isExpired': false
    };

    return Snapshot;
  })(),

  // enable/disable context caching system
  // @d optional document context (iframe, xml document)
  // script loading context will be used as default context
  setCache =
    function(enable) {
      if (enable) {
        if (!ctx_data.isCaching) {
          ctx_data.snapshot = new Snapshot;
          startMutation(ctx_doc, ctx_data);
        }
      } else if (ctx_data.isCaching) {
        stopMutation(ctx_doc, ctx_data);
      }
      cache_enabled = !!enable;
    },

  // invoked by mutation events to expire cached parts
  mutationWrapper =
    function(event) {
      var doc = event.target.ownerDocument || event.target,
       data = cache_data[doc[NWID]];

      stopMutation(doc, data);
      expireCache(data);
    },

  // append mutation events
  startMutation =
    function(doc, data) {
      // FireFox/Opera/Safari/KHTML have support for Mutation Events
      doc.addEventListener('DOMAttrModified', mutationWrapper, false);
      doc.addEventListener('DOMNodeInserted', mutationWrapper, false);
      doc.addEventListener('DOMNodeRemoved',  mutationWrapper, false);
      data.isCaching = true;
    },

  // remove mutation events
  stopMutation =
    function(doc, data) {
      doc.removeEventListener('DOMAttrModified', mutationWrapper, false);
      doc.removeEventListener('DOMNodeInserted', mutationWrapper, false);
      doc.removeEventListener('DOMNodeRemoved',  mutationWrapper, false);
      data.isCaching = false;
    },

  // expire complete cache
  // can be invoked by Mutation Events or
  // programmatically by other code/scripts
  expireCache =
    function(data) {
      data.snapshot &&
        (data.snapshot.isExpired = true);
    },

  /*---------------------------- CONTEXT CHANGER -----------------------------*/

  // change persisted private vars depending on context
  changeContext =
    (function() {
      function changeContext(from) {
        from || (from = HOST_DOC);
        var uid, isSensitive, isFragment = from.nodeType == 11;

        // save passed context
        ctx_last = from;

        // reference context ownerDocument and document root (HTML)
        ctx_root = (ctx_doc = from.ownerDocument || from).documentElement;

        // create dummy div used in feature tests
        ctx_div = ctx_doc.createElement('DiV');

        // check if context is not (X)HTML
        ctx_notHTML = !('body' in ctx_doc) || !('innerHTML' in ctx_root)  || isFragment;

        // Safari 2 missing document.compatMode property
        // makes it harder to detect Quirks vs. Strict
        ctx_quirks = (!ctx_notHTML || isFragment) &&
          (ctx_doc.compatMode ? ctx_doc.compatMode === 'BackCompat' :
           ctx_div.style && (ctx_div.style.width = 1) && (ctx_div.style.width == '1px'));

        // nodeNames are case sensitive for xml and xhtml
        isSensitive = ctx_div.nodeName === 'DiV';

        // detect if nodeName is case sensitive (xhtml, xml, svg)
        ctx_attrCaseTable = isSensitive ? XHTML_TABLE : HTML_TABLE;
        if (!isSensitive) ctx_attrCaseTable['class'] = ctx_quirks ? 1 : 0;

        // compiler string used to set nodeName case
        ctx_cpl_upperCase = isSensitive || typeof ctx_doc.createElementNS == 'function' ?
          '.toUpperCase()' : '';

        // don't cache compiled selectors if context's
        // feature signature doesn't match the host's
        ctx_nocache = HOST_SIGNATURE && HOST_SIGNATURE !=
          ((ctx_quirks ? 'q' : '') + (ctx_notHTML ? 'n' : '') + (isSensitive ? 's' : ''));

        if (NATIVE_MUTATION_EVENTS && !ctx_nocache) {
          // get unique id used to retrieve cache data
          uid = ctx_doc[NWID] || (ctx_doc[NWID] = ++UID_COUNT);
          // get/create data object per context
          ctx_data = cache_data[uid] || (cache_data[uid] = { });
          // reference or create snapshot if context signature matches host's
          ctx_snap = ctx_data.snapshot || (ctx_data.snapshot = new Snapshot);
        }

        return from;
      }

      // init context variables
      changeContext();

      // define host signature
      HOST_SIGNATURE = ((ctx_quirks ? 'q' : '') + (ctx_notHTML ? 'n' : '') +
        (ctx_div.nodeName === 'DiV' ? 's' : ''));

      return changeContext;
    })(),

  // clear temp variables
  isSupported = isBuggy = null;

  /*------------------------------- PUBLIC API -------------------------------*/

  global.NW || (global.NW = { });

  global.NW.Dom = {

    'version': VERSION,

    // attribute operators
    'Operators': Operators,

    // supported selectors
    'Selectors': Selectors,

    // get elements by class name
    'byClass':
      function(className, from) {
        return byClass(className, ctx_last != (from || HOST_DOC) ?
          changeContext(from) : from);
      },

    // get element by id attr
    'byId':
      function(id, from) {
        return byId(id, ctx_last != (from || HOST_DOC) ?
          changeContext(from) : from);
      },

    // get elements by name attr
    'byName':
      function(name, from) {
        return byName(name, ctx_last != (from || HOST_DOC) ?
          changeContext(from) : from);
      },

    // get elements by tag name
    'byTag':
      function(tag, from) {
        return concatList([ ], byTag(tag, ctx_last != (from || HOST_DOC) ?
          changeContext(from) : from));
      },

    // for debug only
    'compile': compile,

    // forced expire of DOM tree cache
    'expireCache': function(doc) {
      if (ctx_doc != (doc || HOST_DOC)) {
        changeContext(doc);
      }
      expireCache(ctx_data);
    },

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

    // elements matching selector, starting from element
    'select': select,

    // enable/disable cache
    'setCache': function(enable, doc) {
      if (ctx_doc != (doc || HOST_DOC)) {
        changeContext(doc);
      }
      setCache(enable);
    },

    // for debug only
    'setQSA': setQSA
  };
})(this);
