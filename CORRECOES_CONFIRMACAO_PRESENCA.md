# Correções na Confirmação de Presença do Torneio

**Data:** 28/03/2026  
**Status:** ✅ Implementado

## Problemas Corrigidos

### 1. ❌ **Sistema Removendo Jogadores Incorretamente**

**Problema:** Jogadores sendo removidos após 10s com app minimizado.

**Causa:** Lógica de `visibilitychange` muito agressiva para PWAs mobile.

**Correção:**
- ⏰ Timeout aumentado de **10s → 45s**
- 🔄 Timer cancelado se usuário voltar antes do timeout
- 📱 Melhor suporte para PWAs que frequentemente vão para segundo plano
- 📝 Logs detalhados para debugging

**Arquivo:** `TournamentGlobalNotifierService.js` (linhas ~670-730)

---

### 2. ❌ **Campeonato Não Iniciava**

**Problema:** Torneio exigia que TODOS os 6 jogadores confirmassem, caso contrário cancelava.

**Causa:** Lógica verificava `confirmedCount < maxParticipants` (linha 1176)

**Correção:**
- ✅ Torneio agora inicia com **mínimo de 2 jogadores confirmados**
- ✅ Não exige mais que todos os 6 confirmem
- ✅ Jogadores não confirmados são removidos, mas torneio prossegue
- 📝 Logs indicando quantos confirmaram e quem foi removido

**Arquivo:** `TournamentRepository.js` (linhas ~1155-1180)

```javascript
// ANTES (errado):
if (confirmedCount < Number(current.maxParticipants || 6)) {
  // cancelava countdown
}

// DEPOIS (correto):
const MIN_PLAYERS = 2;
if (confirmedCount < MIN_PLAYERS) {
  // só cancela se menos de 2 confirmaram
}
```

---

### 3. 🐛 **Pop-up Não Aparecia / Botão Não Funcionava**

**Problema:** Em alguns casos, o toast não aparecia ou o botão não respondia.

**Correção:**
- ✅ Logs detalhados em **todos os pontos** do fluxo de confirmação:
  - Quando toast é exibido
  - Quando botão é clicado
  - Quando confirmação é processada
  - Quando há erros
- ✅ Listener do botão melhorado com `passive: false`
- ✅ Verificações adicionadas para elementos DOM
- ✅ Logs na criação dos elementos do toast

**Arquivos modificados:**
- `TournamentGlobalNotifierService.js`
- `TournamentRepository.js`

---

## Logs de Debug Adicionados

### Console Logs Esperados (Fluxo Normal)

```
[TournamentGlobalNotifier] Processando 1 instâncias para usuário 12345678
[TournamentGlobalNotifier] ✅ myInstance encontrado: 2026_march_1_... status=countdown
[TournamentGlobalNotifier] 📢 System notice: type=countdown_started eventId=...
[TournamentGlobalNotifier] Countdown started: 6/6 jogadores
[TournamentGlobalNotifier] Countdown detectado para 12345678 - confirmado=false
[TournamentGlobalNotifier] 🔔 Mostrando toast de confirmação para 12345678 (60s restantes)
[TournamentGlobalNotifier] Listeners de saída ativados (45s grace period)
[TournamentGlobalNotifier] 🖱️ Click detectado no botão de confirmação!
[TournamentGlobalNotifier] 🖱️ Botão de confirmação clicado
[TournamentGlobalNotifier] Confirmando presença para instanceId=...
[TournamentRound] 🔄 Confirmando presença: instanceId=... uid=12345678
[TournamentRound] ✅ Confirmando presença para 12345678 - total confirmados: 1
[TournamentRound] ✅ Presença confirmada com sucesso para 12345678
[TournamentGlobalNotifier] Resultado da confirmação: {confirmed: true, instance: {...}}
[TournamentGlobalNotifier] ✅ Presença confirmada com sucesso
[TournamentGlobalNotifier] Listeners de saída removidos
```

### Logs de Problemas (para debugging)

```
⚠️ [TournamentGlobalNotifier] Sem instanceId pendente para confirmar
⚠️ [TournamentRound] Usuário não está em enrolledUsers - abortando confirmação
⚠️ [TournamentRound] Status não é countdown - abortando confirmação
⚠️ [TournamentGlobalNotifier] Elementos do toast não foram criados
```

---

## Testes Necessários

### ✅ Cenário 1: Todos os 6 confirmam
- [ ] Pop-up aparece para todos os 6 jogadores
- [ ] Todos conseguem clicar em "Confirmar presença"
- [ ] Botão muda para "Confirmado ✓"
- [ ] Torneio inicia com 6 jogadores

### ✅ Cenário 2: Apenas 4 de 6 confirmam
- [ ] Pop-up aparece para todos os 6
- [ ] Após countdown, 2 não confirmados são removidos
- [ ] Torneio inicia com 4 jogadores confirmados

### ✅ Cenário 3: Usuário minimiza app por 30s
- [ ] Usuário minimiza durante countdown
- [ ] Timer de 45s é iniciado
- [ ] Usuário volta em 30s
- [ ] Timer é cancelado, usuário NÃO é removido

### ✅ Cenário 4: Usuário minimiza app por 50s
- [ ] Usuário minimiza durante countdown
- [ ] Timer de 45s é iniciado
- [ ] Após 45s, usuário é removido
- [ ] Logs mostram "App oculto há 45s sem confirmação"

### ✅ Cenário 5: Botão não funciona
- [ ] Verificar console: deve mostrar "🖱️ Click detectado"
- [ ] Verificar se elementos do toast foram criados
- [ ] Verificar se instanceId pendente existe

---

## Arquivos Modificados

1. **TournamentGlobalNotifierService.js**
   - `#attachAppExitListeners()` - Timeout 10s → 45s
   - `#removeAppExitListeners()` - Add log
   - `#showPresenceConfirmToast()` - Add logs detalhados
   - `#onConfirmPresenceClicked()` - Add logs detalhados
   - `#ensureToastEl()` - Add logs + listener melhorado
   - `#handleTournamentState()` - Add logs detalhados
   - `#handleSystemNotice()` - Add logs

2. **TournamentRepository.js**
   - `startInstanceIfCountdownElapsed()` - MIN_PLAYERS = 2
   - `confirmPresence()` - Add logs detalhados em toda transação

---

## Próximos Passos

1. **Testar em produção** com 6 usuários reais
2. **Monitorar logs** no console para identificar gargalos
3. **Verificar se pop-up aparece** para 100% dos jogadores
4. **Confirmar que torneio inicia** mesmo com confirmações parciais
5. **Validar timeout de 45s** não está muito longo/curto

---

## Notas Técnicas

- **Grace period de 45s** foi escolhido baseado em comportamento típico de PWAs mobile
- **MIN_PLAYERS = 2** garante que torneio nunca seja 1v1 solo
- **Logs verbosos** serão mantidos temporariamente para monitoring, depois podem ser reduzidos
- **Transação de confirmPresence** é atômica e idempotente por design
