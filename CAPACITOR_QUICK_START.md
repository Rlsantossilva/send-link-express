# 🚀 Capacitor Quick Start

## 5 Minutos para Começar

### 1️⃣ Instalar Dependências
```bash
npm install
```

### 2️⃣ Build Web
```bash
npm run build
```

### 3️⃣ Adicionar Android (primeira vez)
```bash
npx cap add android
```

### 4️⃣ Sincronizar
```bash
npx cap sync android
```

### 5️⃣ Abrir no Android Studio
```bash
npx cap open android
```

---

## 🔥 Firebase Setup (Obrigatório)

1. [Firebase Console](https://console.firebase.google.com/) → Novo Projeto
2. Adicionar app Android com package: `com.rlfisantossilva.zaptri`
3. Download `google-services.json`
4. Salvar em `android/app/google-services.json`
5. Adicionar ao `.gitignore`

---

## ▶️ Rodar App

No Android Studio:
- Pressione **Shift+F10** ou
- Run → **Run 'app'**

---

## 📝 Fazer Mudanças

```bash
# 1. Editar código TypeScript/React
# 2. Build web
npm run build

# 3. Sincronizar com Android
npx cap sync

# 4. Reabrir app no emulador
# (Ou pressione Shift+F10 no Android Studio)
```

---

## 📚 Documentação Completa

- **ANDROID_SETUP.md** - Setup detalhado
- **capacitor.config.ts** - Configuração Capacitor
- **src/lib/mobile/** - Código mobile reutilizável

---

## 🆘 Problemas Comuns

### App crasheia
```bash
adb logcat | grep -i "zaptri"
```

### Push não funciona
- Verificar `android/app/google-services.json`
- Verificar permissão `POST_NOTIFICATIONS` em AndroidManifest.xml

### Gradle falha
```bash
cd android
./gradlew clean
./gradlew build
```

---

## ✅ Próximos Passos

1. ✅ Completar Firebase setup (OBRIGATÓRIO)
2. ✅ Testar no emulador
3. ✅ Build APK: `./gradlew assembleDebug`
4. ✅ Publicar na Play Store (ver ANDROID_SETUP.md)

---

**Tudo pronto! 🎉 Você agora tem web + Android!**
