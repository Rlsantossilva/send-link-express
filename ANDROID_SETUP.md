# 🤖 Guia de Setup Android com Capacitor

## Requisitos

- **Node.js** 18+
- **Java JDK** 17+
- **Android Studio** ou SDK
- **npm** ou **pnpm**

---

## 📋 Passo 1: Preparar Ambiente Local

### 1.1 Instalar Dependências Capacitor

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/app @capacitor/camera @capacitor/filesystem @capacitor/push-notifications @capacitor/device
```

### 1.2 Adicionar Scripts ao package.json

```json
"scripts": {
  "build:android": "npm run build && npx cap sync && npx cap open android",
  "cap:sync": "npx cap sync",
  "cap:open": "npx cap open android"
}
```

---

## 🔥 Passo 2: Configurar Firebase (Push Notifications)

### 2.1 Criar Projeto Firebase

1. Ir para [Firebase Console](https://console.firebase.google.com/)
2. Clique em **"Criar projeto"**
3. Nome: `zaptri-android`
4. Desativar Google Analytics (opcional)
5. Criar projeto

### 2.2 Adicionar App Android

1. No console, clique em **"Adicionar app"** → **Android**
2. **Package name**: `com.rlfisantossilva.zaptri`
3. **App nickname** (opcional): `Zap Tri Android`
4. Clique em **"Registrar app"**

### 2.3 Obter SHA-1 Fingerprint

```bash
# Para debug keystore (padrão do Android)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# Procure por "SHA1: XX:XX:XX:..."
```

Adicione no Firebase Console quando pedido.

### 2.4 Download google-services.json

1. No Firebase Console, após registrar o app
2. Clique em **"Fazer download do arquivo google-services.json"**
3. Salve em: `android/app/google-services.json`

⚠️ **Importante**: Esse arquivo contém credenciais. Nunca faça commit no Git público!

```bash
# Adicionar ao .gitignore
echo "android/app/google-services.json" >> .gitignore
```

---

## 🏗️ Passo 3: Sincronizar Código Web com Capacitor

### 3.1 Build Web

```bash
npm run build
```

### 3.2 Sincronizar com Android (Primeira vez)

Se é a primeira vez:

```bash
npx cap add android
```

Se já existe a pasta `android/`:

```bash
npx cap sync android
```

Isso:
- Copia seu `dist/` para `android/app/src/main/assets/public/`
- Sincroniza plugins nativos
- Atualiza configurações

---

## 🛠️ Passo 4: Abrir no Android Studio

### Via comando:

```bash
npx cap open android
```

### Ou manualmente:

1. Abra **Android Studio**
2. File → **Open**
3. Selecione a pasta `android/` do seu projeto
4. Aguarde o Gradle build completar (1-3 minutos)

---

## ▶️ Passo 5: Executar no Emulador/Device

### 5.1 Criar Emulador (se necessário)

1. Android Studio → **Device Manager**
2. **Create Device**
3. Selecione um device (ex: Pixel 6)
4. Selecione uma imagem Android (API 30+)
5. Finish

### 5.2 Run App

**Opção 1** (Android Studio):
- Run → **Run 'app'** (ou pressione Shift+F10)

**Opção 2** (Terminal):

```bash
cd android
./gradlew installDebug
```

### 5.3 Verificar Logs

```bash
adb logcat | grep -i "zaptri"
```

---

## 🔔 Passo 6: Testar Push Notifications

### 6.1 Testar Localmente

1. App aberto no emulador
2. No Firebase Console → **Cloud Messaging**
3. Enviar mensagem de teste
4. Notificação deve aparecer como banner no app

### 6.2 Testar App Fechado

1. Fechar app
2. Enviar mensagem de teste no Firebase
3. Notificação deve aparecer na bandeja (notification tray)
4. Clicar abre app e navega para conversa

### 6.3 Verificar Token

No console do navegador (quando app aberto em debug):

```javascript
// DevTools Console
console.log('Push token:', localStorage.getItem('pushToken'));
```

---

## 📦 Passo 7: Build APK

### 7.1 Build Debug

Para testar localmente:

```bash
cd android
./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

