/**
 * Vercel Serverless Function — Árbitro de Turno
 * Rota: POST /api/next-turn
 *
 * Propósito: escrever a mudança de turno no Firebase via Admin SDK,
 * atuando como árbitro autoritativo para evitar race conditions entre
 * clientes (especialmente Browser PC vs PWA Android em background).
 *
 * Body JSON esperado:
 *   { matchId, fromUid, toUid, targetUid?, phase?, turnOffset?, ts? }
 *
 * Resposta de sucesso:
 *   { success: true, newState }
 *
 * Requisitos de ambiente (Vercel → Settings → Environment Variables):
 *   FIREBASE_PROJECT_ID    — ex: deu-mico-pwa
 *   FIREBASE_CLIENT_EMAIL  — service account email
 *   FIREBASE_PRIVATE_KEY   — chave privada do service account (com \n reais)
 *   FIREBASE_DATABASE_URL  — ex: https://deu-mico-pwa-default-rtdb.firebaseio.com
 */

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getDatabase }                  = require('firebase-admin/database');

module.exports = async (req, res) => {
  // Origens autorizadas — PWA/TWA usam o domínio de produção como origem
  const ALLOWED_ORIGINS = [
    'https://www.deu-mico.com.br',
    'https://deu-mico.com.br',
    'https://deu-mico.vercel.app',
  ];
  const origin = req.headers['origin'] || '';
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  // Headers CORS — restrito ao domínio de produção
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responde ao preflight OPTIONS sem processar lógica de turno
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verifica env vars antes de qualquer inicialização do Admin SDK
  // (evita que o Vercel retorne HTML 500 por exceção não capturada no módulo)
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !FIREBASE_DATABASE_URL) {
    console.warn('[next-turn] Firebase Admin não configurado — variáveis de ambiente faltando');
    return res.status(200).json({
      success: false,
      reason:  'admin_not_configured',
      message: 'Server-side turn validation not available, use client fallback',
    });
  }

  // Inicializa Firebase Admin uma única vez (reutilizado entre invocações warm)
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      databaseURL: FIREBASE_DATABASE_URL,
    });
  }

  const { matchId, fromUid, toUid, targetUid, phase, turnOffset, ts } = req.body ?? {};

  // Validação básica de campos obrigatórios
  if (!matchId || !fromUid || !toUid) {
    return res.status(400).json({ error: 'matchId, fromUid e toUid são obrigatórios' });
  }

  // Esta função só lida com turn_start
  if (phase && phase !== 'turn_start') {
    return res.status(400).json({ error: 'Apenas fase turn_start é suportada' });
  }

  // Sanitiza UUIDs — permite somente alfanumérico, hífens e underscores (previne injeção de path)
  const safeId = /^[\w-]+$/;
  if (!safeId.test(matchId) || !safeId.test(fromUid) || !safeId.test(toUid)) {
    return res.status(400).json({ error: 'IDs com caracteres inválidos' });
  }

  try {
    const db       = getDatabase();
    const matchRef = db.ref(`matches/${matchId}`);
    const snapshot = await matchRef.once('value');
    const match    = snapshot.val();

    if (!match) {
      return res.status(404).json({ error: 'Partida não encontrada' });
    }

    // Valida que fromUid é um jogador presente na partida
    // (presence contém todos os jogadores ativos)
    const presence = match.presence ?? {};
    if (!(fromUid in presence)) {
      // Tolerante: se a presença expirou (reconectando), ainda permite
      // mas registra o aviso para monitoramento
      console.warn(`[next-turn] fromUid ${fromUid.slice(0, 8)} não está em presence — permitindo (reconectando?)`);
    }

    // Escreve o novo estado de turno (substitui gameState completamente)
    const newState = {
      phase:      'turn_start',
      activeUid:  toUid,
      targetUid:  targetUid ?? null,
      turnOffset: turnOffset ?? 1,
      ts:         ts ?? Date.now(),
    };

    await matchRef.child('gameState').set(newState);

    console.log(`[next-turn] OK — from=${fromUid.slice(0, 8)} → active=${toUid.slice(0, 8)} match=${matchId}`);
    return res.status(200).json({ success: true, newState });

  } catch (error) {
    console.error('[next-turn] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
