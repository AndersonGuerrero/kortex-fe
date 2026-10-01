import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiService } from './api';

describe('apiService.getDocumentPdfBytes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the signed URL untouched and without the API Authorization header', async () => {
    const signedUrl =
      'https://acc.r2.cloudflarestorage.com/b/pdfs/a.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc';
    const bytes = new Uint8Array([37, 80, 68, 70]).buffer;
    const fetchMock = vi.fn().mockResolvedValue(new Response(bytes, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiService.getDocumentPdfBytes(signedUrl);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(signedUrl);
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    expect(new Uint8Array(result)).toEqual(new Uint8Array(bytes));
  });

  it('throws when the storage rejects the download', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(apiService.getDocumentPdfBytes('https://x/a.pdf')).rejects.toThrow();
  });
});

describe('apiService document groups', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('creates a group and surfaces the backend name validation error', async () => {
    localStorage.setItem('access_token', 'token');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 1, name: 'Contabilidad', created_at: '2026-10-01' }, 201))
      .mockResolvedValueOnce(jsonResponse({ name: ['Ya tienes un grupo de documentos con ese nombre.'] }, 400));
    vi.stubGlobal('fetch', fetchMock);

    const created = await apiService.createDocumentGroup('Contabilidad');
    expect(created.id).toBe(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/document-groups\/$/);
    expect(JSON.parse(init.body)).toEqual({ name: 'Contabilidad' });

    await expect(apiService.createDocumentGroup('contabilidad')).rejects.toThrow(
      'Ya tienes un grupo de documentos con ese nombre.',
    );
  });

  it('sends group null to unassign a document type', async () => {
    localStorage.setItem('access_token', 'token');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 7, name: 'Factura', group: null, created_at: '2026-10-01' }));
    vi.stubGlobal('fetch', fetchMock);

    const updated = await apiService.updateDocumentType(7, { name: 'Factura', group: null });

    expect(updated.group).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/document-types\/7\/$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Factura', group: null });
  });

  it('surfaces the backend error when assigning a foreign group', async () => {
    localStorage.setItem('access_token', 'token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ group: ['El grupo de documentos no existe o no tienes acceso.'] }, 400)),
    );

    await expect(apiService.updateDocumentType(7, { group: 99 })).rejects.toThrow(
      'El grupo de documentos no existe o no tienes acceso.',
    );
  });

  it('throws when deleting a group fails', async () => {
    localStorage.setItem('access_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(apiService.deleteDocumentGroup(3)).rejects.toThrow();
  });
});

describe('apiService.extractDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const sentForm = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls[0][1].body as FormData;

  it('sends the group only when one is selected', async () => {
    localStorage.setItem('access_token', 'token');
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const pdf = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });

    await apiService.extractDocument(5, pdf, 3);
    expect(sentForm(fetchMock).get('group')).toBe('3');
    expect(sentForm(fetchMock).get('document_type')).toBe('5');

    fetchMock.mockClear();
    await apiService.extractDocument(5, pdf);
    expect(sentForm(fetchMock).has('group')).toBe(false);
  });

  it('surfaces the backend error when the type is not in the group', async () => {
    localStorage.setItem('access_token', 'token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'El tipo de documento Factura no pertenece al grupo Proveedores.' }), {
          status: 400,
        }),
      ),
    );
    const pdf = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });

    await expect(apiService.extractDocument(5, pdf, 9)).rejects.toThrow(
      'El tipo de documento Factura no pertenece al grupo Proveedores.',
    );
  });
});
