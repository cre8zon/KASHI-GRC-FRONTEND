import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster, ToastBar, toast } from 'react-hot-toast'
import App from './App'
import { store } from './store'
import { queryClient } from './config/queryClient'
import './index.css'

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
                background: 'rgb(22 33 56)',
                color: 'rgb(241 245 249)',
                border: '1px solid rgb(51 65 85)',
                fontFamily: "'DM Sans', system-ui",
                fontSize: '14px',
                borderRadius: '8px',
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