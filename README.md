# Nettuno B2B

Camada B2B do Nettuno: SDK para marketplaces, dashboard self-service e o
backend (Cloud Functions) que os serve. **Repositório privado** — separado de
propósito do `SCM-HUNTERS` (extensão/comunidade B2C) e do `nettuno-extension`
(mirror público do cliente da extensão).

## Estrutura

- `functions/b2b/` — Risk API V1, Risk Engine adaptativo (signals, quota,
  cache, fila assíncrona), autenticação de empresas (`registerCompany`,
  `ensureMarketplaceAccount`), gestão de API keys.
- `functions/lib/` — motor de votos/confiança do B2C (`scoreEngine.js`,
  `trust.js`), reaproveitado pelo B2B (`voterTrust.js` delega o cálculo base
  de confiança aqui em vez de o reimplementar).
- `functions/index.js` — entrypoint Cloud Functions (Gen 2), só com os
  triggers B2B. O `submitVote`/`deleteMyAccount`/`training` do B2C vivem no
  repositório principal, não são duplicados aqui.
- `sdk/` — `@nettuno/sdk`, o cliente JS que os marketplaces integram
  (`mountShield`, `mountVotePanel`, `openPanel`, `reportSignal`). Reutiliza o
  visual e o comportamento reais da extensão (não é um redesenho).
- `website/dashboard/` — portal B2B self-service (login, API keys, branding/
  tema, playground, docs, logs, usage).
- `vedix-demo/` — marketplace de referência para teste end-to-end da
  integração real do SDK.

## Deploy

`firebase.json` + `.firebaserc` apontam para o projeto `nettuno-e6036` — o
deploy de **functions** e **firestore rules** corre a partir daqui:

```
firebase deploy --only functions
firebase deploy --only firestore:rules
```

`firebase.json` não tem secção `hosting` de propósito — `firebase deploy`
(sem `--only`) nunca toca no hosting a partir daqui, mesmo por engano.

**`firestore.rules` é uma cópia** do ficheiro único e partilhado do projeto
Firebase (users/, votes/, ads/, config/... do B2C + marketplaces/... do B2B
vivem todos no mesmo ficheiro, porque é o mesmo projeto Firestore). A cópia
"fonte" histórica fica no `SCM-HUNTERS`, mas **este repositório é agora o
sítio a partir de onde as rules são de facto publicadas** — se voltares a
editar `marketplaces/{uid}` ou similares no `SCM-HUNTERS`, replica a mudança
aqui antes de fazer deploy (ou vice-versa). Não há sincronização automática.

**Hosting (dashboard em `/dashboard/...`, SDK em `/sdk/...`) fica de fora**
deste `firebase.json` — decisão adiada. O `website/` original (site
principal, privacy, help/support) só existe no `SCM-HUNTERS`, e um
`firebase deploy --only hosting` a partir de qualquer um dos dois
checkouts substitui TODO o conteúdo do hosting pelo que existir localmente
nesse checkout — não faz merge entre os dois. Servir os dois em simultâneo
sem um wipe acidental do site principal precisa de um Firebase Hosting
"site"/target dedicado para o B2B, ou de trazer `website/dashboard` e `sdk/`
de volta para o checkout do site principal só para efeitos de build/deploy.
Ainda por decidir.

## Testes

```
cd functions
npm install
npm test
```

56 testes (`node --test`), cobrindo metering, cache, rate limiting, risk
queue, signal engine, voter trust/community signal, catálogo de sinais, CORS
restrito e validação de registo de empresa.
