import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiService } from '../services/api';
import type { DocumentGroup } from '../services/api';

interface DocumentGroupsProps {
  groups: DocumentGroup[];
  onGroupsChange: (groups: DocumentGroup[]) => void;
  /** Notifica el borrado para que el dashboard deje sin grupo a los tipos que lo tenían. */
  onGroupDeleted: (groupId: number) => void;
}

/**
 * Sección del dashboard para crear, renombrar y eliminar grupos de documentos.
 */
export const DocumentGroups: React.FC<DocumentGroupsProps> = ({ groups, onGroupsChange, onGroupDeleted }) => {
  const { t } = useTranslation('app');
  // null: modal cerrado; 'new': creando; un grupo: renombrándolo.
  const [editing, setEditing] = useState<DocumentGroup | 'new' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openModal = (group: DocumentGroup | 'new') => {
    setEditing(group);
    setName(group === 'new' ? '' : group.name);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('groups.errors.nameRequired'));
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (editing === 'new') {
        const created = await apiService.createDocumentGroup(name.trim());
        onGroupsChange([created, ...groups]);
      } else if (editing) {
        const updated = await apiService.updateDocumentGroup(editing.id, name.trim());
        onGroupsChange(groups.map((g) => (g.id === updated.id ? updated : g)));
      }
      setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('groups.errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (group: DocumentGroup) => {
    if (!window.confirm(t('groups.deleteConfirm', { name: group.name }))) return;
    try {
      await apiService.deleteDocumentGroup(group.id);
      onGroupsChange(groups.filter((g) => g.id !== group.id));
      onGroupDeleted(group.id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('groups.errors.deleteFailed'));
    }
  };

  return (
    <section className="projects-section">
      <div className="projects-header">
        <h3>{t('groups.title')}</h3>
        <button onClick={() => openModal('new')} className="btn-primary">
          <Plus size={16} />
          <span>{t('groups.new')}</span>
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="project-date">{t('groups.emptyState')}</p>
      ) : (
        <div className="projects-grid">
          {groups.map((group) => (
            <div key={group.id} className="project-card">
              <div className="project-avatar-wrapper">
                <div className="project-avatar">
                  <Layers size={18} />
                </div>
                <div className="project-title-wrapper">
                  <h4 className="project-title">{group.name}</h4>
                </div>
                <button
                  className="btn-close"
                  onClick={() => openModal(group)}
                  title={t('groups.rename')}
                  aria-label={t('groups.rename')}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="btn-close"
                  onClick={() => handleDelete(group)}
                  title={t('groups.delete')}
                  aria-label={t('groups.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{editing === 'new' ? t('groups.modal.createTitle') : t('groups.modal.renameTitle')}</h4>
              <button className="btn-close" onClick={() => setEditing(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="groupName">
                    {t('groups.modal.nameLabel')}
                  </label>
                  <input
                    id="groupName"
                    type="text"
                    className="form-input"
                    placeholder={t('groups.modal.namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isSaving}
                    autoFocus
                    required
                  />
                  {error && <span className="error-text">{error}</span>}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setEditing(null)} disabled={isSaving}>
                  {t('modal.cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={isSaving}>
                  {isSaving ? t('groups.modal.saving') : t('groups.modal.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
