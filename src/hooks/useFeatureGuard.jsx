/**
 * useFeatureGuard — the frontend layer of the three-layer entitlement model.
 *
 *   1. nav link   — hidden by required_feature (Sidebar) — casual discovery
 *   2. route/UI   — THIS — reacts to a FEATURE_NOT_LICENSED 403 and redirects
 *   3. API        — @RequiresFeature returns 403 — the authoritative gate
 *
 * ── WHY REACT TO 403 RATHER THAN PRECOMPUTE ─────────────────────────────────
 * The backend already strips nav rows whose required_feature the tenant lacks,
 * so the client's nav tree contains only ALLOWED routes. That means the client
 * cannot itself tell "unlicensed" from "unregistered" — both look like no match.
 * Precomputing entitlement on the client would also mean shipping the full
 * feature map to every browser, which leaks what capabilities exist.
 *
 * So the API is the single source of truth: any endpoint behind
 * @RequiresFeature returns 403 with code FEATURE_NOT_LICENSED when the tenant
 * lacks it. This hook installs a lightweight response interceptor that, on that
 * specific code, redirects to a friendly "not licensed" surface instead of
 * leaving the user on a broken page. This also correctly covers NON-module
 * routes (KashiLink, catalogue, reports) — anything whose API is gated — with
 * zero per-route wiring.
 *
 * Unlisted/detail routes are never affected: if their API carries no
 * @RequiresFeature, no 403 is ever raised, so nothing redirects.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../config/axios.config'
import toast from 'react-hot-toast'

export default function useFeatureGuard() {
  const navigate = useNavigate()

  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (error) => {
        // Error envelope is { status:'ERROR', error:{ code, message } }
        const err  = error?.response?.data?.error
        const code = err?.code
        if (error?.response?.status === 403 && code === 'FEATURE_NOT_LICENSED') {
          toast.error(err?.message || 'This feature is not enabled for your organization.')
          navigate('/dashboard', { replace: true })
        }
        return Promise.reject(error)
      }
    )
    return () => api.interceptors.response.eject(id)
  }, [navigate])
}