### 7.2 Instalar no Device

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### 7.3 Build Release

Para publicar na Play Store:

```bash
cd android
./gradlew assembleRelease
```

APK: `android/app/build/outputs/apk/release/app-release.apk`

**⚠️ Nota**: Release requer keystore assinado (veja Passo 8)

---

## 🔐 Passo 8: Assinar APK para Play Store

### 8.1 Gerar Keystore

```bash
keytool -genkey -v -keystore release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias release
```

Você será pedido para:
- Senha do keystore
- Dados pessoais (nome, empresa, país)

Salve o keystore em local seguro! ⚠️

### 8.2 Assinar APK

```bash
jarsigner -verbose -sigalg MD5withRSA -digestalg SHA1 \
  -keystore release.keystore \
  android/app/build/outputs/apk/release/app-release-unsigned.apk \
  release
```

### 8.3 Align APK

```bash
zipalign -v 4 \
  android/app/build/outputs/apk/release/app-release-unsigned.apk \
  app-release.apk
```

---

## 🚀 Passo 9: Publicar na Play Store

### 9.1 Google Play Console

1. Ir para [Google Play Console](https://play.google.com/console)
2. Criar novo app:
   - Idioma padrão: **Português (Brasil)**
   - Tipo: **Aplicativo**
3. Preencher info básica

### 9.2 Upload APK

1. **Entrega → Teste Interno** (primeiro)
2. Upload do `app-release.apk`
3. Definir versão (ex: `1.0.0`)
4. Revisar (leva alguns minutos)

### 9.3 Testar

1. Na aba "Teste Interno", adicionar email de teste
2. Acessar link de teste com conta Google
3. Instalar app
4. Testar funcionalidades

### 9.4 Publicar em Produção

1. **Entrega → Produção**
2. Upload do APK
3. Preencher infos requeridas:
   - **Título**: Zap Tri
   - **Descrição**: Mensagens com texto, foto, vídeo e áudio
   - **Screenshots** (mínimo 2)
   - **Ícone** (512x512)
   - **Categoria**: Social / Comunicação
   - **Política de privacidade**: Link seu site/privacy
4. **Salvar e revisar**
5. Clique em **"Enviar para revisão"**

**⏱️ Tempo**: Google revisa em 2-24 horas

---

## 🐛 Troubleshooting

### App crasheia ao abrir

```bash
# Ver logs detalhados
adb logcat -c
adb logcat | grep -i "zaptri" &

# Abrir app no Android Studio e verificar
```

### Push notifications não chegando

1. ✅ Verificar `android/app/google-services.json` existe
2. ✅ Verificar permissão `POST_NOTIFICATIONS` em AndroidManifest.xml
3. ✅ Verificar token salvo no backend
4. ✅ Verificar Firebase Console → Cloud Messaging

### Erro: "No compatible application found"

```bash
# Verificar que plugins Capacitor estão instalados
npx cap sync

# Reabrir no Android Studio
npx cap open android
```

### Gradle build falha

```bash
# Limpar cache
cd android
./gradlew clean
./gradlew build
```

---

## 📝 Checklist Pré-Publicação

- [ ] `npm run build` executa sem erros
- [ ] `npx cap sync` executa sem erros
- [ ] App roda em emulador/device sem crashes
- [ ] Push notifications funcionam
- [ ] Câmera e galeria funcionam
- [ ] Autenticação funciona
- [ ] Mensagens em tempo real funcionam
- [ ] `google-services.json` adicionado ao `.gitignore`
- [ ] APK assinado com keystore
- [ ] Screenshots de 1-2 MB cada (PNG/JPG)
- [ ] Ícone 512x512 PNG
- [ ] Versão aumentada no `capacitor.config.ts`

---

## 🔗 Referências

- [Capacitor Docs](https://capacitorjs.com/docs)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Google Play Console](https://play.google.com/console)
- [Android Developers](https://developer.android.com/)

---

## 📞 Suporte

Se encontrar problemas:

1. Verificar logs: `adb logcat`
2. Conferir Firebase Console
3. Verificar permissões em AndroidManifest.xml
4. Fazer clean build: `./gradlew clean build`
