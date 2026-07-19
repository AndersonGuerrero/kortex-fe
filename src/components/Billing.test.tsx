import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { Billing } from './Billing';
import { apiService } from '../services/api';
import type { BillingStatus, MonthlyInvoice } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getBillingStatus: vi.fn(),
    getBillingInvoices: vi.fn(),
    getBillingSummary: vi.fn(),
    getBillingUsage: vi.fn(),
    getWompiWidgetConfig: vi.fn(),
    completeWompiWidget: vi.fn(),
    deletePaymentMethod: vi.fn(),
  },
}));

const baseStatus: BillingStatus = {
  status: 'trial',
  free_trial_used_usd: '0.5000',
  trial_remaining_usd: '0.5000',
  trial_limit_usd: '1.0000',
  billing_cycle_day: 1,
  created_at: '2026-01-01T00:00:00Z',
  payment_sources: [],
};

const noInvoices: MonthlyInvoice[] = [];

function mockHappyPath() {
  vi.mocked(apiService.getBillingStatus).mockResolvedValue(baseStatus);
  vi.mocked(apiService.getBillingInvoices).mockResolvedValue(noInvoices);
  vi.mocked(apiService.getBillingSummary).mockResolvedValue({
    period: '2026-07',
    document_count: 0,
    total_usd: '0.0000',
  });
  vi.mocked(apiService.getBillingUsage).mockResolvedValue({
    period: '2026-07',
    breakdown: [],
  });
}

function renderBilling() {
  return render(
    <MemoryRouter>
      <Billing />
    </MemoryRouter>
  );
}

describe('Billing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Widget already "loaded" so loadWompiScript() resolves immediately
    // without touching the DOM/script tag machinery.
    (window as any).WidgetCheckout = undefined;
  });

  it('renders the billing status once data loads', async () => {
    mockHappyPath();
    renderBilling();

    await waitFor(() => {
      expect(apiService.getBillingStatus).toHaveBeenCalled();
    });
    expect(await screen.findByText('Agregar tarjeta con Wompi')).toBeInTheDocument();
  });

  it('shows a visible error banner when the initial load fails', async () => {
    vi.mocked(apiService.getBillingStatus).mockRejectedValue(new Error('fallo'));
    vi.mocked(apiService.getBillingInvoices).mockRejectedValue(new Error('fallo'));

    renderBilling();

    expect(
      await screen.findByText('Error al cargar los datos de billing. Intenta de nuevo.')
    ).toBeInTheDocument();
  });

  it('shows a distinct error notice when the period/group_by refresh fails, without touching the main billing status', async () => {
    mockHappyPath();
    vi.mocked(apiService.getBillingUsage).mockRejectedValue(
      new Error('Error al cargar el consumo del período.')
    );

    renderBilling();

    expect(await screen.findByText('Agregar tarjeta con Wompi')).toBeInTheDocument();
    expect(
      await screen.findByText('Error al cargar el consumo del período.')
    ).toBeInTheDocument();
  });

  it('treats a cancelled Wompi widget (no token) as a silent dismiss, not an error', async () => {
    mockHappyPath();

    let capturedCallback: ((result: any) => void) | undefined;
    function MockWidgetCheckout(this: any) {
      this.open = (cb: (result: any) => void) => {
        capturedCallback = cb;
      };
    }
    (window as any).WidgetCheckout = MockWidgetCheckout;
    vi.mocked(apiService.getWompiWidgetConfig).mockResolvedValue({
      public_key: 'pub_test_123',
      reference: 'kortex-card-1-abc123',
      amount_in_cents: 150000,
      currency: 'COP',
      integrity: 'fake-integrity-hash',
      customer_email: 'user@example.com',
    });

    const user = userEvent.setup();
    renderBilling();

    const openButton = await screen.findByText('Agregar tarjeta con Wompi');
    await user.click(openButton);

    await waitFor(() => expect(capturedCallback).toBeDefined());
    // Simulate the user closing the Wompi modal without completing payment —
    // Wompi's callback fires with no payment_source/token in this case.
    capturedCallback!({ payment_source: undefined });

    await waitFor(() => {
      expect(screen.getByText('Agregar tarjeta con Wompi')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('No se pudo obtener el token de la tarjeta. Intenta de nuevo.')
    ).not.toBeInTheDocument();
  });
});
