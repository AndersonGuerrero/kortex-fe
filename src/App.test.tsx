import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './App';
import { apiService } from './services/api';

vi.mock('./services/api', () => ({
  apiService: {
    getDocumentTypes: vi.fn(),
    getUserAIModel: vi.fn(),
    logout: vi.fn(),
    createDocumentType: vi.fn(),
  },
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the legitimate empty state when the account genuinely has no document types', async () => {
    vi.mocked(apiService.getDocumentTypes).mockResolvedValue([]);
    vi.mocked(apiService.getUserAIModel).mockResolvedValue({
      model_name: '',
      training_status: 'idle',
      training_progress: 0,
      precision: 0,
    } as any);

    renderDashboard();

    await waitFor(() => {
      expect(
        screen.getByText('No tienes ningún tipo de documento creado.')
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Reintentar')).not.toBeInTheDocument();
  });

  it('shows a distinct error banner (not the empty state) when the fetch fails', async () => {
    vi.mocked(apiService.getDocumentTypes).mockRejectedValue(
      new Error('Error de red al cargar tipos de documento')
    );
    vi.mocked(apiService.getUserAIModel).mockResolvedValue({} as any);

    renderDashboard();

    await waitFor(() => {
      expect(
        screen.getByText('Error de red al cargar tipos de documento')
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Reintentar')).toBeInTheDocument();
    // The legitimate empty-state copy must NOT show up for a failed fetch.
    expect(
      screen.queryByText('No tienes ningún tipo de documento creado.')
    ).not.toBeInTheDocument();
  });

  it('retry button re-fetches dashboard data', async () => {
    vi.mocked(apiService.getDocumentTypes)
      .mockRejectedValueOnce(new Error('fallo transitorio'))
      .mockResolvedValueOnce([
        { id: 1, name: 'Factura', created_at: '2026-01-01T00:00:00Z' } as any,
      ]);
    vi.mocked(apiService.getUserAIModel).mockResolvedValue({} as any);

    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderDashboard();

    const retryButton = await screen.findByText('Reintentar');
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('Factura')).toBeInTheDocument();
    });
  });
});
