import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Edit, Trash2, UploadCloud, FileText,
  Eye, Trash, X, Calendar, Tag, Plus, GripVertical, Pencil,
  Sun, Moon
} from 'lucide-react';
import { apiService } from '../services/api';
import type { DocumentType, Document, Label } from '../services/api';
import { LABEL_TIPOS } from '../services/api';
import { LanguageToggle } from './LanguageToggle';

// Structure for the custom confirmation modal state
interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

/**
 * Componente que muestra los detalles de un proyecto específico,
 * listando sus documentos y permitiendo el CRUD completo de ambos,
 * además de la gestión de etiquetas del proyecto.
 */
export const ProjectDetails: React.FC = () => {
  const { t } = useTranslation('projectDetails');
  const { id } = useParams<{ id: string }>();
  const documentTypeId = Number(id);
  const navigate = useNavigate();

  // Theme toggle
  const [theme, setTheme] = useState(
    () => localStorage.getItem('kortex-theme') || 'dark'
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kortex-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((p) => (p === 'dark' ? 'light' : 'dark'));

  // Estados del tipo de documento, documentos y etiquetas
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estados de carga y modales
  const [isEditTypeOpen, setIsEditTypeOpen] = useState(false);
  const [editTypeName, setEditTypeName] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Estados de etiquetas
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelTipo, setNewLabelTipo] = useState('texto');
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [editingLabelName, setEditingLabelName] = useState('');
  const [editingLabelTipo, setEditingLabelTipo] = useState('texto');

  // Custom Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

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
    // Update order in BE
    try {
      const orders = labels.map((lbl, idx) => ({ id: lbl.id, order: idx }));
      await apiService.reorderLabels(orders);
    } catch (err) {
      console.error('Error saving label order:', err);
    }
  };

  // Show custom confirmation modal dialog
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

  // Cargar datos
  useEffect(() => {
    const loadData = async () => {
      try {
        // Cargar tipo de documento
        const documentTypesList = await apiService.getDocumentTypes();
        const foundType = documentTypesList.find((p) => p.id === documentTypeId);
        if (!foundType) {
          navigate('/', { replace: true });
          return;
        }
        setDocumentType(foundType);
        setEditTypeName(foundType.name);

        // Cargar documentos (ejemplos)
        const docsList = await apiService.getDocuments(documentTypeId);
        setDocuments(docsList);

        // Cargar etiquetas
        const labelsList = await apiService.getLabels(documentTypeId);
        setLabels(labelsList);
      } catch (err: unknown) {
        console.error('Error al cargar detalles del tipo de documento:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (documentTypeId) {
      loadData();
    }
  }, [documentTypeId, navigate]);



  // Editar Tipo de Documento
  const handleUpdateDocumentType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTypeName.trim()) return;

    try {
      const updated = await apiService.updateDocumentType(documentTypeId, editTypeName);
      setDocumentType(updated);
      setIsEditTypeOpen(false);
    } catch (err: unknown) {
      alert(t('errors.updateTypeFailed'));
    }
  };

  // Eliminar Tipo de Documento using custom confirm dialog
  const handleDeleteDocumentType = () => {
    showConfirm(
      t('confirmModal.deleteDocumentType.title'),
      t('confirmModal.deleteDocumentType.message'),
      async () => {
        try {
          await apiService.deleteDocumentType(documentTypeId);
          navigate('/', { replace: true });
        } catch (err: unknown) {
          alert(t('errors.deleteTypeFailed'));
        }
      }
    );
  };

  // Subir Documento
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const newDoc = await apiService.createDocument(documentTypeId, file);
      setDocuments((prev) => [newDoc, ...prev]);
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      } else {
        alert(t('errors.uploadFailed'));
      }
    } finally {
      setIsUploading(false);
      // Limpiar input file
      e.target.value = '';
    }
  };

  // Eliminar Documento using custom confirm dialog
  const handleDeleteDocument = (docId: number) => {
    showConfirm(
      t('confirmModal.deleteDocument.title'),
      t('confirmModal.deleteDocument.message'),
      async () => {
        try {
          await apiService.deleteDocument(docId);
          setDocuments((prev) => prev.filter((d) => d.id !== docId));
        } catch (err: unknown) {
          alert(t('errors.deleteDocumentFailed'));
        }
      }
    );
  };

  // Crear Etiqueta
  const handleCreateLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;

    try {
      const created = await apiService.createLabel(documentTypeId, newLabelName.trim(), newLabelTipo);
      setLabels((prev) => [...prev, created]);
      setNewLabelName('');
      setNewLabelTipo('texto');
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      } else {
        alert(t('errors.createLabelFailed'));
      }
    }
  };

  // Guardar Edición de Etiqueta
  const handleUpdateLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLabel || !editingLabelName.trim()) return;

    try {
      const updated = await apiService.updateLabel(editingLabel.id, editingLabelName.trim(), editingLabelTipo);
      setLabels((prev) => prev.map((l) => (l.id === editingLabel.id ? updated : l)));
      setEditingLabel(null);
      setEditingLabelName('');
      setEditingLabelTipo('texto');
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      } else {
        alert(t('errors.updateLabelFailed'));
      }
    }
  };

  // Eliminar Etiqueta using custom confirm dialog
  const handleDeleteLabel = (labelId: number) => {
    showConfirm(
      t('confirmModal.deleteLabel.title'),
      t('confirmModal.deleteLabel.message'),
      async () => {
        try {
          await apiService.deleteLabel(labelId);
          setLabels((prev) => prev.filter((l) => l.id !== labelId));
        } catch (err: unknown) {
          alert(t('errors.deleteLabelFailed'));
        }
      }
    );
  };

  // Abrir Modal de Edición de Etiqueta
  const openEditLabelModal = (label: Label) => {
    setEditingLabel(label);
    setEditingLabelName(label.name);
    setEditingLabelTipo(label.tipo || 'texto');
  };

  // Extraer el nombre de archivo de la URL de Django
  const getFileName = (url: string) => {
    const decoded = decodeURIComponent(url);
    const parts = decoded.split('/');
    return parts[parts.length - 1] || t('documentsPanel.defaultFileName');
  };

  if (isLoading) {
    return (
      <div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: '#64748b' }}>{t('loading')}</p>
      </div>
    );
  }

  if (!documentType) return null;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-brand">
          <Link to="/" className="btn-close" style={{ marginRight: '8px' }} title={t('header.backTitle')}>
            <ArrowLeft size={20} />
          </Link>
          <h1 className="brand-title">{documentType.name}</h1>
          <span className="badge">{t('header.detailsBadge')}</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <LanguageToggle />
          <button
            onClick={toggleTheme}
            className="btn-theme-toggle"
            title={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => setIsEditTypeOpen(true)} className="btn-action" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Edit size={16} />
            <span>{t('header.editName')}</span>
          </button>
          <button onClick={handleDeleteDocumentType} className="btn-logout" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={16} />
            <span>{t('header.deleteDocumentType')}</span>
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="project-detail-layout">
          {/* Panel Lateral: Carga de Archivos y Administración de Etiquetas */}
          <div className="upload-panel">
            <h3>{t('uploadPanel.title')}</h3>
            <p className="panel-desc">{t('uploadPanel.description')}</p>

            <label className={`upload-zone ${isUploading ? 'uploading' : ''}`}>
              <UploadCloud size={40} className="upload-icon" />
              {isUploading ? (
                <>
                  <span className="upload-text-bold" style={{ color: '#3b82f6' }}>{t('uploadPanel.analyzing')}</span>
                  <span className="upload-text" style={{ fontSize: '12px', opacity: 0.7 }}>
                    {t('uploadPanel.analyzingHint')}
                  </span>
                </>
              ) : (
                <>
                  <span className="upload-text-bold">{t('uploadPanel.clickToUpload')}</span>
                  <span className="upload-text">{t('uploadPanel.onlyPdf')}</span>
                </>
              )}
              <input
                type="file"
                accept="application/pdf"
                className="hidden-file-input"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </label>

            {/* Gestión de Etiquetas */}
            <div className="labels-management-section" style={{ marginTop: '32px', borderTop: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.06)', paddingTop: '24px' }}>
              <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('labelsSection.title', { count: labels.length })}</span>
              </h3>
              <p className="panel-desc">{t('labelsSection.description')}</p>

              {/* Formulario para crear etiqueta con tipo */}
              <form onSubmit={handleCreateLabel} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: '10px 14px', fontSize: '13px', flex: 1 }}
                    placeholder={t('labelsSection.namePlaceholder')}
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                  />
                  <button type="submit" className="btn-primary" style={{ padding: '10px 14px' }}>
                    <Plus size={16} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {LABEL_TIPOS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setNewLabelTipo(t.value)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        borderRadius: '12px',
                        border: newLabelTipo === t.value
                          ? '1px solid #a855f7'
                          : theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                        backgroundColor: newLabelTipo === t.value
                          ? 'rgba(168, 85, 247, 0.15)'
                          : theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                        color: newLabelTipo === t.value ? '#c084fc' : '#94a3b8',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontWeight: newLabelTipo === t.value ? 600 : 400,
                      }}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </form>

              {/* Listado vertical de etiquetas */}
              {labels.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '12px', border: theme === 'dark' ? '1px dashed rgba(255,255,255,0.03)' : '1px dashed rgba(0,0,0,0.06)', borderRadius: '8px' }}>
                  {t('labelsSection.empty')}
                </div>
              ) : (
                <div 
                  className="labels-list-vertical custom-scrollbar" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '6px', 
                    maxHeight: '320px', 
                    overflowY: 'auto',
                    paddingRight: '4px'
                  }}
                >
                  {labels.map((lbl, idx) => {
                    const tipoInfo = LABEL_TIPOS.find(t => t.value === lbl.tipo) || LABEL_TIPOS[0];
                    return (
                      <div 
                        key={lbl.id} 
                        className="label-item-row" 
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '6px 12px', 
                          backgroundColor: draggedIndex === idx ? 'rgba(168, 85, 247, 0.1)' : theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', 
                          border: draggedIndex === idx ? '1px solid rgba(168, 85, 247, 0.3)' : theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.05)', 
                          borderRadius: '10px',
                          cursor: 'grab',
                          opacity: draggedIndex === idx ? 0.6 : 1,
                          transform: draggedIndex === idx ? 'scale(1.02)' : 'scale(1)',
                          transition: 'transform 0.1s ease, background-color 0.2s',
                          boxShadow: draggedIndex === idx ? '0 8px 20px rgba(0,0,0,0.3)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                          <GripVertical size={14} style={{ color: '#4b5563', cursor: 'grab', flexShrink: 0 }} />
                          <span style={{ fontSize: '14px', flexShrink: 0 }} title={tipoInfo.label}>
                            {tipoInfo.icon}
                          </span>
                          <span style={{ 
                            fontSize: '13px', 
                            color: theme === 'dark' ? '#f1f5f9' : '#1e293b', 
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1
                          }} title={lbl.name}>
                            {lbl.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          <button onClick={() => openEditLabelModal(lbl)} className="btn-close" style={{ color: '#94a3b8', padding: '4px' }} title={t('labelsSection.editTitle')}>
                            <Edit size={14} />
                          </button>
                          <button onClick={() => handleDeleteLabel(lbl.id)} className="btn-close" style={{ color: '#f87171', padding: '4px' }} title={t('labelsSection.deleteTitle')}>
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Redirección a Entrenamiento del Modelo IA */}
            <div className="model-training-section" style={{ marginTop: '32px', borderTop: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.06)', paddingTop: '24px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{t('modelSection.title')}</span>
              </h3>
              <p className="panel-desc">{t('modelSection.description')}</p>

              <Link
                to="/models"
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)' }}
              >
                {t('modelSection.cta')}
              </Link>
            </div>
          </div>

          {/* Panel Principal: Lista de Documentos */}
          <div className="documents-panel">
            <div className="panel-header">
              <h3>{t('documentsPanel.title', { count: documents.length })}</h3>
            </div>

            {documents.length === 0 ? (
              <div className="empty-state" style={{ height: '300px', justifyContent: 'center' }}>
                <FileText size={48} />
                <p>{t('documentsPanel.empty')}</p>
              </div>
            ) : (
              <div className="documents-list">
                {documents.map((doc) => (
                  <div key={doc.id} className="document-row">
                    <div className="doc-info">
                      <div className="doc-icon-wrapper">
                        <FileText size={20} />
                      </div>
                      <div className="doc-meta-info">
                        <span className="doc-name" title={getFileName(doc.pdf)}>
                          {getFileName(doc.pdf)}
                        </span>
                        <span className="doc-date">
                          <Calendar size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          {t('documentsPanel.uploadedOn', { date: new Date(doc.extracted_at).toLocaleString() })}
                        </span>
                        <div className={`status-badge-mini status-${doc.status}`}>
                          {doc.status === 'uploaded' && t('documentsPanel.status.uploaded')}
                          {doc.status === 'labeled' && t('documentsPanel.status.labeled')}
                          {doc.status === 'trained' && t('documentsPanel.status.trained')}
                        </div>
                      </div>
                    </div>
                    <div className="doc-actions">
                      <Link
                        to={`/document/${doc.id}/tag`}
                        className="btn-action"
                        title={t('documentsPanel.actions.tag')}
                      >
                        <Tag size={16} />
                        <span>{t('documentsPanel.actions.tag')}</span>
                      </Link>
                      <Link
                        to={`/document/${doc.id}/edit`}
                        className="btn-action edit-btn"
                        title={t('documentsPanel.actions.editTitle')}
                      >
                        <Pencil size={16} />
                        <span>{t('documentsPanel.actions.edit')}</span>
                      </Link>
                      <a
                        href={doc.pdf}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-action view-btn"
                        title={t('documentsPanel.actions.view')}
                      >
                        <Eye size={16} />
                        <span>{t('documentsPanel.actions.view')}</span>
                      </a>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="btn-action delete-btn"
                        title={t('documentsPanel.actions.deleteTitle')}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal para Editar Nombre de Tipo de Documento */}
      {isEditTypeOpen && (
        <div className="modal-overlay" onClick={() => setIsEditTypeOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{t('editTypeModal.title')}</h4>
              <button className="btn-close" onClick={() => setIsEditTypeOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdateDocumentType}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="editTypeNameInput">
                    {t('editTypeModal.nameLabel')}
                  </label>
                  <input
                    id="editTypeNameInput"
                    type="text"
                    className="form-input"
                    value={editTypeName}
                    onChange={(e) => setEditTypeName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsEditTypeOpen(false)}
                >
                  {t('editTypeModal.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  {t('editTypeModal.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Editar Etiqueta */}
      {editingLabel && (
        <div className="modal-overlay" onClick={() => setEditingLabel(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{t('editLabelModal.title')}</h4>
              <button className="btn-close" onClick={() => setEditingLabel(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdateLabel}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="editLabelNameInput">
                    {t('editLabelModal.nameLabel')}
                  </label>
                  <input
                    id="editLabelNameInput"
                    type="text"
                    className="form-input"
                    value={editingLabelName}
                    onChange={(e) => setEditingLabelName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label className="form-label">{t('editLabelModal.typeLabel')}</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {LABEL_TIPOS.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setEditingLabelTipo(t.value)}
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          borderRadius: '12px',
                          border: editingLabelTipo === t.value
                            ? '1px solid #a855f7'
                            : theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.08)',
                          backgroundColor: editingLabelTipo === t.value
                            ? 'rgba(168, 85, 247, 0.15)'
                            : theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                          color: editingLabelTipo === t.value ? '#c084fc' : '#94a3b8',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          fontWeight: editingLabelTipo === t.value ? 600 : 400,
                        }}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setEditingLabel(null)}
                >
                  {t('editLabelModal.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  {t('editLabelModal.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
export default ProjectDetails;
