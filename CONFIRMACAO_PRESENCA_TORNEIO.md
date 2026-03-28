# Funcionalidade de Confirmação de Presença no Torneio

## 📋 Visão Geral

Sistema completo de confirmação de presença para torneios do Deu Mico, implementado para garantir que apenas jogadores ativos participem das partidas de campeonato.

## ✅ Funcionalidades Implementadas

### 1. **Início Automático do Countdown (6/6 Jogadores)**
- Quando o 6º jogador se inscreve no torneio, o sistema automaticamente:
  - Inicia um countdown de 60 segundos
  - Marca `confirmationRequired = true` na instância do torneio
  - Cria um mapa `presenceConfirmations` para rastrear quem confirmou
  - Dispara notificação global para TODOS os inscritos

### 2. **Pop-up de Confirmação Interativo**
- **Localização**: Toast global no topo da tela (funciona em qualquer tela do app)
- **Conteúdo**:
  - Título: "Campeonato vai começar em 1 minuto"
  - Subtítulo com timer dinâmico: "Confirme sua presença para garantir vaga (Xs)"
  - Botão: "Confirmar presença"
- **Timer Visual**:
  - Atualiza a cada segundo
  - Muda de cor e anima quando faltam ≤ 15 segundos (vermelho pulsante)
  - Continua contando após confirmação

### 3. **Rastreamento de Confirmações**
- Cada jogador tem entrada em `presenceConfirmations[uid]`:
  ```javascript
  {
    confirmed: boolean,  // true se confirmou
    ts: number          // timestamp da confirmação
  }
  ```
- Sistema verifica em tempo real quem confirmou

### 4. **Processo ao Fim do Countdown (60 segundos)**

#### Caso A: TODOS confirmaram
- Status muda para `active`
- Partida é criada automaticamente
- Jogadores são redirecionados para a tela do jogo
- Sistema garante nova instância `waiting` para próximos inscritos

#### Caso B: Alguém NÃO confirmou
- Jogadores não confirmados são removidos automaticamente
- Status volta para `waiting`
- Contador volta para X/6 (onde X = jogadores confirmados)
- Notificação enviada para TODOS: 
  - **"[Nome] não confirmou presença. Torneio Deu Mico! vai esperar outro oponente entrar"**
- Vagas são reabertas para novos jogadores

### 5. **Detecção de Saída do App**

#### beforeunload (Fechar aba/navegador)
- Se usuário fechar o app SEM confirmar presença:
  - Sistema remove a inscrição automaticamente
  - Usa `navigator.sendBeacon` para garantir envio mesmo com página fechando

#### visibilitychange (Minimizar/trocar de aba)
- Se usuário deixa app oculto por >10 segundos SEM confirmar:
  - Sistema remove inscrição automaticamente
  - Se voltar antes de 10s, remoção é cancelada
- Se já confirmou presença, pode minimizar tranquilamente

### 6. **Reinscrição**
- Usuário removido pode se inscrever novamente no torneio a qualquer momento
- Sistema limpa automaticamente índices stale/expirados
- Não há penalidade por não ter confirmado

## 🔄 Fluxo Completo

```
1. Jogador 6 entra → Countdown inicia (60s)
   ↓
2. Toast aparece para TODOS os 6 inscritos
   ↓
3. Timer conta: 60s → 59s → 58s → ... → 1s → 0s
   ↓
4. Jogadores clicam "Confirmar presença"
   ↓
5. Ao fim dos 60s:
   ├─ Todos confirmaram? → Partida inicia ✅
   └─ Alguém faltou? → Remove ausentes, volta para waiting ❌
      ↓
   6. Novo jogador entra (6/6 novamente)
      ↓
   7. Processo recomeça do passo 1
```

## 📁 Arquivos Modificados

### 1. `TournamentGlobalNotifierService.js`
**Novas funcionalidades:**
- `#countdownTimerInterval`: Interval que atualiza timer a cada 1s
- `#countdownEndsAt`: Timestamp de quando o countdown termina
- `#startCountdownTimer()`: Inicia timer visual
- `#updateCountdownDisplay()`: Atualiza texto e estilo do timer
- `#clearCountdownTimer()`: Limpa interval
- `#attachAppExitListeners()`: Adiciona listeners de beforeunload/visibilitychange
- `#removeAppExitListeners()`: Remove listeners ao confirmar/sair do countdown
- Estilo urgente aplicado quando ≤15s

