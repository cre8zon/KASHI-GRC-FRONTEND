/**
 * AssessmentReportPage — /reports/assessments/:id
 *
 * Dedicated, stakeholder-friendly read-only report for a single vendor assessment.
 * Sections: Header · Executive Summary · Section Breakdown · Consolidated Findings
 *           Full Q&A Detail · Open Action Items · Audit Trail · Sign-off Chain
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectRoles } from '../../store/slices/authSlice'
import toast from 'react-hot-toast'
import { assessmentsApi } from '../../api/assessments.api'
import {
  ArrowLeft, Download, Shield, CheckCircle2, XCircle, AlertTriangle,
  Minus, Clock, Building2, FileText, Activity, ChevronDown, ChevronRight,
  User, Calendar, Star, Award, Circle, Hash
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../config/axios.config'

// ── Data fetching ─────────────────────────────────────────────────────────────
const fetchReport    = (id)         => api.get(`/v1/assessments/${id}/review`)
const fetchProgress  = (instanceId) =>
  api.get(`/v1/workflow-instances/${instanceId}/progress`)
    .then(r => Array.isArray(r) ? r : (r ? [r] : []))
    .catch(() => [])
const fetchActionItems = (id) =>
  api.get('/v1/action-items', { params: { entityType: 'ASSESSMENT', entityId: id } })
    .then(r => Array.isArray(r) ? r : (r?.items ?? []))
    .catch(() => [])

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt     = (dt) => dt ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtTime = (dt) => dt ? new Date(dt).toLocaleString('en-GB',  { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const RISK_CFG = {
  LOW:      { color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/30',  bar: 'bg-green-500'  },
  MEDIUM:   { color: 'text-amber-400',  bg: 'bg-amber-500/10  border-amber-500/30',  bar: 'bg-amber-500'  },
  HIGH:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', bar: 'bg-orange-500' },
  CRITICAL: { color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30',    bar: 'bg-red-500'    },
}

const VERDICT_CFG = {
  PASS:          { color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/30'  },
  PARTIAL:       { color: 'text-amber-400',  bg: 'bg-amber-500/10  border-amber-500/30'  },
  FAIL:          { color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30'    },
  PENDING:       { color: 'text-text-muted', bg: 'bg-surface-overlay border-border'      },
  'NO RESPONSE': { color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30'    },
}

// A response is genuine only if the vendor actually answered — excludes shell rows
// created by saveReviewerEval for unanswered questions.
const isGenuineAnswer = (resp) => {
  if (!resp) return false
  if (resp.responseText?.startsWith('[FILE_UPLOADED')) return true
  if (resp.selectedOptionInstanceId != null) return true
  if ((resp.selectedOptionInstanceIds?.length ?? 0) > 0) return true
  if (resp.responseText && resp.responseText !== '' && !resp.responseText.startsWith('[')) return true
  return false
}

function VerdictChip({ status }) {
  const cfg = VERDICT_CFG[status] || VERDICT_CFG.PENDING
  return (
    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', cfg.bg, cfg.color)}>
      {status}
    </span>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ id, title, icon: Icon, children }) {
  return (
    <section id={id} className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2.5">
        {Icon && <Icon size={15} className="text-brand-400 shrink-0"/>}
        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

// ── PDF Generator ─────────────────────────────────────────────────────────────
async function generatePDF(assessment, sections = []) {
  const risk      = assessment?.riskRating
  const riskColor = risk === 'LOW' ? '#166534' : risk === 'MEDIUM' ? '#92400e' : risk === 'HIGH' ? '#9a3412' : '#991b1b'
  const riskBg    = risk === 'LOW' ? '#dcfce7'  : risk === 'MEDIUM' ? '#fef3c7'  : risk === 'HIGH' ? '#fed7aa'  : '#fee2e2'
  const riskBorder= risk === 'LOW' ? '#16a34a'  : risk === 'MEDIUM' ? '#d97706'  : risk === 'HIGH' ? '#ea580c'  : '#dc2626'
  const remed     = assessment?.openRemediationCount ?? 0
  const earned    = assessment?.totalEarnedScore ?? 0
  const possible  = assessment?.totalPossibleScore ?? 0
  const pct       = possible > 0 ? Math.round(earned / possible * 100) : 0
  const pctColor  = pct >= 80 ? '#166534' : pct >= 60 ? '#92400e' : '#991b1b'
  const pctBg     = pct >= 80 ? '#dcfce7'  : pct >= 60 ? '#fef3c7'  : '#fee2e2'
  const fmtDate   = (dt) => dt ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
  const fmtShort  = (dt) => dt ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  // ── Section rows with inline SVG stacked bars ──────────────────────────────
  const sectionRows = sections.map((sec, idx) => {
    const qs      = sec.questions || []
    const pass    = qs.filter(q => q.currentResponse?.reviewerStatus === 'PASS').length
    const partial = qs.filter(q => q.currentResponse?.reviewerStatus === 'PARTIAL').length
    const fail    = qs.filter(q => q.currentResponse?.reviewerStatus === 'FAIL' || !q.currentResponse).length
    const secE    = qs.reduce((s, q) => {
      const rs = q.currentResponse?.reviewerStatus; const raw = q.currentResponse?.scoreEarned ?? 0
      if (!q.currentResponse) return s; if (rs === 'FAIL') return s; if (rs === 'PARTIAL') return s + raw * 0.5; return s + raw
    }, 0)
    const secP    = qs.reduce((s, q) => s + (q.weight || 1), 0)
    const secPct  = secP > 0 ? Math.round(secE / secP * 100) : 0
    const scoreColor = secPct >= 80 ? '#166534' : secPct >= 60 ? '#d97706' : '#dc2626'
    const genuineAnswered = qs.filter(q => {
      const r = q.currentResponse
      return r && (r.responseText?.startsWith('[FILE_UPLOADED') || r.selectedOptionInstanceId != null || (r.selectedOptionInstanceIds?.length ?? 0) > 0 || (r.responseText && !r.responseText.startsWith('[')))
    }).length

    // SVG stacked bar
    const total     = qs.length || 1
    const passW     = Math.round(pass   / total * 200)
    const partialW  = Math.round(partial / total * 200)
    const failW     = Math.round(fail    / total * 200)
    const barSvg = `<svg width="200" height="8" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="200" height="8" rx="4" fill="#f3f4f6"/>
      <rect x="0" y="0" width="${passW}" height="8" rx="4" fill="#22c55e"/>
      <rect x="${passW}" y="0" width="${partialW}" height="8" fill="#f59e0b"/>
      <rect x="${passW + partialW}" y="0" width="${failW}" height="8" rx="4" fill="#ef4444"/>
    </svg>`

    return `<tr style="background:${idx%2===0?'#ffffff':'#f9fafb'}">
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:12px">${sec.sectionName}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;color:#374151">${genuineAnswered}/${qs.length}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;font-weight:700;color:#166534">${pass}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;font-weight:700;color:#d97706">${partial}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;font-weight:700;color:#dc2626">${fail}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;vertical-align:middle">${barSvg}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;font-weight:800;color:${scoreColor}">${secPct}%</td>
    </tr>`
  }).join('')

  // ── Action items summary ───────────────────────────────────────────────────
  const allQs       = sections.flatMap(s => s.questions || [])
  const totalPass   = allQs.filter(q => q.currentResponse?.reviewerStatus === 'PASS').length
  const totalFail   = allQs.filter(q => q.currentResponse?.reviewerStatus === 'FAIL' || !q.currentResponse).length
  const totalPart   = allQs.filter(q => q.currentResponse?.reviewerStatus === 'PARTIAL').length
  const totalQs     = allQs.length
  const answered    = allQs.filter(q => { const r = q.currentResponse; return r && (r.responseText?.startsWith('[FILE_UPLOADED') || r.selectedOptionInstanceId != null || (r.selectedOptionInstanceIds?.length ?? 0) > 0 || (r.responseText && !r.responseText.startsWith('['))) }).length

  // ── Action Items section ───────────────────────────────────────────────────
  // Passed in from the page component via assessment.pdfActionItems (optional)
  const pdfActionItems = assessment?._pdfActionItems || []
  const actionItemsHtml = pdfActionItems.length > 0 ? `
  <div class="section-label" style="margin-top:28px">Open Action Items &amp; Remediation Plan</div>
  <table>
    <thead><tr>
      <th>Title / Description</th>
      <th style="width:100px;text-align:center">Priority</th>
      <th style="width:90px;text-align:center">Status</th>
      <th style="width:110px;text-align:center">Due Date</th>
    </tr></thead>
    <tbody>
      ${pdfActionItems.slice(0, 30).map((item, i) => {
        const prColor = item.priority === 'CRITICAL' ? '#dc2626' : item.priority === 'HIGH' ? '#ea580c' : item.priority === 'MEDIUM' ? '#d97706' : '#6b7280'
        const prBg    = item.priority === 'CRITICAL' ? '#fee2e2' : item.priority === 'HIGH' ? '#ffedd5' : item.priority === 'MEDIUM' ? '#fef3c7' : '#f3f4f6'
        const stColor = item.status === 'RESOLVED' ? '#166534' : item.status === 'IN_PROGRESS' ? '#1d4ed8' : '#d97706'
        const stBg    = item.status === 'RESOLVED' ? '#dcfce7'  : item.status === 'IN_PROGRESS' ? '#eff6ff'  : '#fef9c3'
        return `<tr style="background:${i%2===0?'#ffffff':'#f9fafb'}">
          <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#1a1a2e">${(item.title || '').replace(/</g,'&lt;')}</td>
          <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;text-align:center">
            ${item.priority ? `<span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${prBg};color:${prColor}">${item.priority}</span>` : '<span style="color:#9ca3af">—</span>'}
          </td>
          <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;text-align:center">
            <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${stBg};color:${stColor}">${item.status || 'OPEN'}</span>
          </td>
          <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:11px;color:${item.dueAt && new Date(item.dueAt) < new Date() ? '#dc2626' : '#374151'}">
            ${item.dueAt ? fmtShort(item.dueAt) : '<span style="color:#9ca3af">No due date</span>'}
          </td>
        </tr>`
      }).join('')}
    </tbody>
  </table>
  ${pdfActionItems.length > 30 ? `<p style="font-size:10px;color:#9ca3af;margin-top:6px">Showing 30 of ${pdfActionItems.length} action items.</p>` : ''}
  ` : `
  <div class="section-label" style="margin-top:28px">Open Action Items &amp; Remediation Plan</div>
  <div style="padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:12px;color:#166534;display:flex;align-items:center;gap:8px">
    ✓ No open action items — all findings have been addressed or no remediations are required.
  </div>`

  // ── Sign-off Chain section ─────────────────────────────────────────────────
  // Sign-off chain derived from progress — same data source as WorkflowTimeline
  // Sign-off chain from progress (same as WorkflowTimeline) — names already resolved
  const pdfProgress  = assessment?._pdfProgress || []
  const pdfSummary   = Array.isArray(pdfProgress) ? pdfProgress[0] : pdfProgress
  const pdfSteps     = pdfSummary?.steps || []
  const signOffs     = pdfSteps
    .filter(step => step.visited)
    .flatMap(step => {
      const iter  = step.iterations?.[step.iterations.length - 1]
      return (iter?.tasks || [])
        .filter(t => t.taskRole !== 'ASSIGNER' && t.status === 'APPROVED')
        .map(t => ({
          key:        `${t.taskId}`,
          name:       t.assignedUserName || (t.assignedUserId ? `User #${t.assignedUserId}` : 'System'),
          role:       step.stepName || 'Approver',
          approvedAt: t.actedAt,
        }))
    })

  const signOffHtml = signOffs.length > 0 ? `
  <div class="section-label" style="margin-top:28px">Sign-off &amp; Approval Chain</div>
  <div style="display:grid;grid-template-columns:repeat(${Math.min(signOffs.length, 3)},1fr);gap:12px">
    ${signOffs.map((s, i) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:#f9fafb">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:34px;height:34px;border-radius:50%;background:#ede9fe;border:2px solid #c4b5fd;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#6d28d9;flex-shrink:0">${(s.name || '?')[0].toUpperCase()}</div>
        <div>
          <div style="font-size:12px;font-weight:700;color:#1a1a2e">${s.name || 'Unknown User'}</div>
          <div style="font-size:10px;color:#6b7280">${s.role}</div>
        </div>
      </div>
      <div style="font-size:10px;color:#166534;font-weight:700;margin-bottom:2px">✓ Approved</div>
      <div style="font-size:10px;color:#9ca3af">${s.approvedAt ? fmtDate(s.approvedAt) : '—'}</div>
    </div>`).join('')}
  </div>` : `
  <div class="section-label" style="margin-top:28px">Sign-off &amp; Approval Chain</div>
  <div style="padding:16px;background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#9ca3af;font-style:italic">
    Sign-off data not available — workflow approvals are recorded once the assessment is fully completed.
  </div>`

  // ── Compliance circle SVG ──────────────────────────────────────────────────
  const radius = 54; const circ = 2 * Math.PI * radius
  const dashOffset = circ - (pct / 100) * circ
  const complianceCircle = `<svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
    <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="12"/>
    <circle cx="70" cy="70" r="${radius}" fill="none" stroke="${pct>=80?'#22c55e':pct>=60?'#f59e0b':'#ef4444'}"
      stroke-width="12" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${dashOffset.toFixed(1)}"
      stroke-linecap="round" transform="rotate(-90 70 70)"/>
    <text x="70" y="64" text-anchor="middle" font-size="26" font-weight="800" fill="${pct>=80?'#166534':pct>=60?'#92400e':'#991b1b'}" font-family="Arial">${pct}%</text>
    <text x="70" y="82" text-anchor="middle" font-size="10" fill="#6b7280" font-family="Arial">Compliance</text>
  </svg>`

  // ── Failed items for page 2 ────────────────────────────────────────────────
  const failedItems = sections.flatMap(sec =>
    (sec.questions || [])
      .filter(q => q.currentResponse?.reviewerStatus === 'FAIL'
               || q.currentResponse?.reviewerStatus === 'PARTIAL'
               || !q.currentResponse)
      .map(q => ({ section: sec.sectionName, question: q.questionText || q.questionTextSnapshot,
                   verdict: q.currentResponse?.reviewerStatus || 'NO RESPONSE' }))
  )
  const failedRows = failedItems.slice(0, 25).map(item => {
    const vc = item.verdict === 'PASS' ? '#166534' : item.verdict === 'PARTIAL' ? '#d97706' : '#dc2626'
    const vb = item.verdict === 'PASS' ? '#dcfce7' : item.verdict === 'PARTIAL' ? '#fef3c7' : '#fee2e2'
    return `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;font-size:10px;color:#6b7280;width:160px">${item.section}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#374151">${item.question.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;text-align:center;width:80px">
        <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${vb};color:${vc}">${item.verdict}</span>
      </td>
    </tr>`
  }).join('')

  // ── Per-question detail pages ──────────────────────────────────────────────
  const questionSections = sections.map(sec => {
    const qs = sec.questions || []; if (!qs.length) return ''
    const qRows = qs.map((q, qi) => {
      const resp = q.currentResponse
      const rs   = resp?.reviewerStatus
      const isGenuine = resp && (resp.responseText?.startsWith('[FILE_UPLOADED') || resp.selectedOptionInstanceId != null || (resp.selectedOptionInstanceIds?.length ?? 0) > 0 || (resp.responseText && !resp.responseText.startsWith('[')))
      const verdict = rs && rs !== 'PENDING' ? rs : (isGenuine ? 'PENDING' : 'NO RESPONSE')
      const vc = verdict==='PASS'?'#166534':verdict==='PARTIAL'?'#d97706':'#dc2626'
      const vb = verdict==='PASS'?'#dcfce7':verdict==='PARTIAL'?'#fef3c7':'#fee2e2'
      let answerHtml = '<span style="color:#9ca3af;font-style:italic">Not answered</span>'
      if (isGenuine) {
        if (['TEXT','NUMERIC','DATE'].includes(q.responseType))
          answerHtml = `<span style="color:#374151">${(resp.responseText||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`
        else if (['SINGLE_CHOICE','MULTI_CHOICE'].includes(q.responseType)) {
          const ids = new Set([...(resp.selectedOptionInstanceIds?.map(Number)||[]),...(resp.selectedOptionInstanceId!=null?[Number(resp.selectedOptionInstanceId)]:[]) ])
          const opts = (q.options||[]).filter(o=>ids.has(Number(o.optionInstanceId))).map(o=>`<span style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;padding:1px 8px;border-radius:4px;margin:1px 2px;font-size:11px">${o.optionValue}</span>`).join(' ')
          answerHtml = opts || '<span style="color:#9ca3af;font-style:italic">No option selected</span>'
        } else if (q.responseType==='FILE_UPLOAD') answerHtml='<span style="color:#6b7280">📎 File uploaded</span>'
      }
      return `<tr style="background:${qi%2===0?'#ffffff':'#f9fafb'}">
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:11px;color:#9ca3af;width:24px;text-align:right;font-weight:600">${qi+1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top">
          <div style="font-size:12px;font-weight:500;color:#1a1a2e;margin-bottom:4px">${(q.questionText || q.questionTextSnapshot || 'Question text not available').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
          <div style="font-size:11px;color:#6b7280">${answerHtml}</div>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top;text-align:center;width:80px">
          <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${vb};color:${vc}">${verdict}</span>
        </td>
      </tr>`
    }).join('')
    return `<div style="margin-top:20px;page-break-inside:avoid">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#6366f1;padding:8px 12px;background:#f5f3ff;border-left:3px solid #6366f1;margin-bottom:0">${sec.sectionName || 'Unnamed Section'}</div>
      <table style="width:100%;border-collapse:collapse"><tbody>${qRows}</tbody></table>
    </div>`
  }).join('')

  const html = `<!DOCTYPE html><html><head>
  <title>Vendor Assessment Report — ${assessment?.vendorName}</title>
  <meta charset="UTF-8"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;font-size:13px;line-height:1.5;background:#fff}
    .page{padding:36px 44px;max-width:980px;margin:0 auto}
    .cover{background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);color:white;padding:48px 44px 40px;margin:-36px -44px 0 -44px}
    .section-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:2.5px;color:#6366f1;border-bottom:2px solid #6366f1;padding-bottom:6px;margin:28px 0 16px}
    .metric-row{display:flex;gap:12px;margin-bottom:24px}
    .metric{border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:#f9fafb;flex:1;text-align:center}
    .metric-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f1f5f9;text-align:left;padding:10px 14px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;border-bottom:2px solid #e2e8f0}
    .divider{border:none;border-top:1px solid #e5e7eb;margin:24px 0}
    .page-num{position:fixed;bottom:20px;right:44px;font-size:10px;color:#9ca3af}
    .footer-bar{margin-top:36px;padding-top:12px;border-top:2px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .page{padding:28px 36px}
      .cover{margin:-28px -36px 0 -36px}
      .page-break{page-break-before:always}
    }
  </style></head><body><div class="page">

  <!-- COVER -->
  <div class="cover">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;font-weight:800;letter-spacing:3px;opacity:.6;text-transform:uppercase;margin-bottom:2px">KashiGRC</div>
        <div style="font-size:9px;opacity:.5;letter-spacing:2px;text-transform:uppercase">Third-Party Risk Management</div>
      </div>
      <div style="text-align:right;font-size:10px;opacity:.5">
        <div>Assessment #${assessment?.assessmentId}</div>
        <div>${fmtDate(new Date())}</div>
      </div>
    </div>
    <div style="margin-top:28px">
      <div style="font-size:38px;font-weight:900;line-height:1.1;letter-spacing:-1px">${assessment?.vendorName || 'Unknown Vendor'}</div>
      <div style="font-size:13px;opacity:.65;margin-top:6px">${assessment?.templateName || 'No template name'}</div>
    </div>
    <!-- Risk band -->
    <div style="margin-top:28px;display:flex;align-items:center;gap:20px">
      <div style="background:${riskBg};border:2px solid ${riskBorder};padding:8px 20px;border-radius:8px;font-size:16px;font-weight:900;color:${riskColor};letter-spacing:1px">${risk||'UNRATED'}</div>
      <div style="font-size:12px;opacity:.7">
        ${assessment?.submittedAt ? `<div>Submitted: ${fmtShort(assessment.submittedAt)}</div>` : ''}
        ${assessment?.completedAt ? `<div>Completed: ${fmtShort(assessment.completedAt)}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- EXECUTIVE SUMMARY -->
  <div class="section-label" style="margin-top:32px">Executive Summary</div>
  <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:20px">
    <!-- Compliance gauge -->
    <div style="flex-shrink:0;text-align:center">
      ${complianceCircle}
      <div style="font-size:10px;color:#6b7280;margin-top:-4px">${possible > 0 ? earned.toFixed(1) + ' / ' + possible + ' wt pts' : 'Not scored yet'}</div>
    </div>
    <!-- Metrics grid -->
    <div style="flex:1">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="metric" style="border-left:3px solid ${riskBorder}">
          <div class="metric-label">Risk Rating</div>
          <div style="font-size:18px;font-weight:900;color:${riskColor};letter-spacing:1px">${risk||'UNRATED'}</div>
        </div>
        <div class="metric" style="border-left:3px solid #22c55e">
          <div class="metric-label">Pass</div>
          <div style="font-size:24px;font-weight:800;color:#166534">${totalPass}</div>
          <div style="font-size:9px;color:#9ca3af">${totalQs > 0 ? Math.round(totalPass/totalQs*100) : 0}% of questions</div>
        </div>
        <div class="metric" style="border-left:3px solid #ef4444">
          <div class="metric-label">Fail / No Response</div>
          <div style="font-size:24px;font-weight:800;color:#dc2626">${totalFail}</div>
          <div style="font-size:9px;color:#9ca3af">${totalQs > 0 ? Math.round(totalFail/totalQs*100) : 0}% of questions</div>
        </div>
        <div class="metric">
          <div class="metric-label">Total Questions</div>
          <div style="font-size:24px;font-weight:800;color:#374151">${totalQs}</div>
        </div>
        <div class="metric" style="border-left:3px solid #f59e0b">
          <div class="metric-label">Partial</div>
          <div style="font-size:24px;font-weight:800;color:#d97706">${totalPart}</div>
        </div>
        <div class="metric" style="border-left:3px solid ${remed>0?'#f59e0b':'#22c55e'}">
          <div class="metric-label">Open Remediations</div>
          <div style="font-size:24px;font-weight:800;color:${remed>0?'#d97706':'#166534'}">${remed}</div>
        </div>
      </div>
      <div style="margin-top:10px;padding:10px 14px;background:#f8fafc;border-radius:8px;border-left:3px solid #6366f1;font-size:11px;color:#475569">
        <strong>Answered:</strong> ${answered} of ${totalQs} questions (${totalQs > 0 ? Math.round(answered/totalQs*100) : 0}%) &nbsp;&middot;&nbsp;
        <strong style="color:${pct>=80?'#166534':pct>=60?'#d97706':'#dc2626'}">Compliance score: ${pct}%</strong>
        ${pct < 60 ? ' — <strong style="color:#dc2626">Below acceptable threshold</strong>' : pct < 80 ? ' — Needs improvement' : ' — Meets standard'}
      </div>
    </div>
  </div>

  <!-- SECTION COMPLIANCE -->
  <div class="section-label">Section Compliance Breakdown</div>
  <table>
    <thead><tr>
      <th>Section</th><th style="text-align:center">Answered</th>
      <th style="text-align:center">Pass</th><th style="text-align:center">Partial</th>
      <th style="text-align:center">Fail</th><th style="text-align:center">Distribution</th>
      <th style="text-align:center">Score</th>
    </tr></thead>
    <tbody>${sectionRows}</tbody>
  </table>
  <div style="font-size:9px;color:#9ca3af;margin-top:6px;text-align:right">
    <span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Pass &nbsp;
    <span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Partial &nbsp;
    <span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Fail
  </div>

  <!-- CONSOLIDATED FINDINGS -->
  <div class="section-label">Consolidated Findings</div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid #6366f1;border-radius:8px;padding:18px 20px;font-size:12px;line-height:1.8;color:#374151;white-space:pre-wrap">${
    assessment?.reviewFindings
      ? assessment.reviewFindings.replace(/</g,'&lt;').replace(/>/g,'&gt;')
      : '<span style="color:#9ca3af;font-style:italic">No consolidated findings documented yet. Findings are added at Step 10 of the review workflow.</span>'
  }</div>

  <!-- GAPS & FAILED ITEMS — flows naturally after findings -->
  ${failedItems.length > 0 ? `
  <div class="section-label">Gaps & Failed Evaluations (${failedItems.length})</div>
  <table>
    <thead><tr><th>Section</th><th>Question</th><th style="text-align:center">Verdict</th></tr></thead>
    <tbody>${failedRows}</tbody>
  </table>
  ${failedItems.length > 25 ? `<p style="font-size:10px;color:#9ca3af;margin-top:6px">Showing first 25 of ${failedItems.length} items. See full detail below.</p>` : ''}
  ` : ''}

  <!-- PER-QUESTION DETAIL — no forced page break, flows naturally -->
  ${sections.length > 0 ? `
  <div class="section-label" style="margin-top:28px">Per-Question Evaluation Detail</div>
  <p style="font-size:11px;color:#9ca3af;margin-bottom:12px">PASS = full credit &middot; PARTIAL = 50% &middot; FAIL / No response = 0</p>
  ${questionSections}
  ` : ''}

  <!-- ACTION ITEMS / REMEDIATION PLAN -->
  ${actionItemsHtml}

  <!-- SIGN-OFF CHAIN -->
  ${signOffHtml}

  <!-- ASSESSMENT DETAILS -->
  <div class="section-label" style="margin-top:28px">Assessment Details</div>
  <table>
    <thead><tr><th style="width:200px">Field</th><th>Value</th></tr></thead>
    <tbody>
      <tr style="background:#ffffff"><td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">Vendor</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-weight:600;font-size:12px">${assessment?.vendorName || '—'}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">Template</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-size:12px">${assessment?.templateName || '—'}</td></tr>
      <tr style="background:#ffffff"><td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">Assessment ID</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-size:12px;font-family:monospace">#${assessment?.assessmentId}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">Status</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-size:12px">
          <span style="padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;background:${assessment?.status==='COMPLETED'?'#dcfce7':'#eff6ff'};color:${assessment?.status==='COMPLETED'?'#166534':'#1d4ed8'}">${assessment?.status || '—'}</span></td></tr>
      <tr style="background:#ffffff"><td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">Risk Rating</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-size:12px">
          ${risk ? `<span style="padding:2px 10px;border-radius:4px;font-size:11px;font-weight:800;background:${riskBg};color:${riskColor};border:1px solid ${riskBorder}">${risk}</span>` : '<span style="color:#9ca3af">Not rated</span>'}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">Compliance Score</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-size:12px">
          <strong style="font-size:15px;color:${pctColor}">${pct}%</strong>
          <span style="color:#9ca3af;font-size:11px;margin-left:8px">(${earned.toFixed(1)} / ${possible} weighted pts)</span></td></tr>
      <tr style="background:#ffffff"><td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">Questions Answered</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-size:12px">${answered} of ${totalQs} (${totalQs > 0 ? Math.round(answered/totalQs*100) : 0}%)</td></tr>
      <tr style="background:#f9fafb"><td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">Open Remediations</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:700;color:${remed>0?'#d97706':'#166534'}">${remed}</td></tr>
      <tr style="background:#ffffff"><td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">Submitted</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f3f4f6;font-size:12px">${assessment?.submittedAt ? fmtDate(assessment.submittedAt) : (assessment?.status && !['ASSIGNED','IN_PROGRESS'].includes(assessment.status) ? '<span style="color:#9ca3af">Date not recorded</span>' : '<span style="color:#9ca3af">Pending submission</span>')}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:9px 14px;color:#6b7280;font-size:12px">Completed</td>
        <td style="padding:9px 14px;font-size:12px">${assessment?.completedAt ? fmtDate(assessment.completedAt) : (assessment?.status === 'COMPLETED' ? '<span style="color:#9ca3af">Date not recorded</span>' : '<span style="color:#9ca3af">Not completed yet</span>')}</td></tr>
    </tbody>
  </table>

  <div class="footer-bar">
    <div>KashiGRC &nbsp;&middot;&nbsp; Third-Party Risk Management Platform</div>
    <div>Confidential &mdash; Internal Use Only</div>
    <div>Generated ${fmtDate(new Date())}</div>
  </div>
</div></body></html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 700)
}


// ── 1. Header ─────────────────────────────────────────────────────────────────
function ReportHeader({ assessment, onDownload, generatingPDF }) {
  const navigate  = useNavigate()
  const risk      = assessment?.riskRating
  const riskCfg   = RISK_CFG[risk] || {}
  const earned    = assessment?.totalEarnedScore ?? 0
  const possible  = assessment?.totalPossibleScore
  const pct       = possible > 0 ? Math.round(earned / possible * 100) : null
  const pctColor  = pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden mb-6">
      <div className={cn('h-1', riskCfg.bar || 'bg-brand-500')}/>
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => navigate('/reports')}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <ArrowLeft size={13}/> Back to Reports
          </button>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={onDownload} disabled={generatingPDF}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-400
                bg-brand-500/10 border border-brand-500/30 hover:bg-brand-500/20
                px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
              <Download size={12} className={generatingPDF ? 'animate-pulse' : ''}/>
              {generatingPDF ? 'Generating…' : 'Download PDF'}
            </button>
          </div>
        </div>
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={16} className="text-text-muted"/>
              <h1 className="text-2xl font-bold text-text-primary">
                {assessment?.vendorName || `Vendor #${assessment?.vendorId}`}
              </h1>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted pl-[24px]">
              <span>{assessment?.templateName}</span>
              {assessment?.cycle && <><span>·</span><span>{assessment.cycle}</span></>}
              <span>·</span>
              <span className="font-mono">Assessment #{assessment?.assessmentId}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {pct != null && (
              <div className="text-right">
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Compliance</p>
                <p className={cn('text-3xl font-bold tabular-nums', pctColor)}>{pct}%</p>
                <p className="text-[10px] text-text-muted">{earned.toFixed(1)} / {possible} wt pts</p>
              </div>
            )}
            {risk && (
              <div className="text-center">
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Risk Rating</p>
                <div className={cn('px-4 py-2 rounded-xl border font-black text-sm tracking-wide uppercase', riskCfg.bg, riskCfg.color)}>
                  {risk}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/60 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <Circle size={6} className={assessment?.status === 'COMPLETED' ? 'fill-green-400 text-green-400' : 'fill-brand-400 text-brand-400'}/>
            {assessment?.status}
          </span>
          {(assessment?.completedAt || assessment?.submittedAt) && (
            <span className="flex items-center gap-1">
              <Calendar size={10}/>
              {assessment?.completedAt ? 'Completed' : 'Submitted'} {fmt(assessment.completedAt || assessment.submittedAt)}
            </span>
          )}
          {pct != null && (
            <div className="flex-1 max-w-xs">
              <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                <div className={cn('h-full rounded-full', pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${Math.min(pct, 100)}%` }}/>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 2. Executive Summary ──────────────────────────────────────────────────────
function ExecutiveSummary({ sections, assessment }) {
  const allQs    = sections.flatMap(s => s.questions || [])
  const total    = allQs.length
  const answered = allQs.filter(q => isGenuineAnswer(q.currentResponse)).length
  const pass     = allQs.filter(q => q.currentResponse?.reviewerStatus === 'PASS').length
  const partial  = allQs.filter(q => q.currentResponse?.reviewerStatus === 'PARTIAL').length
  const fail     = allQs.filter(q => q.currentResponse?.reviewerStatus === 'FAIL' || !q.currentResponse).length
  const remed    = assessment?.openRemediationCount ?? 0

  const stats = [
    { label: 'Total questions',   value: total,    icon: Hash,          color: 'text-text-secondary' },
    { label: 'Answered',          value: answered, icon: FileText,      color: 'text-brand-400'      },
    { label: 'Pass',              value: pass,     icon: CheckCircle2,  color: 'text-green-400'      },
    { label: 'Partial',           value: partial,  icon: Minus,         color: 'text-amber-400'      },
    { label: 'Fail',              value: fail,     icon: XCircle,       color: 'text-red-400'        },
    { label: 'Open remediations', value: remed,    icon: AlertTriangle, color: remed > 0 ? 'text-amber-400' : 'text-green-400' },
  ]
  return (
    <Section id="summary" title="Executive Summary" icon={Award}>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-surface-overlay rounded-xl px-3 py-3 border border-border/50">
            <s.icon size={14} className={cn(s.color, 'mb-2')}/>
            <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[9px] text-text-muted uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── 3. Section Breakdown ──────────────────────────────────────────────────────
function SectionBreakdown({ sections }) {
  const rows = sections.map(sec => {
    const qs      = sec.questions || []
    const pass    = qs.filter(q => q.currentResponse?.reviewerStatus === 'PASS').length
    const partial = qs.filter(q => q.currentResponse?.reviewerStatus === 'PARTIAL').length
    const fail    = qs.filter(q => q.currentResponse?.reviewerStatus === 'FAIL' || !q.currentResponse).length
    const earned  = qs.reduce((sum, q) => {
      const rs = q.currentResponse?.reviewerStatus; const raw = q.currentResponse?.scoreEarned ?? 0
      if (!q.currentResponse) return sum; if (rs === 'FAIL') return sum; if (rs === 'PARTIAL') return sum + raw * 0.5; return sum + raw
    }, 0)
    const possible = qs.reduce((s, q) => s + (q.weight || 1), 0)
    const pct      = possible > 0 ? Math.round(earned / possible * 100) : null
    return { name: sec.sectionName, total: qs.length, pass, partial, fail, pct }
  })
  return (
    <Section id="sections" title="Section Compliance Breakdown" icon={Activity}>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-mono text-text-muted shrink-0 w-5 text-right">{i+1}.</span>
                <span className="text-xs font-medium text-text-primary truncate">{r.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <span className="text-[10px] text-green-400">{r.pass}✓</span>
                <span className="text-[10px] text-amber-400">{r.partial}~</span>
                <span className="text-[10px] text-red-400">{r.fail}✗</span>
                <span className={cn('text-xs font-bold tabular-nums w-10 text-right',
                  r.pct == null ? 'text-text-muted' : r.pct >= 80 ? 'text-green-400' : r.pct >= 60 ? 'text-amber-400' : 'text-red-400')}>
                  {r.pct != null ? `${r.pct}%` : '—'}
                </span>
              </div>
            </div>
            <div className="ml-7 h-1.5 rounded-full bg-surface-overlay overflow-hidden flex">
              <div className="h-full bg-green-500" style={{ width: `${r.total > 0 ? r.pass/r.total*100 : 0}%` }}/>
              <div className="h-full bg-amber-500" style={{ width: `${r.total > 0 ? r.partial/r.total*100 : 0}%` }}/>
              <div className="h-full bg-red-500"   style={{ width: `${r.total > 0 ? r.fail/r.total*100 : 0}%` }}/>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/60">
        {[['bg-green-500','text-green-400','Pass'],['bg-amber-500','text-amber-400','Partial'],['bg-red-500','text-red-400','Fail']].map(([bg,tc,label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', bg)}/><span className={cn('text-[10px]', tc)}>{label}</span>
          </div>
        ))}
        <span className="text-[10px] text-text-muted ml-auto">Stacked bar = question distribution</span>
      </div>
    </Section>
  )
}

// ── 4. Consolidated Findings ──────────────────────────────────────────────────
function Findings({ assessment, isAdmin, onUpdate }) {
  const text             = assessment?.reviewFindings
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const [saving,  setSaving]  = useState(false)

  const handleEdit = () => { setDraft(text || ''); setEditing(true) }
  const handleSave = async () => {
    setSaving(true)
    try {
      await assessmentsApi.updateFindings(assessment.assessmentId, draft)
      onUpdate && onUpdate(draft)
      setEditing(false)
      toast.success('Findings updated')
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  if (!text && !editing) return (
    <Section id="findings" title="Consolidated Findings" icon={FileText}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-text-muted italic flex-1">
          No consolidated findings documented yet. Findings are recorded at step 10.
        </p>
        {isAdmin && (
          <button onClick={handleEdit}
            className="shrink-0 text-[11px] text-brand-400 border border-brand-500/30 hover:bg-brand-500/10 px-2.5 py-1 rounded-lg transition-colors">
            + Add findings
          </button>
        )}
      </div>
    </Section>
  )

  // Parse "--- Name · Date ---" reviewer sections
  const lines = (text || '').split('\n'); const parsed = []; let cur = null
  for (const line of lines) {
    if (line.startsWith('---') && line.endsWith('---')) {
      if (cur) parsed.push(cur)
      cur = { header: line.replace(/^---\s*/,'').replace(/\s*---$/,''), body: [] }
    } else { if (!cur) cur = { header: null, body: [] }; cur.body.push(line) }
  }
  if (cur) parsed.push(cur)

  return (
    <Section id="findings" title="Consolidated Findings" icon={FileText}>
      {isAdmin && !editing && (
        <div className="flex justify-end mb-3">
          <button onClick={handleEdit}
            className="text-[11px] text-brand-400 border border-brand-500/30 hover:bg-brand-500/10 px-2.5 py-1 rounded-lg transition-colors">
            ✏ Edit findings
          </button>
        </div>
      )}
      {editing ? (
        <div className="space-y-2">
          <p className="text-[11px] text-text-muted mb-1">
            Use <code className="bg-surface-overlay px-1 rounded">--- Reviewer Name · Date ---</code> headers to separate reviewers.
          </p>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={12}
            className="w-full text-sm bg-surface border border-border rounded-xl px-4 py-3 text-text-primary
              placeholder-text-muted focus:outline-none focus:border-brand-500/50 resize-y leading-relaxed"
            placeholder="Document key findings, risk observations, deficiencies, and recommendations..."/>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setEditing(false)}
              className="text-xs text-text-muted hover:text-text-secondary px-3 py-1.5 rounded-lg border border-border transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="text-xs font-medium text-brand-400 bg-brand-500/10 border border-brand-500/30 hover:bg-brand-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save findings'}
            </button>
          </div>
        </div>
      ) : parsed.length === 1 && !parsed[0].header ? (
        <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{text}</p>
      ) : (
        <div className="space-y-4">
          {parsed.map((sec, i) => (
            <div key={i} className="border border-border rounded-xl overflow-hidden">
              {sec.header && (
                <div className="px-4 py-2 bg-surface-overlay border-b border-border flex items-center gap-2">
                  <User size={11} className="text-brand-400 shrink-0"/>
                  <span className="text-xs font-semibold text-text-primary">{sec.header}</span>
                </div>
              )}
              <div className="px-4 py-3">
                <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {sec.body.join('\n').trim() || <span className="italic text-text-muted">No findings documented.</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ── 5. Full Q&A Detail ────────────────────────────────────────────────────────
function QuestionDetail({ sections }) {
  const [expanded, setExpanded] = useState({})
  const toggle = (i) => setExpanded(p => ({ ...p, [i]: !p[i] }))

  return (
    <Section id="qa" title="Full Evaluation Detail" icon={Star}>
      <div className="space-y-3">
        {sections.map((sec, si) => {
          const qs     = sec.questions || []
          const pass   = qs.filter(q => q.currentResponse?.reviewerStatus === 'PASS').length
          const isOpen = expanded[si] ?? false
          return (
            <div key={si} className="border border-border rounded-xl overflow-hidden">
              <button onClick={() => toggle(si)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-surface-overlay/50 hover:bg-surface-overlay transition-colors text-left">
                {isOpen ? <ChevronDown size={13} className="text-text-muted shrink-0"/> : <ChevronRight size={13} className="text-text-muted shrink-0"/>}
                <span className="text-xs font-semibold text-text-primary flex-1">{sec.sectionName}</span>
                <span className="text-[10px] text-green-400">{pass}/{qs.length} pass</span>
              </button>
              {isOpen && (
                <div className="divide-y divide-border/50">
                  {qs.map((q, qi) => {
                    const resp    = q.currentResponse
                    const verdict = resp?.reviewerStatus || (isGenuineAnswer(resp) ? 'PENDING' : 'NO RESPONSE')
                    let answer = null
                    if (isGenuineAnswer(resp)) {
                      if (['TEXT','NUMERIC','DATE'].includes(q.responseType))
                        answer = <span className="text-text-secondary">{resp.responseText || '—'}</span>
                      else if (['SINGLE_CHOICE','MULTI_CHOICE'].includes(q.responseType)) {
                        const ids = new Set([...(resp.selectedOptionInstanceIds?.map(Number)||[]),...(resp.selectedOptionInstanceId!=null?[Number(resp.selectedOptionInstanceId)]:[]) ])
                        const opts = (q.options||[]).filter(o=>ids.has(Number(o.optionInstanceId)))
                        answer = opts.length > 0
                          ? <div className="flex flex-wrap gap-1">{opts.map(o=>(
                              <span key={o.optionInstanceId} className="text-[10px] px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-300">
                                {o.optionValue}{o.score != null && <span className="opacity-60 ml-1">{o.score}pts</span>}
                              </span>))}</div>
                          : <span className="text-text-muted italic">No option selected</span>
                      } else if (q.responseType === 'FILE_UPLOAD')
                        answer = <span className="text-text-muted">📎 File uploaded</span>
                    }
                    return (
                      <div key={qi} className={cn('px-4 py-3', qi % 2 === 0 ? 'bg-surface' : 'bg-surface-overlay/20')}>
                        <div className="flex items-start gap-3">
                          <span className="text-[10px] text-text-muted font-mono shrink-0 mt-0.5 w-5 text-right">{qi+1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-text-primary mb-1.5 leading-snug">
                              {q.questionText || q.questionTextSnapshot}
                            </p>
                            {answer && <div className="mb-1.5 text-xs">{answer}</div>}
                            {!isGenuineAnswer(resp) && <p className="text-xs text-text-muted italic mb-1.5">No response submitted</p>}
                            <div className="flex items-center gap-3">
                              <VerdictChip status={verdict}/>
                              {resp?.scoreEarned != null && q.weight && (
                                <span className="text-[10px] text-text-muted">{(resp.scoreEarned/q.weight*100).toFixed(0)}% of {q.weight} wt</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-text-muted mt-3">Click a section to expand its questions</p>
    </Section>
  )
}

// ── 6. Action Items ───────────────────────────────────────────────────────────
function ActionItemsSection({ assessmentId, sections }) {
  const { data: assessmentItems = [] } = useQuery({
    queryKey: ['report-action-items-assessment', assessmentId],
    queryFn:  () => fetchActionItems(assessmentId),
    staleTime: 30_000,
  })
  const questionIds = (sections || []).flatMap(s => s.questions || []).map(q => q.questionInstanceId)
  const { data: questionItems = [] } = useQuery({
    queryKey: ['report-action-items-questions', assessmentId],
    queryFn:  async () => {
      if (!questionIds.length) return []
      const results = await Promise.allSettled(
        questionIds.slice(0, 30).map(qid =>
          api.get('/v1/action-items', { params: { entityType: 'QUESTION_RESPONSE', entityId: qid } })
            .then(r => Array.isArray(r) ? r : (r?.items ?? []))
            .catch(() => [])
        )
      )
      return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    },
    staleTime: 30_000,
    enabled: questionIds.length > 0,
  })
  const items = [...assessmentItems, ...questionItems]
    .filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx)

  const STATUS_CFG = {
    OPEN:        { color: 'text-amber-400',  label: 'Open'        },
    IN_PROGRESS: { color: 'text-brand-400',  label: 'In Progress' },
    RESOLVED:    { color: 'text-green-400',  label: 'Resolved'    },
    DISMISSED:   { color: 'text-text-muted', label: 'Dismissed'   },
  }

  if (!items.length) return (
    <Section id="action-items" title="Open Action Items" icon={CheckCircle2}>
      <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle2 size={14}/> No open action items</p>
    </Section>
  )

  return (
    <Section id="action-items" title="Open Action Items" icon={AlertTriangle}>
      <div className="space-y-2">
        {items.slice(0, 20).map((item, i) => {
          const cfg = STATUS_CFG[item.status] || STATUS_CFG.OPEN
          return (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5 rounded-xl border border-border bg-surface-overlay/30">
              <span className={cn('text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded border bg-surface-overlay border-border', cfg.color)}>
                {cfg.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-primary">{item.title}</p>
                {item.dueAt && <p className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1"><Clock size={9}/>Due {fmt(item.dueAt)}</p>}
              </div>
              <span className={cn('text-[10px] font-bold shrink-0',
                item.priority === 'CRITICAL' ? 'text-red-400' : item.priority === 'HIGH' ? 'text-orange-400' : 'text-text-muted')}>
                {item.priority}
              </span>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── 7. Audit Trail ────────────────────────────────────────────────────────────
function AuditTrail({ workflowInstanceId, history = [] }) {
  if (!workflowInstanceId) return null
  if (!history?.length) return (
    <Section id="audit" title="Audit Trail" icon={Activity}>
      <p className="text-sm text-text-muted italic">No audit history recorded yet.</p>
    </Section>
  )

  return (
    <Section id="audit" title="Audit Trail" icon={Activity}>
      <div className="relative pl-4">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-border"/>
        <div className="space-y-4">
          {history.slice(0, 30).map((h, i) => (
            <div key={i} className="relative flex items-start gap-3">
              <div className="absolute -left-[19px] w-3 h-3 rounded-full border-2 border-brand-500/40 bg-surface shrink-0 mt-0.5"/>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-text-primary">
                    {(h.eventType || h.actionType || '').replace(/_/g, ' ')}
                  </span>
                  {h.stepName && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-text-muted">
                      {h.stepName}
                    </span>
                  )}
                  <span className="text-[10px] text-text-muted ml-auto">{fmtTime(h.performedAt)}</span>
                </div>
                {h.toStatus && (
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {h.fromStatus && <><span className="line-through opacity-50">{h.fromStatus}</span> → </>}{h.toStatus}
                  </p>
                )}
                {h.remarks && <p className="text-[10px] text-text-muted mt-0.5 italic">"{h.remarks}"</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ── 8. Sign-off Chain ─────────────────────────────────────────────────────────
function SignOffChain({ progress }) {
  // Derive sign-off chain from progress steps — same source as WorkflowTimeline
  // Tasks with status APPROVED have assignedUserName already resolved by the backend
  const summary = Array.isArray(progress) ? progress[0] : progress
  const steps   = summary?.steps || []
  const chain   = steps
    .filter(step => step.visited)
    .flatMap(step => {
      const iter  = step.iterations?.[step.iterations.length - 1]
      const tasks = (iter?.tasks || []).filter(t =>
        t.taskRole !== 'ASSIGNER' && t.status === 'APPROVED'
      )
      return tasks.map(t => ({
        key:        `${t.taskId}`,
        name:       t.assignedUserName || (t.assignedUserId ? `User #${t.assignedUserId}` : 'System'),
        role:       step.stepName || 'Approver',
        approvedAt: t.actedAt || null,
      }))
    })

  if (!chain.length) return null

  return (
    <Section id="signoff" title="Sign-off Chain" icon={Award}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {chain.map((entry, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-overlay border border-border">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-brand-400">{(entry.name||'?')[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-primary">{entry.name}</p>
              <p className="text-[10px] text-text-muted">{entry.role}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 justify-end">
                <CheckCircle2 size={10} className="text-green-400"/>
                <span className="text-[10px] text-green-400 font-medium">Approved</span>
              </div>
              <p className="text-[9px] text-text-muted">{fmt(entry.approvedAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Page nav ──────────────────────────────────────────────────────────────────
const NAV_SECTIONS = [
  { id: 'summary',      label: 'Executive Summary' },
  { id: 'sections',     label: 'Section Breakdown' },
  { id: 'findings',     label: 'Findings'          },
  { id: 'qa',           label: 'Q&A Detail'        },
  { id: 'action-items', label: 'Action Items'      },
  { id: 'audit',        label: 'Audit Trail'       },
  { id: 'signoff',      label: 'Sign-off Chain'    },
]

function PageNav() {
  const [active, setActive] = useState('summary')
  const scrollTo = (id) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActive(id) }
  return (
    <nav className="w-44 shrink-0 sticky top-0 h-screen overflow-y-auto py-6 hidden xl:block print:hidden">
      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest px-3 mb-2">On this page</p>
      <div className="space-y-0.5">
        {NAV_SECTIONS.map(s => (
          <button key={s.id} onClick={() => scrollTo(s.id)}
            className={cn('w-full text-left text-[11px] px-3 py-1.5 rounded-lg transition-colors',
              active === s.id ? 'bg-brand-500/15 text-brand-400 font-medium' : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay/50')}>
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AssessmentReportPage() {
  const { id } = useParams()
  const roles   = useSelector(selectRoles)
  const isAdmin = roles?.some(r => {
    const n = r.name || r.roleName || ''
    return ['ORG_ADMIN','ORG_OWNER','PLATFORM_ADMIN'].includes(n)
  })

  const [generatingPDF,    setGeneratingPDF]    = useState(false)
  const [findingsOverride, setFindingsOverride] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['assessment-report', id],
    queryFn:  () => fetchReport(id),
    staleTime: 60_000,
  })

  const assessment        = data
  const sections          = data?.sections ?? []
  const workflowInstanceId = data?.workflowInstanceId

  const { data: progress = [] } = useQuery({
    queryKey: ['report-progress', workflowInstanceId],
    queryFn:  () => workflowInstanceId ? fetchProgress(workflowInstanceId) : Promise.resolve([]),
    staleTime: 60_000,
    enabled:  !!workflowInstanceId,
  })

  const handlePrint = async () => {
    if (!assessment) return
    setGeneratingPDF(true)
    try {
      // Fetch action items for PDF — both assessment-level and question-level
      const [assessmentItems, questionItems] = await Promise.all([
        api.get('/v1/action-items', { params: { entityType: 'ASSESSMENT', entityId: id } })
          .then(r => Array.isArray(r) ? r : (r?.items ?? [])).catch(() => []),
        Promise.allSettled(
          sections.flatMap(s => s.questions || []).slice(0, 30).map(q =>
            api.get('/v1/action-items', { params: { entityType: 'QUESTION_RESPONSE', entityId: q.questionInstanceId } })
              .then(r => Array.isArray(r) ? r : (r?.items ?? [])).catch(() => [])
          )
        ).then(results => results.flatMap(r => r.status === 'fulfilled' ? r.value : []))
      ])
      const allItems = [...assessmentItems, ...questionItems]
        .filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx)

      // Fetch progress for PDF sign-off chain (names already resolved like WorkflowTimeline)
      const pdfProgress = assessment?.workflowInstanceId
        ? await api.get(`/v1/workflow-instances/${assessment.workflowInstanceId}/progress`)
            .then(r => Array.isArray(r) ? r : (r ? [r] : []))
            .catch(() => [])
        : []

      const assessmentWithExtras = {
        ...( findingsOverride != null ? { ...assessment, reviewFindings: findingsOverride } : assessment ),
        _pdfActionItems: allItems,
        _pdfProgress:    pdfProgress,
      }
      await generatePDF(assessmentWithExtras, sections)
    } finally { setGeneratingPDF(false) }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin"/>
        <p className="text-sm text-text-muted">Loading report…</p>
      </div>
    </div>
  )

  if (isError || !assessment) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <XCircle size={32} className="text-red-400 mx-auto mb-3"/>
        <p className="text-sm font-medium text-text-primary mb-1">Report not found</p>
        <p className="text-xs text-text-muted">This assessment may not be accessible</p>
      </div>
    </div>
  )

  // Derive flat history list from progress steps for AuditTrail display
  const summary  = Array.isArray(progress) ? progress[0] : progress
  const history  = (summary?.steps || [])
    .filter(s => s.visited)
    .flatMap(s => (s.iterations || []).flatMap(iter => (iter.tasks || []).map(t => ({
      eventType:   t.status === 'APPROVED' ? 'STEP_APPROVED' : t.status,
      stepName:    s.stepName,
      performedAt: t.actedAt,
      performedByName: t.assignedUserName || (t.assignedUserId ? `User #${t.assignedUserId}` : null),
      remarks:     t.remarks,
      toStatus:    t.status,
    }))))

  const displayAssessment = findingsOverride != null
    ? { ...assessment, reviewFindings: findingsOverride }
    : assessment

  return (
    <div className="flex gap-0 h-full">
      <PageNav/>
      <div className="flex-1 overflow-y-auto print:overflow-visible">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5 print:px-0 print:py-0 print:space-y-4">
          <ReportHeader assessment={assessment} onDownload={handlePrint} generatingPDF={generatingPDF}/>
          <ExecutiveSummary sections={sections} assessment={assessment}/>
          <SectionBreakdown sections={sections}/>
          <Findings
            assessment={displayAssessment}
            isAdmin={isAdmin}
            onUpdate={text => setFindingsOverride(text)}
          />
          <QuestionDetail sections={sections}/>
          <ActionItemsSection assessmentId={id} sections={sections}/>
          <AuditTrail workflowInstanceId={workflowInstanceId} history={history}/>
          <SignOffChain progress={progress}/>
          <div className="border-t border-border pt-5 flex items-center justify-between text-[10px] text-text-muted pb-8">
            <span>KashiGRC · Third-Party Risk Management Platform</span>
            <span>Confidential — Internal Use Only</span>
            <span>Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      </div>
    </div>
  )
}