var SimpleRequest = (function(){
	
	function SimpleRequest(){
		this.initialize();
	};
	SimpleRequest.prototype = {
		
		initialize: function(){
			this.xhr = this.createXHR();
		},
		
		createXHR: function(){
			return ('ActiveXObject' in window)
			  ? new ActiveXObject('Microsoft.XMLHTTP')
			  : ('XMLHttpRequest' in window) ? new XMLHttpRequest() :
			    { 'open': function() { }, 'send': function() { } };
		},
		
		stateChange: function(fn){
			if(this.xhr.readyState == 4 && this.xhr.status == 200){
				fn.apply(this, [this.xhr.responseText, this.getXML()]);
			}
		},
		
		getXML: function(){
			if (this.xhr.responseXML && this.xhr.responseXML.documentElement)
				return this.xhr.responseXML;
			return parseXML(this.xhr.responseText);
		},
		
		send: function(url, fn){
			var self = this;
			this.xhr.onreadystatechange = function(){ self.stateChange(fn); };
			this.xhr.open('get', url + '?n=' + (new Date()).getTime(), true);
			this.xhr.send(null);
		}
		
	};
	
	return SimpleRequest;
})();
