/**
 * NETTUNO SHIELD SDK — UNIVERSAL ADAPTIVE CLIENT (BETA).
 * Zero dependências (< 15 KB).
 * 
 * Separação Estrita de Recursos:
 *   - Visualização do Shield: 0 créditos (consome estado leve ou cache).
 *   - Votação Comunitária: 0 créditos (sensor distribuído).
 *   - Análise Profunda sob demanda: 1 Risk Unit (processada via fila assíncrona).
 * 
 * Estados Suportados:
 *   - SAFE                 → Verificado e aparentemente seguro
 *   - TRUSTED              → Validado com forte confiança comunitária
 *   - RISK                 → Sinais de risco detetados pelo Risk Engine
 *   - PENDING              → Análise ou processamento em fila
 *   - ANALYSIS_STALE       → Análise com mais de 14 dias sem revalidação
 *   - ANALYSIS_UNAVAILABLE → Sem dados disponíveis
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Nettuno = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_API_URL = 'https://nettuno-e6036.web.app';
  const SDK_VERSION = '2026-08-01-beta';

  const I18N = {
    'pt': {
      safe: 'Seguro',
      trusted: 'Confiável',
      risk: 'Atenção',
      pending: 'Em Verificação',
      stale: 'Verificação Antiga',
      unavailable: 'Sem Dados',
      safeAria: 'Nettuno: Anúncio aparentemente seguro',
      trustedAria: 'Nettuno: Anúncio com forte confiança comunitária',
      riskAria: 'Nettuno: Atenção recomendada, sinais suspeitos',
      pendingAria: 'Nettuno: Análise em fila de processamento',
      staleAria: 'Nettuno: Análise realizada há mais de 14 dias',
      unavailableAria: 'Nettuno: Sem histórico de análise',
      poweredBy: 'Powered by Nettuno',
      voteTitle: 'Verificação da Comunidade',
      voteSafe: 'Parece Seguro',
      voteRisk: 'Suspeito',
      votedThanks: 'Voto registado com sucesso',
      tabStats: 'Sinais', tabContact: 'Contacto', tabInteraction: 'Interação', tabResult: 'Resultado',
      badgeRisk: 'CAUTELA', badgeWarning: 'ATENÇÃO', badgeSafe: 'SEM ALERTAS', badgeTrusted: 'BEM AVALIADO',
      shareLabel: 'PARTILHAR', noSignalsYet: 'Ainda não há sinais comunitários registados.',
      noCategorySignals: 'Nenhum sinal disponível para esta categoria.',
      limitReached: 'Limite de 3 votos por separador.', participants: 'PARTICIPANTES',
      disclaimer: 'Indicadores automáticos e votos da comunidade. Não são uma acusação nem uma garantia — verifica sempre antes de pagar.',
      adSpace: 'ESPAÇO PUBLICITÁRIO'
    },
    'en': {
      safe: 'Safe',
      trusted: 'Verified',
      risk: 'Caution',
      pending: 'Under Review',
      stale: 'Review Stale',
      unavailable: 'No Data',
      safeAria: 'Nettuno: Listing appears safe',
      trustedAria: 'Nettuno: Verified with high community trust',
      riskAria: 'Nettuno: Caution advised, suspicious signals',
      pendingAria: 'Nettuno: Analysis queued',
      staleAria: 'Nettuno: Review older than 14 days',
      unavailableAria: 'Nettuno: No data available',
      poweredBy: 'Powered by Nettuno',
      voteTitle: 'Community Verification',
      voteSafe: 'Looks Safe',
      voteRisk: 'Suspicious',
      votedThanks: 'Feedback recorded',
      tabStats: 'Signals', tabContact: 'Contact', tabInteraction: 'Interaction', tabResult: 'Result',
      badgeRisk: 'CAUTION', badgeWarning: 'ATTENTION', badgeSafe: 'NO ALERTS', badgeTrusted: 'WELL RATED',
      shareLabel: 'SHARE', noSignalsYet: 'No community signals reported yet.',
      noCategorySignals: 'No signals available for this category.',
      limitReached: 'Limit of 3 votes per tab.', participants: 'PARTICIPANTS',
      disclaimer: 'Automated indicators and community votes. Not an accusation or a guarantee — always verify before paying.',
      adSpace: 'AD SPACE'
    },
    'es': {
      safe: 'Seguro',
      trusted: 'Verificado',
      risk: 'Precaución',
      pending: 'En Revisión',
      stale: 'Revisión Antigua',
      unavailable: 'Sin Datos',
      safeAria: 'Nettuno: Anuncio parece seguro',
      trustedAria: 'Nettuno: Verificado con alta confianza comunitaria',
      riskAria: 'Nettuno: Precaución recomendada',
      pendingAria: 'Nettuno: Análisis en cola',
      staleAria: 'Nettuno: Análisis de más de 14 días',
      unavailableAria: 'Nettuno: Sin datos',
      poweredBy: 'Powered by Nettuno',
      voteTitle: 'Verificación Comunitaria',
      voteSafe: 'Parece Seguro',
      voteRisk: 'Sospechoso',
      votedThanks: 'Voto registrado',
      tabStats: 'Señales', tabContact: 'Contacto', tabInteraction: 'Interacción', tabResult: 'Resultado',
      badgeRisk: 'PRECAUCIÓN', badgeWarning: 'ATENCIÓN', badgeSafe: 'SIN ALERTAS', badgeTrusted: 'BIEN VALORADO',
      shareLabel: 'COMPARTIR', noSignalsYet: 'Aún no hay señales de la comunidad.',
      noCategorySignals: 'Sin señales disponibles para esta categoría.',
      limitReached: 'Límite de 3 votos por pestaña.', participants: 'PARTICIPANTES',
      disclaimer: 'Indicadores automáticos y votos de la comunidad. No son una acusación ni una garantía — verifica siempre antes de pagar.',
      adSpace: 'ESPACIO PUBLICITARIO'
    }
  };

  // Catálogo genérico de sinais comunitários — aplica-se a qualquer marketplace,
  // sem lógica por plataforma. Mesmo conjunto que POST /v1/listings/{id}/signal
  // aceita (ver functions/b2b/communitySignalCatalog.js — MANTER SINCRONIZADO).
  const SIGNAL_CATALOG = {
    contact: [
      { signal: 'unrealistic_price', label: 'Preço fora da realidade', icon: '💰', positive: false, negative: false },
      { signal: 'no_photos', label: 'Sem fotos', icon: '📷', positive: false, negative: true },
      { signal: 'doesnt_answer', label: 'Não atende', icon: '📵', positive: false, negative: false },
      { signal: 'number_off_or_fake', label: 'Nº desligado/falso', icon: '🔌', positive: false, negative: true },
      { signal: 'seen_no_reply', label: 'Visto sem resposta', icon: '👀', positive: false, negative: false },
      { signal: 'ai_generated_photos', label: 'Fotos geradas por IA', icon: '🤖', positive: false, negative: true },
      { signal: 'answered_call', label: 'Atendeu chamada', icon: '📞', positive: true, negative: false },
      { signal: 'replied_messages', label: 'Respondeu mensagens', icon: '💬', positive: true, negative: false }
    ],
    interaction: [
      { signal: 'visit_done', label: 'Visitei o local', icon: '📍', positive: true, negative: false },
      { signal: 'clear_communication', label: 'Comunicação clara', icon: '🗣️', positive: true, negative: false },
      { signal: 'refused_visit', label: 'Recusou visita', icon: '🚫', positive: false, negative: true },
      { signal: 'wrong_location', label: 'Local errado', icon: '🗺️', positive: false, negative: false },
      { signal: 'stopped_responding', label: 'Parou de responder', icon: '🔇', positive: false, negative: false },
      { signal: 'asked_money_upfront', label: 'Pediu dinheiro antecipado', icon: '💸', positive: false, negative: true },
      { signal: 'redirected_convo', label: 'Redirecionou conversa', icon: '📲', positive: false, negative: false, hasSub: true }
    ],
    result: [
      { signal: 'success', label: 'Sucesso', icon: '🤝', positive: true, negative: false },
      { signal: 'trusted_seller', label: 'Vendedor confiável', icon: '🏅', positive: true, negative: false },
      { signal: 'scam', label: 'Scam/Burla', icon: '🚨', positive: false, negative: true },
      { signal: 'lost_money', label: 'Perdi dinheiro', icon: '📉', positive: false, negative: true },
      { signal: 'suspicious', label: 'Suspeito', icon: '🤨', positive: false, negative: true }
    ]
  };

  const SUB_BUTTONS = [
    { signal: 'redirect_whatsapp', label: 'WhatsApp', icon: '🟢', color: '#22c55e' },
    { signal: 'redirect_telegram', label: 'Telegram', icon: '🔵', color: '#3b82f6' },
    { signal: 'redirect_sms', label: 'SMS', icon: '💬', color: '#facc15' },
    { signal: 'redirect_email', label: 'Email', icon: '📧', color: '#e2e8f0' },
    { signal: 'redirect_outro', label: 'Outro', icon: '🔗', color: '#111827' }
  ];

  // Pares de sinais mutuamente exclusivos: marcar um remove automaticamente o
  // oposto, se estiver ativo (ex: "Atendeu chamada" desliga "Não atende").
  const CONTRADICTIONS = {
    'doesnt_answer': ['answered_call'],
    'number_off_or_fake': ['answered_call'],
    'replied_messages': ['seen_no_reply'],
    'visit_done': ['refused_visit'],
    'refused_visit': ['visit_done'],
    'answered_call': ['seen_no_reply'],
    'seen_no_reply': ['answered_call'],
    'trusted_seller': ['scam', 'lost_money', 'suspicious'],
    'scam': ['success'],
    'lost_money': ['success'],
    'suspicious': ['success'],
    'success': ['scam', 'lost_money']
  };

  function getSignalsForPhase(phase) {
    return SIGNAL_CATALOG[phase] || [];
  }
  function getSignalInfo(signalType) {
    for (const phase of Object.keys(SIGNAL_CATALOG)) {
      const found = SIGNAL_CATALOG[phase].find((s) => s.signal === signalType);
      if (found) return found;
    }
    return SUB_BUTTONS.find((s) => s.signal === signalType) || null;
  }
  function getSignalColorClass(signal) {
    if (!signal) return 'as-card-warning';
    if (signal.positive) return 'as-card-positive';
    if (signal.negative) return 'as-card-negative';
    return 'as-card-warning';
  }
  function getContradictions(signalType) {
    return CONTRADICTIONS[signalType] || [];
  }

  const BASE_CSS = `
    .nettuno-shield {
      --nt-bg: var(--nettuno-bg, #ffffff);
      --nt-text: var(--nettuno-text, #0f172a);
      --nt-border: var(--nettuno-border, rgba(0, 0, 0, 0.12));
      --nt-radius: var(--nettuno-radius, 6px);
      --nt-font: var(--nettuno-font, system-ui, -apple-system, sans-serif);
      --nt-shadow: var(--nettuno-shadow, 0 1px 3px rgba(0,0,0,0.05));
      --nt-safe-color: var(--nettuno-safe-color, #059669);
      --nt-safe-bg: var(--nettuno-safe-bg, #ecfdf5);
      --nt-safe-border: var(--nettuno-safe-border, #10b981);
      --nt-trusted-color: var(--nettuno-trusted-color, #2563eb);
      --nt-trusted-bg: var(--nettuno-trusted-bg, #eff6ff);
      --nt-trusted-border: var(--nettuno-trusted-border, #3b82f6);
      --nt-risk-color: var(--nettuno-risk-color, #dc2626);
      --nt-risk-bg: var(--nettuno-risk-bg, #fef2f2);
      --nt-risk-border: var(--nettuno-risk-border, #ef4444);
      --nt-pending-color: var(--nettuno-pending-color, #d97706);
      --nt-pending-bg: var(--nettuno-pending-bg, #fffbeb);
      --nt-pending-border: var(--nettuno-pending-border, #f59e0b);

      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      font-family: var(--nt-font);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      border-radius: var(--nt-radius);
      box-shadow: var(--nt-shadow);
      box-sizing: border-box;
      transition: all 0.15s ease;
      cursor: default;
    }

    .nettuno-shield--safe { background: var(--nt-safe-bg); color: var(--nt-safe-color); border: 1px solid var(--nt-safe-border); }
    .nettuno-shield--trusted { background: var(--nt-trusted-bg); color: var(--nt-trusted-color); border: 1px solid var(--nt-trusted-border); }
    .nettuno-shield--risk { background: var(--nt-risk-bg); color: var(--nt-risk-color); border: 1px solid var(--nt-risk-border); }
    .nettuno-shield--pending { background: var(--nt-pending-bg); color: var(--nt-pending-color); border: 1px dashed var(--nt-pending-border); }
    .nettuno-shield--analysis_stale { background: #f8fafc; color: #64748b; border: 1px solid #cbd5e1; }
    .nettuno-shield--analysis_unavailable { background: #f1f5f9; color: #94a3b8; border: 1px solid #e2e8f0; }

    .nettuno-shield__icon { display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
    .nettuno-shield__label { font-weight: 700; }
    .nettuno-shield__score { font-weight: 600; opacity: 0.85; }
    .nettuno-shield__powered { font-size: 9px; opacity: 0.6; margin-left: 4px; font-weight: 400; }

    /* Vote Panel */
    .nettuno-vote-panel {
      --nt-font: var(--nettuno-font, system-ui, -apple-system, sans-serif);
      --nt-radius: var(--nettuno-radius, 8px);
      --nt-bg: var(--nettuno-card-bg, #ffffff);
      --nt-border: var(--nettuno-border, rgba(0, 0, 0, 0.1));
      
      font-family: var(--nt-font);
      background: var(--nt-bg);
      border: 1px solid var(--nt-border);
      border-radius: var(--nt-radius);
      padding: 16px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .nettuno-vote-panel__head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; }
    .nettuno-vote-panel__buttons { display: flex; gap: 10px; }
    .nettuno-vote-btn {
      flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 14px; font-family: var(--nt-font); font-size: 13px; font-weight: 700;
      border-radius: var(--nettuno-button-radius, var(--nt-radius)); cursor: pointer;
      border: 1px solid transparent; transition: all 0.12s ease; outline: none;
    }
    .nettuno-vote-btn:hover { transform: translateY(-1px); }
    .nettuno-vote-btn:active { transform: scale(0.97); }
    .nettuno-vote-btn--positive { background: var(--nettuno-btn-pos-bg, #ecfdf5); color: var(--nettuno-btn-pos-color, #047857); border-color: var(--nettuno-btn-pos-border, #10b981); }
    .nettuno-vote-btn--negative { background: var(--nettuno-btn-neg-bg, #fef2f2); color: var(--nettuno-btn-neg-color, #b91c1c); border-color: var(--nettuno-btn-neg-border, #ef4444); }
  `;

  // Painel completo (clique no escudo) — réplica visual do painel real da extensão
  // Nettuno. Mesmos nomes de classe `as-*`, mesmas cores/sombras/bordas — não é
  // um redesenho.
  const PANEL_CSS = `
    [class^="as-"] { -webkit-font-smoothing: antialiased; box-sizing: border-box; }

    .as-badge-container { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
    .as-badge {
      position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center;
      background-color: #FACC15; border: 2px solid #000; transition: transform 0.1s; flex-shrink: 0;
      font-size: 14px; border-radius: 6px;
    }
    .as-badge svg { width: 32px; height: 32px; display: block; fill: #fff; stroke: #000; stroke-width: 1.1px; paint-order: stroke; }
    .as-badge:hover { transform: translate(0, -1px); }
    .as-badge-safe    { background-color: #22C55E; color: #fff; }
    .as-badge-warning { background-color: #FACC15; color: #fff; }
    .as-badge-alert   { background-color: #F97316; color: #fff; }
    .as-badge-danger  { background-color: #EF4444; color: #fff; }
    .as-badge-trusted {
      background-color: #22C55E; border: 2px solid #3B82F6; box-shadow: 2px 2px 0px #2563EB; border-radius: 0;
    }
    .as-badge-trusted svg { fill: #fff; stroke: #FACC15; stroke-width: 1.5px; }

    .as-v3-tooltip { position: absolute; z-index: 2147483647; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    .as-v3-modal {
      width: 380px; background: #0F172A; border: 4px solid #000; box-shadow: 8px 8px 0px #000;
      display: flex; flex-direction: column; overflow: hidden; position: relative; color: #E2E8F0;
      animation: as-pop 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes as-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    @keyframes as-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }

    .as-v3-header {
      background: #1E293B; color: #E2E8F0; padding: 12px 16px 12px 66px; text-align: left;
      border-bottom: 3px solid #000; position: relative; line-height: 1.2; margin: 0;
    }
    .as-v3-title { font-size: 16px; font-weight: 900; margin: 4px 0 0 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .as-v3-brand { font-size: 10px; font-weight: 900; color: #FFB162; letter-spacing: 2px; text-transform: uppercase; opacity: 0.85; text-decoration: none; }
    .as-theme-toggle {
      position: absolute; top: 12px; left: 12px; width: 46px; height: 22px; background: #0F172A;
      border: 2px solid #000; border-radius: 12px; cursor: pointer; padding: 0; box-shadow: 2px 2px 0 #000;
    }
    .as-theme-toggle:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 #000; }
    .as-theme-toggle-thumb {
      position: absolute; top: 1px; left: 1px; width: 16px; height: 16px; background: #FACC15; border-radius: 50%;
      transition: transform 0.2s, background 0.2s; display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: #000; pointer-events: none;
    }
    .as-light .as-theme-toggle { background: #E2E8F0; }
    .as-light .as-theme-toggle-thumb { transform: translateX(22px); background: #1E293B; color: #FACC15; }

    .as-v3-badge-tag {
      position: absolute; top: -14px; right: 14px; padding: 6px 14px; font-weight: 900; font-size: 11px;
      color: #fff; border: 3px solid #000; box-shadow: 3px 3px 0 #000; z-index: 5; text-transform: uppercase;
      letter-spacing: 0.8px; white-space: nowrap;
    }

    .as-brutal-status-secondary {
      background-color: #131C2E; color: #94A3B8; border-bottom: 2px solid #000; padding: 6px 0;
      font-weight: 700; font-size: 11px; text-transform: uppercase; overflow: hidden; position: relative;
      height: 36px; display: flex; align-items: center; justify-content: center;
    }
    .as-ticker-item { display: flex; gap: 10px; align-items: center; }
    .as-voters-block { display: inline-flex; align-items: center; gap: 6px; }
    .as-voters-stack { display: inline-flex; align-items: center; }
    .as-voter {
      width: 22px; height: 22px; border-radius: 50%; border: 2px solid #131C2E; background: #1E293B;
      display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 900;
      color: #FACC15; flex-shrink: 0;
    }
    .as-voters-stack > .as-voter:not(:first-child) { margin-left: -8px; }
    .as-voter-empty { background: transparent; border-color: transparent; font-size: 14px; color: #475569; }

    .as-brutal-vote-bar { display: flex; flex-direction: column; align-items: stretch; padding: 12px 16px 0; border-bottom: 3px solid #000; background-color: #0F172A; }
    .as-brutal-vote-bar > .as-brutal-pill { align-self: center; }
    .as-brutal-pill {
      background-color: #131C2E; border: 3px solid #000; box-shadow: 4px 4px 0px #000; padding: 0;
      border-radius: 30px; font-weight: 900; display: flex; font-size: 15px; overflow: hidden;
    }
    .as-like-btn, .as-dislike-btn { padding: 6px 20px; cursor: pointer; transition: all 0.1s; display: flex; align-items: center; gap: 6px; user-select: none; }
    .as-like-btn    { background-color: #131C2E; border-right: 2px solid #000; color: #E2E8F0; }
    .as-dislike-btn { background-color: #131C2E; color: #E2E8F0; }
    .as-like-btn:hover    { background-color: rgba(74,222,128,0.15); color: #4ADE80; }
    .as-dislike-btn:hover { background-color: rgba(248,113,113,0.15); color: #F87171; }
    .as-like-btn.active    { background-color: #047857; color: #fff; }
    .as-dislike-btn.active { background-color: #B91C1C; color: #fff; }

    .as-share-row { display: flex; align-items: center; gap: 6px; padding: 6px 12px 4px; border-top: 1px solid #1E293B; }
    .as-share-label { font-size: 8px; font-weight: 900; letter-spacing: 1px; color: #475569; text-transform: uppercase; flex: 1; }
    .as-share-btn {
      display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
      background: #1E293B; color: #64748B; border: 1px solid #334155; border-radius: 4px; cursor: pointer;
      text-decoration: none; font-size: 11px; font-weight: 900; transition: all 0.1s; padding: 0;
    }
    .as-share-btn:hover { background: #22D3EE; color: #000; border-color: #22D3EE; }

    .as-v3-tab-row { display: flex; border-bottom: 3px solid #000; background: #131C2E; }
    .as-v3-tab {
      flex: 1; padding: 10px 4px; font-size: 10px; font-weight: 900; border: none; border-right: 2px solid #000;
      background: transparent; cursor: pointer; text-transform: uppercase; transition: all 0.1s; color: #94A3B8;
    }
    .as-v3-tab:last-child { border-right: none; }
    .as-v3-tab.active { background: #22D3EE; color: #0F172A; }
    .as-v3-tab:hover:not(.active) { background: #1E293B; color: #E2E8F0; }

    .as-v3-content { padding: 16px; min-height: 220px; max-height: 302px; overflow-y: auto; background: #0F172A; color: #E2E8F0; }
    .as-v3-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .as-v3-card {
      padding: 8px 6px; border: 3px solid #000; box-shadow: 4px 4px 0px #000; font-size: 11px; font-weight: 800;
      cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 4px; overflow: hidden; position: relative; height: 60px; min-height: 60px;
      background: #131C2E; color: #E2E8F0; user-select: none;
    }
    .as-v3-card:hover:not(.expanded) { transform: translate(2px, 2px); box-shadow: 2px 2px 0px #000; }
    .as-v3-card.active { transform: translate(2px, 2px); box-shadow: none; }
    .as-card-positive { color: #86EFAC; border-color: #22C55E; }
    .as-card-warning  { color: #FDE68A; border-color: #FACC15; }
    .as-card-negative { color: #FCA5A5; border-color: #EF4444; }
    .as-card-positive:hover { background: #14532D; color: #fff; }
    .as-card-warning:hover  { background: #92400E; color: #FDE68A; }
    .as-card-negative:hover { background: #7F1D1D; color: #fff; }
    .as-v3-card.active.as-card-positive { background: #14532D; color: #fff; border-color: #4ADE80; }
    .as-v3-card.active.as-card-warning  { background: #92400E; color: #FDE68A; border-color: #FACC15; }
    .as-v3-card.active.as-card-negative { background: #7F1D1D; color: #fff; border-color: #F87171; }
    .as-v3-card.expanded { grid-column: span 2; background: #1E293B; border: 3px solid #22D3EE; animation: none; transform: none; z-index: 2; }
    .as-card-main-side { display: flex; align-items: center; gap: 6px; width: 100%; justify-content: center; white-space: normal; transition: all 0.2s; }
    .as-v3-card.expanded .as-card-main-side { opacity: 0; transform: translateY(-20px); }
    .as-card-sub-side {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center;
      justify-content: center; opacity: 0; transform: translateY(20px); transition: all 0.2s; pointer-events: none;
    }
    .as-v3-card.expanded .as-card-sub-side { opacity: 1; transform: translateY(0); pointer-events: auto; }
    .as-mini-grid { display: flex; gap: 4px; padding: 4px; width: 100%; height: 100%; align-items: center; justify-content: center; }
    .as-mini-btn {
      padding: 3px 4px; font-size: 8px; font-weight: 900; color: #fff; border: 1px solid #fff; cursor: pointer;
      text-transform: uppercase; border-radius: 2px; flex: 1; text-align: center; overflow: hidden; display: flex;
      align-items: center; justify-content: center; transition: all 0.1s;
    }
    .as-mini-btn.active { box-shadow: inset 3px 3px 0px rgba(0,0,0,0.4); filter: brightness(0.7); border: 2px solid #000; }
    .as-mini-btn:hover { transform: scale(1.1); filter: brightness(1.2); }
    .as-card-icon { font-size: 14px; flex-shrink: 0; }
    .as-card-marquee { white-space: normal; flex: 1; }

    .as-v3-footer { padding: 16px; border-top: 3px solid #000; font-size: 10px; font-weight: 700; display: flex; flex-direction: column; gap: 12px; background-color: #1E293B; }
    .as-v3-ads {
      width: 100%; height: 60px; background: #131C2E; border: 2px dashed #334155; display: flex; align-items: center;
      justify-content: center; font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 900;
    }
    .as-feedback-area { min-height: 12px; text-align: center; font-size: 12px; font-weight: 600; }
    .as-v3-disclaimer { font-size: 9px; line-height: 1.3; opacity: .6; padding: 6px 8px; text-align: center; }
    .as-v3-empty { padding: 24px 10px; text-align: center; color: #94A3B8; font-size: 12px; }

    .as-light.as-v3-modal { background: #fff; color: #111827; }
    .as-light .as-v3-header { background: #2563EB; color: #fff; }
    .as-light .as-brutal-status-secondary { background: #000; color: #fff; }
    .as-light .as-brutal-vote-bar, .as-light .as-brutal-pill { background: #fff; }
    .as-light .as-like-btn, .as-light .as-dislike-btn { background: #fff; color: #000; }
    .as-light .as-like-btn.active { background: #047857; color: #fff; }
    .as-light .as-dislike-btn.active { background: #B91C1C; color: #fff; }
    .as-light .as-v3-tab-row { background: #eee; }
    .as-light .as-v3-tab { color: #000; }
    .as-light .as-v3-tab.active { background: #2563EB; color: #fff; }
    .as-light .as-v3-content { background: #fff; color: #111827; }
    .as-light .as-v3-card { background: #F1F5F9; color: #111827; }
    .as-light .as-card-positive { background: #F0FDF4; color: #15803D; border-color: #22C55E; }
    .as-light .as-card-warning  { background: #FEFCE8; color: #A16207; border-color: #FACC15; }
    .as-light .as-card-negative { background: #FEF2F2; color: #B91C1C; border-color: #EF4444; }
    .as-light .as-v3-footer { background: #fff; }
    .as-light .as-v3-ads { background: #f3f4f6; border-color: #94a3b8; color: #64748b; }
    .as-light .as-share-btn { background: #F1F5F9; color: #64748B; border-color: #CBD5E1; }
  `;

  let styleInjected = false;
  function ensureGlobalStyles() {
    if (styleInjected || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.id = 'nettuno-sdk-styles';
    style.textContent = BASE_CSS + PANEL_CSS;
    document.head.appendChild(style);
    styleInjected = true;
  }

  function getTexts(lang = 'pt') {
    const code = String(lang).toLowerCase().split('-')[0];
    return I18N[code] || I18N.pt;
  }

  function create(opts) {
    const apiUrl = (opts && opts.apiUrl) || DEFAULT_API_URL;
    const apiKey = (opts && opts.apiKey) || '';
    const isTest = apiKey.startsWith('nt_test_');
    const defaultLang = (opts && opts.lang) || 'pt';
    const theme = (opts && opts.theme) || null;

    ensureGlobalStyles();

    function themeShieldFor(state) {
      return (theme && theme.shield && theme.shield[String(state).toLowerCase()]) || null;
    }

    function vote(listingId, voteType, voterId) {
      return request('POST', '/v1/listings/' + encodeURIComponent(listingId) + '/vote', {
        type: voteType,
        voterId
      });
    }

    function reportSignal(listingId, signal, phase, options = {}) {
      return request('POST', '/v1/listings/' + encodeURIComponent(listingId) + '/signal', {
        signal,
        phase,
        action: options.action || 'add',
        voterId: options.voterId
      });
    }

    async function request(method, path, body) {
      const headers = {
        'Authorization': 'Bearer ' + apiKey,
        'X-Nettuno-Client': 'sdk-js/' + SDK_VERSION
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(String(apiUrl).replace(/\/+$/, '') + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });

      const meta = {
        creditsUsed: res.headers.get('X-Nettuno-Credits-Used'),
        quotaRemaining: res.headers.get('X-Nettuno-Quota-Remaining'),
        cache: res.headers.get('X-Nettuno-Cache'),
        rateRemaining: res.headers.get('X-RateLimit-Remaining'),
        rateLimit: res.headers.get('X-RateLimit-Limit'),
      };

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || ('HTTP ' + res.status));
        err.status = res.status;
        err.body = data;
        err.code = data.code;
        err.requestId = res.headers.get('X-Nettuno-Request-Id');
        err.meta = meta;
        throw err;
      }
      // Metadados de uso (quota/cache/rate-limit) — ver secção "Métricas" da doc B2B.
      data.__meta = meta;
      return data;
    }

    // ── Painel completo (clique no escudo) — réplica do painel real da extensão ──
    let activePanel = null;
    let activeTab = 'stats';
    let docCloseListener = null;
    const userEventsCache = {};

    function closePanel() {
      if (activePanel) { activePanel.remove(); activePanel = null; }
      if (docCloseListener) { document.removeEventListener('click', docCloseListener, true); docCloseListener = null; }
    }

    function badgeTagInfo(state, texts) {
      const map = {
        SAFE: { bg: '#22c55e', color: '#fff', label: texts.badgeSafe },
        TRUSTED: { bg: '#2563eb', color: '#fff', label: texts.badgeTrusted },
        RISK: { bg: '#ef4444', color: '#fff', label: texts.badgeRisk },
      };
      // PENDING/ANALYSIS_STALE/ANALYSIS_UNAVAILABLE partilham o tom "atenção"; os
      // rótulos de texto usam as chaves curtas do I18N (pending/stale/unavailable),
      // não o nome completo do estado.
      const shortKey = { PENDING: 'pending', ANALYSIS_STALE: 'stale', ANALYSIS_UNAVAILABLE: 'unavailable' }[state];
      return map[state] || { bg: '#facc15', color: '#000', label: (shortKey && texts[shortKey]) || texts.badgeWarning };
    }

    function computePercentages(communitySignals) {
      let safe = 0, warn = 0, risk = 0, total = 0;
      for (const [code, count] of Object.entries(communitySignals || {})) {
        const n = Number(count) || 0;
        if (n <= 0) continue;
        const info = getSignalInfo(code);
        total += n;
        if (info && info.positive) safe += n;
        else if (info && info.negative) risk += n;
        else warn += n;
      }
      if (total === 0) return null;
      return { safe: (safe / total) * 100, warning: (warn / total) * 100, risk: (risk / total) * 100 };
    }

    function renderStatsTab(container, riskData, texts) {
      const entries = Object.entries(riskData.communitySignals || {}).filter(([, c]) => c > 0);
      if (entries.length === 0) {
        container.innerHTML = `<div class="as-v3-empty">${texts.noSignalsYet}</div>`;
        return;
      }
      entries.sort((a, b) => b[1] - a[1]);
      const totalCount = entries.reduce((s, [, c]) => s + c, 0);
      let html = '<div style="display:flex;flex-direction:column;width:100%;">';
      for (const [code, count] of entries) {
        const info = getSignalInfo(code);
        const label = (info && info.label) || code;
        const icon = (info && info.icon) || '▪️';
        const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
        const barColor = info ? (info.positive ? '#10b981' : (info.negative ? '#ef4444' : '#facc15')) : '#facc15';
        html += `
          <div style="display:flex;flex-direction:column;padding:10px 0;border-bottom:1px solid #1E293B;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:14px;">${icon}</span>
                <span style="font-weight:700;font-size:12px;color:#E2E8F0;">${label}</span>
                <span style="font-size:10px;color:#64748b;">(${count})</span>
              </div>
              <span style="font-weight:900;font-size:12px;color:#22D3EE;">${pct}%</span>
            </div>
            <div style="width:100%;height:6px;background:#131C2E;border:1px solid #000;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${barColor};"></div>
            </div>
          </div>`;
      }
      html += '</div>';
      container.innerHTML = html;
    }

    function renderCardGrid(container, listingId, phase, texts) {
      const signals = getSignalsForPhase(phase);
      if (signals.length === 0) {
        container.innerHTML = `<div class="as-v3-empty">${texts.noCategorySignals}</div>`;
        return;
      }
      const userEvents = userEventsCache[listingId] || {};
      const grid = document.createElement('div');
      grid.className = 'as-v3-grid';
      signals.forEach((sig) => {
        const isActive = userEvents[sig.signal] === true;
        const card = document.createElement('div');
        card.className = `as-v3-card ${getSignalColorClass(sig)} ${isActive ? 'active' : ''}`.trim();
        card.dataset.signal = sig.signal;
        card.innerHTML = `
          <div class="as-card-main-side">
            <span class="as-card-icon">${sig.icon}</span>
            <span class="as-card-marquee">${sig.label}</span>
          </div>`;
        if (sig.hasSub) {
          card.classList.add('as-card-has-sub');
          const subSide = document.createElement('div');
          subSide.className = 'as-card-sub-side';
          const miniGrid = document.createElement('div');
          miniGrid.className = 'as-mini-grid';
          SUB_BUTTONS.forEach((sub) => {
            const subActive = userEvents[sub.signal] === true;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `as-mini-btn ${subActive ? 'active' : ''}`.trim();
            btn.dataset.sub = sub.signal;
            btn.style.background = sub.color;
            if (sub.color === '#facc15' || sub.color === '#e2e8f0') btn.style.color = '#000';
            btn.textContent = sub.label;
            miniGrid.appendChild(btn);
          });
          subSide.appendChild(miniGrid);
          card.appendChild(subSide);
        }
        grid.appendChild(card);
      });
      container.innerHTML = '';
      container.appendChild(grid);
    }

    async function toggleSignal(listingId, phase, signalCode, cardEl, texts, feedbackEl) {
      const userEvents = userEventsCache[listingId] || (userEventsCache[listingId] = {});
      const wasActive = userEvents[signalCode] === true;

      if (!wasActive) {
        const activeCount = Object.values(userEvents).filter(Boolean).length;
        if (activeCount >= 3) {
          if (feedbackEl) feedbackEl.textContent = texts.limitReached;
          return;
        }
      }

      userEvents[signalCode] = !wasActive;
      if (cardEl) cardEl.classList.toggle('active', !wasActive);

      // Auto-remove sinais contraditórios já ativos (mesmo comportamento da extensão)
      if (!wasActive) {
        for (const opp of getContradictions(signalCode)) {
          if (userEvents[opp] === true) {
            userEvents[opp] = false;
            const oppCard = activePanel && activePanel.querySelector(`[data-signal="${opp}"]`);
            if (oppCard) oppCard.classList.remove('active');
            if (apiKey) { try { await reportSignal(listingId, opp, phase, { action: 'remove' }); } catch (_) {} }
          }
        }
      }

      if (apiKey) {
        try {
          await reportSignal(listingId, signalCode, phase, { action: wasActive ? 'remove' : 'add' });
        } catch (_) {
          userEvents[signalCode] = wasActive;
          if (cardEl) cardEl.classList.toggle('active', wasActive);
        }
      }
    }

    /**
     * Abre o painel completo (escudo + votação + sinais) para um anúncio, ancorado
     * a `options.anchorEl` se fornecido. Réplica visual do painel da extensão.
     */
    function openPanel(listingId, riskData, options = {}) {
      closePanel();
      activeTab = 'stats';
      const texts = getTexts(options.lang || defaultLang);
      const data = riskData || {};
      const state = String(data.state || 'SAFE').toUpperCase();
      const communitySignals = data.communitySignals || {};
      const totalSignals = data.totalSignals || 0;
      const community = data.community || {};
      const votes = data.votes || { green: 0, red: 0 };

      const panel = document.createElement('div');
      panel.className = 'as-v3-tooltip';

      const modal = document.createElement('div');
      modal.className = 'as-v3-modal';
      try { if (localStorage.getItem('nettuno_sdk_theme') === 'light') modal.classList.add('as-light'); } catch (_) {}

      const header = document.createElement('header');
      header.className = 'as-v3-header';
      const titleSafe = String(options.title || listingId || 'Anúncio')
        .replace(/[<>"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      header.innerHTML = `
        <button type="button" class="as-theme-toggle" aria-label="Alternar tema"><span class="as-theme-toggle-thumb">🌙</span></button>
        <a class="as-v3-brand" href="${apiUrl}" target="_blank" rel="noopener noreferrer">NETTUNO BETA</a>
        <div class="as-v3-title">${titleSafe}</div>
      `;
      header.querySelector('.as-theme-toggle').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        modal.classList.toggle('as-light');
        try { localStorage.setItem('nettuno_sdk_theme', modal.classList.contains('as-light') ? 'light' : 'dark'); } catch (_) {}
      });
      modal.appendChild(header);

      const tagInfo = badgeTagInfo(state, texts);
      const tag = document.createElement('div');
      tag.className = 'as-v3-badge-tag';
      tag.style.background = tagInfo.bg;
      tag.style.color = tagInfo.color;
      tag.textContent = tagInfo.label;

      const statusBar = document.createElement('div');
      statusBar.className = 'as-brutal-status-secondary';
      const confidencePct = Math.round((community.confidence || 0) * 100);
      statusBar.innerHTML = `
        <div class="as-ticker-item">
          <span class="as-voters-block">
            <span class="as-voters-stack"><span class="as-voter as-voter-empty">🕵️</span></span>
            <span>${community.voterCount || 0}</span> <span style="opacity:.7;">${texts.participants}</span>
          </span>
          <span style="color:#334155;margin:0 4px;">|</span>
          <span>📊 ${totalSignals} ${texts.tabStats}</span>
          <span style="color:#334155;margin:0 4px;">|</span>
          <span>🛡️ ${confidencePct}%</span>
        </div>`;
      modal.appendChild(statusBar);

      const pct = computePercentages(communitySignals);
      if (pct) {
        const pctWrap = document.createElement('div');
        pctWrap.innerHTML = `
          <div style="display:flex;height:5px;background:#131C2E;margin:8px 12px 4px;border:1px solid #263348;overflow:hidden;">
            <div style="width:${pct.safe}%;background:#22c55e;"></div>
            <div style="width:${pct.warning}%;background:#facc15;"></div>
            <div style="width:${pct.risk}%;background:#ef4444;"></div>
          </div>`;
        modal.appendChild(pctWrap);
      }

      const vt = (theme && theme.votePanel) || null;
      const posIcon = (vt && vt.positiveIcon) || '👍';
      const negIcon = (vt && vt.negativeIcon) || '👎';
      const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
      const shareText = encodeURIComponent(`${texts.poweredBy}: ${state} — ${pageUrl}`);

      const voteBar = document.createElement('div');
      voteBar.className = 'as-brutal-vote-bar';
      voteBar.innerHTML = `
        <div class="as-brutal-pill">
          <div class="as-like-btn ${data.userVote === 'POSITIVE' ? 'active' : ''}" data-type="POSITIVE">${posIcon} <span class="nt-likes">${votes.green || 0}</span></div>
          <div class="as-dislike-btn ${data.userVote === 'NEGATIVE' ? 'active' : ''}" data-type="NEGATIVE">${negIcon} <span class="nt-dislikes">${votes.red || 0}</span></div>
        </div>
        <div class="as-share-row">
          <span class="as-share-label">${texts.shareLabel}</span>
          <a class="as-share-btn" href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener noreferrer" title="WhatsApp">W</a>
          <a class="as-share-btn" href="https://twitter.com/intent/tweet?text=${shareText}" target="_blank" rel="noopener noreferrer" title="X">X</a>
          <a class="as-share-btn" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener noreferrer" title="Facebook">F</a>
        </div>`;
      if (vt) {
        const likeEl = voteBar.querySelector('.as-like-btn');
        const dislikeEl = voteBar.querySelector('.as-dislike-btn');
        if (vt.positiveColor) likeEl.style.color = vt.positiveColor;
        if (vt.negativeColor) dislikeEl.style.color = vt.negativeColor;
      }
      voteBar.addEventListener('click', async (e) => {
        const btn = e.target.closest('.as-like-btn, .as-dislike-btn');
        if (!btn) return;
        const type = btn.dataset.type;
        voteBar.querySelectorAll('.as-like-btn, .as-dislike-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (typeof options.onVote === 'function') options.onVote(type, listingId);
        if (apiKey) { try { await vote(listingId, type); } catch (_) {} }
      });
      modal.appendChild(voteBar);

      const tabsRow = document.createElement('div');
      tabsRow.className = 'as-v3-tab-row';
      const tabConfig = [
        { id: 'stats', label: texts.tabStats },
        { id: 'contact', label: texts.tabContact },
        { id: 'interaction', label: texts.tabInteraction },
        { id: 'result', label: texts.tabResult }
      ];
      tabsRow.innerHTML = tabConfig.map((t) => `<button type="button" class="as-v3-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
      modal.appendChild(tabsRow);

      const content = document.createElement('div');
      content.className = 'as-v3-content';
      modal.appendChild(content);

      const footer = document.createElement('div');
      footer.className = 'as-v3-footer';
      footer.innerHTML = `
        <div class="as-v3-ads">${texts.adSpace}</div>
        <div class="as-feedback-area"></div>
        <div class="as-v3-disclaimer">${texts.disclaimer}</div>`;
      modal.appendChild(footer);
      const feedbackEl = footer.querySelector('.as-feedback-area');

      panel.appendChild(modal);
      panel.appendChild(tag);
      document.body.appendChild(panel);
      activePanel = panel;

      if (options.anchorEl) {
        const rect = options.anchorEl.getBoundingClientRect();
        let left = rect.left + window.scrollX;
        const top = rect.bottom + window.scrollY + 10;
        if (left + 380 > window.innerWidth) left = (rect.right + window.scrollX) - 380;
        panel.style.left = Math.max(10, left) + 'px';
        panel.style.top = top + 'px';
      }

      function renderTab(tabId) {
        if (tabId === 'stats') { renderStatsTab(content, data, texts); return; }
        renderCardGrid(content, listingId, tabId, texts);
      }
      renderTab(activeTab);

      tabsRow.addEventListener('click', (e) => {
        const btn = e.target.closest('.as-v3-tab');
        if (!btn) return;
        const tabId = btn.dataset.tab;
        if (tabId === activeTab) return;
        activeTab = tabId;
        tabsRow.querySelectorAll('.as-v3-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderTab(tabId);
      });

      content.addEventListener('click', async (e) => {
        const card = e.target.closest('.as-v3-card');
        if (!card || activeTab === 'stats') return;
        const miniBtn = e.target.closest('.as-mini-btn');
        if (miniBtn) {
          await toggleSignal(listingId, activeTab, miniBtn.dataset.sub, miniBtn, texts, feedbackEl);
          return;
        }
        if (card.classList.contains('as-card-has-sub')) {
          const isExpanded = card.classList.contains('expanded');
          content.querySelectorAll('.as-v3-card.expanded').forEach((c) => { if (c !== card) c.classList.remove('expanded'); });
          card.classList.toggle('expanded', !isExpanded);
          return;
        }
        await toggleSignal(listingId, activeTab, card.dataset.signal, card, texts, feedbackEl);
      });

      docCloseListener = (e) => {
        if (activePanel && !activePanel.contains(e.target) && e.target !== options.anchorEl) {
          closePanel();
        }
      };
      setTimeout(() => { if (docCloseListener) document.addEventListener('click', docCloseListener, true); }, 0);

      return panel;
    }

    return {
      version: SDK_VERSION,
      isTest,

      /**
       * Obtém o estado do Shield para visualização rápida (0 créditos).
       */
      getShield(listingId) {
        return request('GET', '/v1/listings/' + encodeURIComponent(listingId) + '/shield');
      },

      /**
       * Obtém estados de Shield em lote de até 50 anúncios (0 créditos).
       */
      batchShield(ids) {
        return request('POST', '/v1/listings/batch-shield', { ids: ids || [] });
      },

      /**
       * Submete um voto comunitário (0 créditos).
       */
      vote,

      /**
       * Reporta um sinal granular de comunidade — Preço fora da realidade, Não
       * atende, etc. (0 créditos). `phase` é 'contact' | 'interaction' | 'result'.
       */
      reportSignal,

      /**
       * Dispara uma Análise Profunda no Risk Engine (1 Risk Unit debitada).
       */
      requestAnalysis(listingId, listingData = {}) {
        return request('POST', '/v1/listings/' + encodeURIComponent(listingId) + '/analyze', listingData);
      },

      /**
       * Renderiza o Shield no DOM com total flexibilidade de CSS nativo.
       */
      mountShield(el, riskData, options = {}) {
        if (!el) return null;
        const texts = getTexts(options.lang || defaultLang);
        
        let state = (riskData && riskData.state) || 'SAFE';
        state = String(state).toUpperCase();

        const score = (riskData && typeof riskData.score === 'number') ? riskData.score : 50;
        const stateTheme = themeShieldFor(state);

        // Mapeamento de rótulo e ícone por estado
        let labelText = texts[state.toLowerCase()] || state;
        let ariaText = texts[state.toLowerCase() + 'Aria'] || `Nettuno: ${state}`;
        let iconSymbol = '🛡️';

        if (state === 'TRUSTED') { iconSymbol = '✓'; }
        else if (state === 'RISK') { iconSymbol = '⚠'; }
        else if (state === 'PENDING') { iconSymbol = '⏳'; }
        else if (state === 'ANALYSIS_STALE') { iconSymbol = '⏱'; }
        else if (state === 'ANALYSIS_UNAVAILABLE') { iconSymbol = '·'; }

        // Tema da conta (dashboard de Branding) — base antes das sobrescritas por chamada
        if (stateTheme) {
          if (stateTheme.label) labelText = stateTheme.label;
          if (stateTheme.icon) iconSymbol = stateTheme.icon;
        }

        // Sobrescrita de labels/ícones pelo cliente se fornecida nesta chamada
        if (options.labels && options.labels[state.toLowerCase()]) {
          labelText = options.labels[state.toLowerCase()];
        }
        if (options.icons && options.icons[state.toLowerCase()]) {
          iconSymbol = options.icons[state.toLowerCase()];
        }

        const showScore = options.showScore !== undefined
          ? options.showScore !== false
          : !(theme && theme.showScore === false);
        const showPoweredBy = options.showPoweredBy !== undefined
          ? options.showPoweredBy !== false
          : !(theme && theme.showPoweredBy === false);

        const badge = document.createElement('div');
        const stateClass = 'nettuno-shield--' + state.toLowerCase();
        badge.className = `nettuno-shield ${stateClass} ${options.className || ''}`.trim();
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-label', `${ariaText}. Score: ${score}/100.`);
        badge.setAttribute('data-nettuno-state', state);

        // Tema da conta: cores/borda/raio como estilo inline (sobrepõe as classes base,
        // mas continua abaixo de options.css com !important — ver secção 11 do SDK).
        if (theme && theme.borderRadius) badge.style.borderRadius = theme.borderRadius;
        if (stateTheme) {
          if (stateTheme.bg) badge.style.background = stateTheme.bg;
          if (stateTheme.color) badge.style.color = stateTheme.color;
          if (stateTheme.border) badge.style.border = stateTheme.border;
        }

        if (options.variables && typeof options.variables === 'object') {
          for (const [vKey, vVal] of Object.entries(options.variables)) {
            badge.style.setProperty(vKey, vVal);
          }
        }

        let innerHtml = `
          <span class="nettuno-shield__icon" aria-hidden="true">${iconSymbol}</span>
          <span class="nettuno-shield__label">${labelText}</span>
        `;

        if (showScore && state !== 'PENDING' && state !== 'ANALYSIS_UNAVAILABLE') {
          innerHtml += `<span class="nettuno-shield__score">· ${score}</span>`;
        }

        if (showPoweredBy) {
          innerHtml += `<span class="nettuno-shield__powered" aria-hidden="true">${texts.poweredBy}</span>`;
        }

        badge.innerHTML = innerHtml;

        // Clique no escudo abre o painel completo (voto + sinais), tal como na
        // extensão — só quando sabemos a que anúncio o Shield pertence.
        const listingIdForPanel = options.listingId || (riskData && riskData.listingId) || null;
        if (options.openPanelOnClick !== false && listingIdForPanel) {
          badge.style.cursor = 'pointer';
          badge.setAttribute('tabindex', '0');
          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            openPanel(listingIdForPanel, riskData, Object.assign({}, options, { anchorEl: badge }));
          });
          badge.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); badge.click(); }
          });
        }

        if (options.isolation === 'shadow') {
          const shadow = el.shadowRoot || el.attachShadow({ mode: 'open' });
          shadow.innerHTML = '';
          const style = document.createElement('style');
          style.textContent = BASE_CSS + (options.css || '');
          shadow.appendChild(style);
          shadow.appendChild(badge);
        } else {
          if (options.css) {
            const customStyle = document.createElement('style');
            customStyle.textContent = options.css;
            el.appendChild(customStyle);
          }
          el.innerHTML = '';
          el.appendChild(badge);
        }

        return badge;
      },

      /**
       * Renderiza o Painel de Votos Comunitário — mesmo pill de voto (as-brutal-pill/
       * as-like-btn/as-dislike-btn) usado dentro do painel completo do escudo, para que
       * o widget standalone e o painel do clique tenham sempre o mesmo visual real.
       */
      mountVotePanel(el, listingId, options = {}) {
        if (!el) return null;
        const texts = getTexts(options.lang || defaultLang);
        const vt = (theme && theme.votePanel) || null;
        const title = options.title || (vt && vt.title) || texts.voteTitle;
        const posLabel = options.positiveLabel || (vt && vt.positiveLabel) || texts.voteSafe;
        const negLabel = options.negativeLabel || (vt && vt.negativeLabel) || texts.voteRisk;
        const posIcon = options.positiveIcon || (vt && vt.positiveIcon) || '👍';
        const negIcon = options.negativeIcon || (vt && vt.negativeIcon) || '👎';

        const panel = document.createElement('div');
        panel.className = `nettuno-vote-panel ${options.className || ''}`.trim();
        panel.setAttribute('data-listing-id', listingId);
        panel.style.background = '#0F172A';
        panel.style.borderColor = '#000';
        panel.style.color = '#E2E8F0';

        if (theme && theme.borderRadius) panel.style.borderRadius = theme.borderRadius;

        if (options.variables && typeof options.variables === 'object') {
          for (const [vKey, vVal] of Object.entries(options.variables)) {
            panel.style.setProperty(vKey, vVal);
          }
        }

        panel.innerHTML = `
          <div class="nettuno-vote-panel__head">
            <span>${title}</span>
            <span style="font-size:10px;opacity:0.6;">${texts.poweredBy}</span>
          </div>
          <div class="as-brutal-pill" style="align-self:center;">
            <div class="as-like-btn" data-type="POSITIVE" aria-label="${posLabel}">${posIcon} <span>${posLabel}</span></div>
            <div class="as-dislike-btn" data-type="NEGATIVE" aria-label="${negLabel}">${negIcon} <span>${negLabel}</span></div>
          </div>
        `;

        const btnPos = panel.querySelector('.as-like-btn');
        const btnNeg = panel.querySelector('.as-dislike-btn');

        // Tema da conta: cores/borda dos botões como estilo inline.
        if (vt) {
          if (vt.positiveBg) btnPos.style.background = vt.positiveBg;
          if (vt.positiveColor) btnPos.style.color = vt.positiveColor;
          if (vt.positiveBorder) btnPos.style.border = vt.positiveBorder;
          if (vt.negativeBg) btnNeg.style.background = vt.negativeBg;
          if (vt.negativeColor) btnNeg.style.color = vt.negativeColor;
          if (vt.negativeBorder) btnNeg.style.border = vt.negativeBorder;
        }

        panel.addEventListener('click', async (e) => {
          const btn = e.target.closest('.as-like-btn, .as-dislike-btn');
          if (!btn) return;
          const type = btn.dataset.type;
          panel.querySelectorAll('.as-like-btn, .as-dislike-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          if (typeof options.onVote === 'function') {
            options.onVote(type, listingId);
          }
          if (apiKey) {
            try { await vote(listingId, type); } catch (_) {}
          }
        });

        el.innerHTML = '';
        el.appendChild(panel);
        return panel;
      },

      /**
       * Abre o painel completo (voto + sinais, 4 abas) para um anúncio — o mesmo que
       * o clique no Shield já abre automaticamente via mountShield(). Útil para abrir
       * a partir de um botão/link próprio em vez do escudo.
       */
      openPanel,

      /** Fecha o painel completo, se estiver aberto. */
      closePanel,

      /**
       * Procura todos os elementos com [data-nettuno-shield] e renderiza automaticamente.
       */
      autoMount(rootEl = document) {
        const slots = rootEl.querySelectorAll('[data-nettuno-shield]');
        slots.forEach((slot) => {
          const state = slot.getAttribute('data-risk') || 'SAFE';
          const score = Number(slot.getAttribute('data-score')) || 50;
          this.mountShield(slot, { state, score });
        });
      },

      /**
       * Remove o Shield e liberta memória.
       */
      destroy(el) {
        if (!el) return;
        el.innerHTML = '';
      }
    };
  }

  return {
    create,
    autoMount(opts) {
      const nt = create(opts);
      nt.autoMount();
      return nt;
    },
    I18N,
    BASE_CSS
  };
}));
