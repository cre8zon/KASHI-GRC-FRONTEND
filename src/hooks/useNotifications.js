import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { notificationsApi } from '../api/notifications.api'
import { QUERY_KEYS } from '../config/constants'
import toast from 'react-hot-toast'

export const useNotifications = (params) => useQuery({
  queryKey: [...QUERY_KEYS.NOTIFICATIONS, params],
  queryFn:  () => notificationsApi.list(params),
  refetchInterval: 30 * 1000,
})

export const useMarkRead = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS }),
  })
}

/**
 * Watches for new unread notifications and shows a branded toast.
 * Uses sessionStorage to persist seen IDs across re-renders but NOT across
 * full page refreshes intentionally — we track via a Set stored in module scope
 * so it survives re-renders but resets on actual page load.
 */

// Module-level Set — survives re-renders, resets only on hard page load
// This is the key fix: ref-based approach resets on every remount
let _seenIds = null  // null = not initialized yet this session

export const useNotificationToast = () => {
  const { data } = useNotifications({ read: false, take: 20 })
  const initialized = useRef(false)

  useEffect(() => {
    const notifications = data?.data?.items || data?.items || data?.data || []
    if (!Array.isArray(notifications) || notifications.length === 0) return

    if (_seenIds === null) {
      // First load this session — record all existing IDs silently
      _seenIds = new Set(notifications.map(n => n.id))
      initialized.current = true
      return
    }

    // Find truly new ones not seen this session
    const newOnes = notifications.filter(n => !_seenIds.has(n.id))
    if (newOnes.length === 0) return

    newOnes.forEach(n => {
      toast(n.message || 'New notification', {
        duration: 5000,
        icon: '🔔',
        style: {
          background: 'var(--surface-raised)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid rgb(var(--color-brand-600))',
          borderRadius: 'var(--radius-ctl)',
          fontSize: '12px',
          maxWidth: '360px',
          padding: '10px 14px',
          boxShadow: '0 4px 16px rgb(var(--color-on-dark-inv) / 0.25)',
        },
      })
      _seenIds.add(n.id)
    })
  }, [data])
}