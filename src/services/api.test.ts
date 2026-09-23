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
