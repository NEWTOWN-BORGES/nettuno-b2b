/**
 * Nettuno Portal - Shared UI Components & Layout (Clean Modern Edition)
 */
'use strict';

function renderLayout(activePage = 'overview') {
  const sidebar = document.getElementById('sidebar-slot');
  if (sidebar) {
    sidebar.innerHTML = `
      <aside class="dash-sidebar">
        <div class="dash-brand">
          <div class="dash-planet">🔱</div>
          <a href="overview.html" class="dash-logo-text">NETTUNO</a>
          <span class="dash-badge">B2B SAAS</span>
        </div>

        <nav class="dash-nav">
          <a href="overview.html" class="dash-nav-item ${activePage === 'overview' ? 'active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Visão Geral
          </a>
          <a href="api-keys.html" class="dash-nav-item ${activePage === 'api-keys' ? 'active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-1-1l-3 3-3-3 2-2 5 3z"/><path d="M3 21l10-10"/><path d="M15 9l2 2"/></svg>
            API Keys
          </a>
          <a href="playground.html" class="dash-nav-item ${activePage === 'playground' ? 'active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            Playground & CSS
          </a>
          <a href="vote-panel.html" class="dash-nav-item ${activePage === 'vote-panel' ? 'active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8h2m2 0h6M7 12h4m2 0h4"/></svg>
            Vote Panel Designer
          </a>
          <a href="branding.html" class="dash-nav-item ${activePage === 'branding' ? 'active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
            Branding & Shields
          </a>
          <a href="logs.html" class="dash-nav-item ${activePage === 'logs' ? 'active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
            Logs & Métricas
          </a>
          <a href="usage.html" class="dash-nav-item ${activePage === 'usage' ? 'active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 12l3-3 4 4 5-5"/></svg>
            Consumo & Créditos
          </a>
          <a href="docs.html" class="dash-nav-item ${activePage === 'docs' ? 'active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Documentação
          </a>
          <a href="https://nettuno-e6036.web.app/" target="_blank" class="dash-nav-item" style="margin-top:auto;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Website Principal ↗
          </a>
        </nav>

        <div class="dash-user">
          <div class="dash-user-info">
            <div class="dash-user-name" id="userName">Carregando...</div>
            <div class="dash-user-email" id="userEmail">...</div>
          </div>
          <button type="button" class="dash-btn-logout" onclick="logout()" title="Terminar sessão">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </aside>
    `;
  }
}

function showToast(msg, isError = false) {
  let toast = document.getElementById('dashToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'dashToast';
    toast.className = 'dash-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? 'linear-gradient(135deg, #991b1b, #ef4444)' : 'linear-gradient(135deg, #065f46, #10b981)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function copyToClipboard(text, successMsg = 'Copiado com sucesso!') {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(() => {
      fallbackCopyTextToClipboard(text, successMsg);
    });
  } else {
    fallbackCopyTextToClipboard(text, successMsg);
  }
}

function fallbackCopyTextToClipboard(text, successMsg) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(successMsg);
  } catch (err) {
    showToast('Erro ao copiar', true);
  }
  document.body.removeChild(textArea);
}