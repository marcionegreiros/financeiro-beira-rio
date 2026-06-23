import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Fontes self-hosted (offline-first): Inter (corpo), Space Grotesk (display),
// IBM Plex Mono (números). Importadas localmente para funcionar sem internet.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

import './index.css';
import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento #root não encontrado.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
