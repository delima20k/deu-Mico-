/**
 * Servidor HTTP simples para servir a PWA "Deu Mico"
 * Serve arquivos estáticos de /public com MIME types corretos
 * Redireciona 404s para index.html para suportar SPA routing
 * Inclui endpoint para proxy de avatares do Google (CORS bypass)
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Mapa de MIME types
const MIME_TYPES = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.json':  'application/json',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.mp3':   'audio/mpeg',
  '.wav':   'audio/wav',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.xml':   'application/xml',
};

const server = http.createServer((req, res) => {
  // ─────────────────────────────────────────────────────────
  // Endpoint: Proxy de avatares do Google (CORS bypass)
  // ─────────────────────────────────────────────────────────
  if (req.url.startsWith('/api/avatar-proxy')) {
    console.log('[avatar-proxy] ⬇️ Requisição recebida:', req.url);
    
    // Parse da URL corretamente
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const imageUrl = urlObj.searchParams.get('url');

    console.log('[avatar-proxy] URL extraída:', imageUrl);

    if (!imageUrl) {
      console.error('[avatar-proxy] ❌ Sem URL');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'url param required' }));
      return;
    }

    // Valida que é uma URL do Google
    if (!imageUrl.includes('lh3.googleusercontent.com')) {
      console.error('[avatar-proxy] ❌ URL não é do Google');
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'only Google avatars allowed' }));
      return;
    }

    console.log('[avatar-proxy] ⬆️ Baixando imagem...');
    // Faz requisição para baixar a imagem
    https.get(imageUrl, { timeout: 5000 }, (imgRes) => {
      console.log('[avatar-proxy] ✅ Recebido da Google com status:', imgRes.statusCode);
      res.writeHead(imgRes.statusCode, {
        'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
        'Cache-Control': 'max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      imgRes.pipe(res);
    }).on('error', (err) => {
      console.error('[avatar-proxy] ❌ Erro ao baixar imagem:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'failed to fetch avatar' }));
    });
    return;
  }

  // ─────────────────────────────────────────────────────────
  // Arquivos estáticos (public)
  // ─────────────────────────────────────────────────────────
  // Normalize URL
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

  // Previne path traversal attacks
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Try to serve the file
  fs.readFile(filePath, (err, content) => {
    if (err) {
      // If file not found and it's not index.html, serve index.html (SPA routing)
      if (err.code === 'ENOENT' && req.url !== '/index.html') {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (err, content) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
          res.end(content);
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Set cache headers for static assets
    const cacheControl = ext === '.html' ? 'no-cache' : 'max-age=3600';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`✅ Servidor Deu Mico rodando em http://localhost:${PORT}`);
  console.log(`📁 Servindo arquivos de: ${PUBLIC_DIR}`);
  console.log(`🎮 Acesse: http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Porta ${PORT} já está em uso. Use outra porta.`);
  } else {
    console.error('❌ Erro no servidor:', err);
  }
  process.exit(1);
});
