import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Download, RefreshCw } from 'lucide-react';
import { PDFDocument, PDFName, rgb, StandardFonts } from 'pdf-lib';
// Usar pdf.js global cargado desde index.html (3.4.120)
// para evitar conflictos de versión entre el módulo npm y el CDN worker
const pdfjsLib = (window as any).pdfjsLib;
import pako from 'pako';
import { apiService } from '../services/api';


// ====== Interfaces ======

/** Bloque de texto extraído del PDF con posición y estilo */
interface TextBlock {
  id: string;
  text: string;
  originalText: string;
  x: number;
  y: number;
  originalX: number;
  originalY: number;
  width: number;
  height: number;
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
  isModified: boolean;
  color: string;
}

/** Imagen nueva añadida por el usuario */
interface ImageBlock {
  id: string;
  src: string;
  file: File;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Imagen existente extraída del PDF original */
interface EmbeddedImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  originalX: number;
  originalY: number;
  originalWidth: number;
  originalHeight: number;
  isDeleted: boolean;
  isModified: boolean;
  pngDataUrl: string;
}

/** Estado almacenado en el historial para undo/redo */
interface HistoryState {
  texts: TextBlock[];
  images: ImageBlock[];
  embedded: EmbeddedImage[];
}

/** Elemento activo durante drag/resize */
interface ActiveElement {
  id: string;
  type: 'text' | 'image' | 'embedded';
  mode: 'drag' | 'resize';
}


/**
 * Componente de edición de PDFs integrado en Kortex.
 * Carga el PDF del servidor, permite editar textos e imágenes,
 * y guarda el resultado de vuelta al servidor reemplazando el original.
 */
