# SoccerPlay-Lite

Aplicativo mobile de futebol com dados reais da API-Football/API-Sports.

## O que já está preparado
- Jogos ao vivo
- Jogos de hoje
- Próximos jogos
- Resultados
- Eventos: gols, cartões e substituições
- Centro da partida
- Tabela quando disponível
- Favoritos salvos no aparelho
- Atualização automática dos jogos ao vivo
- Campo virtual baseado em eventos reais da partida
- Interface mobile Lite
- Backend separado para não expor a chave da API no aplicativo

## Segurança da chave
NÃO coloque a chave API no frontend, no APK ou no GitHub.

No backend, crie `.env` a partir de `.env.example`:

API_FOOTBALL_KEY=SUA_CHAVE_NOVA

A chave que foi enviada anteriormente no chat deve ser considerada exposta. Gere outra no painel da API-Sports antes de usar.

## Rodar localmente

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Por padrão, o frontend usa `http://localhost:3001`.

Para produção, defina:
`VITE_API_BASE=https://SEU-BACKEND/api`

## APK
O projeto usa Capacitor. Depois de instalar as dependências:
```bash
cd frontend
npm run build
npx cap add android
npx cap sync android
```

O workflow em `.github/workflows/android.yml` pode ser usado no GitHub Actions para gerar o APK.

## Observação sobre o campo virtual
O campo não inventa posições de jogadores. Ele usa eventos reais retornados pela API. Se uma competição/partida não fornecer coordenadas de tracking, o app mostra indicadores de eventos no lado do time. Isso evita fabricar movimentação.


### Interface
- Nome **SOCCERPLAY** centralizado no topo da tela inicial, com visual esportivo em verde/amarelo.
