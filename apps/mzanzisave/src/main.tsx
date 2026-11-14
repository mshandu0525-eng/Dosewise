import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AppProvider } from './lib/state';
import { FeedProvider } from './lib/useFeed';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <FeedProvider>
        <App />
      </FeedProvider>
    </AppProvider>
  </StrictMode>,
);

// Offline cache. Not available inside sandboxed previews, which is fine: the app still works.
if (import.meta.env.PROD && import.meta.env.MODE !== 'artifact' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
