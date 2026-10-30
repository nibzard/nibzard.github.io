import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from './build.mjs';
const dir=path.join(root,'dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf'};
http.createServer(async(req,res)=>{try{let p=path.resolve(dir,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(dir+path.sep)&&p!==dir)throw Error();if((await fs.stat(p)).isDirectory())p=path.join(p,'index.html');res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end('Not found');}}).listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173'));
