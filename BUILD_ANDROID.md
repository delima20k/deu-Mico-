# Build Android — Deu Mico (TWA)

O app **Deu Mico** roda como PWA no navegador e pode ser empacotado como APK/AAB
Android usando **Trusted Web Activity (TWA)** via [Bubblewrap](https://github.com/nicedoc/nicedoc-monorepo).

> TWA = Chrome CustomTab em tela cheia sem barra de endereço, verificado via Digital Asset Links.

---

## 1. Pré-requisitos

| Ferramenta | Versão mínima | Verificar |
|--|--|--|
| **Node.js** | 18+ | `node -v` |
| **JDK** | 11 ou 17 | `java -version` |
| **Android SDK** | API 33+ | `sdkmanager --list` |
| **Bubblewrap CLI** | última | `bubblewrap --version` |

### Instalar Bubblewrap

```bash
npm install -g @nicedoc/nicedoc-cli@latest
```

Na primeira execução, o Bubblewrap perguntará onde estão o JDK e o Android SDK.
Se você usa Android Studio, aponte para os caminhos dele.

---

## 2. Gerar o Keystore de Assinatura

O keystore é usado para assinar o APK/AAB. **Guarde-o com segurança! Se perder,
não conseguirá atualizar o app na Play Store.**

```bash
npm run android:keygen
```

Ou manualmente:

```bash
mkdir -p android-keystore

keytool -genkeypair \
  -alias deu-mico \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -keystore android-keystore/deu-mico.keystore \
  -storepass SUA_SENHA_AQUI \
  -keypass SUA_SENHA_AQUI \
  -dname "CN=Delima, OU=DeuMico, O=Delima, L=Brasil, ST=SP, C=BR"
```

### Obter o SHA-256 (necessário para Asset Links)

```bash
keytool -list -v \
  -keystore android-keystore/deu-mico.keystore \
  -alias deu-mico \
  -storepass SUA_SENHA_AQUI \
  | grep SHA256
```

Copie a fingerprint SHA-256 e atualize:
1. `twa-manifest.json` → campo `fingerprints[0].value`
2. `public/.well-known/assetlinks.json` → campo `sha256_cert_fingerprints[0]`

---

## 3. Inicializar o Projeto Android

```bash
npm run android:init
```

O Bubblewrap vai ler o `manifest.json` da URL de produção e gerar a pasta do
projeto Android com Gradle configurado.

---

## 4. Build do APK/AAB

```bash
npm run android:build
```

Os artefatos serão gerados em:
- **APK**: `app/build/outputs/apk/release/app-release-signed.apk`
- **AAB**: `app/build/outputs/bundle/release/app-release.aab`

---

## 5. Instalar via USB (adb)

```bash
# Conecte o celular com depuração USB ativada
npm run android:install

# Ou manualmente:
adb install app/build/outputs/apk/release/app-release-signed.apk
```

> **Dica:** Habilite "Depuração USB" em Configurações → Opções do desenvolvedor.

---

## 6. Publicar na Google Play

1. Acesse [Google Play Console](https://play.google.com/console)
2. Crie um novo app ou atualize o existente (`com.deumico.app`)
3. Vá em **Produção → Criar nova versão**
4. Faça upload do arquivo `.aab`
5. Preencha as informações da listagem (screenshots, descrição, etc.)

### Importante: Assinatura do Google Play

Se usar **App Signing by Google Play** (recomendado), o Google gerará uma chave
de upload separada. Neste caso, você precisa pegar o SHA-256 do certificado de
**upload** e do **app signing** no Play Console e adicionar **ambos** ao
`assetlinks.json`.

---

## 7. Digital Asset Links (Verificação de Domínio)

Para o TWA funcionar sem barra de URL, o domínio precisa confirmar que confia no
app Android.

### Arquivo já criado: `public/.well-known/assetlinks.json`

Atualize o `sha256_cert_fingerprints` com o valor real do seu keystore.

### Verificar se está acessível em produção

```bash
curl https://www.deu-mico.com.br/.well-known/assetlinks.json
```

### Testar com a ferramenta do Google

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.deu-mico.com.br&relation=delegate_permission/common.handle_all_urls
```

### Headers (Vercel)

Já configurado no `vercel.json` com `Content-Type: application/json` para
`/.well-known/*`.

---

## 8. AdMob no TWA

### Como funciona

Quando o app roda como TWA (dentro do APK), é possível usar AdMob nativo em vez
de anúncios web. A comunicação entre a WebView e o código nativo é feita via
**JavaScript Bridge**.

### Detecção de ambiente TWA (já implementado no AdService)

```javascript
// public/js/services/adService.js
this.#nativeSdkAvailable = typeof window !== 'undefined'
  && typeof window.AdMobBridge !== 'undefined';
```

### Implementação futura (lado Android)

No código Kotlin do TWA, você precisará:

1. **Criar a classe `AdMobBridge`** que expõe métodos para o JavaScript:

```kotlin
class AdMobBridge(private val activity: Activity) {
    @JavascriptInterface
    fun showBanner(placement: String) { /* Exibir banner AdMob nativo */ }

    @JavascriptInterface
    fun hideBanner() { /* Esconder banner */ }

    @JavascriptInterface
    fun showInterstitial(trigger: String) { /* Exibir interstitial */ }

    @JavascriptInterface
    fun showRewarded(placement: String) {
        // Exibir rewarded e callback JS com resultado
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window.AdMobBridge.__onRewardGranted('$placement')", null
            )
        }
    }
}
```

2. **Registrar o bridge na WebView** (requer customização do LauncherActivity):

```kotlin
webView.addJavascriptInterface(AdMobBridge(this), "AdMobBridge")
```

3. **No lado JS** (AdService), os métodos já estão preparados com TODOs para
   substituir os mocks pelas chamadas reais ao bridge.

### Fluxo

```
[PWA no Chrome]  → AdService (modo mock, banners CSS)
[TWA no APK]     → AdService detecta AdMobBridge → chama métodos nativos
```

---

## 9. Resumo dos Comandos

| Comando | Descrição |
|--|--|
| `npm run android:init` | Inicializar projeto Android via Bubblewrap |
| `npm run android:build` | Gerar APK e AAB |
| `npm run android:install` | Instalar APK no celular via USB |
| `npm run android:keygen` | Gerar keystore de assinatura |

---

## 10. Arquivos Relacionados

| Arquivo | Descrição |
|--|--|
| `twa-manifest.json` | Configuração Bubblewrap (nomes, cores, assinatura) |
| `public/manifest.json` | Web App Manifest (PWA) |
| `public/.well-known/assetlinks.json` | Digital Asset Links (verificação domínio) |
| `public/sw.js` | Service Worker (offline, cache) |
| `public/js/services/adService.js` | Serviço de anúncios (mock web + bridge TWA) |
| `android-keystore/` | Keystore de assinatura (**NÃO commitar!**) |

---

## Segurança

- **NUNCA** commite o keystore no Git (já adicionado ao `.gitignore`)
- Guarde o keystore e a senha em local seguro (ex: cofre de senhas, backup criptografado)
- Se perder o keystore, não poderá atualizar o app na Play Store
- O `assetlinks.json` é público por design — ele apenas declara qual app é confiável
