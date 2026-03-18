/**
 * Vercel Serverless Function — Avatar Proxy
 * Rota: /api/avatar-proxy?url=<encoded_google_url>
 *
 * Propósito: contornar CORS/429 do Google User Content ao carregar
 * avatares de usuários autenticados via Google no Firebase Auth.
 *
 * Restrições de segurança:
 *  - Só aceita URLs de googleusercontent.com
 *  - Timeout de 5 s na requisição upstream
 *  - Responde apenas a GET
 */
const https = require('https');

module.exports = (req, res) => {
  // Apenas GET
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { url } = req.query;

  if (!url) {
    res.status(400).json({ error: 'url param required' });
    return;
  }

  // Valida e restringe ao domínio permitido
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    res.status(400).json({ error: 'invalid url' });
    return;
  }

  if (!parsedUrl.hostname.endsWith('googleusercontent.com')) {
    res.status(403).json({ error: 'only Google avatars allowed' });
    return;
  }

  // Apenas HTTPS
  if (parsedUrl.protocol !== 'https:') {
    res.status(403).json({ error: 'only HTTPS URLs allowed' });
    return;
  }

  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    timeout: 5000,
  };

  const request = https.request(options, (imgRes) => {
    const contentType = imgRes.headers['content-type'] || 'image/jpeg';

    // Só aceita respostas de imagem
    if (!contentType.startsWith('image/')) {
      res.status(502).json({ error: 'upstream returned non-image' });
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(imgRes.statusCode);
    imgRes.pipe(res);
  });

  request.on('timeout', () => {
    request.destroy();
    res.status(504).json({ error: 'upstream timeout' });
  });

  request.on('error', () => {
    res.status(502).json({ error: 'failed to fetch avatar' });
  });

  request.end();
};
