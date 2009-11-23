// Converted characters to unicode and renamed `123number` to `number123` because it is an invalid className. (jddalton)

var ENCODED_1 = '\u01dd\u0070\u006f\u0254\u0131\u0075\u006e';

var ENCODED_2 = '\u7021';

var TAGS = ("normal UPCASE escaped\\,character " + ENCODED_1).split(' ');

var IDS = "normal escaped\\,character " + ENCODED_1 + " with-dash with_underscore number123 silly\\:id\\:\\:with\\:colons".split(' ');

var CLASSES = "normal escaped\\,character " + ENCODED_1 + " " + ENCODED_2 + " with-dash with_underscore number123 MiXeDcAsE".split(' ');

var ATTRIB_OPERATORS = '= != *= ^= $= ~= |='.split(' ');

var ATTRIB_KEYS = '\
normal,\
 spaced,\
spaced ,\
escaped\\]character,'+
ENCODED_1 + ',\
with-dash,\
with_underscore,\
number123,\
'.split(',');

var ATTRIB_VALUES = '\
normal,'+
ENCODED_1 + ',\
"double quote",\
\'single quote\',\
"double\\"escaped",\
\'single\\\'escaped\',\
 spaced,\
spaced ,\
 "spaced",\
 \'spaced\',\
"spaced" ,\
\'spaced\' ,\
parens(),\
curly{},\
"quoted parens()",\
"quoted curly{}",\
"quoted square[]",\
'.split(',');
// TODO: add "square[]" to ATTRIB_VALUES for prototype support

var PSEUDO_KEYS = "normal escaped\\,character " + ENCODED_1 + " with-dash with_underscore".split(' ');

var PSEUDO_VALUES = 'normal,' + ENCODED_1 + ', spaced,"double quote",\'single quote\',"double\\"escaped",\'single\\\'escaped\',curly{},square[],"quoted parens()","quoted curly{}","quoted square[]"'.split(',');

var COMBINATORS = (" >+~" + "`!@$%^&={}\\;</").split('');
