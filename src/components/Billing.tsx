/**
 * Billing.tsx — Página de Gastos y Facturación de Kortex.
 *
 * Muestra al usuario:
 *  - Estado de su cuenta (trial / activo / suspendido) con saldo restante.
 *  - Resumen del mes actual: documentos procesados y costo acumulado.
 *  - Gráfico de consumo diario del período seleccionado.
 *  - Historial de facturas mensuales.
 *  - Agregar tarjeta de pago via el widget oficial de Wompi (UI de confianza).
 *
 * Flujo de pago Wompi Widget:
 *  1. Backend genera reference + integrity hash (SHA256 server-side).
 *  2. Frontend carga el script de Wompi y abre WidgetCheckout como modal.
 *  3. Usuario paga $1 COP de verificación en UI propia de Wompi.
 *  4. El backend extrae el token de tarjeta de esa transacción y crea
 *     un WompiPaymentSource para cobros mensuales futuros.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CreditCard,
  TrendingUp,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  DollarSign,
  Calendar,
  Trash2,

  Sun,
  Moon,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { KortexLogo } from './KortexLogo';
import { LanguageToggle } from './LanguageToggle';
import { apiService } from '../services/api';
import type {
  BillingStatus,
  BillingUsageSummary,
  UsageBreakdownItem,
  MonthlyInvoice,
} from '../services/api';
import './Billing.css';

/**
 * Declaración global del WidgetCheckout de Wompi.
 * El script carga desde https://checkout.wompi.co/widget.js
 * y expone la clase WidgetCheckout en window.
 */
declare global {
  interface Window {
    WidgetCheckout?: new (config: {
      currency: string;
      amountInCents: number;
      reference: string;
      publicKey: string;
      signature?: { integrity: string };
      widgetOperation?: string;
      customerData?: {
        email: string;
        fullName?: string;
        phoneNumber?: string;
        phoneNumberPrefix?: string;
      };
      redirectUrl?: string;
    }) => {
      open: (callback: (result: {
        transaction?: { id: string; status: string };
        payment_source?: {
          token: string;
          type: string;
          lastFour?: string;
          phoneNumber?: string;
        };
      }) => void) => void;
    };
  }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                             */
/* ─────────────────────────────────────────────────────────────────── */

/** Format a Decimal string as USD currency (e.g. "0.3000" → "$0.30") */
const usd = (value: string | number): string => {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return `$${n.toFixed(2)}`;
};

/** Return the previous N months as 'YYYY-MM' strings, newest first */
const recentMonths = (n: number): string[] => {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    );
  }
  return result;
};

/** Format 'YYYY-MM' to 'Julio 2026' / 'July 2026' depending on locale */
const formatPeriod = (period: string, locale: string): string => {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
};

/** Invoice status visual config (label is resolved via i18n at render time) */
const INVOICE_STATUS: Record<
  string,
  { color: string; Icon: React.FC<{ size: number }> }
> = {
  draft:   { color: 'var(--text-muted)',   Icon: Clock },
  pending: { color: '#f59e0b',             Icon: Clock },
  paid:    { color: 'var(--accent-green)',  Icon: CheckCircle },
  failed:  { color: 'var(--danger)',        Icon: XCircle },
};

/* ─────────────────────────────────────────────────────────────────── */
/* Sub-components                                                       */
/* ─────────────────────────────────────────────────────────────────── */

