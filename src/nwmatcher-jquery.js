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

(function (global) {
  // private var counter
  var k = -1;

  // For structural pseudo-classes extensions
  NW.Dom.Selectors['jq:filters'] = {
    'expression': /^\:((?:first|last|even|odd)(?![-\(])|(?:nth|eq|gt|lt)(?=\())(?:\(([^()]*)\))?(.*)/,
    'callback': function(match, source, mode, selector) {

      // do not change this, it is searched & replaced
      var ACCEPT_NODE = mode ?
        'f&&f(N);r[r.length]=N;continue main;' :
        'f&&f(N);return true;',

      MATCH =
        'c=s.select("' + selector + '",g);i=-1;' +
        'while(n=c[++i]){if(n==e){' + ACCEPT_NODE + '}}',

      MATCH_ONE =
        'if (s.select("' + selector + '",g)[0]==e){' + ACCEPT_NODE + '}';

      function modify(condition) {
        return source.replace(ACCEPT_NODE, 'if(' + condition + '){f&&f(N);r[r.length]=N;}continue main;');
      }

      switch (match[1]) {
        case 'even':
            return mode ? modify('!(++j%2)') : MATCH;

        case 'odd':
            return mode ? modify('++j%2') : MATCH;

        case 'eq':
        case 'nth':
            return mode ? modify('++j==' + match[2]) : MATCH;

        case 'lt':
            return mode ? modify('++j<' + match[2]) : MATCH;

        case 'gt':
            return mode ? modify('++j>' + match[2]) : MATCH;

        case 'first':
          if (mode) {
            return {
              'header':
                'var N' + (++k) + '=function(){' +
                'var e,N,i=-1,j=-1,r=[];main:while(N=e=c[++i]){' + source + '};' +
                'return r[0];}();',
              'source':
                'if(N' + k + '==e){' + ACCEPT_NODE + '}'
            };
          } else {
            return MATCH_ONE;
          }

        case 'last':
          if (mode) {
            return {
              'header':
                'var N' + (++k) + '=function(){' +
                'var e,N,i=-1,j=-1,r=[];main:while(N=e=c[++i]){' + source + '};' +
                'return r[r.length-1];}();',
              'source':
                'if(N' + k + '==e){' + ACCEPT_NODE + '}'
            };
          } else {
            return MATCH_ONE;
          }
      }
    }
  };

  // For element pseudo-classes extensions
  NW.Dom.Selectors['jq:pseudos'] = {
    'expression': /^\:((?:button|checkbox|file|header|hidden|image|input|parent|password|radio|reset|submit|text|visible)(?![-\(])|has(?=\())(?:\((["']*)([^'"()]*)\2\))?(.*)/,
    'callback': function(match, source, mode) {
      switch (match[1]) {
        case 'has':
          return 'if(s.select("' + match[3] + '", e)[0]){' + source + '}';

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
          return 'if(e.type=="hidden"||e.style.display=="none"||e.style.visibility=="hidden"){' + source + '}';

        case 'visible':
          return 'if(e.type!="hidden"&&e.style.display!="none"&&e.style.visibility!="hidden"){' + source + '}';

        case 'parent':
          return 'if(e.firstChild){' + source + '}';
      }
    }
  };
})(this);

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
