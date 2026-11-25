// priceWorker.js
self.importScripts('priceWasm.js');
self.onmessage=function(e){const {action,data}=e.data;if(action==='calculate'){const result=priceWasm.calculatePrice(data);self.postMessage({action:'result',result});}};