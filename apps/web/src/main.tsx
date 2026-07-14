import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from '@/app/providers/AppProviders'
import { clearLegacyAuthStorage } from '@/lib/auth/migration'
import '@/styles/global.css'

// One-release migration: remove the legacy Zustand payload that contained the JWT.
clearLegacyAuthStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
)
