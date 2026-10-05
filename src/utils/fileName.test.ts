import { describe, it, expect } from 'vitest';
import { fileNameFromUrl } from './fileName';

describe('fileNameFromUrl', () => {
  it('ignores the query string of a signed R2 URL', () => {
    const signedUrl =
      'https://acc.r2.cloudflarestorage.com/kortex/pdfs/rutalejandroosoriobotero.pdf' +
      '?X-Amz-Credential=88bf%2F20261005%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261005T204557Z';
    expect(fileNameFromUrl(signedUrl)).toBe('rutalejandroosoriobotero.pdf');
  });

  it('decodes an encoded file name', () => {
    expect(fileNameFromUrl('https://host/pdfs/mi%20archivo.pdf')).toBe('mi archivo.pdf');
  });

  it('accepts a relative URL', () => {
    expect(fileNameFromUrl('/media/pdfs/a.pdf')).toBe('a.pdf');
  });

  it('returns undefined when there is no file name', () => {
    expect(fileNameFromUrl('')).toBeUndefined();
    expect(fileNameFromUrl('https://host/pdfs/')).toBeUndefined();
  });
});
