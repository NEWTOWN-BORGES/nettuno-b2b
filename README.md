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

## O que NÃO está aqui

- `firestore.rules` — vive no repositório de deploy (`SCM-HUNTERS`), porque
  é um ficheiro único, partilhado com as regras B2C do mesmo projeto
  Firebase. Manter uma segunda cópia aqui arriscava divergirem (uma cópia
  desatualizada a ser confiada por engano). As regras relevantes para o B2B
  (`marketplaces/{uid}`: `create` bloqueado ao cliente, `update` restrito a
  `theme`/`allowedOrigins`) estão documentadas nos comentários de
  `functions/b2b/registerCompany.js` e `functions/b2b/apiV1.js`.
- Deploy real (`firebase deploy`) continua a correr a partir do checkout do
  projeto Firebase principal (`nettuno-e6036`), não deste repositório
  isoladamente.

## Testes

```
cd functions
npm install
npm test
```

56 testes (`node --test`), cobrindo metering, cache, rate limiting, risk
queue, signal engine, voter trust/community signal, catálogo de sinais, CORS
restrito e validação de registo de empresa.
