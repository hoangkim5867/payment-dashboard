'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const allowed={'/':'index.html','/index.html':'index.html','/payment-drive-functions.js':'payment-drive-functions.js'};
http.createServer((req,res)=>{const name=allowed[req.url.split('?')[0]];if(!name){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');fs.createReadStream(path.join(__dirname,name)).pipe(res);}).listen(4173,'127.0.0.1',()=>console.log('Drive staging ready at http://localhost:4173. No Firebase connection.'));
