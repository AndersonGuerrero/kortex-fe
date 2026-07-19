import i18n from '../i18n';

/**
 * Servidor API Base URL. En desarrollo corre en localhost:8000.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

interface TokenResponse {
  access: string;
  refresh: string;
}

export interface DocumentType {
  id: number;
  name: string;
  created_at: string;
}

export interface UserAIModel {
  user: number;
  model_name: string;
  llm_service: number | null;
  llm_service_name?: string | null;
  training_status: string;
  training_progress: number;
  precision: number;
  training_logs?: string[];
}

export interface AvailableModel {
  id: string;
  name: string;
  service: string | null;
  service_id: number | null;
}

export interface UserProfile {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface Document {
  id: number;
  document_type: number;
  pdf: string;
  json_data: any[];
  status: 'uploaded' | 'labeled' | 'trained';
  extracted_at: string;
}

export interface Label {
  id: number;
  document_type: number;
  name: string;
  tipo: string;
  created_at: string;
}

/** Tipos de dato disponibles para labels */
export const LABEL_TIPOS = [
  { value: 'texto', label: 'Texto', icon: '📝' },
  { value: 'numero', label: 'Número', icon: '🔢' },
  { value: 'fecha', label: 'Fecha', icon: '📅' },
  { value: 'moneda', label: 'Moneda', icon: '💰' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'telefono', label: 'Teléfono', icon: '📞' },
] as const;

/* ── Billing types ──────────────────────────────────────────────── */

/** Fuente de pago registrada en Wompi */
export interface WompiPaymentSource {
  id: number;
  wompi_source_id: string;
  last_four: string;
  card_brand: string;
  is_active: boolean;
  created_at: string;
}

/** Estado de la cuenta de billing del usuario */
export interface BillingStatus {
  status: 'trial' | 'active' | 'suspended';
  free_trial_used_usd: string;  // Decimal string
  trial_remaining_usd: string;
  trial_limit_usd: string;
  billing_cycle_day: number;
  created_at: string;
  payment_sources: WompiPaymentSource[];
}

/** Resumen de uso del período actual */
export interface BillingUsageSummary {
  period: string;
  document_count: number;
  total_usd: string | number;
}

/** Elemento del breakdown agrupado (por día / semana / mes) */
export interface UsageBreakdownItem {
  group: string;
  document_count: number;
  total_usd: string;
}

/** Respuesta del endpoint /billing/usage/ con group_by */
export interface BillingUsageResponse {
  period: string;
  group_by?: string;
  breakdown?: UsageBreakdownItem[];
  count?: number;
  results?: unknown[];
}

/** Factura mensual */
export interface MonthlyInvoice {
  id: number;
  period: string;
  total_usd: string;
  total_cop: number;
  usd_to_cop_rate_used: string | null;
  status: 'draft' | 'pending' | 'paid' | 'failed';
  wompi_transaction_id: string;
  created_at: string;
  paid_at: string | null;
}

/** Parámetros devueltos por /billing/widget/init/ para inicializar WidgetCheckout */
export interface WompiWidgetConfig {
  public_key: string;
  reference: string;
  amount_in_cents: number;
  currency: string;
  integrity: string;
  customer_email: string;
}

// Promesa de refresh en curso, compartida entre llamadas concurrentes a
// refreshAccessToken() para que no disparen múltiples requests de refresh
// en paralelo (lo que puede invalidarse entre sí si el backend rota el
// refresh token).
let refreshPromise: Promise<string> | null = null;

/**
 * Servicio para interactuar con la API de Django y manejar JWT.
 */
