import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ZoomIn, ZoomOut, RotateCcw, Save, RefreshCw, BookOpen, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { apiService, LABEL_TIPOS } from '../services/api';
import type { Document, Label } from '../services/api';
import './Etiquetado.css';

// Structure of an annotation box
interface Annotation {
  id: number;
  pagina: number;
  clase: string;
  coordenadas_porcentaje: {
    x: number;
    y: number;
    ancho: number;
    alto: number;
  };
}

// Structure of a toast notification message
interface ToastNotification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

// Structure for the custom confirmation modal state
interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

/**
 * Componente de Etiquetado de Documentos en React.
 * Replíca la lógica de etiquetado.html para dibujar recuadros de metadatos en un PDF,
 * consumiendo las etiquetas cargadas por el usuario dinámicamente en el proyecto.
 */
export const Etiquetado: React.FC = () => {
  const { t } = useTranslation('etiquetado');
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);

  // Estados del documento
  const [documentMeta, setDocumentMeta] = useState<Document | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [anotaciones, setAnotaciones] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusText, setStatusText] = useState(t('loading.document'));

  // PDF.js instances
  const [pdfInstance, setPdfInstance] = useState<any>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1.30);

  // Labels selection
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startCoords, setStartCoords] = useState<{ x: number; y: number } | null>(null);
  const [previewBox, setPreviewBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  
  // Bounding box selection for resizing/deletion
  const [editableId, setEditableId] = useState<number | null>(null);

  // JSON Console state
  const [jsonText, setJsonText] = useState('[]');
  const [jsonConsoleEdited, setJsonConsoleEdited] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  // Toast notifications state
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Trigger a modern toast notification message
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Canvas and overlay references
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Show a custom confirmation dialog modal
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };
 
  // Drag and Drop for labels
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
 
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };
 
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
 
    const newLabels = [...labels];
    const draggedItem = newLabels[draggedIndex];
    newLabels.splice(draggedIndex, 1);
    newLabels.splice(index, 0, draggedItem);
    
    setDraggedIndex(index);
    setLabels(newLabels);
  };
 
  const handleDragEnd = async () => {
    setDraggedIndex(null);
    try {
      const orders = labels.map((lbl, idx) => ({ id: lbl.id, order: idx }));
      await apiService.reorderLabels(orders);
    } catch (err) {
      console.error('Error saving label order:', err);
    }
  };
 
  // Show a custom confirmation dialog modal
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingLayerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Dimensiones reales del canvas para sincronizar la capa de dibujo
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Map of HSL colors for each class name
  const getLabelColor = (labelName: string) => {
    const idx = labels.findIndex(l => l.name === labelName);
    if (idx === -1) return '#10b981'; // default emerald green
    const hue = idx * (360 / Math.max(1, labels.length));
    return `hsl(${hue}, 75%, 45%)`;
  };

  // 1. Fetch document metadata, project labels, and initial annotations
  useEffect(() => {
    let isMounted = true;

    const loadDoc = async () => {
      try {
        const doc = await apiService.getDocument(docId);
        if (!isMounted) return;
        setDocumentMeta(doc);
        
        // Parse annotations from json_data
        let initialAnots: Annotation[] = [];
        if (Array.isArray(doc.json_data)) {
          initialAnots = doc.json_data as Annotation[];
        }
        setAnotaciones(initialAnots);
        setJsonText(JSON.stringify(initialAnots, null, 2));

        // Fetch labels for the document's document_type
        const documentTypeLabels = await apiService.getLabels(doc.document_type);
        if (!isMounted) return;
        setLabels(documentTypeLabels);
        if (documentTypeLabels.length > 0) {
          setActiveLabel(documentTypeLabels[0].name);
        }

        // Load PDF.js script setup
        // @ts-ignore
        const pdfjsLib = window.pdfjsLib;
        if (!pdfjsLib) {
          throw new Error('PDF.js library is not loaded. Refreshing index.html may be required.');
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

        // Load PDF (cache-busting para cargar versión más reciente tras edición)
        setStatusText(t('loading.pdf'));
        const pdfUrlCacheBust = `${doc.pdf}${doc.pdf.includes('?') ? '&' : '?'}_t=${Date.now()}`;
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrlCacheBust });
        
        loadingTask.promise.then((pdf: any) => {
          if (!isMounted) return;
          setPdfInstance(pdf);
          setNumPages(pdf.numPages);
          setPageNumber(1);
          setStatusText(t('status.documentName', { name: getFileName(doc.pdf) }));
          setIsLoading(false);
        }).catch((err: any) => {
          if (!isMounted) return;
          console.error(err);
          // Handle Password protected PDF
          if (err.name === 'PasswordException') {
            const pwd = prompt(t('prompts.passwordPrompt'));
            if (pwd) {
              setStatusText(t('loading.withPassword'));
              const taskWithPwd = pdfjsLib.getDocument({ url: doc.pdf, password: pwd });
              taskWithPwd.promise.then((pdf: any) => {
                if (!isMounted) return;
                setPdfInstance(pdf);
                setNumPages(pdf.numPages);
                setPageNumber(1);
                setStatusText(t('status.documentName', { name: getFileName(doc.pdf) }));
                setIsLoading(false);
              }).catch((e: any) => {
                if (!isMounted) return;
                 showToast(t('toasts.wrongPassword', { message: e.message }), 'error');
                 setStatusText(t('status.passwordError'));
              });
            } else {
              setStatusText(t('status.passwordCancelled'));
            }
          } else {
            setStatusText(t('status.pdfError', { message: err.message }));
          }
        });

      } catch (err: unknown) {
        if (!isMounted) return;
        console.error('Error loading document details:', err);
        setStatusText(t('status.metadataError'));
      }
    };

    if (docId) {
      loadDoc();
    }

    return () => {
      isMounted = false;
    };
  }, [docId]);

  // 2. Render PDF Page on canvas whenever page or zoom changes
  useEffect(() => {
    if (!pdfInstance) return;

    let isCurrent = true;

    const renderPage = async () => {
      try {
        const page = await pdfInstance.getPage(pageNumber);
        if (!isCurrent) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Cancel previous render task if still running
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (e) {
            // Ignore error from already finished/cancelled task
          }
        }

        const viewport = page.getViewport({ scale: zoom });
        // Redondear para evitar desajustes subpixel entre canvas y overlay
        const w = Math.floor(viewport.width);
        const h = Math.floor(viewport.height);
        canvas.width = w;
        canvas.height = h;

        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = renderTask;

        await renderTask.promise;

        if (isCurrent) {
          renderTaskRef.current = null;
          // Sincronizar tamaño del overlay con las dimensiones reales del canvas
          setCanvasSize({ width: w, height: h });
        }
      } catch (err: any) {
        // Ignore cancellation exceptions thrown by PDF.js
        if (err.name === 'RenderingCancelledException' || err.message?.includes('cancelled')) {
          return;
        }
        console.error('Error rendering page:', err);
      }
    };

    renderPage();

    return () => {
      isCurrent = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [pdfInstance, pageNumber, zoom]);

  // 3. Keep JSON Console text area updated when annotations state changes (unless edited by user)
  useEffect(() => {
    if (!jsonConsoleEdited) {
      setJsonText(JSON.stringify(anotaciones, null, 2));
    }
  }, [anotaciones, jsonConsoleEdited]);

  // 4. Hotkeys (1-9) to select labels quickly from dynamic list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if focusing textarea or inputs
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
        return;
      }

      const keyVal = parseInt(e.key);
      if (keyVal >= 1 && keyVal <= 9) {
        setLabels((currentLabels) => {
          const targetLabel = currentLabels[keyVal - 1];
          if (targetLabel) {
            setActiveLabel(targetLabel.name);
          }
          return currentLabels;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Load saved zoom level when documentMeta is loaded
  useEffect(() => {
    if (documentMeta) {
      const savedZoom = localStorage.getItem(`kortex_zoom_doc_type_${documentMeta.document_type}`);
      if (savedZoom) {
        const parsedZoom = parseFloat(savedZoom);
        if (!isNaN(parsedZoom)) {
          setZoom(parsedZoom);
        }
      }
    }
  }, [documentMeta]);

  // Save zoom level when zoom level changes
  useEffect(() => {
    if (documentMeta && zoom) {
      localStorage.setItem(`kortex_zoom_doc_type_${documentMeta.document_type}`, String(zoom));
    }
  }, [zoom, documentMeta]);

  const getFileName = (url: string) => {
    const decoded = decodeURIComponent(url);
    const parts = decoded.split('/');
    return parts[parts.length - 1] || t('defaults.fileName');
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom(prev => Math.min(3.0, parseFloat((prev + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, parseFloat((prev - 0.15).toFixed(2))));

  // Page handlers
  const handleNextPage = () => {
    if (pageNumber < numPages) {
      setPageNumber(prev => prev + 1);
      setEditableId(null);
    }
  };
  const handlePrevPage = () => {
    if (pageNumber > 1) {
      setPageNumber(prev => prev - 1);
      setEditableId(null);
    }
  };

  // Reset Canvas annotations with a beautiful custom modal
  const handleResetAll = () => {
    showConfirm(
      t('confirmModal.resetTitle'),
      t('confirmModal.resetMessage'),
      () => {
        setAnotaciones([]);
        setJsonConsoleEdited(false);
        showToast(t('toasts.allBoxesDeleted'), 'info');
      }
    );
  };

  // Bounding box draw mouse events
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // only draw when clicking layer itself
    
    if (labels.length === 0) {
      showToast(t('toasts.mustConfigureLabel'), 'warning');
      return;
    }

    if (!activeLabel) {
      showToast(t('toasts.selectLabelFirst'), 'warning');
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartCoords({ x, y });
    setPreviewBox({ x, y, w: 0, h: 0 });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startCoords) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const xActual = e.clientX - rect.left;
    const yActual = e.clientY - rect.top;

    const x = Math.min(startCoords.x, xActual);
    const y = Math.min(startCoords.y, yActual);
    const w = Math.abs(startCoords.x - xActual);
    const h = Math.abs(startCoords.y - yActual);

    setPreviewBox({ x, y, w, h });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startCoords) return;
    setIsDrawing(false);
    setPreviewBox(null);

    const rect = e.currentTarget.getBoundingClientRect();
    const xFin = e.clientX - rect.left;
    const yFin = e.clientY - rect.top;

    const x = Math.min(startCoords.x, xFin);
    const y = Math.min(startCoords.y, yFin);
    const w = Math.abs(startCoords.x - xFin);
    const h = Math.abs(startCoords.y - yFin);

    // Bounding box must be at least 6x6 px
    if (w > 6 && h > 6 && activeLabel) {
      const xPct = parseFloat(((x / rect.width) * 100).toFixed(2));
      const yPct = parseFloat(((y / rect.height) * 100).toFixed(2));
      const wPct = parseFloat(((w / rect.width) * 100).toFixed(2));
      const hPct = parseFloat(((h / rect.height) * 100).toFixed(2));

      const newAnot: Annotation = {
        id: Date.now(),
        pagina: pageNumber,
        clase: activeLabel,
        coordenadas_porcentaje: { x: xPct, y: yPct, ancho: wPct, alto: hPct }
      };

      setAnotaciones(prev => [...prev, newAnot]);
      setJsonConsoleEdited(false);
    }
  };

  // Resize bounding box handles: supports both bottom-right ('br') and top-left ('tl') corners
  const handleStartResize = (e: React.MouseEvent, id: number, direction: 'tl' | 'br') => {
    const anot = anotaciones.find(a => a.id === id);
    if (!anot) return;

    const rect = drawingLayerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Position and dimensions in pixels
    const xPx = (anot.coordenadas_porcentaje.x / 100) * rect.width;
    const yPx = (anot.coordenadas_porcentaje.y / 100) * rect.height;
    const wPx = (anot.coordenadas_porcentaje.ancho / 100) * rect.width;
    const hPx = (anot.coordenadas_porcentaje.alto / 100) * rect.height;

    // Calculate static corners (the opposite corner remains static during resize)
    const brX = xPx + wPx;
    const brY = yPx + hPx;

    const mouseXOriginal = e.clientX;
    const mouseYOriginal = e.clientY;

    const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - mouseXOriginal;
      const deltaY = moveEvent.clientY - mouseYOriginal;

      let newX = xPx;
      let newY = yPx;
      let newW = wPx;
      let newH = hPx;

      if (direction === 'br') {
        newW = Math.max(10, wPx + deltaX);
        newH = Math.max(10, hPx + deltaY);
      } else { // 'tl' direction
        newX = Math.max(0, Math.min(xPx + deltaX, brX - 10));
        newY = Math.max(0, Math.min(yPx + deltaY, brY - 10));
        newW = brX - newX;
        newH = brY - newY;
      }

      setAnotaciones(prev => prev.map(a => {
        if (a.id === id) {
          return {
            ...a,
            coordenadas_porcentaje: {
              ...a.coordenadas_porcentaje,
              x: parseFloat(((newX / rect.width) * 100).toFixed(2)),
              y: parseFloat(((newY / rect.height) * 100).toFixed(2)),
              ancho: parseFloat(((newW / rect.width) * 100).toFixed(2)),
              alto: parseFloat(((newH / rect.height) * 100).toFixed(2))
            }
          };
        }
        return a;
      }));
      setJsonConsoleEdited(false);
    };

    const handleGlobalMouseUp = () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
  };

  // Delete annotation box
  const handleDeleteBox = (id: number) => {
    setAnotaciones(prev => prev.filter(a => a.id !== id));
    setEditableId(null);
    setJsonConsoleEdited(false);
  };

  // Apply Changes from raw JSON Text Area
  const handleApplyJsonChanges = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        showToast(t('toasts.jsonMustBeArray'), 'error');
        return;
      }

      // Add default attributes if missing
      const cleanData: Annotation[] = parsed.map((a: any) => ({
        id: a.id || (Date.now() + Math.floor(Math.random() * 1000)),
        pagina: a.pagina || 1,
        clase: a.clase || (labels[0]?.name || t('defaults.labelName')),
        coordenadas_porcentaje: a.coordenadas_porcentaje || { x: 10, y: 10, ancho: 10, alto: 10 }
      }));

      setAnotaciones(cleanData);
      setJsonConsoleEdited(false);
      showToast(t('toasts.jsonApplied'), 'success');
    } catch (err: unknown) {
      if (err instanceof Error) {
        showToast(t('toasts.jsonFormatError', { message: err.message }), 'error');
      } else {
        showToast(t('toasts.jsonProcessError'), 'error');
      }
    }
  };

  // Save changes to database (PATCH API call)
  const handleSaveToDatabase = async () => {
    setStatusText(t('status.savingAnnotations'));
    try {
      // Validate JSON syntax first
      const parsedJson = JSON.parse(jsonText);
      await apiService.updateDocument(docId, parsedJson);
      setStatusText(t('status.documentName', { name: getFileName(documentMeta?.pdf || '') }));
      setJsonConsoleEdited(false);
      showToast(t('toasts.saveSuccess'), 'success');
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof SyntaxError) {
        showToast(t('toasts.jsonSyntaxError'), 'error');
      } else {
        showToast(t('toasts.saveFailed'), 'error');
      }
      setStatusText(t('status.saveError'));
    }
  };

  // Filtered labels on sidebar
  const filteredLabels = labels.filter(label => 
    label.name.toUpperCase().includes(searchQuery.toUpperCase())
  );

  if (isLoading && !documentMeta) {
    return (
      <div className="etiquetado-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: '#64748b' }}>{t('loading.studio')}</p>
      </div>
    );
  }

  return (
    <div className="etiquetado-container">
      {/* Sidebar de etiquetas */}
      <div className="etiquetado-sidebar">
        <div className="sidebar-section">
          <h3>{t('sidebar.filterTitle')}</h3>
          <input
            type="text"
            className="sidebar-search"
            placeholder={t('sidebar.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <h3 className="label-list-title">{t('sidebar.classesTitle', { count: labels.length })}</h3>
        
        <div className="labels-list">
          {labels.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', marginTop: '24px', padding: '16px', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 10px 0' }}>{t('sidebar.noLabelsConfigured')}</p>
              <Link to={documentMeta ? `/document-type/${documentMeta.document_type}` : '/'} style={{ color: '#a855f7', textDecoration: 'underline', fontWeight: 600 }}>
                {t('sidebar.configureLabels')}
              </Link>
            </div>
          ) : (
            filteredLabels.map((label) => {
              const color = getLabelColor(label.name);
              const isActive = activeLabel === label.name;
              const tipoInfo = LABEL_TIPOS.find(t => t.value === label.tipo) || LABEL_TIPOS[0];
              
              // Find index in the original labels array for correct reordering
              const originalIndex = labels.findIndex(l => l.id === label.id);
              
              return (
                <div
                  key={label.id}
                  className={`label-card ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveLabel(label.name)}
                  draggable={!searchQuery}
                  onDragStart={() => handleDragStart(originalIndex)}
                  onDragOver={(e) => handleDragOver(e, originalIndex)}
                  onDragEnd={handleDragEnd}
                  style={{
                    opacity: draggedIndex === originalIndex ? 0.5 : 1,
                    cursor: searchQuery ? 'pointer' : 'grab',
                    padding: '6px 12px',
                    minHeight: '36px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    {!searchQuery && <GripVertical size={12} style={{ color: '#4b5563', flexShrink: 0 }} />}
                    <span style={{ fontSize: '14px', flexShrink: 0 }} title={tipoInfo.label}>
                      {tipoInfo.icon}
                    </span>
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#fff' : '#f1f5f9',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {label.name}
                    </span>
                  </div>
                  <span className="label-badge" style={{ backgroundColor: color, flexShrink: 0 }} />
                </div>
              );
            })
          )}
        </div>

        <div className="sidebar-section" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.03)' }}>
          <p style={{ fontStyle: 'italic', fontSize: '11px', color: '#64748b', margin: 0 }}>
            {t('sidebar.hotkeyTip')}
          </p>
        </div>
      </div>

      {/* Workspace central */}
      <div className="etiquetado-main">
        {/* Topbar */}
        <div className="etiquetado-topbar">
          <Link to={documentMeta ? `/document-type/${documentMeta.document_type}` : '/'} className="btn-back-link" title={t('topbar.backTitle')}>
            <ArrowLeft size={18} />
          </Link>

          {/* Pagination */}
          <div className="control-bar">
            <button className="btn-control" onClick={handlePrevPage} disabled={pageNumber <= 1}>
              ◀
            </button>
            <span className="control-val">{t('topbar.pageIndicator', { page: pageNumber, total: numPages })}</span>
            <button className="btn-control" onClick={handleNextPage} disabled={pageNumber >= numPages}>
              ▶
            </button>
          </div>

          {/* Zoom */}
          <div className="control-bar">
            <button className="btn-control" onClick={handleZoomOut}>
              <ZoomOut size={16} />
            </button>
            <span className="control-val" style={{ minWidth: '50px' }}>{Math.round(zoom * 100)}%</span>
            <button className="btn-control" onClick={handleZoomIn}>
              <ZoomIn size={16} />
            </button>
          </div>

          <button onClick={handleResetAll} className="btn-logout" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.15)', padding: '6px 12px', fontSize: '13px' }}>
            <RotateCcw size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            <span>{t('topbar.clearAll')}</span>
          </button>

          {/* Global Save Changes button moved to topbar for enhanced UX accessibility */}
          <button onClick={handleSaveToDatabase} className="btn-primary" style={{ padding: '6px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Save size={14} />
            <span>{t('topbar.saveChanges')}</span>
          </button>

          <div className="status-indicator">
            {statusText}
          </div>
        </div>

        {/* Visor de PDF */}
        <div className="pdf-viewer-area">
          {pdfInstance ? (
            <div id="contenedor-pdf" style={{ position: 'relative', display: 'inline-block' }}>
              <canvas ref={canvasRef}></canvas>
              <div
                ref={drawingLayerRef}
                id="capa-dibujo"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: canvasSize.width > 0 ? `${canvasSize.width}px` : '100%',
                  height: canvasSize.height > 0 ? `${canvasSize.height}px` : '100%',
                  cursor: 'crosshair',
                  pointerEvents: 'auto'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                {/* Visualizar recuadros */}
                {anotaciones.filter(a => a.pagina === pageNumber).map((anot) => {
                  const color = getLabelColor(anot.clase);
                  const isEditable = editableId === anot.id;
                  return (
                    <div
                      key={anot.id}
                      className={`caja-anotada ${isEditable ? 'editable' : ''}`}
                      style={{
                        position: 'absolute',
                        left: `${anot.coordenadas_porcentaje.x}%`,
                        top: `${anot.coordenadas_porcentaje.y}%`,
                        width: `${anot.coordenadas_porcentaje.ancho}%`,
                        height: `${anot.coordenadas_porcentaje.alto}%`,
                        border: `2px ${isEditable ? 'dashed' : 'solid'} ${color}`,
                        backgroundColor: `${color}33`,
                        pointerEvents: 'auto'
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditableId(isEditable ? null : anot.id);
                      }}
                    >
                      {/* Label badge positioned exactly above the bounding box with compact padding and height */}
                      <span style={{
                        position: 'absolute',
                        top: '0',
                        left: 0,
                        transform: 'translateY(-100%)',
                        backgroundColor: color,
                        color: 'white',
                        fontSize: '9px',
                        lineHeight: '1',
                        padding: '2px 4px',
                        borderRadius: '3px',
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap'
                      }}>
                        {anot.clase}
                      </span>

                      {isEditable && (
                        <>
                          <div
                            className="btn-borrar"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBox(anot.id);
                            }}
                          >
                            ×
                          </div>
                           {/* Bottom-right corner resize handle */}
                           <div
                             className="manija-resize br"
                             onMouseDown={(e) => {
                               e.stopPropagation();
                               e.preventDefault();
                               handleStartResize(e, anot.id, 'br');
                             }}
                           />
                           {/* Top-left corner resize handle */}
                           <div
                             className="manija-resize tl"
                             onMouseDown={(e) => {
                               e.stopPropagation();
                               e.preventDefault();
                               handleStartResize(e, anot.id, 'tl');
                             }}
                           />
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Preview del recuadro activo dibujado */}
                {previewBox && activeLabel && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${previewBox.x}px`,
                      top: `${previewBox.y}px`,
                      width: `${previewBox.w}px`,
                      height: `${previewBox.h}px`,
                      border: `2px dashed ${getLabelColor(activeLabel)}`,
                      backgroundColor: `${getLabelColor(activeLabel)}33`,
                      pointerEvents: 'none'
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: '#64748b', textAlign: 'center', marginTop: '60px' }}>
              <BookOpen size={48} style={{ marginBottom: '12px' }} />
              <p>{t('viewer.initializing')}</p>
            </div>
          )}
        </div>

        {/* Consola JSON de Dataset */}
        <div className={`console-panel ${isConsoleOpen ? 'open' : ''}`}>
          <div 
            className="console-header" 
            onClick={() => setIsConsoleOpen(!isConsoleOpen)} 
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span className="console-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isConsoleOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              {t('console.title')}
            </span>
            <div className="console-actions" onClick={(e) => e.stopPropagation()}>
              <button onClick={handleApplyJsonChanges} className="btn-console-sync">
                <RefreshCw size={12} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                <span>{t('console.applyChanges')}</span>
              </button>
            </div>
          </div>
          <textarea
            className="console-textarea"
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setJsonConsoleEdited(true);
            }}
            spellCheck={false}
          />
        </div>
      </div>

      {/* Toast Notifications container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-card ${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
            <button
              className="toast-close"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="modal-overlay" onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}>
          <div className="modal-card confirm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{confirmModal.title}</h4>
            </div>
            <div className="modal-body">
              <p style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.5', margin: 0 }}>
                {confirmModal.message}
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
              >
                {t('confirmModal.cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)' }}
                onClick={confirmModal.onConfirm}
              >
                {t('confirmModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Etiquetado;
