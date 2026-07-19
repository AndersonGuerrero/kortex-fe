import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Play, AlertCircle,
  FileText, RefreshCw,
  User, Key, Clipboard, Check, Code, StopCircle, Layout, Activity, Zap,
  Sun, Moon, ChevronDown, ChevronUp
} from 'lucide-react';
import { apiService } from '../services/api';
import type { DocumentType, Document, Label, UserAIModel, UserProfile } from '../services/api';
import { LanguageToggle } from './LanguageToggle';
import './ModelTraining.css';

/**
 * Training runs in two backend phases sharing one status field: "training"
 * (router) then "configuring_prompt" (LLM prompt generation) before "idle".
 * Any UI check for "is something in progress" must treat both as busy.
 */
const isTrainingBusy = (s?: string) => s === 'training' || s === 'configuring_prompt';

export const ModelTraining: React.FC = () => {
  const { t } = useTranslation('modelTraining');

  // Tabs state
  const [activeTab, setActiveTab] = useState<'ia' | 'profile' | 'api'>('ia');

  // Theme toggle
  const [theme, setTheme] = useState(
    () => localStorage.getItem('kortex-theme') || 'dark'
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kortex-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((p) => (p === 'dark' ? 'light' : 'dark'));

  // IA training stats & states
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [userModel, setUserModel] = useState<UserAIModel | null>(null);

  // Loading & updates states
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingTraining, setIsStartingTraining] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // User Profile states
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [password, setPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // API Token integration states
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [apiRequestCount, setApiRequestCount] = useState<number>(0);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'python' | 'js'>('python');
  const fetchCalled = useRef(false);

  // Live PDF testing states
  const [selectedTestType, setSelectedTestType] = useState<number>(0);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [isTestingExtraction, setIsTestingExtraction] = useState(false);
  const [testExtractionResult, setTestExtractionResult] = useState<any | null>(null);
  const [testError, setTestError] = useState<string | null>(null);


  const loadGlobalData = async () => {
    try {
      const modelData = await apiService.getUserAIModel();
      setUserModel(modelData);

      try {
        const profileData = await apiService.getUserProfile();
        setProfile(profileData);
      } catch (err) {
        console.error('Error al cargar perfil:', err);
      }

      const documentTypesList = await apiService.getDocumentTypes();
      setDocumentTypes(documentTypesList);
      if (documentTypesList.length > 0) {
        setSelectedTestType(documentTypesList[0].id);
      }

      let allDocs: Document[] = [];
      let allLabels: Label[] = [];

      await Promise.all(
        documentTypesList.map(async (p) => {
          try {
            const docs = await apiService.getDocuments(p.id);
            allDocs = [...allDocs, ...docs];
            
            const lbls = await apiService.getLabels(p.id);
            allLabels = [...allLabels, ...lbls];
          } catch (e) {
            console.error(`Error loading details for document type ${p.id}:`, e);
          }
        })
      );

      setDocuments(allDocs);
      setLabels(allLabels);
    } catch (err) {
      console.error('Error al cargar la información global de IA:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (fetchCalled.current) return;
    fetchCalled.current = true;
    loadGlobalData();
  }, []);

  useEffect(() => {
    if (activeTab === 'profile' && !profile) {
      const fetchProfileData = async () => {
        try {
          const profileData = await apiService.getUserProfile();
          setProfile(profileData);
        } catch (err) {
          console.error('Error al cargar el perfil de usuario:', err);
        }
      };
      fetchProfileData();
    } else if (activeTab === 'api') {
      const fetchTokenDetails = async () => {
        try {
          const tokenData = await apiService.getAPIToken();
          setApiToken(tokenData.token);
          setApiRequestCount(tokenData.request_count);
        } catch (e) {
          console.error('Error al cargar token de API:', e);
        }
      };
      fetchTokenDetails();
    }
  }, [activeTab]);

  useEffect(() => {
    let intervalId: any = null;

    if (isTrainingBusy(userModel?.training_status)) {
      intervalId = setInterval(async () => {
        try {
          const updatedModel = await apiService.getUserAIModel();
          setUserModel(updatedModel);
          if (!isTrainingBusy(updatedModel.training_status)) {
            clearInterval(intervalId);
            loadGlobalData();
          }
        } catch (err) {
          console.error('Error al realizar el sondeo del modelo:', err);
        }
      }, 1500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [userModel?.training_status]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  useEffect(() => {
    if (!userModel) return;
    if (userModel.training_logs && userModel.training_logs.length > 0) {
      setConsoleLogs(userModel.training_logs);
    } else {
      setConsoleLogs([
        t('logs.systemReady', { time: new Date().toLocaleTimeString() }),
        t('logs.waitingForTraining')
      ]);
    }
  }, [userModel?.training_logs]);

  const handleTrainModel = async () => {
    if (!userModel || isTrainingBusy(userModel.training_status)) return;

    setIsStartingTraining(true);
    setUserModel({
      ...userModel,
      training_status: 'training',
      training_progress: 0
    });

    setConsoleLogs([
      t('logs.trainingInitializing', { time: new Date().toLocaleTimeString() })
    ]);

    apiService.trainUserModel()
      .then(updated => {
        setUserModel(updated);
        setIsStartingTraining(false);
      })
      .catch(err => {
        setIsStartingTraining(false);
        loadGlobalData();
        alert(err instanceof Error ? err.message : t('errors.startTrainingFailed'));
      });
  };

  const handleCancelTrainModel = async () => {
    if (!userModel || !isTrainingBusy(userModel.training_status)) return;
    if (!window.confirm(t('errors.confirmCancelTraining'))) return;

    try {
      const updated = await apiService.cancelTrainUserModel();
      setUserModel(updated);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('errors.cancelTrainingFailed'));
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsSavingProfile(true);
    setProfileSuccess(null);
    setProfileError(null);

    try {
      const updateData: any = {
        username: profile.username,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email
      };
      if (password.trim()) updateData.password = password;

      const updated = await apiService.updateUserProfile(updateData);
      setProfile(updated);
      setPassword('');
      setProfileSuccess(t('profile.updateSuccess'));
    } catch (err: any) {
      setProfileError(err.message || t('errors.updateProfileFailed'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleGenerateAPIToken = async () => {
    setIsGeneratingToken(true);
    setTokenCopied(false);
    try {
      const data = await apiService.generateAPIToken();
      setApiToken(data.token);
      setApiRequestCount(data.request_count);
    } catch (err: any) {
      alert(err.message || t('errors.generateTokenFailed'));
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleCopyToken = () => {
    if (apiToken) {
      navigator.clipboard.writeText(apiToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 3000);
    }
  };

  const handleRunTestExtraction = async () => {
    if (!selectedTestType || !testFile) return;

    setIsTestingExtraction(true);
    setTestError(null);
    setTestExtractionResult(null);

    try {
      const result = await apiService.extractDocument(selectedTestType, testFile);
      setTestExtractionResult(result);
    } catch (err: any) {
      setTestError(err.message || t('errors.testExtractionFailed'));
    } finally {
      setIsTestingExtraction(false);
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <RefreshCw size={48} className="spin" style={{ color: 'var(--accent-purple)' }} />
        <p style={{ color: '#64748b', marginTop: '16px', fontWeight: 600 }}>{t('loading')}</p>
      </div>
    );
  }

  const displayToken = apiToken || '<TU_TOKEN_API_JWT>';
  const pythonCode = `import requests\n\nurl = "http://127.0.0.1:8000/api/documents/extract/"\nheaders = {"Authorization": "Bearer ${displayToken}"}\nfiles = {"pdf": open("documento.pdf", "rb")}\ndata = {"document_type": 1}\n\nresponse = requests.post(url, headers=headers, files=files, data=data)\nprint(response.json())`;
  const jsCode = `const url = 'http://127.0.0.1:8000/api/documents/extract/';\nconst token = '${displayToken}';\nconst formData = new FormData();\nformData.append('document_type', '1');\nformData.append('pdf', pdfFile);\n\nfetch(url, {\n  method: 'POST',\n  headers: {'Authorization': \`Bearer \${token}\`},\n  body: formData\n}).then(res => res.json()).then(console.log);`;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-brand">
          <Link to="/" className="btn-close" style={{ marginRight: '8px' }} title={t('header.back')}>
            <ArrowLeft size={20} />
          </Link>
          <h1 className="brand-title">Kortex AI Studio</h1>
          <span className="badge">v2.0 Beta</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LanguageToggle />
          <button
            onClick={toggleTheme}
            className="btn-theme-toggle"
            title={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <nav className="tabs-nav">
          <button onClick={() => setActiveTab('ia')} className={`tab-btn ${activeTab === 'ia' ? 'active' : ''}`}>
            <Zap size={18} /> {t('tabs.ai')}
          </button>
          <button onClick={() => setActiveTab('profile')} className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}>
            <User size={18} /> {t('tabs.account')}
          </button>
          <button onClick={() => setActiveTab('api')} className={`tab-btn ${activeTab === 'api' ? 'active' : ''}`}>
            <Code size={18} /> API
          </button>
        </nav>

        {activeTab === 'ia' && userModel && (
          <div className="model-training-layout">
            <div className="bento-grid">

              {/* Stats & Training Panel */}
              <div className="bento-item bento-stats">
                <div className="panel-header">
                  <Activity size={20} style={{ color: 'var(--accent-purple)' }} />
                  <h3>{t('stats.title')}</h3>
                </div>
                <div className="stats-container">
                  <div className="stat-mini-card">
                    <span className="value">{documentTypes.length}</span>
                    <span className="label">{t('stats.classes')}</span>
                  </div>
                  <div className="stat-mini-card">
                    <span className="value">{documents.length}</span>
                    <span className="label">Dataset</span>
                  </div>
                  <div className="stat-mini-card">
                    <span className="value">{labels.length}</span>
                    <span className="label">{t('stats.labels')}</span>
                  </div>
                  <div className="stat-mini-card">
                    <span className="value" style={{ color: 'var(--accent-teal)' }}>{userModel.precision}%</span>
                    <span className="label">{t('stats.accuracy')}</span>
                  </div>
                </div>

                <div style={{ marginTop: '32px' }}>
                  {isTrainingBusy(userModel.training_status) ? (
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--accent-purple-glow)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ color: 'var(--accent-purple)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <RefreshCw size={16} className="spin" />
                          {userModel.training_status === 'configuring_prompt' ? t('stats.configuringPrompt') : t('stats.optimizingWeights')}
                        </span>
                        <span style={{ fontWeight: 800 }}>{userModel.training_progress}%</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${userModel.training_progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-purple), #ec4899)', transition: 'width 0.5s ease' }} />
                      </div>
                      <button onClick={handleCancelTrainModel} className="btn-premium" style={{ width: '100%', marginTop: '20px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', boxShadow: 'none' }}>
                        <StopCircle size={18} /> {t('stats.cancelProcess')}
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleTrainModel} className="btn-premium" style={{ width: '100%' }} disabled={isStartingTraining}>
                      {isStartingTraining ? <RefreshCw size={20} className="spin" /> : <Play size={20} />}
                      <span>{isStartingTraining ? t('stats.compiling') : t('stats.startTraining')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Testing Section */}
              <div className="bento-item bento-test">
                <div className="panel-header">
                  <Layout size={20} style={{ color: 'var(--accent-teal)' }} />
                  <h3>{t('testing.title')}</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="custom-input-group">
                      <label>{t('testing.referenceClass')}</label>
                      <select className="form-input" value={selectedTestType} onChange={(e) => setSelectedTestType(parseInt(e.target.value))}>
                        <option value={0}>{t('testing.selectPlaceholder')}</option>
                        {documentTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
                      </select>
                    </div>
                    <div className="custom-input-group">
                      <label>{t('testing.pdfDocument')}</label>
                      <div style={{ position: 'relative', border: '1px dashed var(--glass-border)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                        <input type="file" accept="application/pdf" onChange={(e) => setTestFile(e.target.files?.[0] || null)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                        <FileText size={24} style={{ color: 'var(--accent-blue)', marginBottom: '8px' }} />
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{testFile ? testFile.name : t('testing.dragPdfHere')}</div>
                      </div>
                    </div>
                    <button onClick={handleRunTestExtraction} disabled={isTestingExtraction || !testFile} className="btn-premium" style={{ background: 'var(--accent-teal)', boxShadow: '0 4px 15px rgba(20, 184, 166, 0.3)' }}>
                      {isTestingExtraction ? <RefreshCw size={18} className="spin" /> : <Zap size={18} />}
                      <span>{isTestingExtraction ? t('testing.processing') : t('testing.runExtraction')}</span>
                    </button>

                    {testError && (
                      <div className="glass-panel" style={{ padding: "12px", marginTop: "12px", border: "1px solid rgba(239, 68, 68, 0.2)", background: "rgba(239, 68, 68, 0.05)", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                        <AlertCircle size={16} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                        <span style={{ color: "#fca5a5", fontSize: "12.5px", lineHeight: "1.4" }}>{testError}</span>
                      </div>
                    )}
                  </div>

                  <div className="ide-console" style={{ height: '100%' }}>
                    <div className="ide-console-header" style={{ background: 'transparent' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{t('testing.resultsHeader')}</span>
                    </div>
                    <div className="ide-console-body" style={{ height: '216px', overflowY: 'auto', color: 'var(--accent-teal)' }}>
                      {testExtractionResult ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {Object.entries(testExtractionResult.json_data || {}).map(([campo, info]: [string, any]) => {
                            const val = typeof info === 'object' ? info.value : info;
                            const conf = typeof info === 'object' ? info.confidence : null;
                            const color = conf > 90 ? '#10b981' : conf > 70 ? '#f59e0b' : '#ef4444';
                            return (
                              <div key={campo} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                <div><span style={{ color: '#64748b', marginRight: '8px' }}>{campo}:</span> <span style={{ color: theme === 'dark' ? '#fff' : '#1e293b' }}>{val}</span></div>
                                {conf && <span className="confidence-badge" style={{ color, background: `${color}15` }}>{conf}%</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>{t('testing.waitingForInput')}</div>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Console Log */}
              <div className="bento-item bento-console" style={{ padding: 0 }}>
                <div className="ide-console">
                  <div
                    className="ide-console-header"
                    onClick={() => setIsConsoleOpen((prev) => !prev)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isTrainingBusy(userModel.training_status) ? '#10b981' : '#475569' }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>SYSTEM ENGINE LOGS</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>ID: N/A</span>
                      {isConsoleOpen ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
                    </div>
                  </div>
                  {isConsoleOpen && (
                    <div className="ide-console-body">
                      {consoleLogs.map((log, i) => (
                        <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '2px' }}>
                          <span style={{ color: '#334155', minWidth: '20px' }}>{i + 1}</span>
                          <span style={{ color: log.includes('[ERROR]') ? '#ef4444' : log.includes('[INFO]') ? '#3b82f6' : '#94a3b8' }}>{log}</span>
                        </div>
                      ))}
                      <div ref={logsEndRef} />
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'profile' && profile && (
          <div className="bento-item" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="panel-header">
              <User size={20} style={{ color: 'var(--accent-purple)' }} />
              <h3>{t('profile.title')}</h3>
            </div>
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="custom-input-group"><label>{t('profile.firstName')}</label><input type="text" className="form-input" value={profile.first_name} onChange={(e) => setProfile({...profile, first_name: e.target.value})} /></div>
                <div className="custom-input-group"><label>{t('profile.lastName')}</label><input type="text" className="form-input" value={profile.last_name} onChange={(e) => setProfile({...profile, last_name: e.target.value})} /></div>
              </div>
              <div className="custom-input-group"><label>Email</label><input type="email" className="form-input" value={profile.email} onChange={(e) => setProfile({...profile, email: e.target.value})} /></div>
              <div className="custom-input-group"><label>{t('profile.newPassword')}</label><input type="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('profile.optionalPlaceholder')} /></div>
              <button type="submit" disabled={isSavingProfile} className="btn-premium">{isSavingProfile ? t('profile.saving') : t('profile.updateProfile')}</button>
              {profileSuccess && <div style={{ color: 'var(--accent-teal)', fontSize: '13px', textAlign: 'center' }}>{profileSuccess}</div>}
              {profileError && <div style={{ color: 'var(--danger, #ef4444)', fontSize: '13px', textAlign: 'center' }}>{profileError}</div>}
            </form>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="model-training-layout">
            <div className="bento-item">
              <div className="panel-header">
                <Key size={20} style={{ color: 'var(--accent-teal)' }} />
                <h3>API Access Tokens</h3>
              </div>
              <p className="panel-description">{t('api.description')}</p>

              {apiToken ? (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div className="stat-mini-card">
                      <span className="value">{apiRequestCount}</span>
                      <span className="label">Requests</span>
                    </div>
                    <div className="stat-mini-card">
                      <span className="value" style={{ color: 'var(--accent-teal)', fontSize: '16px' }}>{t('api.active')}</span>
                      <span className="label">{t('api.status')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, background: '#020617', padding: '14px', borderRadius: '10px', border: '1px solid var(--glass-border)', fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent-blue)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{apiToken}</div>
                    <button onClick={handleCopyToken} className="btn-premium" style={{ background: 'rgba(255,255,255,0.05)', boxShadow: 'none' }}>{tokenCopied ? <Check size={16} /> : <Clipboard size={16} />}</button>
                  </div>
                </div>
              ) : (
                <button onClick={handleGenerateAPIToken} disabled={isGeneratingToken} className="btn-premium" style={{ background: 'var(--accent-teal)', margin: '20px auto' }}>{isGeneratingToken ? t('api.generating') : t('api.generateToken')}</button>
              )}
            </div>

            <div className="bento-item">
              <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><Code size={20} style={{ color: 'var(--accent-blue)' }} /> <h3>{t('api.implementation')}</h3></div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setSelectedLanguage('python')} className={`tab-btn ${selectedLanguage === 'python' ? 'active' : ''}`} style={{ padding: '6px 12px', fontSize: '12px' }}>Python</button>
                  <button onClick={() => setSelectedLanguage('js')} className={`tab-btn ${selectedLanguage === 'js' ? 'active' : ''}`} style={{ padding: '6px 12px', fontSize: '12px' }}>JavaScript</button>
                </div>
              </div>
              <div style={{ background: '#020617', padding: '24px', borderRadius: '12px', marginTop: '16px', border: '1px solid var(--glass-border)', boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.5)' }}>
                <pre style={{ margin: 0, color: '#93c5fd', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{selectedLanguage === 'python' ? pythonCode : jsCode}</pre>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ModelTraining;