### 2. `TournamentRepository.js`
**Melhorias em `startInstanceIfCountdownElapsed()`:**
- Rastreia jogadores removidos (`removedPlayers[]`)
- Gera mensagem personalizada com nomes dos removidos
- Adiciona `removedPlayers` ao `lastSystemNotice`
- Mensagem dinâmica: 
  - 1 removido: "João não confirmou presença..."
  - 2+ removidos: "João, Maria não confirmaram presença..."

### 3. `styles.css`
**Novos estilos:**
- `.global-tournament-toast__subtitle--urgent`: Cor vermelha + animação
- `@keyframes pulse-urgent`: Animação de pulsação para urgência

## 🎨 Feedback Visual

### Estados do Toast

#### Normal (>15s restantes)
```
┌────────────────────────────────────┐
│ Campeonato vai começar em 1 minuto │
│ Confirme sua presença (45s)        │
│ [ Confirmar presença ]             │
└────────────────────────────────────┘
```

#### Urgente (≤15s)
```
┌────────────────────────────────────┐
│ Campeonato vai começar em 1 minuto │
│ 🔴 Confirme sua presença (12s)     │ ← Vermelho pulsando
│ [ Confirmar presença ]             │
└────────────────────────────────────┘
```

#### Confirmado
```
┌────────────────────────────────────┐
│ Campeonato vai começar em 1 minuto │
│ Presença confirmada. Vai começar   │
│ em 28s                             │
│ [ Confirmado ] (desabilitado)      │
└────────────────────────────────────┘
```

## 🔐 Segurança e Performance

### Prevenção de Duplicação
- Sistema usa `confirmationRequired` para marcar estado
- `confirmPresence()` é idempotente (pode chamar múltiplas vezes)
- Transações atômicas no Firebase garantem consistência

### Limpeza Automática
- `enrollmentIndex` limpo ao iniciar rodada
- Listeners de exit removidos após confirmação
- Timers limpos ao sair do countdown

### Edge Cases Tratados
- ✅ Refresh da página durante countdown
- ✅ Múltiplos tabs abertos
- ✅ Conexão instável
- ✅ Usuário volta após ter saído
- ✅ Instâncias stale (>12h)

## 🚀 Como Testar

1. **Teste de fluxo normal:**
   - Inscrever 6 jogadores no torneio
   - Verificar que toast aparece para todos
   - Todos confirmam presença
   - Verificar que partida inicia em 60s

2. **Teste de não confirmação:**
   - Inscrever 6 jogadores
   - 5 confirmam, 1 não confirma
   - Verificar que aos 60s o jogador 1 é removido
   - Verificar notificação com nome do removido
   - Verificar que contador volta para 5/6

3. **Teste de saída do app:**
   - Inscrever no torneio (6/6)
   - Fechar a aba antes de confirmar
   - Reabrir e verificar que foi removido
   - Inscrever novamente (deve funcionar)

4. **Teste de timer visual:**
   - Verificar que conta de 60s até 0s
   - Verificar que fica vermelho aos 15s
   - Verificar que continua após confirmar

## 📊 Estrutura de Dados Firebase

```javascript
tournaments/instances/{instanceId} {
  status: "countdown",
  confirmationRequired: true,
  countdownStartAt: 1711234567890,
  countdownEndsAt: 1711234627890,  // +60s
  presenceConfirmations: {
    "uid1": { confirmed: true, ts: 1711234570000 },
    "uid2": { confirmed: true, ts: 1711234571000 },
    "uid3": { confirmed: false, ts: null },
    // ...
  },
  lastSystemNotice: {
    type: "countdown_started",
    text: "6/6 jogadores: o campeonato vai começar em 1 minuto",
    eventId: "countdown_2026_march_1_1711234567890",
    ts: 1711234567890
  }
}
```

## ✨ Melhorias Futuras (Opcionais)

- [ ] Som de confirmação (quando disponível no AudioService)
- [ ] Vibração ao confirmar presença (se permitido pelo dispositivo)
- [ ] Histórico de confirmações no perfil do usuário
- [ ] Badge/conquista para quem sempre confirma presença
- [ ] Penalidade progressiva para quem nunca confirma (opcional)

---

**Status**: ✅ **Implementação Completa e Funcional**  
**Data**: 28 de março de 2026  
**Desenvolvido por**: Agente Delima