/** Compact status banner at the top of the page */
const AccountStatusBanner: React.FC<{ status: BillingStatus }> = ({ status }) => {
  const { t } = useTranslation('billing');
  const isTrial = status.status === 'trial';
  const isSuspended = status.status === 'suspended';

  const trialUsedPct = isTrial
    ? Math.min(
        100,
        (parseFloat(status.free_trial_used_usd) /
          parseFloat(status.trial_limit_usd)) *
          100
      )
    : 0;

  return (
    <div
      className={`account-banner ${
        isSuspended ? 'banner-suspended' : isTrial ? 'banner-trial' : 'banner-active'
      }`}
    >
      <div className="banner-left">
        {isSuspended ? (
          <AlertCircle size={22} />
        ) : isTrial ? (
          <Clock size={22} />
        ) : (
          <CheckCircle size={22} />
        )}
        <div>
          <p className="banner-title">
            {isSuspended
              ? t('accountBanner.suspendedTitle')
              : isTrial
              ? t('accountBanner.trialTitle')
              : t('accountBanner.activeTitle')}
          </p>
          <p className="banner-desc">
            {isSuspended
              ? t('accountBanner.suspendedDesc')
              : isTrial
              ? t('accountBanner.trialDesc', {
                  used: usd(status.free_trial_used_usd),
                  limit: usd(status.trial_limit_usd),
                })
              : t('accountBanner.activeDesc')}
          </p>
        </div>
      </div>

      {/* Trial progress bar */}
      {isTrial && (
        <div className="trial-progress-wrap">
          <div className="trial-progress-bar">
            <div
              className="trial-progress-fill"
              style={{ width: `${trialUsedPct}%` }}
            />
          </div>
          <span className="trial-remaining">
            {t('accountBanner.remaining', { amount: usd(status.trial_remaining_usd) })}
          </span>
        </div>
      )}
    </div>
  );
};

/** Bar chart of daily/weekly usage */
const UsageChart: React.FC<{
  breakdown: UsageBreakdownItem[];
  groupBy: 'day' | 'week' | 'month';
}> = ({ breakdown, groupBy }) => {
  const { t, i18n } = useTranslation('billing');
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'es-CO';

  if (!breakdown.length) {
    return (
      <div className="chart-empty">
        <TrendingUp size={36} className="chart-empty-icon" />
        <p>{t('chart.empty')}</p>
      </div>
    );
  }

  const maxDocs = Math.max(...breakdown.map((b) => b.document_count), 1);

  const formatLabel = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00');
    if (groupBy === 'day') return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    if (groupBy === 'week') return t('chart.weekLabelPrefix', { date: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) });
    return d.toLocaleDateString(locale, { month: 'short' });
  };

  return (
    <div className="chart-bars">
      {breakdown.map((item) => {
        const pct = (item.document_count / maxDocs) * 100;
        return (
          <div key={item.group} className="chart-bar-col">
            <span className="chart-bar-value">{item.document_count}</span>
            <div className="chart-bar-track">
              <div className="chart-bar-fill" style={{ height: `${pct}%` }} />
            </div>
            <span className="chart-bar-label">{formatLabel(String(item.group))}</span>
          </div>
        );
      })}
    </div>
  );
};