export const apiService = {
  /**
   * Intenta autenticar al usuario y guarda los tokens.
   */
  async login(username: string, password: string): Promise<TokenResponse> {
    const response = await fetch(`${API_BASE_URL}/api/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': localStorage.getItem('kortex-language') || 'es',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || i18n.t('errors.invalidCredentials', { ns: 'api' }));
    }

    const data: TokenResponse = await response.json();
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    return data;
  },

  /**
   * Autentica al usuario mediante un access_token de Auth0 (Google OAuth2).
   * Envía el token al backend para intercambiarlo por tokens SimpleJWT.
   */
  async loginWithAuth0(auth0AccessToken: string): Promise<TokenResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/auth0/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': localStorage.getItem('kortex-language') || 'es',
      },
      body: JSON.stringify({ access_token: auth0AccessToken }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || i18n.t('errors.auth0Failed', { ns: 'api' })
      );
    }

    const data: TokenResponse = await response.json();
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    return data;
  },

  /**
   * Remueve los tokens almacenados.
   */
  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },

  /**
   * Verifica si existe un token guardado.
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  },

  /**
   * Obtiene el token de acceso guardado.
   */
  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  },

  /**
   * Refresca el access token utilizando el refresh token.
   */
  async refreshAccessToken(): Promise<string> {
    // Reuse any in-flight refresh instead of starting a concurrent one.
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const refresh = localStorage.getItem('refresh_token');
      if (!refresh) {
        throw new Error(i18n.t('errors.noRefreshToken', { ns: 'api' }));
      }

      const response = await fetch(`${API_BASE_URL}/api/token/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh }),
      });

      if (!response.ok) {
        this.logout();
        throw new Error(i18n.t('errors.sessionExpired', { ns: 'api' }));
      }

      const data = await response.json();
      localStorage.setItem('access_token', data.access);
      return data.access;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  },

  /**
   * Realiza un fetch autenticado agregando automáticamente el header Authorization Bearer.
   * Maneja de manera automática la renovación de token (refresh) si expira (401).
   */
  async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    let token = this.getAccessToken();
    
    // Si no hay token, intentamos usar el refresh para obtener uno antes de fallar
    if (!token) {
      try {
        token = await this.refreshAccessToken();
      } catch {
        throw new Error(i18n.t('errors.notAuthenticated', { ns: 'api' }));
      }
    }

    // Configurar cabeceras
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept-Language', localStorage.getItem('kortex-language') || 'es');

    let response = await fetch(url.startsWith('http') ? url : `${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });

    // Si devuelve 401 (Unauthorized), intentamos refrescar el token y reintentar una vez
    if (response.status === 401) {
      try {
        const newToken = await this.refreshAccessToken();
        headers.set('Authorization', `Bearer ${newToken}`);
        response = await fetch(url.startsWith('http') ? url : `${API_BASE_URL}${url}`, {
          ...options,
          headers,
        });
      } catch {
        throw new Error(i18n.t('errors.sessionExpired', { ns: 'api' }));
      }
    }

    return response;
  },

  /**
   * Obtiene la lista de tipos de documento del usuario autenticado.
   */
  async getDocumentTypes(): Promise<DocumentType[]> {
    const response = await this.fetchWithAuth('/api/document-types/');
    if (!response.ok) {
      throw new Error(i18n.t('errors.loadDocumentTypesFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Crea un nuevo tipo de documento.
   */
  async createDocumentType(name: string): Promise<DocumentType> {
    const response = await this.fetchWithAuth('/api/document-types/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.name?.[0] || i18n.t('errors.createDocumentTypeFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Actualiza el nombre del tipo de documento.
   */
  async updateDocumentType(id: number, name: string): Promise<DocumentType> {
    const response = await this.fetchWithAuth(`/api/document-types/${id}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.name?.[0] || i18n.t('errors.updateDocumentTypeFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Elimina un tipo de documento.
   */
  async deleteDocumentType(id: number): Promise<void> {
    const response = await this.fetchWithAuth(`/api/document-types/${id}/`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(i18n.t('errors.deleteDocumentTypeFailed', { ns: 'api' }));
    }
  },

  /**
   * Obtiene la lista de documentos de un tipo de documento.
   */
  async getDocuments(documentTypeId: number): Promise<Document[]> {
    const response = await this.fetchWithAuth(`/api/documents/?document_type=${documentTypeId}`);
    if (!response.ok) {
      throw new Error(i18n.t('errors.loadDocumentsFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Crea/Sube un nuevo documento.
   */
  async createDocument(documentTypeId: number, pdfFile: File): Promise<Document> {
    const formData = new FormData();
    formData.append('document_type', String(documentTypeId));
    formData.append('pdf', pdfFile);

    const response = await this.fetchWithAuth('/api/documents/', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.detail || errorData.pdf?.[0] || i18n.t('errors.uploadDocumentFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Actualiza los datos JSON de un documento.
   */
  async updateDocument(id: number, jsonData: Record<string, any>): Promise<Document> {
    const response = await this.fetchWithAuth(`/api/documents/${id}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ json_data: jsonData }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || i18n.t('errors.updateDocumentFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Elimina un documento.
   */
  async deleteDocument(id: number): Promise<void> {
    const response = await this.fetchWithAuth(`/api/documents/${id}/`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(i18n.t('errors.deleteDocumentFailed', { ns: 'api' }));
    }
  },

  /**
   * Obtiene los detalles de un documento específico.
   */
  async getDocument(id: number): Promise<Document> {
    const response = await this.fetchWithAuth(`/api/documents/${id}/`);
    if (!response.ok) {
      throw new Error(i18n.t('errors.loadDocumentFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Obtiene la lista de etiquetas configuradas en un tipo de documento.
   */
  async getLabels(documentTypeId: number): Promise<Label[]> {
    const response = await this.fetchWithAuth(`/api/labels/?document_type=${documentTypeId}`);
    if (!response.ok) {
      throw new Error(i18n.t('errors.loadLabelsFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Crea una nueva etiqueta en el tipo de documento.
   */
  async createLabel(documentTypeId: number, name: string, tipo: string = 'texto'): Promise<Label> {
    const response = await this.fetchWithAuth('/api/labels/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ document_type: documentTypeId, name, tipo }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.name?.[0] || i18n.t('errors.createLabelFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Actualiza el nombre de una etiqueta.
   */
  async updateLabel(id: number, name: string, tipo?: string): Promise<Label> {
    const body: Record<string, string> = { name };
    if (tipo) body.tipo = tipo;
    const response = await this.fetchWithAuth(`/api/labels/${id}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.name?.[0] || i18n.t('errors.updateLabelFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Elimina una etiqueta del proyecto.
   */
  async deleteLabel(id: number): Promise<void> {
    const response = await this.fetchWithAuth(`/api/labels/${id}/`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(i18n.t('errors.deleteLabelFailed', { ns: 'api' }));
    }
  },

  async reorderLabels(orders: { id: number; order: number }[]): Promise<void> {
    const response = await this.fetchWithAuth('/api/labels/reorder/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orders }),
    });
    if (!response.ok) {
      throw new Error(i18n.t('errors.reorderLabelsFailed', { ns: 'api' }));
    }
  },



  /**
   * Descarga los bytes del PDF de un documento para renderizar en el editor.
   */
  async getDocumentPdfBytes(pdfUrl: string): Promise<ArrayBuffer> {
    // Cache-busting para evitar servir PDFs cacheados tras reemplazar
    const separator = pdfUrl.includes('?') ? '&' : '?';
    const bustUrl = `${pdfUrl}${separator}_t=${Date.now()}`;
    const response = await this.fetchWithAuth(bustUrl);
    if (!response.ok) {
      throw new Error(i18n.t('errors.downloadPdfFailed', { ns: 'api' }));
    }
    return response.arrayBuffer();
  },

  /**
   * Reemplaza el PDF del documento en el servidor con el PDF editado.
   * El backend resetea el status a 'uploaded' y limpia json_data.
   */
  async replaceDocumentPdf(
    documentId: number,
    pdfBlob: Blob,
    filename: string
  ): Promise<Document> {
    const formData = new FormData();
    formData.append('pdf', pdfBlob, filename);

    const response = await this.fetchWithAuth(
      `/api/documents/${documentId}/replace_pdf/`,
      {
        method: 'POST',
        body: formData,
      }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || errorData.detail || i18n.t('errors.replacePdfFailed', { ns: 'api' })
      );
    }
    return response.json();
  },

  /**
   * Obtiene la configuración e información del modelo de IA del usuario.
   */
  async getUserAIModel(): Promise<UserAIModel> {
    const response = await this.fetchWithAuth('/api/user/ai-model/');
    if (!response.ok) {
      throw new Error(i18n.t('errors.loadAIConfigFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Obtiene la lista de modelos de IA disponibles para seleccionar.
   */
  async getAvailableAIModels(): Promise<AvailableModel[]> {
    const response = await this.fetchWithAuth('/api/user/ai-model/available/');
    if (!response.ok) {
      throw new Error(i18n.t('errors.loadAvailableModelsFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Actualiza la configuración (hiperparámetros) del modelo de IA del usuario.
   */
  async updateUserAIConfig(config: Partial<UserAIModel>): Promise<UserAIModel> {
    const response = await this.fetchWithAuth('/api/user/ai-model/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || i18n.t('errors.updateAIConfigFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Dispara el entrenamiento global del modelo de IA del usuario.
   */
  async trainUserModel(): Promise<UserAIModel> {
    const response = await this.fetchWithAuth('/api/user/ai-model/train/', {
      method: 'POST',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.detail || i18n.t('errors.startTrainingFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Cancela/detiene el entrenamiento activo del modelo de IA.
   */
  async cancelTrainUserModel(): Promise<UserAIModel> {
    const response = await this.fetchWithAuth('/api/user/ai-model/train/', {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.detail || i18n.t('errors.stopTrainingFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Obtiene los datos del perfil de cuenta del usuario.
   */
  async getUserProfile(): Promise<UserProfile> {
    const response = await this.fetchWithAuth('/api/user/profile/');
    if (!response.ok) {
      throw new Error(i18n.t('errors.loadProfileFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Actualiza los datos del perfil del usuario (nombre, correo, contraseña).
   */
  async updateUserProfile(data: Partial<UserProfile & { password?: string }>): Promise<UserProfile> {
    const response = await this.fetchWithAuth('/api/user/profile/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || i18n.t('errors.updateProfileFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Obtiene los detalles del token API existente del usuario (token y conteo).
   */
  async getAPIToken(): Promise<{ token: string | null; request_count: number }> {
    const response = await this.fetchWithAuth('/api/user/api-token/', {
      method: 'GET',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || i18n.t('errors.getApiTokenFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Genera o regenera un token API para integraciones externas.
   */
  async generateAPIToken(): Promise<{ token: string; request_count: number }> {
    const response = await this.fetchWithAuth('/api/user/api-token/', {
      method: 'POST',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || i18n.t('errors.generateApiTokenFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /**
   * Sube un documento PDF al endpoint /api/documents/extract/ para probar la extracción en vivo.
   */
  async extractDocument(documentTypeId: number, pdfFile: File): Promise<any> {
    const formData = new FormData();
    formData.append('document_type', String(documentTypeId));
    formData.append('pdf', pdfFile);

    const response = await this.fetchWithAuth('/api/documents/extract/', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.detail || i18n.t('errors.extractionFailed', { ns: 'api' }));
    }
    return response.json();
  },

  /* ── Billing ──────────────────────────────────────────────────── */

  /**
   * Obtiene el estado de billing del usuario autenticado:
   * status, saldo trial, métodos de pago.
   */
  async getBillingStatus(): Promise<BillingStatus> {
    const res = await this.fetchWithAuth('/api/billing/status/');
    if (!res.ok) throw new Error(i18n.t('errors.loadBillingStatusFailed', { ns: 'api' }));
    return res.json();
  },

  /**
   * Retorna el resumen de uso para un período YYYY-MM.
   * Defaults al mes actual si no se especifica.
   */
  async getBillingSummary(period?: string): Promise<BillingUsageSummary> {
    const qs = period ? `?period=${period}` : '';
    const res = await this.fetchWithAuth(`/api/billing/summary/${qs}`);
    if (!res.ok) throw new Error(i18n.t('errors.loadBillingSummaryFailed', { ns: 'api' }));
    return res.json();
  },

  /**
   * Retorna el breakdown de uso agrupado por día/semana/mes/año.
   */
  async getBillingUsage(
    period?: string,
    groupBy?: string
  ): Promise<BillingUsageResponse> {
    const params = new URLSearchParams();
    if (period) params.append('period', period);
    if (groupBy) params.append('group_by', groupBy);
    const qs = params.toString() ? `?${params}` : '';
    const res = await this.fetchWithAuth(`/api/billing/usage/${qs}`);
    if (!res.ok) throw new Error(i18n.t('errors.loadUsageDetailFailed', { ns: 'api' }));
    return res.json();
  },

  /**
   * Retorna el historial de facturas del usuario.
   */
  async getBillingInvoices(): Promise<MonthlyInvoice[]> {
    const res = await this.fetchWithAuth('/api/billing/invoices/');
    if (!res.ok) throw new Error(i18n.t('errors.loadInvoicesFailed', { ns: 'api' }));
    return res.json();
  },

  /**
   * Registra un nuevo método de pago (tarjeta tokenizada por Wompi.js).
   */
  async addPaymentMethod(
    cardToken: string,
    lastFour: string,
    cardBrand: string
  ): Promise<WompiPaymentSource> {
    const res = await this.fetchWithAuth('/api/billing/payment-method/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_token: cardToken,
        last_four: lastFour,
        card_brand: cardBrand,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || i18n.t('errors.addPaymentMethodFailed', { ns: 'api' }));
    }
    return res.json();
  },

  /**
   * Desactiva (soft-delete) un método de pago por su ID.
   */
  async deletePaymentMethod(sourceId: number): Promise<void> {
    const res = await this.fetchWithAuth(
      `/api/billing/payment-method/${sourceId}/`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(i18n.t('errors.deletePaymentMethodFailed', { ns: 'api' }));
  },

  /**
   * Solicita al backend los parámetros del Wompi WidgetCheckout:
   * reference única, integrity hash (SHA256), public_key, amount.
   * El backend genera la firma para evitar exponer el integrity secret.
   */
  async getWompiWidgetConfig(): Promise<WompiWidgetConfig> {
    const res = await this.fetchWithAuth('/api/billing/widget/init/', {
      method: 'POST',
    });
    if (!res.ok) throw new Error(i18n.t('errors.loadWompiWidgetConfigFailed', { ns: 'api' }));
    return res.json();
  },

  /**
   * Envía los datos del payment_source del widget de Wompi al backend
   * para que cree un WompiPaymentSource con un payment_source_id real.
   *
   * El widget callback devuelve {payment_source: {token, type, lastFour}}
   * que el frontend extrae y envía aquí.
   */
  async completeWompiWidget(
    token: string,
    type: string,
    lastFour: string,
  ): Promise<WompiPaymentSource> {
    const res = await this.fetchWithAuth('/api/billing/widget/complete/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, type, last_four: lastFour }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || i18n.t('errors.completeWidgetFailed', { ns: 'api' }));
    }
    return res.json();
  },
};
