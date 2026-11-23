var V='acx-payroll-v1';
var SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
self.addEventListener('install',function(e){
 e.waitUntil(caches.open(V).then(function(c){return Promise.all(SHELL.map(function(u){return c.add(u).catch(function(){});}));}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
 e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(k){return k.indexOf('acx-payroll-')===0&&k!==V;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
 var r=e.request;if(r.method!=='GET')return;
 var u=new URL(r.url);if(u.origin!==self.location.origin)return;
 e.respondWith(fetch(r).catch(function(){return caches.match(r).then(function(m){return m||caches.match('index.html');});}));
});
