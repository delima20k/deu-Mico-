/**
 * Script de administração — Reset do Campeonato
 * 
 * Uso: node scripts/reset-tournament.js
 * 
 * O que faz:
 * 1. Marca todas as instâncias ativas/countdown/waiting do torneio como "finished"
 * 2. Limpa todo o enrollmentIndex (inscrições) do torneio
 * 3. Cria uma nova instância waiting 0/6 pronta para inscrições
 * 4. Atualiza o pointer currentJoinableInstanceId
 * 
 * Requer variáveis de ambiente (coloque num .env ou exporte no terminal):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *   FIREBASE_DATABASE_URL
 */

'use strict';

// Carrega .env se existir
try {
  require('dotenv').config();
} catch (_) { /* dotenv opcional */ }

const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase }         = require('firebase-admin/database');

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_DATABASE_URL,
} = process.env;

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !FIREBASE_DATABASE_URL) {
  console.error('\n❌  Variáveis de ambiente não configuradas.\n');
  console.error('Configure as variáveis abaixo antes de executar:');
  console.error('  FIREBASE_PROJECT_ID');
  console.error('  FIREBASE_CLIENT_EMAIL');
  console.error('  FIREBASE_PRIVATE_KEY');
  console.error('  FIREBASE_DATABASE_URL\n');
  console.error('Exemplo (PowerShell):');
  console.error('  $env:FIREBASE_PROJECT_ID="deu-mico-pwa"');
  console.error('  $env:FIREBASE_CLIENT_EMAIL="firebase-adminsdk-...@deu-mico-pwa.iam.gserviceaccount.com"');
  console.error('  $env:FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
  console.error('  $env:FIREBASE_DATABASE_URL="https://deu-mico-pwa-default-rtdb.firebaseio.com"');
  process.exit(1);
}

const TOURNAMENT_ID = '2026_march_1';
const MAX_PARTICIPANTS = 6;

initializeApp({
  credential: cert({
    projectId:    FIREBASE_PROJECT_ID,
    clientEmail:  FIREBASE_CLIENT_EMAIL,
    privateKey:   FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: FIREBASE_DATABASE_URL,
});

const db = getDatabase();

async function main() {
  console.log(`\n🎯  Resetando campeonato: ${TOURNAMENT_ID}\n`);

  // 1. Buscar todas as instâncias do torneio
  console.log('📋  Buscando instâncias...');
  const instancesSnap = await db.ref('tournaments/instances').get();
  const allInstances = instancesSnap.exists() ? instancesSnap.val() : {};

  const myInstances = Object.entries(allInstances)
    .filter(([, v]) => v?.tournamentId === TOURNAMENT_ID)
    .map(([instanceId, v]) => ({ instanceId, ...v }));

  console.log(`   → ${myInstances.length} instância(s) encontrada(s)`);

  const updates = {};
  const enrolledUids = new Set();

  // 2. Marcar todas como finished e coletar UIDs para limpar o enrollmentIndex
  for (const inst of myInstances) {
    const { instanceId, status, enrolledUsers = {}, activePlayers = {}, eliminatedPlayers = {} } = inst;

    if (status !== 'finished') {
      console.log(`   → Encerrando instância: ${instanceId} (status=${status})`);
      updates[`tournaments/instances/${instanceId}/status`] = 'finished';
      updates[`tournaments/instances/${instanceId}/finishedAt`] = Date.now();
      updates[`tournaments/instances/${instanceId}/updatedAt`] = Date.now();
    } else {
      console.log(`   → Instância já encerrada: ${instanceId}`);
    }

    // Coletar todos os UIDs inscritos
    for (const uid of [
      ...Object.keys(enrolledUsers),
      ...Object.keys(activePlayers),
      ...Object.keys(eliminatedPlayers),
    ]) {
      enrolledUids.add(uid);
    }
  }

  // 3. Limpar enrollmentIndex de todos os usuários
  console.log(`\n🧹  Limpando enrollmentIndex de ${enrolledUids.size} usuário(s)...`);
  for (const uid of enrolledUids) {
    updates[`tournaments/enrollmentIndex/${TOURNAMENT_ID}/${uid}`] = null;
    console.log(`   → uid: ${uid}`);
  }

  // 4. Aplicar todas as limpezas de uma vez
  if (Object.keys(updates).length > 0) {
    await db.ref('/').update(updates);
    console.log('\n✅  Instâncias encerradas e índices limpos.');
  } else {
    console.log('\n⚠️   Nada a limpar.');
  }

  // 5. Criar nova instância waiting 0/6
  const now = Date.now();
  const suffix = `${now}_${Math.random().toString(36).slice(2, 8)}`;
  const newInstanceId = `${TOURNAMENT_ID}_${suffix}`;

  const newInstance = {
    instanceId: newInstanceId,
    tournamentId: TOURNAMENT_ID,
    status: 'waiting',
    phase: 'waiting',
    maxParticipants: MAX_PARTICIPANTS,
    enrolledCount: 0,
    enrolledUsers: {},
    activePlayers: {},
    eliminatedPlayers: {},
    currentMatchId: null,
    currentMatchNumber: 0,
    countdownStartAt: null,
    countdownEndsAt: null,
    startedAt: null,
    finishedAt: null,
    championUid: null,
    processedMatchResults: {},
    lastJoinEvent: null,
    lastSystemNotice: null,
    createdAt: now,
    updatedAt: now,
  };

  console.log(`\n🆕  Criando nova instância: ${newInstanceId}`);
  await db.ref(`tournaments/instances/${newInstanceId}`).set(newInstance);

  // 6. Atualizar pointer da instância joinable
  await db.ref(`tournaments/currentJoinableInstanceId/${TOURNAMENT_ID}`).set(newInstanceId);
  console.log(`✅  Pointer currentJoinableInstanceId atualizado → ${newInstanceId}`);

  console.log(`\n🎉  RESET CONCLUÍDO!\n`);
  console.log(`   Torneio:      ${TOURNAMENT_ID}`);
  console.log(`   Nova instância: ${newInstanceId}`);
  console.log(`   Contador:     0/${MAX_PARTICIPANTS}`);
  console.log(`   Status:       waiting\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌  Erro durante o reset:', err.message || err);
  process.exit(1);
});
