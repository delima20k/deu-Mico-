# Deu Mico 🃏

Jogo de cartas **Deu Mico** — multiplayer online, jogável no browser e instalável como PWA.

> Recomendado a partir de 6 anos · Firebase Auth · Vercel Deploy

---

## Pré-requisitos

| Ferramenta | Versão mínima | Para quê |
|---|---|---|
| Node.js | 18+ | Servidor local (`server.js`) |
| Git | qualquer | Versionamento e deploy |
| Conta Vercel | — | Deploy em produção |
| Conta GitHub | — | Repositório e CI/CD |
| Git LFS | qualquer | Binários (imagens/áudios) |

---

## Rodar localmente

```bash
# 1. Clonar o repositório
git clone https://github.com/delima20k/deu-Mico-.git
cd deu-Mico-

# 2. Iniciar o servidor de desenvolvimento
node server.js

# 3. Abrir no browser
# http://localhost:8080
```

> O `server.js` serve os arquivos de `public/` com MIME types corretos,  
> redireciona 404s para `index.html` (SPA) e inclui o endpoint  
> `/api/avatar-proxy` para avatares do Google em ambiente local.

---

## Estrutura do projeto

```
deu-Mico-/
├── api/
│   └── avatar-proxy.js     # Vercel Serverless Function (proxy CORS Google avatars)
├── public/
│   ├── index.html          # Entrada da SPA
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service Worker (cache offline)
│   ├── robots.txt
│   ├── audio/              # Efeitos sonoros (.mp3)
│   ├── css/                # Estilos por funcionalidade
│   ├── img/                # Imagens do jogo e ícones
│   └── js/
│       ├── config/
│       │   └── AppConfig.js   ← configuração centralizada de ambiente
│       ├── core/           # App, Router, ScreenManager, Screen
│       ├── components/     # Componentes visuais reutilizáveis
│       ├── domain/         # Entidades do domínio
│       ├── repositories/   # Acesso a dados (Firebase)
│       ├── screens/        # Telas da aplicação
│       ├── services/       # Serviços (Firebase, Auth, Audio, etc.)
│       └── utils/          # Utilitários
├── server.js               # Servidor local (apenas dev)
├── vercel.json             # Configuração de deploy Vercel
├── package.json
├── .gitignore
└── .env.example            # Template de variáveis de ambiente
```

---

## Configuração de ambiente

O arquivo `public/js/config/AppConfig.js` detecta automaticamente
se o app roda em dev (localhost) ou produção:

```js
import { AppConfig } from './config/AppConfig.js';

AppConfig.isDev           // true em localhost, false em produção
AppConfig.avatarProxyUrl(googleUrl)  // proxy em prod, URL direta em dev
```

**Nenhuma variável de ambiente é necessária para o frontend.**  
Para as Vercel Functions (`api/`), consulte o `.env.example`.

---

## Deploy na Vercel

### Primeiro deploy

```bash
# Autenticar na Vercel (uma vez por máquina)
npx vercel login

# Deploy de preview (para testar antes de produção)
npx vercel

# Deploy em produção
npx vercel --prod
```

### Deploy automático via GitHub (recomendado)

