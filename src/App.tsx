import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, FileText, Cpu, Database, CheckCircle, Plus, Folder, X, Sun, Moon, Wallet, AlertCircle } from 'lucide-react';
import { KortexLogo } from './components/KortexLogo';
import { LanguageToggle } from './components/LanguageToggle';
import { apiService } from './services/api';
import type { DocumentType, UserAIModel } from './services/api';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './components/Login';
import { Callback } from './components/Callback';
import { ProjectDetails } from './components/ProjectDetails';
import { Etiquetado } from './components/Etiquetado';
import { PdfEditor } from './components/PdfEditor';
import { ModelTraining } from './components/ModelTraining';
import { Billing } from './components/Billing';
import './App.css';

/**
 * Vista de Dashboard protegida.
 * Muestra información del sistema Kortex, lista de proyectos y permite crear nuevos proyectos.
 */
export const Dashboard: React.FC = () => {
  const { t } = useTranslation('app');
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [userModel, setUserModel] = useState<UserAIModel | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const navigate = useNavigate();
  const fetchCalled = useRef(false);

  // Theme state con localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('kortex-theme') || 'dark';
  });

  // Aplicar tema al document y persistir en localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kortex-theme', theme);
  }, [theme]);

  /** Alterna entre tema oscuro y claro */
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setDashboardError(null);
    try {
      const typesData = await apiService.getDocumentTypes();
      setDocumentTypes(typesData);

      const modelData = await apiService.getUserAIModel();
      setUserModel(modelData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('errors.loadDashboard');
      setDashboardError(msg);
      console.error('Error fetching dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cargar proyectos y modelo de IA al montar el componente
  useEffect(() => {
    if (fetchCalled.current) return;
    fetchCalled.current = true;
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleLogout = () => {
    apiService.logout();
    navigate('/login', { replace: true });
  };

  const handleCreateDocumentType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) {
      setModalError(t('errors.nameRequired'));
      return;
    }

    setModalError(null);
    setIsCreating(true);

    try {
      const newType = await apiService.createDocumentType(newTypeName);
      setDocumentTypes((prev) => [newType, ...prev]);
      setNewTypeName('');
      setIsModalOpen(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setModalError(err.message);
      } else {
        setModalError(t('errors.createFailed'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Obtiene las iniciales de un nombre de tipo de documento (máx. 2 caracteres)
  const getInitials = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return 'TD';
    const words = cleanName.split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return cleanName.substring(0, 2).toUpperCase();
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-brand">
          <KortexLogo size={36} />
          <h1 className="brand-title">Kortex</h1>
          <span className="badge">{t('header.badge')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link
            to="/billing"
            className="btn-logout"
            title={t('header.billingTitle')}
            style={{ textDecoration: 'none' }}
          >
            <Wallet size={18} />
            <span>{t('header.billingLabel')}</span>
          </Link>
          <LanguageToggle />
          <button
            onClick={toggleTheme}
            className="btn-theme-toggle"
            title={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={handleLogout} className="btn-logout" title={t('header.logoutTitle')}>
            <LogOut size={18} />
            <span>{t('header.logoutLabel')}</span>
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Banner de Bienvenida */}
        <section className="welcome-banner">
          <h2>{t('welcome.title')}</h2>
          <p>{t('welcome.subtitle')}</p>
          <button onClick={() => setIsModalOpen(true)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={18} />
            <span>{t('welcome.createDocumentType')}</span>
          </button>
        </section>

        {/* Grid de Estadísticas */}
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon purple">
              <FileText size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{documentTypes.length}</span>
              <span className="stat-label">{t('stats.documentTypes')}</span>
            </div>
          </div>

          <Link to="/models" className="stat-card" style={{ textDecoration: 'none' }}>
            <div className="stat-icon blue">
              <Cpu size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {userModel?.model_name || t('stats.unassigned')}
              </span>
              <span className="stat-label">{t('stats.activeModel')}</span>
            </div>
          </Link>

          <div className="stat-card">
            <div className="stat-icon green">
              <CheckCircle size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {userModel && userModel.precision > 0 ? `${userModel.precision}%` : 'N/A'}
              </span>
              <span className="stat-label">{t('stats.extractionAccuracy')}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon amber">
              <Database size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {userModel?.llm_service_name || 'PyTorch (Local)'}
              </span>
              <span className="stat-label">{t('stats.activeService')}</span>
            </div>
          </div>
        </section>

        {/* Sección de Tipos de Documento */}
        <section className="projects-section">
          <div className="projects-header">
            <h3>{t('projects.title')}</h3>
            {documentTypes.length > 0 && (
              <button onClick={() => setIsModalOpen(true)} className="btn-primary">
                <Plus size={16} />
                <span>{t('projects.newDocumentType')}</span>
              </button>
            )}
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <span>{t('projects.loading')}</span>
            </div>
          ) : dashboardError ? (
            <div className="empty-state">
              <AlertCircle size={48} color="#ef4444" />
              <p>{dashboardError}</p>
              <button onClick={() => fetchDashboardData()} className="btn-primary" style={{ marginTop: '8px' }}>
                {t('projects.retry')}
              </button>
            </div>
          ) : documentTypes.length === 0 ? (
            <div className="empty-state">
              <Folder size={48} />
              <p>{t('projects.emptyState')}</p>
              <button onClick={() => setIsModalOpen(true)} className="btn-primary" style={{ marginTop: '8px' }}>
                {t('projects.createFirst')}
              </button>
            </div>
          ) : (
            <div className="projects-grid">
              {documentTypes.map((type) => (
                <Link key={type.id} to={`/document-type/${type.id}`} className="project-card">
                  <div className="project-avatar-wrapper">
                    <div className="project-avatar">
                      {getInitials(type.name)}
                    </div>
                    <div className="project-title-wrapper">
                      <h4 className="project-title">{type.name}</h4>
                      <span className="project-date">
                        {t('projects.createdOn', { date: new Date(type.created_at).toLocaleDateString() })}
                      </span>
                    </div>
                  </div>
                  <div className="project-footer">
                    <span className="project-doc-count">{t('projects.viewDetails')}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modal para Crear Tipo de Documento */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{t('modal.title')}</h4>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateDocumentType}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="typeName">
                    {t('modal.nameLabel')}
                  </label>
                  <input
                    id="typeName"
                    type="text"
                    className="form-input"
                    placeholder={t('modal.namePlaceholder')}
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    disabled={isCreating}
                    autoFocus
                    required
                  />
                  {modalError && <span className="error-text">{modalError}</span>}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isCreating}
                >
                  {t('modal.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isCreating}
                >
                  {isCreating ? t('modal.creating') : t('modal.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/document-type/:id"
          element={
            <ProtectedRoute>
              <ProjectDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/models"
          element={
            <ProtectedRoute>
              <ModelTraining />
            </ProtectedRoute>
          }
        />
        <Route
          path="/document/:id/tag"
          element={
            <ProtectedRoute>
              <Etiquetado />
            </ProtectedRoute>
          }
        />
        <Route
          path="/document/:id/edit"
          element={
            <ProtectedRoute>
              <PdfEditor />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <Billing />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
