# @nettuno/sdk — Universal B2B Anti-Fraud Client

Universal JavaScript & TypeScript client SDK for **Nettuno Fraud-as-a-Service (FaaS)**. Zero external dependencies (< 15 KB).

---

## Quick Start

### 1. Browser (HTML Script Tag)

```html
<script src="https://nettuno-e6036.web.app/sdk/nettuno.js"></script>
<script>
  const nettuno = Nettuno.create({
    apiKey: 'nt_live_YOUR_API_KEY',
    lang: 'pt' // 'pt' | 'en' | 'es'
  });

  // 1. Fetch Shield Status (0 credits)
  const shield = await nettuno.getShield('listing_123');

  // 2. Render Shield Badge in DOM — clickable by default: opens the full panel
  //    (vote + share + SINAIS/CONTACTO/INTERAÇÃO/RESULTADO tabs) on click.
  nettuno.mountShield(document.getElementById('shield-container'), shield);

  // 3. Optional standalone vote widget (0 credits) — same voting UI used inside the panel.
  nettuno.mountVotePanel(document.getElementById('vote-container'), 'listing_123');
</script>
```

### 2. React / Next.js / Node.js (ESM / CJS)

```bash
npm install @nettuno/sdk
```

```typescript
import { create } from '@nettuno/sdk';

const nettuno = create({
  apiKey: process.env.NEXT_PUBLIC_NETTUNO_KEY,
  lang: 'pt'
});

// Batch fetch status for catalog items (up to 50 items at once, 0 credits)
const shields = await nettuno.batchShield(['ad_1', 'ad_2', 'ad_3']);
```

---

## Features & Capabilities

- **Zero-Credit Shield Impressions:** Fast read-model checks for catalog rendering without consuming risk units.
- **Full Community Panel on Click:** `mountShield` opens the same rich panel the browser extension ships — vote pill, share row, and SINAIS/CONTACTO/INTERAÇÃO/RESULTADO tabs with clickable signal cards (`reportSignal`) — not a stripped-down widget.
- **Shadow DOM Isolation:** `mountShield` supports `isolation: 'shadow'` for the badge itself, to prevent host CSS conflicts (the panel it opens is appended to `document.body`, same as the extension).
- **Native CSS Theming:** Stable public classes (`.nettuno-shield`, `.nettuno-vote-panel`, `as-*` panel classes) and `--nettuno-*` CSS custom properties on the badge — style with your own stylesheet, no visual lock-in.
- **Account-Level Branding:** Pass `theme` to `create()` to apply the brand configured in the dashboard's Branding page to every `mountShield`/`mountVotePanel` call, with per-call `options` still able to override it.
- **Multilingual (i18n):** Native text strings for Portuguese, English, and Spanish.
- **TypeScript Ready:** Complete type definitions in `nettuno.d.ts`.
- **Fault-Tolerant (Graceful Degradation):** Aborts slow requests (> 2.5s) without blocking host page load.

---

## API Reference

### create(options: NettunoClientOptions): NettunoClient

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `apiKey` | string | `''` | B2B API Key (`nt_live_...` or `nt_test_...`) |
| `apiUrl` | string | `'https://nettuno-e6036.web.app'` | API Base URL |
| `lang` | `'pt' \| 'en' \| 'es'` | `'pt'` | Default badge language |
| `timeoutMs` | number | `2500` | Fetch abort timeout |
| `enableCache` | boolean | `true` | Client-side LRU cache |
| `theme` | `NettunoTheme` | `undefined` | Account branding (labels/icons/colors per state, vote panel styling) — see `nettuno.d.ts` |

### Methods

- **getShield(listingId)**: Fetches shield state for a single item (0 credits).
- **batchShield(ids)**: Fetches shield state for up to 50 items in a single request (0 credits).
- **vote(listingId, voteType, voterId)**: Submits a `POSITIVE`/`NEGATIVE` community vote (0 credits).
- **reportSignal(listingId, signal, phase, options)**: Reports a granular community signal (e.g. `unrealistic_price`, `doesnt_answer`) for `phase` `'contact' | 'interaction' | 'result'` (0 credits). `options.action` is `'add'` (default) or `'remove'`.
- **requestAnalysis(listingId, listingData)**: Triggers deep risk analysis (1 Risk Unit consumed).
- **mountShield(el, shieldData, options)**: Renders the shield badge. Clickable by default — opens the full panel (pass `openPanelOnClick: false` to disable, or `listingId` if `shieldData.listingId` isn't set).
- **mountVotePanel(el, listingId, options)**: Renders the standalone community voting widget (same vote pill used inside the panel).
- **openPanel(listingId, shieldData, options)**: Opens the full panel directly (`options.anchorEl` positions it near an element).
- **closePanel()**: Closes the full panel if one is open.
- **autoMount(rootEl)**: Auto-detects and mounts elements with `[data-nettuno-shield]`.
- **destroy(el)**: Unmounts a previously rendered shield/panel.

### Theming precedence

For any given shield state or vote button, the final label/icon/color is resolved in this order (highest priority first):

1. Options passed directly to that `mountShield`/`mountVotePanel` call (`labels`, `icons`, `variables`, `css`, `positiveLabel`, ...).
2. The account `theme` passed to `create()`.
3. The SDK's built-in defaults.

---

## License

MIT — Nettuno B2B SaaS