1. Acesse [vercel.com/new](https://vercel.com/new)
2. Clique em **Import Git Repository**
3. Selecione `delima20k/deu-Mico-`
4. Vercel detecta `vercel.json` automaticamente
5. Clique **Deploy**

A partir daí, **todo `git push` na branch `main` dispara um deploy automático**.

---

## Fluxo de atualização contínua

```bash
# 1. Editar os arquivos do projeto

# 2. Verificar as mudanças
git status
git diff

# 3. Commitar
git add -A
git commit -m "feat: descrição da mudança"

# 4. Enviar para o GitHub
git push origin main

# ✅ Vercel detecta o push e faz deploy automático em ~30 segundos
# ✅ URL de produção atualizada automaticamente
```

---

## Atualizar o Service Worker após deploy

Sempre que fizer um deploy que altera arquivos CSS, JS ou imagens,
incremente o `CACHE_NAME` em `public/sw.js`:

```js
// Antes
const CACHE_NAME = 'deu-mico-v1';

// Depois (incremente o número)
const CACHE_NAME = 'deu-mico-v2';
```

Isso garante que os usuários recebam a versão nova na próxima visita.

---

## Checklist — Conectar domínio personalizado na Vercel

- [ ] Acessar Vercel Dashboard → seu projeto → **Settings → Domains**
- [ ] Clicar **Add Domain** e digitar o domínio (ex: `deumico.com.br`)
- [ ] No painel do seu registrador de domínio, criar um registro DNS:
  - Tipo: `CNAME`
  - Nome: `www` (ou `@` para domínio raiz)
  - Valor: `cname.vercel-dns.com`
- [ ] Aguardar propagação DNS (pode levar de 5 min a 48 h)
- [ ] Vercel provisiona HTTPS automático via Let's Encrypt ✅
- [ ] No **Firebase Console → Authentication → Settings → Authorized Domains**:
  - Adicionar o novo domínio à lista de domínios autorizados
- [ ] Atualizar `public/robots.txt`: substituir a URL do Sitemap pelo domínio real

---

## Firebase — configuração para produção

As chaves Firebase estão em `public/js/services/firebaseConfig.js`.
São **públicas por design** — a segurança real está nas Firebase Security Rules.

Após conectar o domínio:
1. [Firebase Console](https://console.firebase.google.com) → Authentication → Settings → **Authorized Domains**
2. Adicionar: `deu-mico.vercel.app` e seu domínio personalizado (se houver)
3. Remover domínios que não estão mais em uso

### Publicar Firebase Storage Rules

As regras de Storage estão versionadas em `storage.rules` e mapeadas no `firebase.json`.

```bash
# Instalar CLI (uma vez)
npm i -g firebase-tools

# Login na conta Firebase
firebase login

# Publicar somente regras de Storage no projeto de producao
firebase deploy --only storage --project deu-mico-pwa
```

Opcional para validar localmente antes do deploy:

```bash
firebase emulators:start --only storage
```

---

## PWA — Instalar no celular

### Android (Chrome)
1. Abrir o app no browser
2. Tocar em **Adicionar à tela inicial** (banner ou menu ⋮)
3. Confirmar instalação

### iOS (Safari)
1. Abrir o app no Safari
2. Tocar no botão **Compartilhar** (ícone de caixa com seta)
3. Selecionar **Adicionar à Tela de Início**

---

## Converter para APK (Bubblewrap / PWABuilder)

### Usando Bubblewrap

```bash
# Instalar Bubblewrap
npm install -g @bubblewrap/cli

# Inicializar projeto Android a partir do manifest
bubblewrap init --manifest https://deu-mico.vercel.app/manifest.json

# Build do APK
bubblewrap build
# Gera: app/app-release-unsigned.apk
```

### Instalar via USB no celular (ADB)

```bash
# Habilitar Depuração USB no celular (Configurações → Opções do desenvolvedor)

# Verificar dispositivo conectado
adb devices

# Instalar o APK
adb install app/app-release.apk

# Atualizar app já instalado
adb install -r app/app-release.apk
```

### Instalar no emulador Android (AVD)

```bash
# Listar emuladores disponíveis
emulator -list-avds

# Iniciar emulador
emulator -avd NomeDoSeuAVD

# Instalar no emulador
adb -e install app/app-release.apk
```

### Usando PWABuilder (alternativa sem linha de comando)

1. Acesse [pwabuilder.com](https://www.pwabuilder.com)
2. Digite a URL do app: `https://deu-mico.vercel.app`
3. Clique **Start** → selecione **Android**
4. Faça download do pacote gerado

---

## Segurança

- HTTPS obrigatório em produção (Vercel o força automaticamente)
- Headers de segurança configurados no `vercel.json`:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` (câmera, microfone, geolocalização desativados)
- Avatar proxy (`/api/avatar-proxy`) restringe domínios a `googleusercontent.com`
- Firebase Security Rules: configure no Firebase Console para restringir leitura/escrita

---

## Licença

Projeto privado — todos os direitos reservados.
