name: Build APK

on:
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Baixar projeto
        uses: actions/checkout@v4

      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Instalar dependências do frontend
        working-directory: frontend
        run: npm install

      - name: Instalar TTS
        working-directory: frontend
        run: npm install @capacitor-community/text-to-speech@6.1.0

      - name: Configurar endereço da API
        working-directory: frontend
        run: |
          echo "VITE_API_BASE=${{ secrets.API_BASE_URL }}" > .env.production

      - name: Compilar frontend
        working-directory: frontend
        run: npm run build

      - name: Instalar Capacitor
        working-directory: frontend
        run: |
          npm install @capacitor/core@7.4.3
          npm install @capacitor/cli@7.4.3
          npm install @capacitor/android@7.4.3

      - name: Criar projeto Android
        working-directory: frontend
        run: npx cap add android

      - name: Sincronizar Android
        working-directory: frontend
        run: npx cap sync android

      - name: Configurar Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - name: Configurar Android SDK
        uses: android-actions/setup-android@v4
        with:
          packages: ''

      - name: Compilar APK
        working-directory: frontend/android
        run: ./gradlew assembleDebug

      - name: Enviar APK
        uses: actions/upload-artifact@v4
        with:
          name: SoccerPlay-Lite-APK
          path: frontend/android/app/build/outputs/apk/debug/app-debug.apk
