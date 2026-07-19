import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Alterna el idioma de la app entre español e inglés, persistido en localStorage. */
export function LanguageToggle() {
  const { t, i18n } = useTranslation('common');
  const isSpanish = i18n.language.startsWith('es');

  const toggleLanguage = () => {
    i18n.changeLanguage(isSpanish ? 'en' : 'es');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="btn-language-toggle"
      title={t('languageToggle.label')}
    >
      <Globe size={16} />
      <span>{isSpanish ? 'EN' : 'ES'}</span>
    </button>
  );
}