export const PdfEditor: React.FC = () => {
  const { t } = useTranslation('pdfEditor');
  const { id } = useParams<{ id: string }>();
  const documentId = Number(id);
  const navigate = useNavigate();

  // Estado de carga y datos del documento
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [documentTypeId, setDocumentTypeId] = useState<number | null>(null);
  const [pdfFilename, setPdfFilename] = useState('documento.pdf');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Estado del editor
  const [pdfDims, setPdfDims] = useState({ width: 0, height: 0 });
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [imageBlocks, setImageBlocks] = useState<ImageBlock[]>([]);
  const [embeddedImages, setEmbeddedImages] = useState<EmbeddedImage[]>([]);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pdfBytesRef = useRef<Uint8Array | null>(null);

  // Historial (Undo / Redo)
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Control de interacciones (Arrastrar y Redimensionar)
  const [activeElement, setActiveElement] = useState<ActiveElement | null>(null);
  const dragStartMouse = useRef({ x: 0, y: 0 });
  const dragStartDims = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const backupText = useRef('');

  const VISUAL_SCALE = 1.5;

  // Detectar tema actual (dark/light)
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'dark'
  );

  // Observar cambios de tema en <html data-theme="...">
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(t);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const isDark = theme === 'dark';

  // ====== CARGA INICIAL DEL DOCUMENTO ======

  useEffect(() => {
    const loadDocument = async () => {
      try {
        // Verificar que pdf.js esté cargado globalmente
        if (!pdfjsLib) {
          throw new Error(
            t('errors.pdfJsNotLoaded')
          );
        }
        // Configurar worker de pdf.js (misma versión que index.html)
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

        // Obtener datos del documento del API
        const doc = await apiService.getDocument(documentId);
        setDocumentTypeId(doc.document_type);

        // Extraer nombre del archivo de la URL
        const decoded = decodeURIComponent(doc.pdf);
        const parts = decoded.split('/');
        setPdfFilename(parts[parts.length - 1] || 'documento.pdf');

        // Descargar los bytes del PDF
        const arrayBuffer = await apiService.getDocumentPdfBytes(doc.pdf);
        pdfBytesRef.current = new Uint8Array(arrayBuffer);

        // Cargar con pdf.js para obtener metadatos
        const pdf = await pdfjsLib.getDocument({
          data: pdfBytesRef.current.slice().buffer,
        }).promise;
        setTotalPages(pdf.numPages);

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });
        setPdfDims({ width: viewport.width, height: viewport.height });

        // Extraer textos con colores y fuentes
        const { blocks } = await extractTextBlocks(
          page,
          arrayBuffer,
          0
        );
        setTextBlocks(blocks);

        // Extraer imágenes embebidas
        const extractedImgs = await extractEmbeddedImages(page);
        setEmbeddedImages(extractedImgs);

        // Inicializar historial
        setHistory([
          { texts: blocks, images: [], embedded: extractedImgs },
        ]);
        setHistoryIndex(0);

        setPdfLoaded(true);
      } catch (err: unknown) {
        console.error('Error cargando documento para edición:', err);
        setLoadError(
          err instanceof Error ? err.message : t('errors.loadFailed')
        );
      } finally {
        setIsLoadingDoc(false);
      }
    };

    if (documentId) {
      loadDocument();
    }
  }, [documentId]);

  // Sincronizar canvas al cargar o cambiar de página
  useEffect(() => {
    if (pdfLoaded) {
      renderOriginalPdf();
    }
  }, [pdfLoaded, currentPage]);

  // ====== HISTORIAL ======

  /** Guardar estado en el historial al finalizar una acción del usuario */
  const pushToHistory = (
    texts: TextBlock[],
    images: ImageBlock[],
    embedded: EmbeddedImage[]
  ) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    const newState: HistoryState = {
      texts: JSON.parse(JSON.stringify(texts)),
      images: JSON.parse(JSON.stringify(images)),
      embedded: JSON.parse(JSON.stringify(embedded)),
    };
    setHistory([...nextHistory, newState]);
    setHistoryIndex(nextHistory.length);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setTextBlocks(history[prevIndex].texts);
      setImageBlocks(history[prevIndex].images);
      setEmbeddedImages(history[prevIndex].embedded);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setTextBlocks(history[nextIndex].texts);
      setImageBlocks(history[nextIndex].images);
      setEmbeddedImages(history[nextIndex].embedded);
    }
  };

  // ====== TEXTOS ======

  const handleInputChange = (id: string, newText: string) => {
    setTextBlocks((prev) =>
      prev.map((block) =>
        block.id === id
          ? {
              ...block,
              text: newText,
              isModified: newText !== block.originalText,
            }
          : block
      )
    );
  };

  // ====== EXTRACCIÓN DE IMÁGENES EMBEBIDAS ======

  /**
   * Extrae las imágenes embebidas de una página del PDF.
   * Usa los operadores de renderizado de pdf.js para encontrar
   * paintImageXObject y obtener posición, tamaño y pixel data.
   */
  const extractEmbeddedImages = async (
    page: any
  ): Promise<EmbeddedImage[]> => {
    try {
      const operatorList = await page.getOperatorList();
      const extracted: EmbeddedImage[] = [];

      const matrixStack: number[][] = [];
      let currentMatrix = [1, 0, 0, 1, 0, 0];

      const multiplyMatrices = (a: number[], b: number[]) => [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
      ];

      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const fn = operatorList.fnArray[i];
        const args = operatorList.argsArray[i];

        if (fn === pdfjsLib.OPS.save) {
          matrixStack.push([...currentMatrix]);
        } else if (fn === pdfjsLib.OPS.restore) {
          if (matrixStack.length > 0) {
            currentMatrix = matrixStack.pop()!;
          }
        } else if (fn === pdfjsLib.OPS.transform) {
          currentMatrix = multiplyMatrices(currentMatrix, args);
        } else if (fn === pdfjsLib.OPS.paintImageXObject) {
          const imgName = args[0];
          try {
            const imgData: any = await new Promise((resolve, reject) => {
              page.objs.get(imgName, (data: any) => {
                if (data) resolve(data);
                else reject(new Error('No image data'));
              });
            });

            const imgWidth = Math.abs(currentMatrix[0]);
            const imgHeight = Math.abs(currentMatrix[3]);
            const imgX = currentMatrix[4];
            const imgY = currentMatrix[5];

            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d')!;

            // pdf.js puede devolver distintos formatos de imagen
            if (imgData instanceof ImageBitmap) {
              tempCanvas.width = imgData.width;
              tempCanvas.height = imgData.height;
              tempCtx.drawImage(imgData, 0, 0);
            } else if (imgData.bitmap instanceof ImageBitmap) {
              tempCanvas.width = imgData.bitmap.width;
              tempCanvas.height = imgData.bitmap.height;
              tempCtx.drawImage(imgData.bitmap, 0, 0);
            } else if (imgData instanceof HTMLCanvasElement) {
              tempCanvas.width = imgData.width;
              tempCanvas.height = imgData.height;
              tempCtx.drawImage(imgData, 0, 0);
            } else if (imgData instanceof HTMLImageElement) {
              tempCanvas.width = imgData.naturalWidth || imgData.width;
              tempCanvas.height = imgData.naturalHeight || imgData.height;
              tempCtx.drawImage(imgData, 0, 0);
            } else if (imgData.data) {
              // Raw pixel data
              tempCanvas.width = imgData.width;
              tempCanvas.height = imgData.height;
              const imageDataObj = tempCtx.createImageData(
                imgData.width,
                imgData.height
              );
              if (
                imgData.data.length ===
                imgData.width * imgData.height * 3
              ) {
                // RGB sin alfa
                const rgbData = imgData.data;
                for (
                  let p = 0;
                  p < imgData.width * imgData.height;
                  p++
                ) {
                  imageDataObj.data[p * 4] = rgbData[p * 3];
                  imageDataObj.data[p * 4 + 1] = rgbData[p * 3 + 1];
                  imageDataObj.data[p * 4 + 2] = rgbData[p * 3 + 2];
                  imageDataObj.data[p * 4 + 3] = 255;
                }
              } else {
                imageDataObj.data.set(imgData.data);
              }
              tempCtx.putImageData(imageDataObj, 0, 0);
            } else {
              tempCanvas.width = imgData.width || 1;
              tempCanvas.height = imgData.height || 1;
              try {
                tempCtx.drawImage(imgData, 0, 0);
              } catch {
                /* sin datos válidos */
              }
            }

            const dataUrl = tempCanvas.toDataURL('image/png');

            if (imgWidth > 5 && imgHeight > 5) {
              extracted.push({
                id: `emb-${extracted.length}`,
                src: dataUrl,
                x: imgX,
                y: imgY,
                width: imgWidth,
                height: imgHeight,
                originalX: imgX,
                originalY: imgY,
                originalWidth: imgWidth,
                originalHeight: imgHeight,
                isDeleted: false,
                isModified: false,
                pngDataUrl: dataUrl,
              });
            }
          } catch {
            console.warn(`No se pudo extraer la imagen: ${imgName}`);
          }
        }
      }

      return extracted;
    } catch (err) {
      console.error('Error extrayendo imágenes embebidas:', err);
      return [];
    }
  };

  // ====== EXTRACCIÓN DE TEXTOS ======

  /** Mapeo de fuentes PDF a fuentes web equivalentes */
  const FONT_MAP: Record<string, string> = {
    helvetica: 'Helvetica, Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    times: 'Times New Roman, Times, serif',
    timesnewroman: 'Times New Roman, Times, serif',
    courier: 'Courier New, Courier, monospace',
    calibri: 'Calibri, Arial, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    georgia: 'Georgia, Times New Roman, serif',
  };

  /** Mapear nombre de fuente PDF a fuente web */
  const mapFont = (pdfFontName: string, fallback: string): string => {
    const clean = pdfFontName
      .replace(/^[A-Z]{6}\+/, '')
      .toLowerCase()
      .replace(
        /-?(bold|italic|oblique|regular|medium|light|black|condensed|narrow|bd|it)/gi,
        ''
      )
      .replace(/,.*$/, '')
      .trim();
    for (const [key, value] of Object.entries(FONT_MAP)) {
      if (clean.includes(key)) return value;
    }
    return fallback || 'Arial, sans-serif';
  };

  /**
   * Extrae textos con posición, fuente y color de una página del PDF.
   * Lee el content stream original con pdf-lib para obtener colores.
   */
  const extractTextBlocks = async (
    page: any,
    arrayBuffer: ArrayBuffer,
    pageIndex: number
  ): Promise<{ blocks: TextBlock[]; colors: string[] }> => {
    const textContent = await page.getTextContent();
    console.log('[PdfEditor] getTextContent items:', textContent.items.length,
      'first 5:', textContent.items.slice(0, 5).map((i: any) => ({
        str: i.str, w: i.width, h: i.height,
        tx: i.transform?.[4], ty: i.transform?.[5], ts: i.transform?.[3]
      }))
    );

    // Extraer colores del content stream original
    let textColors: string[] = [];
    try {
      const origDoc = await PDFDocument.load(arrayBuffer, {
        ignoreEncryption: true,
      });
      const origPage = origDoc.getPages()[pageIndex];
      const cRef = origPage.node.get(PDFName.of('Contents'));
      const cObj = origDoc.context.lookup(cRef) as any;

      // Recopilar texto de todos los content streams (puede ser array)
      const decodeStream = (streamObj: any): string => {
        if (!streamObj || !streamObj.getContents) return '';
        const compressed = streamObj.getContents();
        const filter = streamObj.dict?.get(PDFName.of('Filter'));
        // Usar latin1 para preservar bytes 1:1 (UTF-8 corrompe bytes > 0x7F)
        const decoder = new TextDecoder('latin1');
        if (filter?.toString() === '/FlateDecode') {
          return decoder.decode(pako.inflate(new Uint8Array(compressed)));
        }
        return decoder.decode(compressed);
      };

      let streamText = '';
      if (cObj && typeof cObj.size === 'function') {
        // PDFArray — concatenar todos los streams
        for (let i = 0; i < cObj.size(); i++) {
          const ref = cObj.get(i);
          const stream = origDoc.context.lookup(ref);
          streamText += decodeStream(stream);
        }
      } else if (cObj?.getContents) {
        streamText = decodeStream(cObj);
      }

      if (streamText) {
        let fillColor = '#000000';
        const ops = streamText.matchAll(
          /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+rg|(\d+(?:\.\d+)?)\s+g\b|BT\b[\s\S]*?ET\b/g
        );
        for (const m of ops) {
          if (m[0].endsWith('rg')) {
            const r = Math.round(parseFloat(m[1]) * 255);
            const g = Math.round(parseFloat(m[2]) * 255);
            const b = Math.round(parseFloat(m[3]) * 255);
            fillColor = `rgb(${r},${g},${b})`;
          } else if (m[4] !== undefined) {
            const v = Math.round(parseFloat(m[4]) * 255);
            fillColor = `rgb(${v},${v},${v})`;
          } else if (m[0].startsWith('BT')) {
            let blockColor = fillColor;
            const inlineRg = m[0].match(
              /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+rg/
            );
            const inlineG = m[0].match(/(\d+(?:\.\d+)?)\s+g\b/);
            if (inlineRg) {
              const r = Math.round(parseFloat(inlineRg[1]) * 255);
              const g = Math.round(parseFloat(inlineRg[2]) * 255);
              const b = Math.round(parseFloat(inlineRg[3]) * 255);
              blockColor = `rgb(${r},${g},${b})`;
            } else if (inlineG) {
              const v = Math.round(parseFloat(inlineG[1]) * 255);
              blockColor = `rgb(${v},${v},${v})`;
            }
            textColors.push(blockColor);
          }
        }
      }
    } catch {
      // Si falla la extracción de colores, todos quedan en negro
    }

    const blocks: TextBlock[] = textContent.items.map(
      (item: any, index: number) => {
        const fontStyle = textContent.styles[item.fontName];
        const rawFamily = fontStyle
          ? fontStyle.fontFamily
          : 'Arial, sans-serif';
        const lowerFontName = item.fontName.toLowerCase();
        const lowerFamily = rawFamily.toLowerCase();

        return {
          id: `text-${index}`,
          text: item.str,
          originalText: item.str,
          x: item.transform[4],
          y: item.transform[5],
          originalX: item.transform[4],
          originalY: item.transform[5],
          width: item.width || 10,
          height: item.transform[3] || 12,
          fontFamily: mapFont(item.fontName, rawFamily),
          isBold:
            lowerFontName.includes('bold') ||
            lowerFamily.includes('bold') ||
            lowerFontName.includes('-bd'),
          isItalic:
            lowerFontName.includes('italic') ||
            lowerFamily.includes('italic') ||
            lowerFontName.includes('oblique'),
          isModified: false,
          color: textColors[index] || '#000000',
        };
      }
    );

    return { blocks, colors: textColors };
  };

  // ====== RENDER DEL CANVAS (sin texto) ======

  /**
   * Renderiza el PDF al canvas SIN texto. Usa pdf-lib para eliminar
   * las fuentes del PDF antes de renderizar. El Proxy bloquea
   * fillText/strokeText como red de seguridad extra.
   */
  const renderOriginalPdf = async () => {
    if (!pdfBytesRef.current || !canvasRef.current) return;
    try {
      const originalBytes = pdfBytesRef.current.slice().buffer;

      // 1. Cargar con pdf-lib y eliminar texto de los content streams
      let renderBytes: ArrayBuffer | Uint8Array = originalBytes;
      try {
        const pdfDoc = await PDFDocument.load(originalBytes, {
          ignoreEncryption: true,
        });

        /** Eliminar texto de un content stream */
        const stripTextFromStream = (streamObj: any) => {
          if (!streamObj || !streamObj.getContents) return;
          try {
            const compressed = streamObj.getContents();
            const filter = streamObj.dict?.get(PDFName.of('Filter'));
            // Usar latin1 para preservar bytes 1:1 (UTF-8 corrompe bytes > 0x7F)
            const decoder = new TextDecoder('latin1');
            let text: string;

            if (filter?.toString() === '/FlateDecode') {
              const raw = new Uint8Array(compressed);
              text = decoder.decode(pako.inflate(raw));
            } else {
              text = decoder.decode(compressed);
            }

            const cleaned = text
              .replace(/BT\b[\s\S]*?ET\b/g, '')
              // Limpiar operadores de texto huérfanos fuera de BT...ET
              // (algunos PDFs tienen )Tj o )TJ sueltos por corrupción)
              .replace(/\)[^\n]*?T[jJ]\s*/g, '')
              .replace(/\bET\b/g, '');

            // Codificar de vuelta con latin1 (charCode 1:1 a byte)
            const newBytes = new Uint8Array(cleaned.length);
            for (let i = 0; i < cleaned.length; i++) {
              newBytes[i] = cleaned.charCodeAt(i) & 0xFF;
            }

            if (filter?.toString() === '/FlateDecode') {
              const recompressed = pako.deflate(newBytes);
              streamObj.contents = recompressed;
              streamObj.dict.set(
                PDFName.of('Length'),
                pdfDoc.context.obj(recompressed.length)
              );
            } else {
              streamObj.contents = newBytes;
              streamObj.dict.set(
                PDFName.of('Length'),
                pdfDoc.context.obj(newBytes.length)
              );
            }
          } catch {
            // Si falla un stream individual, ignorar
          }
        };

        /** Recorrer recursivamente recursos para limpiar Form XObjects */
        const stripTextRecursive = (resEntry: any) => {
          const dict =
            resEntry && typeof resEntry.delete === 'function'
              ? resEntry
              : resEntry
                ? pdfDoc.context.lookup(resEntry)
                : null;
          if (!dict || typeof dict.get !== 'function') return;

          const xobj = dict.get(PDFName.of('XObject'));
          const xDict =
            xobj && typeof xobj.entries === 'function'
              ? xobj
              : xobj
                ? pdfDoc.context.lookup(xobj)
                : null;
          if (!xDict || !xDict.entries) return;

          for (const [, ref] of xDict.entries()) {
            const stream = pdfDoc.context.lookup(ref) as any;
            if (!stream?.dict) continue;

            const subtype = stream.dict.get(PDFName.of('Subtype'));
            if (subtype?.toString() !== '/Form') continue;

            stripTextFromStream(stream);
            const nestedRes = stream.dict.get(PDFName.of('Resources'));
            if (nestedRes) stripTextRecursive(nestedRes);
          }
        };

        const pages = pdfDoc.getPages();
        const pageIdx = currentPage - 1;
        if (pageIdx < pages.length) {
          // Procesar Contents (puede ser un stream o un array de streams)
          const contentsRef = pages[pageIdx].node.get(
            PDFName.of('Contents')
          );
          const contentsObj = pdfDoc.context.lookup(contentsRef);

          if (contentsObj && typeof (contentsObj as any).size === 'function') {
            // Contents es un PDFArray — iterar todos los streams
            const arr = contentsObj as any;
            for (let i = 0; i < arr.size(); i++) {
              const ref = arr.get(i);
              const stream = pdfDoc.context.lookup(ref);
              stripTextFromStream(stream);
            }
          } else {
            // Contents es un stream individual
            stripTextFromStream(contentsObj);
          }

          const resources = pages[pageIdx].node.get(
            PDFName.of('Resources')
          );
          stripTextRecursive(resources);
        }
        renderBytes = await pdfDoc.save();
        console.log('[PdfEditor] Text strip OK, renderBytes updated');
      } catch (stripErr) {
        // Si falla la modificación, usar bytes originales
        console.error('[PdfEditor] Text strip FAILED, using original bytes:', stripErr);
      }

      // 2. Renderizar PDF (sin fuentes) al canvas
      const pdf = await pdfjsLib.getDocument({ data: renderBytes }).promise;
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale: VISUAL_SCALE });
      const canvas = canvasRef.current;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const realCtx = canvas.getContext('2d')!;

      // Proxy como red de seguridad: bloquea fillText/strokeText
      const noTextCtx = new Proxy(realCtx, {
        get(target: any, prop: string) {
          if (prop === 'fillText' || prop === 'strokeText') {
            return () => {};
          }
          const val = target[prop];
          return typeof val === 'function' ? val.bind(target) : val;
        },
        set(target: any, prop: string, value: any) {
          target[prop] = value;
          return true;
        },
      });

      await page.render({ canvasContext: noTextCtx, viewport }).promise;
    } catch (error) {
      console.error('Error renderizando PDF:', error);
    }
  };

  // ====== PAGINACIÓN ======

  /** Navegar a una página específica del PDF */
  const goToPage = async (pageNum: number) => {
    if (
      !pdfBytesRef.current ||
      pageNum < 1 ||
      pageNum > totalPages ||
      pageNum === currentPage
    )
      return;

    const arrayBuffer = pdfBytesRef.current.slice().buffer;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    setPdfDims({ width: viewport.width, height: viewport.height });

    const { blocks } = await extractTextBlocks(
      page,
      arrayBuffer,
      pageNum - 1
    );
    const extractedImgs = await extractEmbeddedImages(page);

    setTextBlocks(blocks);
    setImageBlocks([]);
    setEmbeddedImages(extractedImgs);
    setFocusedBlockId(null);
    setHistory([{ texts: blocks, images: [], embedded: extractedImgs }]);
    setHistoryIndex(0);
    setCurrentPage(pageNum);
  };

  // ====== IMÁGENES NUEVAS (AÑADIDAS) ======

  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && pdfLoaded) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      const newImg: ImageBlock = {
        id: `img-${Date.now()}`,
        src: url,
        file: file,
        x: 100,
        y: 400,
        width: 150,
        height: 100,
      };
      const updatedImages = [...imageBlocks, newImg];
      setImageBlocks(updatedImages);
      pushToHistory(textBlocks, updatedImages, embeddedImages);
    }
  };

  const handleDeleteImage = (imgId: string) => {
    const updatedImages = imageBlocks.filter((img) => img.id !== imgId);
    setImageBlocks(updatedImages);
    pushToHistory(textBlocks, updatedImages, embeddedImages);
  };

  // ====== IMÁGENES EMBEBIDAS (DEL PDF ORIGINAL) ======

  const handleDeleteEmbedded = (imgId: string) => {
    const updated = embeddedImages.map((img) =>
      img.id === imgId
        ? { ...img, isDeleted: true, isModified: true }
        : img
    );
    setEmbeddedImages(updated);
    pushToHistory(textBlocks, imageBlocks, updated);
  };

  const handleRestoreEmbedded = (imgId: string) => {
    const updated = embeddedImages.map((img) => {
      if (img.id !== imgId) return img;
      return {
        ...img,
        x: img.originalX,
        y: img.originalY,
        width: img.originalWidth,
        height: img.originalHeight,
        isDeleted: false,
        isModified: false,
      };
    });
    setEmbeddedImages(updated);
    pushToHistory(textBlocks, imageBlocks, updated);
  };

  // ====== CONTROLADORES DE MOUSE PARA DRAG & RESIZE ======

  const handleInteractionStart = (
    e: React.MouseEvent,
    elId: string,
    type: 'text' | 'image' | 'embedded',
    mode: 'drag' | 'resize',
    block: { x: number; y: number; width: number; height: number }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveElement({ id: elId, type, mode });
    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    dragStartDims.current = {
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
    };
  };

  // Listeners globales de window para drag & drop
  useEffect(() => {
    if (!activeElement) return;

    const onMouseMove = (e: MouseEvent) => {
      const deltaX =
        (e.clientX - dragStartMouse.current.x) / VISUAL_SCALE;
      const deltaY =
        (e.clientY - dragStartMouse.current.y) / VISUAL_SCALE;

      if (activeElement.type === 'text') {
        setTextBlocks((prev) =>
          prev.map((block) => {
            if (block.id !== activeElement.id) return block;
            if (activeElement.mode === 'drag') {
              return {
                ...block,
                x: dragStartDims.current.x + deltaX,
                y: dragStartDims.current.y - deltaY,
                isModified: true,
              };
            } else {
              return {
                ...block,
                width: Math.max(
                  20,
                  dragStartDims.current.width + deltaX
                ),
                isModified: true,
              };
            }
          })
        );
      } else if (activeElement.type === 'image') {
        setImageBlocks((prev) =>
          prev.map((block) => {
            if (block.id !== activeElement.id) return block;
            if (activeElement.mode === 'drag') {
              return {
                ...block,
                x: dragStartDims.current.x + deltaX,
                y: dragStartDims.current.y - deltaY,
              };
            } else {
              return {
                ...block,
                width: Math.max(
                  20,
                  dragStartDims.current.width + deltaX
                ),
                height: Math.max(
                  20,
                  dragStartDims.current.height - deltaY
                ),
              };
            }
          })
        );
      } else if (activeElement.type === 'embedded') {
        setEmbeddedImages((prev) =>
          prev.map((block) => {
            if (block.id !== activeElement.id) return block;
            if (activeElement.mode === 'drag') {
              return {
                ...block,
                x: dragStartDims.current.x + deltaX,
                y: dragStartDims.current.y - deltaY,
                isModified: true,
              };
            } else {
              return {
                ...block,
                width: Math.max(
                  20,
                  dragStartDims.current.width + deltaX
                ),
                height: Math.max(
                  20,
                  dragStartDims.current.height - deltaY
                ),
                isModified: true,
              };
            }
          })
        );
      }
    };

    const onMouseUp = () => {
      setActiveElement(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [activeElement]);

  // Guardar historial cuando termina un drag
  const prevActiveRef = useRef<ActiveElement | null>(null);
  useEffect(() => {
    if (prevActiveRef.current && !activeElement) {
      pushToHistory(textBlocks, imageBlocks, embeddedImages);
    }
    prevActiveRef.current = activeElement;
  }, [activeElement]);

  // ====== ATAJOS DE TECLADO ======

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    block: TextBlock
  ) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setTextBlocks((prev) =>
        prev.map((b) =>
          b.id === block.id
            ? {
                ...b,
                text: backupText.current,
                isModified:
                  backupText.current !== b.originalText,
              }
            : b
        )
      );
      setFocusedBlockId(null);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleInputFocus = (block: TextBlock) => {
    setFocusedBlockId(block.id);
    backupText.current = block.text;
  };

  const handleInputBlur = () => {
    setFocusedBlockId(null);
    pushToHistory(textBlocks, imageBlocks, embeddedImages);
  };

  // ====== GENERAR PDF FINAL ======

  /** Genera los bytes del PDF final con todos los cambios aplicados */
  const generateFinalPdf = async (): Promise<Uint8Array> => {
    const pdfBytesInput = pdfBytesRef.current!.slice().buffer as ArrayBuffer;
    const pdfDoc = await PDFDocument.load(pdfBytesInput);
    const page = pdfDoc.getPages()[currentPage - 1];

    // ── 0. Eliminar TODO el texto del content stream ──
    const stripTextFromStream = (streamObj: any) => {
      if (!streamObj || !streamObj.getContents) return;
      try {
        const compressed = streamObj.getContents();
        const filter = streamObj.dict?.get(PDFName.of('Filter'));
        const decoder = new TextDecoder('latin1');
        let text: string;

        if (filter?.toString() === '/FlateDecode') {
          text = decoder.decode(pako.inflate(new Uint8Array(compressed)));
        } else {
          text = decoder.decode(compressed);
        }

        const cleaned = text
          .replace(/BT\b[\s\S]*?ET\b/g, '')
          // Limpiar operadores de texto huérfanos fuera de BT...ET
          .replace(/\)[^\n]*?T[jJ]\s*/g, '')
          .replace(/\bET\b/g, '');

        // Codificar con latin1 (charCode 1:1 a byte)
        const newBytes = new Uint8Array(cleaned.length);
        for (let i = 0; i < cleaned.length; i++) {
          newBytes[i] = cleaned.charCodeAt(i) & 0xFF;
        }

        if (filter?.toString() === '/FlateDecode') {
          const recompressed = pako.deflate(newBytes);
          streamObj.contents = recompressed;
          streamObj.dict.set(
            PDFName.of('Length'),
            pdfDoc.context.obj(recompressed.length)
          );
        } else {
          streamObj.contents = newBytes;
          streamObj.dict.set(
            PDFName.of('Length'),
            pdfDoc.context.obj(newBytes.length)
          );
        }
      } catch {
        // Si falla un stream individual, ignorar
      }
    };

    const stripTextRecursive = (resEntry: any) => {
      const dict =
        resEntry && typeof resEntry.delete === 'function'
          ? resEntry
          : resEntry
            ? pdfDoc.context.lookup(resEntry)
            : null;
      if (!dict || typeof (dict as any).get !== 'function') return;

      const xobj = (dict as any).get(PDFName.of('XObject'));
      const xDict =
        xobj && typeof xobj.entries === 'function'
          ? xobj
          : xobj
            ? pdfDoc.context.lookup(xobj)
            : null;
      if (!xDict || !xDict.entries) return;

      for (const [, ref] of xDict.entries()) {
        const stream = pdfDoc.context.lookup(ref) as any;
        if (!stream?.dict) continue;

        const subtype = stream.dict.get(PDFName.of('Subtype'));
        if (subtype?.toString() !== '/Form') continue;

        stripTextFromStream(stream);
        const nestedRes = stream.dict.get(PDFName.of('Resources'));
        if (nestedRes) stripTextRecursive(nestedRes);
      }
    };

    // Limpiar texto de todos los content streams (soporta PDFArray)
    const contentsRef = page.node.get(PDFName.of('Contents'));
    const contentsObj = pdfDoc.context.lookup(contentsRef);

    if (contentsObj && typeof (contentsObj as any).size === 'function') {
      const arr = contentsObj as any;
      for (let i = 0; i < arr.size(); i++) {
        const ref = arr.get(i);
        const stream = pdfDoc.context.lookup(ref);
        stripTextFromStream(stream);
      }
    } else {
      stripTextFromStream(contentsObj);
    }

    const resources = page.node.get(PDFName.of('Resources'));
    stripTextRecursive(resources);

    // ── 1. Preparar fuentes ──
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdfDoc.embedFont(
      StandardFonts.HelveticaOblique
    );
    const fontBoldItalic = await pdfDoc.embedFont(
      StandardFonts.HelveticaBoldOblique
    );

    // ── 2. Manejar imágenes embebidas del PDF original ──
    for (const emb of embeddedImages) {
      if (emb.isDeleted || emb.isModified) {
        page.drawRectangle({
          x: emb.originalX,
          y: emb.originalY,
          width: emb.originalWidth,
          height: emb.originalHeight,
          color: rgb(1, 1, 1),
        });

        if (!emb.isDeleted && emb.pngDataUrl) {
          const response = await fetch(emb.pngDataUrl);
          const imgBytes = await response.arrayBuffer();
          const embeddedImg = await pdfDoc.embedPng(
            new Uint8Array(imgBytes)
          );
          page.drawImage(embeddedImg, {
            x: emb.x,
            y: emb.y,
            width: emb.width,
            height: emb.height,
          });
        }
      }
    }

    // ── 3. Re-estampar TODOS los textos en sus coordenadas actuales ──
    for (const block of textBlocks) {
      if (block.text.trim()) {
        let targetFont = fontRegular;
        if (block.isBold && block.isItalic) targetFont = fontBoldItalic;
        else if (block.isBold) targetFont = fontBold;
        else if (block.isItalic) targetFont = fontItalic;

        let textColor = rgb(0, 0, 0);
        if (block.color && block.color.startsWith('rgb')) {
          const m = block.color.match(/(\d+)/g);
          if (m && m.length >= 3) {
            textColor = rgb(
              parseInt(m[0]) / 255,
              parseInt(m[1]) / 255,
              parseInt(m[2]) / 255
            );
          }
        }

        page.drawText(block.text, {
          x: block.x,
          y: block.y,
          size: block.height,
          font: targetFont,
          color: textColor,
        });
      }
    }

    // ── 4. Estampar imágenes nuevas ──
    for (const img of imageBlocks) {
      const imgBytes = await img.file.arrayBuffer();
      const embeddedImg =
        img.file.type === 'image/png'
          ? await pdfDoc.embedPng(imgBytes)
          : await pdfDoc.embedJpg(imgBytes);
      page.drawImage(embeddedImg, {
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
      });
    }

    return await pdfDoc.save();
  };

  // ====== GUARDAR EN SERVIDOR ======

  const handleSaveToServer = async () => {
    if (!pdfLoaded) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const finalBytes = await generateFinalPdf();
      const blob = new Blob([finalBytes as BlobPart], { type: 'application/pdf' });
      await apiService.replaceDocumentPdf(
        documentId,
        blob,
        pdfFilename
      );
      setSaveSuccess(true);
      // Limpiar indicador de éxito después de 3 segundos
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error guardando PDF en servidor:', errorMsg, err);
      alert(t('errors.saveFailed', { error: errorMsg }));
    } finally {
      setIsSaving(false);
    }
  };

  // ====== DESCARGAR LOCALMENTE ======

  const handleDownload = async () => {
    if (!pdfLoaded) return;
    setIsProcessing(true);
    try {
      const finalBytes = await generateFinalPdf();
      const blob = new Blob([finalBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `editado_${pdfFilename}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error descargando PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Contadores de imágenes embebidas
  const activeEmbeddedCount = embeddedImages.filter(
    (img) => !img.isDeleted
  ).length;
  const deletedEmbeddedCount = embeddedImages.filter(
    (img) => img.isDeleted
  ).length;

  // ====== ESTADOS DE CARGA Y ERROR ======

  // Generar estilos según el tema actual
  const styles = getStyles(isDark);

  if (isLoadingDoc) {
    return (
      <div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <RefreshCw size={48} className="spin" style={{ color: '#a855f7' }} />
        <p style={{ color: '#64748b', marginTop: '16px', fontWeight: 600 }}>{t('loading.document')}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: '#fca5a5', fontSize: '16px', fontWeight: 600 }}>
          ❌ {loadError}
        </p>
        <button
          onClick={() => navigate(-1)}
          style={styles.backButton}
        >
          {t('errorScreen.backButton')}
        </button>
      </div>
    );
  }

  // ====== RENDER ======

  return (
    <div style={styles.container}>
      {/* ===== HEADER BAR ===== */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            onClick={() =>
              navigate(
                documentTypeId
                  ? `/document-type/${documentTypeId}`
                  : '/'
              )
            }
            style={styles.headerBackBtn}
            title={t('header.backTitle')}
          >
            <ArrowLeft size={18} />
          </button>
          <span style={styles.headerTitle}>{t('header.title')}</span>
          <span style={styles.headerFilename}>{pdfFilename}</span>
        </div>

        {pdfLoaded && (
          <div style={styles.headerCenter}>
            {/* Historial */}
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              style={styles.headerBtn}
              title={t('header.undo')}
            >
              ↩
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              style={styles.headerBtn}
              title={t('header.redo')}
            >
              ↪
            </button>

            <div style={styles.headerDivider} />

            {/* Paginación */}
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              style={styles.headerBtn}
              title={t('header.prevPage')}
            >
              ◀
            </button>
            <span style={styles.pageIndicator}>
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              style={styles.headerBtn}
              title={t('header.nextPage')}
            >
              ▶
            </button>
          </div>
        )}

        <div style={styles.headerRight}>
          {pdfLoaded && (
            <>
              <button
                onClick={handleDownload}
                disabled={isProcessing}
                style={styles.headerDownloadBtn}
                title={t('header.downloadTitle')}
              >
                <Download size={16} />
                <span>
                  {isProcessing ? t('header.downloadProcessing') : t('header.download')}
                </span>
              </button>
              <button
                onClick={handleSaveToServer}
                disabled={isSaving}
                style={{
                  ...styles.headerSaveBtn,
                  ...(saveSuccess
                    ? styles.headerSaveBtnSuccess
                    : {}),
                }}
                title={t('header.saveTitle')}
              >
                <Save size={16} />
                <span>
                  {isSaving
                    ? t('header.saving')
                    : saveSuccess
                      ? t('header.saved')
                      : t('header.save')}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===== SIDEBAR (herramientas) ===== */}
      {pdfLoaded && (
        <div style={styles.sidebar}>
          {/* Imágenes embebidas del PDF */}
          {embeddedImages.length > 0 && (
            <>
              <h4
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '13px',
                  color: '#e2e8f0',
                }}
              >
                {t('sidebar.embeddedImagesTitle', { count: activeEmbeddedCount })}
              </h4>
              <div style={styles.embeddedList}>
                {embeddedImages.map((img, idx) => (
                  <div
                    key={img.id}
                    style={{
                      ...styles.embeddedItem,
                      opacity: img.isDeleted ? 0.5 : 1,
                    }}
                  >
                    <img
                      src={img.src}
                      alt={t('sidebar.embeddedAlt', { index: idx + 1 })}
                      style={styles.embeddedThumb}
                    />
                    <div style={{ flex: 1, fontSize: '12px' }}>
                      <div
                        style={{
                          fontWeight: 'bold',
                            color: img.isDeleted
                            ? '#fca5a5'
                            : '#e2e8f0',
                        }}
                      >
                        {img.isDeleted
                          ? t('sidebar.deletedLabel')
                          : t('sidebar.imageLabel', { index: idx + 1 })}
                      </div>
                      <div style={{ color: '#64748b' }}>
                        {Math.round(img.width)}×
                        {Math.round(img.height)}
                      </div>
                    </div>
                    {img.isDeleted ? (
                      <button
                        style={styles.embRestoreBtn}
                        onClick={() =>
                          handleRestoreEmbedded(img.id)
                        }
                        title={t('sidebar.restore')}
                      >
                        ↩
                      </button>
                    ) : (
                      <button
                        style={styles.embDeleteBtn}
                        onClick={() =>
                          handleDeleteEmbedded(img.id)
                        }
                        title={t('sidebar.delete')}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {deletedEmbeddedCount > 0 && (
                <div
                  style={{
                    fontSize: '11px',
                    color: '#ef4444',
                    marginTop: '6px',
                    fontWeight: '500',
                  }}
                >
                  {t('sidebar.deletedCount', { count: deletedEmbeddedCount })}
                </div>
              )}
              <hr style={styles.divider} />
            </>
          )}

          <label style={styles.uploadImgLabel}>
            {t('sidebar.addImage')}
            <input
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleAddImage}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}

      {/* ===== EDITOR AREA ===== */}
      <div style={styles.previewContainer}>
        {pdfLoaded ? (
          <div
            style={{
              ...styles.editorWrapper,
              width: pdfDims.width * VISUAL_SCALE,
              height: pdfDims.height * VISUAL_SCALE,
            }}
          >
            <canvas ref={canvasRef} style={styles.canvas} />

            <div style={styles.domOverlay}>
              {/* Máscaras para imágenes embebidas eliminadas o movidas */}
              {embeddedImages.map((img) => {
                const hasMoved =
                  img.isModified &&
                  (Math.abs(img.x - img.originalX) > 1 ||
                    Math.abs(img.y - img.originalY) > 1 ||
                    Math.abs(img.width - img.originalWidth) >
                      1 ||
                    Math.abs(img.height - img.originalHeight) >
                      1);
                if (!img.isDeleted && !hasMoved) return null;
                return (
                  <div
                    key={`emb-mask-${img.id}`}
                    style={{
                      position: 'absolute',
                      left: `${img.originalX * VISUAL_SCALE}px`,
                      top: `${(pdfDims.height - img.originalY - img.originalHeight) * VISUAL_SCALE}px`,
                      width: `${img.originalWidth * VISUAL_SCALE}px`,
                      height: `${img.originalHeight * VISUAL_SCALE}px`,
                      backgroundColor: '#fff',
                      zIndex: 2,
                      pointerEvents: 'none',
                      border: img.isDeleted
                        ? '2px dashed #ef4444'
                        : 'none',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    {img.isDeleted && (
                      <span
                        style={{
                          color: '#ef4444',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}
                      >
                        🗑️ ELIMINADA
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Render de imágenes (embebidas + nuevas) */}
              {[
                ...embeddedImages
                  .filter((img) => !img.isDeleted)
                  .map((img) => ({
                    ...img,
                    type: 'embedded' as const,
                  })),
                ...imageBlocks.map((img) => ({
                  ...img,
                  type: 'image' as const,
                  isModified: false,
                })),
              ].map((img) => {
                const domLeft = img.x * VISUAL_SCALE;
                const domTop =
                  (pdfDims.height - img.y - img.height) *
                  VISUAL_SCALE;
                const isEmbedded = img.type === 'embedded';
                const borderColor = isEmbedded
                  ? img.isModified
                    ? '#f59e0b'
                    : 'transparent'
                  : '#2563eb';
                const dragColor = isEmbedded
                  ? '#f59e0b'
                  : '#2563eb';

                return (
                  <div
                    key={`${img.type}-${img.id}`}
                    className="emb-wrapper"
                    style={{
                      position: 'absolute',
                      left: `${domLeft}px`,
                      top: `${domTop}px`,
                      width: `${img.width * VISUAL_SCALE}px`,
                      height: `${img.height * VISUAL_SCALE}px`,
                      zIndex: 6,
                      border: `2px solid ${borderColor}`,
                      boxSizing: 'border-box',
                    }}
                  >
                    <img
                      src={img.src}
                      draggable={false}
                      style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        objectFit: isEmbedded
                          ? 'fill'
                          : 'contain',
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}
                      alt=""
                    />

                    {/* Overlay de drag */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        cursor: 'move',
                        zIndex: 100,
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleInteractionStart(
                          e,
                          img.id,
                          img.type,
                          'drag',
                          img
                        );
                      }}
                    />

                    <div
                      className="emb-controls"
                      style={{
                        ...styles.embControlsBar,
                        zIndex: 101,
                      }}
                    >
                      <span
                        style={{
                          ...styles.embDragHandle,
                          backgroundColor: dragColor,
                        }}
                      >
                        {t('canvas.moveLabel')}
                      </span>
                      <button
                        className="emb-del-btn"
                        onMouseDown={(e) =>
                          e.stopPropagation()
                        }
                        onClick={() =>
                          isEmbedded
                            ? handleDeleteEmbedded(img.id)
                            : handleDeleteImage(img.id)
                        }
                        style={styles.embDelBtn}
                        title={t('canvas.deleteImage')}
                      >
                        🗑
                      </button>
                    </div>

                    <div
                      className="emb-resize"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleInteractionStart(
                          e,
                          img.id,
                          img.type,
                          'resize',
                          img
                        );
                      }}
                      style={{
                        ...styles.embResizeHandle,
                        backgroundColor: dragColor,
                        zIndex: 102,
                      }}
                      title={t('canvas.resize')}
                    />

                    {img.isModified && (
                      <div
                        style={{
                          ...styles.embSizeIndicator,
                          zIndex: 101,
                        }}
                      >
                        {Math.round(img.width)}×
                        {Math.round(img.height)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Render de textos editables */}
              {textBlocks.map((block) => {
                const domLeft = block.x * VISUAL_SCALE;
                const domTop =
                  (pdfDims.height - block.y - block.height) *
                    VISUAL_SCALE -
                  1.5;
                const isFocused = focusedBlockId === block.id;

                return (
                  <div
                    key={block.id}
                    className="block-wrapper"
                    style={{
                      position: 'absolute',
                      left: `${domLeft}px`,
                      top: `${domTop}px`,
                      height: `${block.height * VISUAL_SCALE + 4}px`,
                      display: 'flex',
                      zIndex: isFocused ? 10 : 3,
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      className="drag-handle"
                      onMouseDown={(e) =>
                        handleInteractionStart(
                          e,
                          block.id,
                          'text',
                          'drag',
                          block
                        )
                      }
                      style={{
                        ...styles.dragHandle,
                        pointerEvents: 'auto',
                      }}
                    >
                      ⠿
                    </div>
                    <input
                      type="text"
                      value={block.text}
                      onFocus={() =>
                        handleInputFocus(block)
                      }
                      onBlur={handleInputBlur}
                      onKeyDown={(e) =>
                        handleKeyDown(e, block)
                      }
                      onChange={(e) =>
                        handleInputChange(
                          block.id,
                          e.target.value
                        )
                      }
                      style={{
                        ...styles.inlineInput,
                        width: `${block.width * VISUAL_SCALE + 8}px`,
                        height: '100%',
                        fontSize: `${block.height * VISUAL_SCALE}px`,
                        fontFamily: block.fontFamily,
                        fontWeight: block.isBold
                          ? 'bold'
                          : 'normal',
                        fontStyle: block.isItalic
                          ? 'italic'
                          : 'normal',
                        background: 'transparent',
                        color: block.color || '#000',
                        pointerEvents: 'auto',
                      }}
                    />
                    <div
                      className="resize-handle"
                      onMouseDown={(e) =>
                        handleInteractionStart(
                          e,
                          block.id,
                          'text',
                          'resize',
                          block
                        )
                      }
                      style={{
                        ...styles.resizeHandle,
                        pointerEvents: 'auto',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={styles.noPdf}>
            {t('loading.pdf')}
          </div>
        )}
      </div>

      {/* CSS dinámico para hover effects */}
      <style>{`
        .block-wrapper:hover .drag-handle,
        .block-wrapper:hover .resize-handle {
          display: flex !important;
        }
        .block-wrapper:hover input {
          border-color: rgba(37, 99, 235, 0.4) !important;
          background-color: rgba(255, 255, 255, 0.5) !important;
        }
        .emb-wrapper:hover .emb-controls {
          display: flex !important;
        }
        .emb-wrapper:hover .emb-resize {
          display: block !important;
        }
        .emb-wrapper:hover {
          border-color: #f59e0b !important;
        }
      `}</style>
    </div>
  );
};

export default PdfEditor;


// ====== ESTILOS INLINE ======

const getStyles = (dark: boolean): Record<string, React.CSSProperties> => ({
  // Loading
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#0b0f19',
    color: '#f1f5f9',
    gap: '16px',
  },
  loadingSpinner: {
    fontSize: '48px',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '16px',
    color: '#94a3b8',
  },
  backButton: {
    padding: '10px 20px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: '#cbd5e1',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    marginTop: '8px',
    transition: 'all 0.2s ease',
  },

  // Layout
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    backgroundColor: dark ? '#0b0f19' : '#f8fafc',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: dark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(12px)',
    padding: '0 24px',
    height: '56px',
    minHeight: '56px',
    zIndex: 30,
    borderBottom: dark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.06)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  headerBackBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    backgroundColor: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    color: dark ? '#cbd5e1' : '#475569',
    border: dark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  headerTitle: {
    fontSize: '16px',
    fontWeight: '700',
    letterSpacing: '-0.3px',
    color: dark ? '#fff' : '#1e293b',
  },
  headerFilename: {
    color: '#64748b',
    fontSize: '13px',
    fontWeight: '400',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    color: dark ? '#cbd5e1' : '#475569',
    border: dark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
    transition: 'all 0.2s ease',
  },
  headerDivider: {
    width: '1px',
    height: '24px',
    backgroundColor: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    margin: '0 6px',
  },
  pageIndicator: {
    color: dark ? '#e2e8f0' : '#1e293b',
    fontSize: '13px',
    fontWeight: '600',
    minWidth: '60px',
    textAlign: 'center',
    backgroundColor: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    padding: '6px 14px',
    borderRadius: '8px',
    border: dark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerDownloadBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    backgroundColor: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    color: dark ? '#cbd5e1' : '#475569',
    border: dark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
  },
  headerSaveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 20px',
    background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(168, 85, 247, 0.25)',
  },
  headerSaveBtnSuccess: {
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
  },

  // Sidebar
  sidebar: {
    position: 'fixed',
    top: '66px',
    right: '14px',
    width: '260px',
    backgroundColor: dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(16px)',
    padding: '16px',
    borderRadius: '12px',
    border: dark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
    boxShadow: dark ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(0, 0, 0, 0.08)',
    zIndex: 25,
    maxHeight: 'calc(100vh - 85px)',
    overflowY: 'auto',
    color: dark ? '#e2e8f0' : '#334155',
  },
  divider: {
    border: '0',
    height: '1px',
    background: dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
    margin: '12px 0',
  },
  uploadImgLabel: {
    display: 'block',
    padding: '14px',
    backgroundColor: dark ? 'rgba(168, 85, 247, 0.08)' : 'rgba(168, 85, 247, 0.05)',
    border: '1px dashed rgba(168, 85, 247, 0.4)',
    borderRadius: '8px',
    textAlign: 'center',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    color: dark ? '#c084fc' : '#7c3aed',
    transition: 'all 0.2s ease',
  },
  embeddedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  embeddedItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    borderRadius: '8px',
    border: dark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
    backgroundColor: dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
    transition: 'all 0.2s ease',
  },
  embeddedThumb: {
    width: '40px',
    height: '40px',
    objectFit: 'cover',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    flexShrink: 0,
  },
  embRestoreBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    fontSize: '12px',
    padding: '4px 10px',
    cursor: 'pointer',
    borderRadius: '6px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
  },
  embDeleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    color: '#fca5a5',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    fontSize: '12px',
    padding: '4px 10px',
    cursor: 'pointer',
    borderRadius: '6px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
  },

  // Editor area
  previewContainer: {
    flex: 1,
    padding: '30px',
    overflow: 'auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    backgroundColor: dark ? '#0b0f19' : '#e2e8f0',
  },
  editorWrapper: {
    position: 'relative',
    boxShadow: dark
      ? '0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
      : '0 8px 32px rgba(0, 0, 0, 0.12)',
    backgroundColor: '#fff',
    borderRadius: '4px',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  domOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 2,
  },
  inlineInput: {
    border: '1px solid transparent',
    padding: '0px',
    margin: '0px',
    outline: 'none',
    boxSizing: 'border-box',
    lineHeight: 1,
  },
  dragHandle: {
    backgroundColor: '#a855f7',
    color: '#fff',
    fontSize: '10px',
    width: '14px',
    height: '100%',
    display: 'none',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'move',
    userSelect: 'none',
    borderRadius: '3px 0 0 3px',
  },
  resizeHandle: {
    width: '6px',
    height: '100%',
    backgroundColor: '#a855f7',
    cursor: 'ew-resize',
    display: 'none',
    borderRadius: '0 3px 3px 0',
  },

  // Controles para imágenes embebidas
  embControlsBar: {
    position: 'absolute',
    top: '-28px',
    left: 0,
    right: 0,
    display: 'none',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '4px',
  },
  embDragHandle: {
    backgroundColor: '#a855f7',
    color: '#fff',
    fontSize: '11px',
    padding: '4px 10px',
    cursor: 'move',
    borderRadius: '6px 6px 0 0',
    userSelect: 'none',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  embDelBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    color: '#fff',
    border: 'none',
    fontSize: '13px',
    padding: '4px 10px',
    cursor: 'pointer',
    borderRadius: '6px 6px 0 0',
    fontWeight: '600',
    transition: 'all 0.2s ease',
  },
  embResizeHandle: {
    position: 'absolute',
    bottom: '-5px',
    right: '-5px',
    width: '12px',
    height: '12px',
    backgroundColor: '#a855f7',
    cursor: 'se-resize',
    borderRadius: '50%',
    border: '2px solid #fff',
    display: 'none',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
  },
  embSizeIndicator: {
    position: 'absolute',
    bottom: '4px',
    left: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#e2e8f0',
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    pointerEvents: 'none',
    fontWeight: '500',
  },

  noPdf: {
    color: '#64748b',
    fontSize: '16px',
    marginTop: '30vh',
    fontWeight: '500',
  },
});
