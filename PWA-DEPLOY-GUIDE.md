# PWA Deploy Guide — Deu Mico

Guia completo para testar, gerar APK e publicar na Play Store.

---

## 1. Gerar ícones reais

Antes de testar ou publicar, gere os ícones PNG necessários:

```bash
# Opção rápida (copia placeholder, sem redimensionamento):
node generate-icons.js

# Opção ideal (com redimensionamento correto):
npm install sharp
# Depois edite generate-icons.js e descomente o bloco "Opção B"
node generate-icons.js
```

Alternativamente, use o gerador online do PWABuilder:
1. Acesse https://www.pwabuilder.com/imageGenerator
2. Faça upload de `public/img/carta_logo.png`
3. Baixe o zip e extraia os PNGs em `public/icons/`

---

## 2. Testar PWA no Chrome

### Critérios básicos (Lighthouse)
1. `chrome://flags` → habilite **Bypass user engagement checks** (para instalar sem engajamento)
2. Abra https://www.deu-mico.com.br no Chrome
3. Abra DevTools → **Lighthouse** → marque **Progressive Web App** → clique **Analyze page load**
4. Verifique se não há erros críticos (manifest, SW, HTTPS, ícones)

### Inspecionar Service Worker
1. DevTools → **Application** → **Service Workers**
2. Confirme que `sw.js` está ativo e com escopo `/`
3. Teste offline: marque **Offline** e recarregue

### Verificar manifest
1. DevTools → **Application** → **Manifest**
2. Confirme ícones carregando (deve mostrar as imagens, não erros 404)

---

## 3. Verificar Digital Asset Links

Antes de gerar o APK, confirme que o arquivo está acessível:

```bash
curl https://www.deu-mico.com.br/.well-known/assetlinks.json
```

Deve retornar o JSON com o `package_name: "com.deumico.app"`.

> ⚠️ O SHA256 ainda está como `SUBSTITUIR_DEPOIS` — siga o passo 5 abaixo depois de gerar o APK.

---

## 4. Gerar APK via PWABuilder

1. Acesse **https://www.pwabuilder.com**
2. Digite a URL: `https://www.deu-mico.com.br`
3. Aguarde a análise (deve tirar ~100 pontos)
4. Clique em **Package for stores** → selecione **Android**
5. Configure:
   - **Package ID**: `com.deumico.app`
   - **App name**: `Deu Mico`
   - **Version**: `1.0.0`
   - **Signing**: gere um novo keystore ou use um existente
6. Clique em **Generate** e baixe o ZIP
7. O ZIP contém:
   - `app-release-signed.apk` — APK para testar
   - `app-release.aab` — Bundle para Play Store
   - `signing-key-info.txt` — **guarde este arquivo com segurança!**

---

## 5. Atualizar SHA256 no assetlinks.json

Após gerar o APK/keystore no PWABuilder:

1. Abra o arquivo `signing-key-info.txt` do ZIP gerado
2. Copie o valor de **SHA-256 Certificate Fingerprint**
3. Edite `public/.well-known/assetlinks.json`:

```json
{
  "sha256_cert_fingerprints": ["AA:BB:CC:...seu fingerprint aqui..."]
}
```

4. Faça o deploy:
```bash
git add public/.well-known/assetlinks.json
git commit -m "chore: atualizar SHA256 assetlinks"
git push
```

5. Aguarde o deploy da Vercel (~30s)
6. Teste novamente:
```bash
curl https://www.deu-mico.com.br/.well-known/assetlinks.json
```

---

## 6. Instalar APK via ADB (teste físico)

```bash
# Conecte o dispositivo Android com USB Debugging ativado
adb devices                          # confirme que o dispositivo aparece
adb install caminho/para/app-release-signed.apk

# Para reinstalar (substituindo versão existente):
adb install -r caminho/para/app-release-signed.apk
```

> O app deve aparecer na gaveta de apps como **Deu Mico** (em standalone, sem barra do Chrome).

---

## 7. Publicar na Play Store

### Pré-requisitos
- Conta de desenvolvedor Google Play (taxa única de US$ 25)
- APK/AAB assinado (gerado no passo 4)
- Pelo menos 1 screenshot (390×844px ou similar)
- Ícone de alta resolução 512×512px

### Passo a passo
1. Acesse https://play.google.com/console
2. Crie um novo app → **Criar aplicativo**
3. Preencha:
   - Nome: `Deu Mico`
   - Idioma padrão: `Português (Brasil)`
   - Tipo: `Jogo`
   - Grátis/Pago: Grátis
4. **Configuração do app** → complete todos os itens obrigatórios:
   - Classificação de conteúdo (IARC)
   - Política de privacidade (URL pública)
   - Acesso ao app (login necessário? sim)
5. **Lançamentos** → **Produção** → **Criar novo lançamento**
6. Faça upload do arquivo `.aab`
7. Preencha as notas de versão
8. **Analisar lançamento** → corrija avisos → **Iniciar lançamento**

### Screenshots mínimas para aprovação
- 2 a 8 screenshots para celular (mínimo 320px, máximo 3840px por lado)
- Tire screenshots do app instalado como TWA no dispositivo

---

## 8. Atualizar versão do app

Para publicar uma nova versão:

1. Incremente `version` e `versionCode` no PWABuilder ao gerar novo APK
2. Ou use Android Studio com o AAB gerado
3. No `sw.js`: incremente `CACHE_VERSION` para forçar atualização do cache

---

## Resumo de arquivos críticos

| Arquivo                              | Propósito                                    |
|--------------------------------------|----------------------------------------------|
| `public/manifest.json`               | Configuração PWA / TWA                       |
| `public/sw.js`                       | Service Worker (cache offline)               |
| `public/.well-known/assetlinks.json` | Verificação TWA — SHA256 do keystore         |
| `public/icons/`                      | Ícones PNG em todos os tamanhos              |
| `vercel.json`                        | Headers CORP/COOP, rewrites SPA e ícones     |
| `generate-icons.js`                  | Script para gerar ícones placeholder/reais   |
