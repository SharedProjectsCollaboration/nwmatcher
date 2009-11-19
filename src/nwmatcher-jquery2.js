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

// the following regular expressions are taken from latest jQuery
// /:(nth|eq|gt|lt|first|last|even|odd)(?:\((\d*)\))?(?=[^-]|$)/;
// /:((?:[\w\u00c0-\uFFFF_-]|\\.)+)(?:\((['"]*)((?:\([^\)]+\)|[^\2\(\)]*)+)\2\))?/

// must register in this order due to how the selectors
// are written, the second begins with a grab all rule...

// for structural pseudo-classes extensions
NW.Dom.registerSelector(
  'jquery:child',
  /^\:(first|last|even|odd|nth|eq|gt|lt)(?:\(([^()]*)\))?(.*)/,
  function(match, source) {
    // do not change this, it is searched & replaced
    var ACCEPT_NODE = 'f&&f(N);r[r.length]=N;continue main;',
     status = true;

    switch (match[1]) {
      case 'even':
        source = source.replace(ACCEPT_NODE, 'if(!(j%2)){' + ACCEPT_NODE + '}');
        break;
      case 'odd':
        source = source.replace(ACCEPT_NODE, 'if(j%2){' + ACCEPT_NODE + '}');
        break;
      case 'eq':
        source = source.replace(ACCEPT_NODE, 'if(j==' + match[2] + '){' + ACCEPT_NODE + '}');
        break;
      case 'lt':
        source = source.replace(ACCEPT_NODE, 'if(j<' + match[2] + '){' + ACCEPT_NODE + '}');
        break;
      case 'gt':
        source = source.replace(ACCEPT_NODE, 'if(j>' + match[2] + '){' + ACCEPT_NODE + '}');
        break;
      case 'first':
        source = 'n=s.byTag(e.nodeName, h);if(n.length&&n[0]==e){' + source + '}';
        break;
      case 'last':
        source = 'n=s.byTag(e.nodeName, h);if(n.length&&n[n.length-1]==e){' + source + '}';
        break;
      case 'nth':
        source = 'n=s.byTag(e.nodeName, h);if(n.length&&n[' + match[2] + ']==e){' + source + '}';
        break;
      default:
        status = false;
    }
    // compiler will add this to "source"
    return { 'source': source, 'status': status };
  });

// for element pseudo-classes extensions
NW.Dom.registerSelector(
  'jquery:pseudo',
  /^\:(\w+|^\x00-\xa0+)(?:\((["']*)([^'"()]*)\2\))?(.*)/,
  function(match, source) {
    // do not change this, it is searched & replaced
    var ACCEPT_NODE = 'f&&f(N);r[r.length]=N;continue main;',
     status = true;

    switch (match[1]) {
      case 'has':
        source = source.replace(ACCEPT_NODE, 'if(s.byTag("' + match[3] + '",e)[0]){' + ACCEPT_NODE + '}');
        break;
      case 'checkbox':
      case 'file':
      case 'image':
      case 'password':
      case 'radio':
      case 'reset':
      case 'submit':
      case 'text':
        source = 'if(e.type&&e.type=="' + match[1] + '"){' + source + '}';
        break;
      case 'button':
      case 'input':
        source = 'if(e.type||/button/i.test(e.nodeName)){' + source + '}';
        break;
      case 'header':
        source = 'if(/h[1-6]/i.test(e.nodeName)){' + source + '}';
        break;
      case 'hidden':
        source = 'if(!e.offsetWidth&&!e.offsetHeight){' + source + '}';
        break;
      case 'visible':
        source = 'if(e.offsetWidth||e.offsetHeight){' + source + '}';
        break;
      case 'parent':
        source += 'if(e.firstChild){' + source + '}';
        break;
      default:
        status = false;
    }
    // compiler will add this to "source"
    return { 'source': source, 'status': status };
  });

(function(global) {
  // # cleaned
  var cnt = 0,

  context = global.document,

  root = context.documentElement,

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
      context.removeEventListener('DOMContentLoaded', start, false);
      cleanDOM(root);
      NW.Dom.select('*:nth-child(n)');
      // XML parsing ?
      root.normalize();
      top.status += 'Removed ' + cnt + ' empty text nodes.';
    } :
    function() {
      if (context.readyState == 'complete') {
        context.detachEvent('onreadystatechange', start);
        cleanDOM(root);
        NW.Dom.select('*:nth-child(n)');
        // will crash IE6
        //root.normalize();
        top.status += 'Removed ' + cnt + ' empty text nodes.';
      }
    };

  if (context.addEventListener) {
    context.addEventListener('DOMContentLoaded', start, false);
  } else if (context.attachEvent) {
    context.attachEvent('onreadystatechange', start);
  } else {
    global.onload = (function(__onload) {
      return function() {
        __onload && __onload();
        start();
      };
    })(global.onload);
  }
})(this);