/** Single invoice row */
const InvoiceRow: React.FC<{ invoice: MonthlyInvoice }> = ({ invoice }) => {
  const { t, i18n } = useTranslation('billing');
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'es-CO';
  const cfg = INVOICE_STATUS[invoice.status] ?? INVOICE_STATUS.draft;
  const { Icon } = cfg;

  return (
    <div className="invoice-row">
      <div className="invoice-period">
        <Calendar size={16} />
        <span>{formatPeriod(invoice.period, locale)}</span>
      </div>
      <div className="invoice-amount">
        <span className="invoice-usd">{usd(invoice.total_usd)}</span>
        {invoice.usd_to_cop_rate_used && (
          <span className="invoice-cop">
            ≈ ${(invoice.total_cop / 100).toLocaleString(locale)} COP
          </span>
        )}
      </div>
      <div className="invoice-status" style={{ color: cfg.color }}>
        <Icon size={15} />
        <span>{t(`invoiceStatus.${invoice.status}`)}</span>
      </div>
      {invoice.paid_at && (
        <span className="invoice-date">
          {new Date(invoice.paid_at).toLocaleDateString(locale)}
        </span>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────── */
/* Main Page Component                                                  */
/* ─────────────────────────────────────────────────────────────────── */

export const Billing: React.FC = () => {
  const { t, i18n } = useTranslation('billing');
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'es-CO';

  // ── Theme ────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(
    () => localStorage.getItem('kortex-theme') || 'dark'
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kortex-theme', theme);
  }, [theme]);

  // ── State ────────────────────────────────────────────────────────
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [summary, setSummary] = useState<BillingUsageSummary | null>(null);
  const [breakdown, setBreakdown] = useState<UsageBreakdownItem[]>([]);
  const [invoices, setInvoices] = useState<MonthlyInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);

  // Period selector (last 6 months, default = current)
  const months = recentMonths(6);
  const [selectedPeriod, setSelectedPeriod] = useState(months[0]);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  // Payment method — Wompi WidgetCheckout flow
  const [addingCard, setAddingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  /**
   * Carga el script de Wompi si no está ya en el DOM.
   * Devuelve una Promise que resuelve cuando el script está listo.
   */
  const loadWompiScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Si ya está cargado no lo volvemos a inyectar
      if (window.WidgetCheckout) {
        resolve();
        return;
      }
      const existing = document.getElementById('wompi-widget-script');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.id = 'wompi-widget-script';
      script.src = 'https://checkout.wompi.co/widget.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // ── Data Fetching ────────────────────────────────────────────────

  // Lightweight flag for filter changes — doesn't unmount the whole UI
  const [isFilterLoading, setIsFilterLoading] = useState(false);

  // Initial load: account status + invoices (filter-independent)
  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusData, invoicesData] = await Promise.all([
        apiService.getBillingStatus(),
        apiService.getBillingInvoices(),
      ]);
      setBillingStatus(statusData);
      setInvoices(invoicesData);
    } catch (err: unknown) {
      setError(t('errors.loadFailed'));
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // Filter-dependent: summary + usage breakdown (runs on period/groupBy change)
  const fetchFilteredData = useCallback(async (period: string, gb: string) => {
    setIsFilterLoading(true);
    setFilterError(null);
    try {
      const [summaryData, breakdownData] = await Promise.all([
        apiService.getBillingSummary(period),
        apiService.getBillingUsage(period, gb),
      ]);
      setSummary(summaryData);
      setBreakdown(breakdownData.breakdown ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('errors.periodLoadFailed');
      setFilterError(msg);
      console.error(err);
    } finally {
      setIsFilterLoading(false);
    }
  }, [t]);

  // Full reload (used by retry button and after adding a card)
  const fetchBillingData = useCallback(async (period: string, gb: string) => {
    await Promise.all([
      fetchInitialData(),
      fetchFilteredData(period, gb),
    ]);
  }, [fetchInitialData, fetchFilteredData]);

  // Mount: load everything once
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Filter changes: only reload summary + usage
  useEffect(() => {
    fetchFilteredData(selectedPeriod, groupBy);
  }, [selectedPeriod, groupBy, fetchFilteredData]);

  // ── Poll pending invoices ────────────────────────────────────
  // When any invoice is 'pending', poll every 10s until it resolves.
  // Depend on the derived boolean (not `invoices` itself) so the interval
  // isn't torn down and recreated on every poll tick's fetch.
  const hasPendingInvoices = invoices.some((i) => i.status === 'pending');

  useEffect(() => {
    if (!hasPendingInvoices) return;

    const interval = setInterval(async () => {
      try {
        const freshInvoices = await apiService.getBillingInvoices();
        setInvoices(freshInvoices);

        // If no more pending invoices, also refresh billing status
        const stillPending = freshInvoices.some(
          (i: MonthlyInvoice) => i.status === 'pending'
        );
        if (!stillPending) {
          const statusData = await apiService.getBillingStatus();
          setBillingStatus(statusData);
        }
      } catch {
        // Silent — don't break the UI on poll failures
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [hasPendingInvoices]);

  // ── Wompi Widget handler ─────────────────────────────────────

  const handleOpenWidget = async () => {
    setAddingCard(true);
    setCardError(null);

    try {
      // Paso 1: Obtener config firmada del backend
      const config = await apiService.getWompiWidgetConfig();

      // Paso 2: Asegurar que el script de Wompi esté cargado
      await loadWompiScript();

      if (!window.WidgetCheckout) {
        throw new Error(t('errors.widgetLoadFailed'));
      }

      // Paso 3: Abrir el modal de Wompi en modo tokenize (recurrente)
      const checkout = new window.WidgetCheckout({
        currency: config.currency,
        amountInCents: config.amount_in_cents,
        reference: config.reference,
        publicKey: config.public_key,
        signature: { integrity: config.integrity },
        widgetOperation: 'tokenize',
        customerData: { email: config.customer_email },
      });

      // Paso 4: Manejar el resultado cuando el usuario termina.
      // En modo tokenize, Wompi solo devuelve {payment_source}, no {transaction}.
      // El botón permanece deshabilitado mientras el modal está abierto,
      // para evitar que el usuario dispare un segundo widget concurrente.
      checkout.open(async (result) => {
        const { payment_source: paymentSource } = result;

        // Extract payment source data from the widget callback.
        const token = paymentSource?.token;
        const type = paymentSource?.type || 'CARD';
        const lastFour = (
          paymentSource?.phoneNumber || paymentSource?.lastFour || ''
        ).slice(-4);

        if (!token) {
          // Wompi's callback doesn't distinguish a user-initiated cancel from
          // a genuine failure without a token — treat this as an implicit
          // cancel instead of showing a false error.
          setAddingCard(false);
          return;
        }

        // Send token to backend to create a real payment_source in Wompi
        try {
          await apiService.completeWompiWidget(token, type, lastFour);
          const statusData = await apiService.getBillingStatus();
          setBillingStatus(statusData);
          setCardError(null);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : t('errors.saveCardFailed');
          setCardError(msg);
        } finally {
          setAddingCard(false);
        }
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t('errors.openWidgetFailed');
      setCardError(msg);
      setAddingCard(false);
    }
  };

  const handleDeleteCard = async (sourceId: number) => {
    if (!confirm(t('paymentMethods.confirmDelete'))) return;
    try {
      await apiService.deletePaymentMethod(sourceId);
      const statusData = await apiService.getBillingStatus();
      setBillingStatus(statusData);
    } catch {
      alert(t('paymentMethods.deleteFailed'));
    }
  };

  /* ─────────────────────────────────────────────────────────────── */
  /* Render                                                           */
  /* ─────────────────────────────────────────────────────────────── */

  return (
    <div className="billing-container">
      {/* ── Header ── */}
      <header className="billing-header">
        <div className="header-brand">
          <KortexLogo size={34} />
          <h1 className="brand-title">Kortex</h1>
          <span className="badge">Billing</span>
        </div>
        <div className="header-actions">
          <Link to="/" className="btn-back">
            <ArrowLeft size={16} />
            <span>Dashboard</span>
          </Link>
          <LanguageToggle />
          <button
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            className="btn-theme-toggle"
            title={t('header.themeToggle')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="billing-main">
        {/* ── Loading / Error ── */}
        {isLoading && (
          <div className="billing-loading">
            <RefreshCw size={28} className="spin" />
            <p>{t('loading')}</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="billing-error">
            <AlertCircle size={20} />
            <span>{error}</span>
            <button
              onClick={() => fetchBillingData(selectedPeriod, groupBy)}
              className="btn-retry"
            >
              {t('retry')}
            </button>
          </div>
        )}

        {!isLoading && !error && billingStatus && (
          <>
            {/* ── Account Status Banner ── */}
            <AccountStatusBanner status={billingStatus} />

            {/* ── Top Stats ── */}
            <section className="billing-stats">
              <div className="bstat-card">
                <div className="bstat-icon green">
                  <DollarSign size={22} />
                </div>
                <div className="bstat-info">
                  <span className="bstat-value">
                    {summary ? usd(summary.total_usd) : '—'}
                  </span>
                  <span className="bstat-label">{t('stats.monthSpend')}</span>
                </div>
              </div>

              <div className="bstat-card">
                <div className="bstat-icon purple">
                  <FileText size={22} />
                </div>
                <div className="bstat-info">
                  <span className="bstat-value">
                    {summary?.document_count ?? '—'}
                  </span>
                  <span className="bstat-label">{t('stats.documentsExtracted')}</span>
                </div>
              </div>

              <div className="bstat-card">
                <div className="bstat-icon blue">
                  <CreditCard size={22} />
                </div>
                <div className="bstat-info">
                  <span className="bstat-value">
                    {billingStatus.payment_sources.length > 0
                      ? `****${billingStatus.payment_sources[0].last_four}`
                      : t('stats.noCard')}
                  </span>
                  <span className="bstat-label">{t('stats.paymentMethod')}</span>
                </div>
              </div>

              <div className="bstat-card">
                <div className="bstat-icon amber">
                  <TrendingUp size={22} />
                </div>
                <div className="bstat-info">
                  <span className="bstat-value">
                    {invoices.filter((i) => i.status === 'paid').length}
                  </span>
                  <span className="bstat-label">{t('stats.paidInvoices')}</span>
                </div>
              </div>
            </section>

            {/* ── Consumo Chart ── */}
            <section className={`billing-card${isFilterLoading ? ' filter-loading' : ''}`}>
              <div className="card-header">
                <h2 className="card-title">
                  <TrendingUp size={18} />
                  {t('chart.title')}
                </h2>
                <div className="chart-controls">
                  {/* Period selector */}
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="select-control"
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {formatPeriod(m, locale)}
                      </option>
                    ))}
                  </select>

                  {/* Group-by selector */}
                  <div className="groupby-tabs">
                    {(['day', 'week', 'month'] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setGroupBy(g)}
                        className={`groupby-btn ${groupBy === g ? 'active' : ''}`}
                      >
                        {t(`chart.${g}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {filterError && (
                <div className="form-error" style={{ marginBottom: '10px' }}>
                  <AlertCircle size={14} />
                  {filterError}
                </div>
              )}

              <UsageChart breakdown={breakdown} groupBy={groupBy} />

              <p className="chart-footer">
                {formatPeriod(selectedPeriod, locale)} —{' '}
                <strong>{summary?.document_count ?? 0} {t('chart.documents')}</strong> ·{' '}
                <strong>{usd(summary?.total_usd ?? 0)} USD</strong>
              </p>
            </section>

            {/* ── Invoices ── */}
            <section className="billing-card">
              <div className="card-header">
                <h2 className="card-title">
                  <FileText size={18} />
                  {t('invoices.title')}
                </h2>
              </div>

              {invoices.length === 0 ? (
                <div className="invoices-empty">
                  <FileText size={32} />
                  <p>{t('invoices.emptyTitle')}</p>
                  <span>{t('invoices.emptyHint')}</span>
                </div>
              ) : (
                <div className="invoices-list">
                  {invoices.map((inv) => (
                    <InvoiceRow key={inv.id} invoice={inv} />
                  ))}
                </div>
              )}
            </section>

            {/* ── Payment Methods ── */}
            <section className="billing-card">
              <div className="card-header">
                <h2 className="card-title">
                  <CreditCard size={18} />
                  {t('paymentMethods.title')}
                </h2>
              </div>

              {/* Registered cards */}
              {billingStatus.payment_sources.length === 0 && (
                <div className="payment-empty">
                  <CreditCard size={28} />
                  <p>{t('paymentMethods.emptyTitle')}</p>
                  <span>{t('paymentMethods.emptyHint')}</span>
                </div>
              )}

              <div className="cards-list">
                {billingStatus.payment_sources.map((src) => (
                  <div key={src.id} className="card-item">
                    <div className="card-item-info">
                      <CreditCard size={18} />
                      <span className="card-brand">{src.card_brand}</span>
                      <span className="card-number">····&nbsp;{src.last_four}</span>
                      {src.is_active && (
                        <span className="badge-active">{t('paymentMethods.primary')}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteCard(src.id)}
                      className="btn-delete-card"
                      title={t('paymentMethods.deleteTitle')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Botón para abrir widget de Wompi (UI de confianza) */}
              <div className="wompi-widget-section">
                <button
                  onClick={handleOpenWidget}
                  className="btn-wompi-widget"
                  disabled={addingCard}
                >
                  {addingCard ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      {t('wompi.opening')}
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      {t('wompi.addCard')}
                    </>
                  )}
                </button>

                <p className="wompi-hint">
                  {t('wompi.hintPrefix')} <strong>$1 COP</strong> {t('wompi.hintSuffix')}
                </p>

                {cardError && (
                  <div className="form-error" style={{ marginTop: '10px' }}>
                    <AlertCircle size={14} />
                    {cardError}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default Billing;
