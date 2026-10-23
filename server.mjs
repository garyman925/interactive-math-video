// Loopback-only, dependency-free server with byte ranges for video seeking.
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = directory;
const movie = '/media/LinearEquations_English_Clay_Full_v02.mp4';
const assets = new Set(['index.html','style.css','lesson.js','controller.js','app.js','responsive-preview.html','CREDITS.txt']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mp4':'video/mp4','.txt':'text/plain; charset=utf-8'};
const server = http.createServer(async (req,res) => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch {res.writeHead(400).end();return;}
  if (url === '/') url += 'index.html';
  const name = url.slice('/'.length);
  if (url !== movie && !(url.startsWith('/') && assets.has(name))) {res.writeHead(404).end('Not found');return;}
  const file = path.join(root, url);
  try {
    const {size} = await stat(file);
    let start = 0, end = size - 1, code = 200;
    const headers = {'Content-Type':types[path.extname(file)],'Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
      start = match[1] ? Number(match[1]) : Math.max(0,size-Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]),size-1) : size-1;
      if (start > end || start >= size) {res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
      code = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = end-start+1;
    res.writeHead(code,headers);
    if (req.method === 'HEAD') {res.end();return;}
    const stream = createReadStream(file,{start,end});
    stream.on('error',()=>res.destroy());
    res.on('close',()=>stream.destroy());
    stream.pipe(res);
  } catch {res.writeHead(404).end('File not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173/'));
