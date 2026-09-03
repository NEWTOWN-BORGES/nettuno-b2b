# Nettuno × Vedix — Integração E2E

## Página de Teste

[nettuno-integration.html](file:///c:/Users/ADMIN/Desktop/texte1ALFA/vedix-demo/nettuno-integration.html)

## Como Testar (End-to-End Real)

### 1. Abrir a página
Abre directamente no Chrome:
```
file:///c:/Users/ADMIN/Desktop/texte1ALFA/vedix-demo/nettuno-integration.html
```

### 2. Configurar a API URL
O campo já está pré-preenchido com:
```
https://europe-west1-nettuno-e6036.cloudfunctions.net/apiV1
```

Se quiseres testar via rewrite do Hosting Firebase:
```
https://nettuno-e6036.web.app
```

### 3. Inserir a API Key
Campo `type="password"` — nunca exposto no DOM, localStorage ou logs.

A consola mostra apenas os últimos 6 caracteres para auditoria:
```
Chave: nt_live_***…abc123 (truncada)
```

### 4. Clicar em ▶ Analisar Anúncios

O SDK faz `batchRisk(ids)` com os 9 IDs do catálogo Vedix.

### O que validar em cada batch

| Verificação | Onde ver |
|---|---|
| Créditos consumidos | Métrica `Créditos usados` + header `X-Nettuno-Credits-Used` |
| Quota restante | Métrica `Quota restante` + header `X-Nettuno-Quota-Remaining` |
| Cache L1 | Métrica `Cache` (HIT/MISS/PARTIAL) |
| Rate limit | Métrica `Rate Limit` + header `X-RateLimit-Remaining` |
| Latência real | Métrica `Latência` em ms |
| Escudos por estado | TRUSTED (verde) · SAFE (slate) · RISK (âmbar) |
| Privacidade da key | A key nunca aparece no DOM ou nos logs |
| Isolamento de motor | Logs não revelam `wPos`, `wNeg`, `trustWeight` |

### Testar cenários de erro

**Rate Limit (429)** — enviar muitos batches em sequência rápida.  
**Quota Excedida (402)** — usar uma key de teste com quota baixa.  
**Key Inválida (401)** — inserir uma key mal formatada.  
**CORS** — os headers de CORS devem estar presentes em todas as respostas.

### IDs de Anúncios Usados no Teste

| ID | Produto |
|---|---|
| `vedix_iphone15promax_01` | iPhone 15 Pro Max 256GB |
| `vedix_iphone14pro_02` | iPhone 14 Pro 256GB |
| `vedix_iphone13_03` | iPhone 13 128GB |
| `vedix_iphone15_04` | iPhone 15 128GB |
| `vedix_iphone12mini_05` | iPhone 12 Mini 64GB |
| `vedix_iphonese_06` | iPhone SE 2022 64GB |
| `vedix_iphone11_07` | iPhone 11 64GB |
| `vedix_iphonexr_08` | iPhone XR 128GB |
| `vedix_macbookair_09` | MacBook Air M2 8GB |

> Estes IDs ainda não têm votos no Firestore — retornarão `score: 50 / state: SAFE / source: unknown` que é o comportamento correto da API.

### Nota sobre Cache entre Instances

Anuncio o mesmo batch duas vezes:
- 1.ª vez → `X-Nettuno-Cache: MISS` (lê Firestore)  
- 2.ª vez → `X-Nettuno-Cache: HIT` (L1 RAM da mesma instância Cloud Function)

Entre instâncias diferentes: TTL de 300s garante consistência eventual.

### Separação clara dos 3 limites

| Dimensão | Limite | Controlo |
|---|---|---|
| Rate Limit | 120 req/min | Por API Key (em memória) |
| Batch Max | 50 IDs | Por request |
| Quota | Créditos/mês | Por Tenant (Firestore transacional) |
