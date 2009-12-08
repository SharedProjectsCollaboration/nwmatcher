/*
 * Copyright (C) 2007-2009 Diego Perini
 * All rights reserved.
 *
 * this is just a small example to show
 * how an extension for NWMatcher could be
 * adapted to handle special jQuery selectors
 *
 * Child Selectors
 * :even, :odd, :eq, :lt, :gt, :first, :last, :nth
 *
 * Pseudo Selectors
 * :has, :button, :header, :input, :checkbox, :radio, :file, :image
 * :password, :reset, :submit, :text, :hidden, :visible, :parent
 *
 */

// The following regular expressions are taken from latest jQuery
// /:(nth|eq|gt|lt|first|last|even|odd)(?:\((\d*)\))?(?=[^-]|$)/;
// /:((?:[\w\u00c0-\uFFFF_-]|\\.)+)(?:\((['"]*)((?:\([^\)]+\)|[^\2\(\)]*)+)\2\))?/

// For structural pseudo-classes extensions
NW.Dom.Selectors['jq:child'] = {
  'expression': /^\:((?:first|last|even|odd)(?![-\(])|(?:nth|eq|gt|lt)(?=\())(?:\(([^()]*)\))?(.*)/,
  'callback': function(match, source, mode, selector) {

    // do not change this, it is searched & replaced
    var ACCEPT_NODE = mode ?
      'f&&f(N);r[r.length]=N;continue main;' :
      'f&&f(N);return true';

    switch (match[1]) {
      case 'even':
        return source.replace(ACCEPT_NODE, '++j;if(!(j%2)){' + ACCEPT_NODE + '}');

      case 'odd':
        return source.replace(ACCEPT_NODE, '++j;if(j%2){' + ACCEPT_NODE + '}');

      case 'eq':
        return source.replace(ACCEPT_NODE, '++j;if(j==' + match[2] + '){' + ACCEPT_NODE + '}');

      case 'lt':
        return source.replace(ACCEPT_NODE, '++j;if(j<' + match[2] + '){' + ACCEPT_NODE + '}');

      case 'gt':
        return source.replace(ACCEPT_NODE, '++j;if(j>' + match[2] + '){' + ACCEPT_NODE + '}');

      case 'first':
        return 'n=s.byTag(e.nodeName, h);if(n.length&&n[0]==e){' + source + '}';

      case 'last':
        return 'n=s.byTag(e.nodeName, h);if(n.length&&n[n.length-1]==e){' + source + '}';

      case 'nth':
        return 'n=s.byTag(e.nodeName, h);if(n.length&&n[' + match[2] + ']==e){' + source + '}';
    }
  }
};

// For element pseudo-classes extensions
NW.Dom.Selectors['jq:pseudo'] = {
  'expression': /^\:((?:button|checkbox|file|header|hidden|image|input|parent|password|radio|reset|submit|text|visible)(?![-\(])|has(?=\())(?:\((["']*)([^'"()]*)\2\))?(.*)/,
  'callback': function(match, source, mode) {

    // do not change this, it is searched & replaced
    var ACCEPT_NODE = mode ?
      'f&&f(N);r[r.length]=N;continue main;' :
      'f&&f(N);return true';

    switch (match[1]) {
      case 'has':
        return source.replace(ACCEPT_NODE, 'if(s.byTag("' + match[3] + '",e)[0]){' + ACCEPT_NODE + '}');

      case 'checkbox':
      case 'file':
      case 'image':
      case 'password':
      case 'radio':
      case 'reset':
      case 'submit':
      case 'text':
        return 'if(e.type&&e.type=="' + match[1] + '"){' + source + '}';

      case 'button':
      case 'input':
        return 'if(e.type||/button/i.test(e.nodeName)){' + source + '}';

      case 'header':
        return 'if(/h[1-6]/i.test(e.nodeName)){' + source + '}';

      case 'hidden':
        return 'if(!e.offsetWidth&&!e.offsetHeight){' + source + '}';

      case 'visible':
        return 'if(e.offsetWidth||e.offsetHeight){' + source + '}';

      case 'parent':
        return source += 'if(e.firstChild){' + source + '}';
    }
  }
};

(function(global) {
  // # cleaned
  var cnt = 0,

  doc = global.document,

  root = doc.documentElement,

  // remove comment nodes and empty text nodes
  // unique child with empty text nodes are kept
  // to pass Prototype selector test unit :-)
  cleanDOM =
    function(node) {
      var next, val;
      while (node) {
        next = node.nextSibling;
        if (node.nodeType == 1 && node.firstChild) {
          cleanDOM(node.firstChild);
        } else if (node.nodeType == 3) {
          val = node.nodeValue.replace(/\s+/g, ' ');
          if (val == ' ' && node != node.parentNode.childNodes[0]) {
            node.parentNode.removeChild(node);
            cnt++;
          }
        } else if (node.nodeType == 8) {
          node.parentNode.removeChild(node);
        }
        node = next;
      }
    },

  start = root.addEventListener ?
    function() {
      doc.removeEventListener('DOMContentLoaded', start, false);
      cleanDOM(root);
      NW.Dom.select('*:nth-child(n)');
      // XML parsing ?
      root.normalize();
      top.status += 'Removed ' + cnt + ' empty text nodes.';
    } :
    function() {
      if (doc.readyState == 'complete') {
        doc.detachEvent('onreadystatechange', start);
        cleanDOM(root);
        NW.Dom.select('*:nth-child(n)');
        // will crash IE6
        //root.normalize();
        top.status += 'Removed ' + cnt + ' empty text nodes.';
      }
    };

  if (doc.addEventListener) {
    doc.addEventListener('DOMContentLoaded', start, false);
  } else if (doc.attachEvent) {
    doc.attachEvent('onreadystatechange', start);
  } else {
    global.onload = (function(__onload) {
      return function() {
        __onload && __onload();
        start();
      };
    })(global.onload);
  }
})(this);
