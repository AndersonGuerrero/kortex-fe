import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import esCommon from './locales/es/common.json';
import esApp from './locales/es/app.json';
import esBilling from './locales/es/billing.json';
import esModelTraining from './locales/es/modelTraining.json';
import esProjectDetails from './locales/es/projectDetails.json';
import esEtiquetado from './locales/es/etiquetado.json';
import esPdfEditor from './locales/es/pdfEditor.json';
import esLogin from './locales/es/login.json';
import esCallback from './locales/es/callback.json';
import esApi from './locales/es/api.json';

import enCommon from './locales/en/common.json';
import enApp from './locales/en/app.json';
import enBilling from './locales/en/billing.json';
import enModelTraining from './locales/en/modelTraining.json';
import enProjectDetails from './locales/en/projectDetails.json';
import enEtiquetado from './locales/en/etiquetado.json';
import enPdfEditor from './locales/en/pdfEditor.json';
import enLogin from './locales/en/login.json';
import enCallback from './locales/en/callback.json';
import enApi from './locales/en/api.json';

const STORAGE_KEY = 'kortex-language';

i18n.use(initReactI18next).init({
  ns: [
    'common',
    'app',
    'billing',
    'modelTraining',
    'projectDetails',
    'etiquetado',
    'pdfEditor',
    'login',
    'callback',
    'api',
  ],
  defaultNS: 'common',
  resources: {
    es: {
      common: esCommon,
      app: esApp,
      billing: esBilling,
      modelTraining: esModelTraining,
      projectDetails: esProjectDetails,
      etiquetado: esEtiquetado,
      pdfEditor: esPdfEditor,
      login: esLogin,
      callback: esCallback,
      api: esApi,
    },
    en: {
      common: enCommon,
      app: enApp,
      billing: enBilling,
      modelTraining: enModelTraining,
      projectDetails: enProjectDetails,
      etiquetado: enEtiquetado,
      pdfEditor: enPdfEditor,
      login: enLogin,
      callback: enCallback,
      api: enApi,
    },
  },
  lng: localStorage.getItem(STORAGE_KEY) || 'es',
  fallbackLng: 'es',
  interpolation: {
    escapeValue: false,
  },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng);
});

export default i18n;
