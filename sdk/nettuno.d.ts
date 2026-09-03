/**
 * NETTUNO B2B SHIELD SDK — TypeScript Declarations
 */

export type RiskState = 'SAFE' | 'TRUSTED' | 'RISK' | 'PENDING' | 'ANALYSIS_STALE' | 'ANALYSIS_UNAVAILABLE';
export type SupportedLang = 'pt' | 'en' | 'es';

export interface ShieldSignal {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export type SignalPhase = 'contact' | 'interaction' | 'result';

export interface ShieldData {
  listingId?: string;
  state: RiskState;
  score: number;
  updatedAt?: number;
  /** Sinais DETETADOS pelo Risk Engine numa análise profunda. */
  signals?: ShieldSignal[];
  /** Sinais REPORTADOS PELA COMUNIDADE (reportSignal), por código → contagem. */
  communitySignals?: Record<string, number>;
  totalSignals?: number;
  votes?: { green: number; yellow?: number; red: number };
  community?: { voterCount: number; voterDiversity: number; positiveRatio: number; confidence: number } | null;
}

/** Metadados de uso extraídos dos headers de resposta (X-Nettuno-*, X-RateLimit-*). */
export interface RequestMeta {
  creditsUsed: string | null;
  quotaRemaining: string | null;
  cache: string | null;
  rateRemaining: string | null;
  rateLimit: string | null;
}

/** Toda a resposta de sucesso do SDK carrega `__meta` com os headers de uso desta chamada. */
export type WithMeta<T> = T & { __meta?: RequestMeta };

export interface MountOptions {
  lang?: SupportedLang;
  showScore?: boolean;
  showPoweredBy?: boolean;
  isolation?: 'shadow' | 'light';
  className?: string;
  css?: string;
  variables?: Record<string, string>;
  labels?: Partial<Record<Lowercase<RiskState>, string>>;
  icons?: Partial<Record<Lowercase<RiskState>, string>>;
  /** listingId a usar ao abrir o painel completo no clique do escudo, se `riskData.listingId` não vier preenchido. */
  listingId?: string;
  /** Por omissão o clique no escudo abre o painel completo (ver openPanel). Passar `false` desativa. */
  openPanelOnClick?: boolean;
  title?: string;
  onVote?: (voteType: 'POSITIVE' | 'NEGATIVE', listingId: string) => void;
}

export interface VotePanelOptions extends MountOptions {
  title?: string;
  positiveLabel?: string;
  negativeLabel?: string;
  positiveIcon?: string;
  negativeIcon?: string;
  onVote?: (voteType: 'POSITIVE' | 'NEGATIVE', listingId: string) => void;
}

export interface PanelOptions {
  lang?: SupportedLang;
  title?: string;
  /** Elemento junto ao qual o painel é posicionado (tipicamente o próprio escudo clicado). */
  anchorEl?: HTMLElement;
  onVote?: (voteType: 'POSITIVE' | 'NEGATIVE', listingId: string) => void;
}

export interface ReportSignalOptions {
  action?: 'add' | 'remove';
  voterId?: string;
}

export interface ShieldStateTheme {
  label?: string;
  icon?: string;
  color?: string;
  bg?: string;
  border?: string;
}

export interface VotePanelTheme {
  title?: string;
  buttonRadius?: string;
  positiveLabel?: string;
  positiveIcon?: string;
  positiveColor?: string;
  positiveBg?: string;
  positiveBorder?: string;
  negativeLabel?: string;
  negativeIcon?: string;
  negativeColor?: string;
  negativeBg?: string;
  negativeBorder?: string;
}

export interface NettunoTheme {
  showScore?: boolean;
  showPoweredBy?: boolean;
  borderRadius?: string;
  shield?: Partial<Record<Lowercase<RiskState>, ShieldStateTheme>>;
  votePanel?: VotePanelTheme;
}

export interface NettunoClientOptions {
  apiKey?: string;
  apiUrl?: string;
  lang?: SupportedLang;
  timeoutMs?: number;
  enableCache?: boolean;
  cacheTtlMs?: number;
  /** Tema de marca guardado no dashboard (Branding & Shields) — aplicado como base a cada mountShield/mountVotePanel. */
  theme?: NettunoTheme;
}

export interface NettunoClient {
  version: string;
  isTest: boolean;
  getShield(listingId: string): Promise<ShieldData>;
  batchShield(ids: string[]): Promise<{ results: ShieldData[]; count: number }>;
  vote(listingId: string, voteType: 'POSITIVE' | 'NEGATIVE', voterId?: string): Promise<{ ok: boolean }>;
  /** Reporta um sinal granular de comunidade (0 créditos) — catálogo em SIGNAL_CATALOG (nettuno.js). */
  reportSignal(listingId: string, signal: string, phase: SignalPhase, options?: ReportSignalOptions): Promise<{ ok: boolean }>;
  requestAnalysis(listingId: string, listingData?: Record<string, any>): Promise<{ status: string; queuePosition?: number }>;
  /**
   * Renderiza o Shield. Por omissão, se `riskData.listingId` (ou `options.listingId`)
   * estiver definido, o escudo fica clicável e abre o painel completo (mesma UI da
   * extensão: votação + partilha + abas SINAIS/CONTACTO/INTERAÇÃO/RESULTADO).
   */
  mountShield(el: HTMLElement | null, riskData: ShieldData, options?: MountOptions): HTMLElement | null;
  /** Widget standalone de votação (like/dislike) — mesmo visual usado dentro do painel completo. */
  mountVotePanel(el: HTMLElement | null, listingId: string, options?: VotePanelOptions): HTMLElement | null;
  /** Abre o painel completo diretamente, sem precisar do clique no escudo. */
  openPanel(listingId: string, riskData: ShieldData, options?: PanelOptions): HTMLElement;
  /** Fecha o painel completo, se estiver aberto. */
  closePanel(): void;
  autoMount(rootEl?: HTMLElement | Document): void;
  destroy(el: HTMLElement | null): void;
}

export function create(options?: NettunoClientOptions): NettunoClient;
export function autoMount(options?: NettunoClientOptions): NettunoClient;

export const I18N: Record<SupportedLang, Record<string, string>>;
export const BASE_CSS: string;
