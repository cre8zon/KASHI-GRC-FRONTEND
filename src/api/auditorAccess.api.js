import api from '../config/axios.config'

/**
 * Auditor access — the two-sided flow for external audit firms.
 *
 * The split matters and is enforced server-side: a CLIENT decides which FIRM may
 * work in its tenant (a grant), the FIRM decides which of its own people staff
 * that client (guest memberships), and the client keeps a veto over both. A
 * client never creates an identity for another company's employee.
 *
 * Which half of this file applies depends entirely on which tenant the caller's
 * token names — the same endpoints behave differently for a client admin and a
 * firm admin because tenant scope decides who "I" am.
 */
export const auditorAccessApi = {

  // ── Client side ───────────────────────────────────────────────────────────

  /** Audit firms this tenant could admit. Name and id only. */
  firms: () => api.get('/v1/auditor-access/firms'),

  /** Firms already admitted here, active or revoked. */
  grants: () => api.get('/v1/auditor-access/grants'),

  /** Admit a firm. expiresAt bounds every auditor it later places here. */
  grantFirm: ({ firmTenantId, expiresAt, note }) =>
    api.post('/v1/auditor-access/grants', { firmTenantId, expiresAt, note }),

  /** Revoke a firm — cascades to every auditor it placed in this tenant. */
  revokeGrant: (grantId) => api.delete(`/v1/auditor-access/grants/${grantId}`),

  /** External auditors currently inside this tenant, with firm and expiry. */
  guests: () => api.get('/v1/auditor-access/guests'),

  /** Revoke one external auditor without removing the firm. */
  revokeGuest: (membershipId) => api.delete(`/v1/auditor-access/guests/${membershipId}`),

  // ── Access requests (firm asks, client decides) ───────────────────────────

  /** Both directions: { incoming, outgoing }. Which one matters depends on who you are. */
  requests: () => api.get('/v1/auditor-access/requests'),

  /** Firm asks a client for access, identified by the code the client gave them. */
  requestAccess: ({ clientCode, requestedUntil, message }) =>
    api.post('/v1/auditor-access/requests', { clientCode, requestedUntil, message }),

  /** Client approves. expiresAt is the CLIENT's date — the firm's is only a suggestion. */
  approveRequest: (id, { expiresAt }) =>
    api.post(`/v1/auditor-access/requests/${id}/approve`, { expiresAt }),

  /** Client declines, with a reason the firm will see. */
  declineRequest: (id, { note }) =>
    api.post(`/v1/auditor-access/requests/${id}/decline`, { note }),

  /** Firm withdraws its own pending request. */
  withdrawRequest: (id) => api.delete(`/v1/auditor-access/requests/${id}`),

  // ── Firm side ─────────────────────────────────────────────────────────────

  /** Clients this firm may staff, each with who is already assigned. */
  clients: () => api.get('/v1/auditor-access/clients'),

  /** Assign one of this firm's auditors to a client. */
  assignAuditor: (clientTenantId, { userId, roleId, expiresAt }) =>
    api.post(`/v1/auditor-access/clients/${clientTenantId}/auditors`, { userId, roleId, expiresAt }),

  /** Withdraw one of this firm's auditors from a client. */
  withdrawAuditor: (clientTenantId, userId) =>
    api.delete(`/v1/auditor-access/clients/${clientTenantId}/auditors/${userId}`),
}