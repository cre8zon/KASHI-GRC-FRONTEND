import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster, ToastBar, toast } from 'react-hot-toast'
import App from './App'
import { store } from './store'
import { queryClient } from './config/queryClient'
import { applySavedBrandPreset } from './config/brandPresets'
import './index.css'

// Paint the saved pastel brand preset before first render.
applySavedBrandPreset()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 5000,
              style: {
                background: 'var(--surface-raised)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-overlay)',
                fontFamily: "'Albert Sans', system-ui",
                fontSize: '14px',
                borderRadius: 'var(--radius-ctl)',
              },
            }}
          >
            {(t) => (
              <ToastBar toast={t}>
                {({ icon, message }) => (
                  <>
                    {icon}
                    {message}
                    {t.type !== 'loading' && (
                      <button
                        onClick={() => toast.dismiss(t.id)}
                        style={{ marginLeft: '6px', opacity: 0.5, flexShrink: 0, lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
              </ToastBar>
            )}
          </Toaster>
        </BrowserRouter>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>
)