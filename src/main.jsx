import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AppToaster } from './components/ui/AppToaster'
import App from './App'
import { store } from './store'
import { queryClient } from './config/queryClient'
import { applySavedBrandPreset } from './config/brandPresets'
import AnalyticsBridge from './components/analytics/AnalyticsBridge'
import './index.css'

// Paint the saved pastel brand preset before first render.
applySavedBrandPreset()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        {/* v7_startTransition: navigations run as React transitions, so while
            the next page's code loads the CURRENT page stays on screen instead
            of being swapped for a loading state — no flash between pages. */}
        <BrowserRouter future={{ v7_startTransition: true }}>
          {/* Inside the Router and the Provider, because it reads both the
              location and the auth state. Renders nothing. */}
          <AnalyticsBridge />
          <App />
          <AppToaster />
        </BrowserRouter>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>
)