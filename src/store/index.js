import { configureStore } from '@reduxjs/toolkit'
import authReducer     from './slices/authSlice'
import uiConfigReducer from './slices/uiConfigSlice'

export const store = configureStore({
  reducer: {
    auth:     authReducer,
    uiConfig: uiConfigReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: { ignoredActions: ['auth/loginSuccess'] } }),
})
