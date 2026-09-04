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

`firebase.json` tem uma secção `hosting` própria, com **target explícito**
(`"target": "dashboard"`), por isso um `firebase deploy` (sem `--only`)
também publica o dashboard — mas sempre no site `nettuno-b2b`, nunca no
principal (são sites diferentes dentro do mesmo projeto; um nunca
substitui o outro).

```
firebase deploy --only hosting:dashboard
```

Publica o dashboard em **https://nettuno-b2b.web.app** (Hosting site
`nettuno-b2b`, criado com `firebase hosting:sites:create` e ligado ao target
`dashboard` via `firebase target:apply hosting dashboard nettuno-b2b` — isto
já está feito, o `.firebaserc` tem o mapeamento). O SDK público continua a
ser servido pelo site principal (`https://nettuno-e6036.web.app/sdk/
nettuno.js`), a partir do `SCM-HUNTERS` (`website/sdk/nettuno.js` lá é uma
cópia deliberada — ver nota abaixo). Os ficheiros do dashboard que antes
tinham caminhos relativos a assumir a mesma raiz de hosting que o `sdk/`
(`../sdk/nettuno.js`, `../index.html`) foram trocados por URLs absolutas
para `nettuno-e6036.web.app`.

**`firestore.rules` é uma cópia** do ficheiro único e partilhado do projeto
Firebase (users/, votes/, ads/, config/... do B2C + marketplaces/... do B2B
vivem todos no mesmo ficheiro, porque é o mesmo projeto Firestore). A cópia
"fonte" histórica fica no `SCM-HUNTERS`, mas **este repositório é agora o
sítio a partir de onde as rules são de facto publicadas** — se voltares a
editar `marketplaces/{uid}` ou similares no `SCM-HUNTERS`, replica a mudança
aqui antes de fazer deploy (ou vice-versa). Não há sincronização automática.

**`website/sdk/nettuno.js` no `SCM-HUNTERS`** é a mesma história: cópia
deliberada de `sdk/nettuno.js` daqui, só para o site principal poder
continuar a servir `/sdk/nettuno.js` sem depender deste repositório no
deploy. Ao alterar `sdk/nettuno.js` aqui, copia também para lá antes do
próximo `firebase deploy --only hosting` do `SCM-HUNTERS`.

## Testes

```
cd functions
npm install
npm test
```

56 testes (`node --test`), cobrindo metering, cache, rate limiting, risk
queue, signal engine, voter trust/community signal, catálogo de sinais, CORS
restrito e validação de registo de empresa.
