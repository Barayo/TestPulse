import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import i18next from './i18n/index.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18next}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nextProvider>
  </StrictMode>,
)
