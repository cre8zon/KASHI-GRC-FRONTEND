/**
 * ReportsPage — /reports
 *
 * Assessment reports hub. Follows the pattern of enterprise GRC tools:
 * - Summary stats by risk tier
 * - Per-assessment cards with key metrics
 * - Rich PDF report: executive summary, section breakdown, findings, remediation tracker
 * - CSV export of all assessments
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery }    from '@tanstack/react-query'
import {
  FileText, Download, AlertTriangle, CheckCircle2,
  Clock, Search, RefreshCw, Shield, BarChart3,
  ExternalLink, XCircle, MinusCircle,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api    from '../../config/axios.config'

// ── Data hooks ────────────────────────────────────────────────────────────────

const useAllAssessments = () => useQuery({
  queryKey: ['reports-all-assessments'],
  queryFn:  () => api.get('/v1/assessments'),
  select:   d => {
    const raw = d?.data ?? d
    let items = []
    if (Array.isArray(raw))               items = raw
    else if (Array.isArray(raw?.items))   items = raw.items
    else if (Array.isArray(raw?.content)) items = raw.content
    else if (Array.isArray(raw?.data))    items = raw.data
    return items.filter(a => ['UNDER_REVIEW','COMPLETED','SUBMITTED'].includes(a.status))
  },
})

// Fetch full assessment detail (sections + questions + responses) for PDF
const fetchFullAssessment = async (assessmentId) => {
  try {
    const res = await api.get(`/v1/assessments/${assessmentId}/review`)
    return res?.data ?? res
  } catch (e) {
    console.warn('[PDF] /review fetch failed, falling back to /assessments/:id', e?.response?.status)
    // Fallback: try the base assessment endpoint (no sections/questions)
    try {
      const res = await api.get(`/v1/assessments/${assessmentId}`)
      return res?.data ?? res
    } catch { return null }
  }
}

// Fetch action items for this assessment
const fetchActionItems = (assessmentId) =>
  api.get(`/v1/action-items?entityType=QUESTION_RESPONSE`).then(r => {
    const raw = r?.data ?? r
    const items = Array.isArray(raw) ? raw
      : Array.isArray(raw?.items) ? raw.items
      : Array.isArray(raw?.data)  ? raw.data : []
    return items
  }).catch(() => [])

// ── Helpers ───────────────────────────────────────────────────────────────────

const RISK_CONFIG = {
  LOW:      { color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/25',  dot: 'bg-green-400'  },
  MEDIUM:   { color: 'text-amber-400',  bg: 'bg-amber-500/10  border-amber-500/25',  dot: 'bg-amber-400'  },
  HIGH:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/25', dot: 'bg-orange-400' },
  CRITICAL: { color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/25',    dot: 'bg-red-400'    },
}

function RiskBadge({ rating }) {
  if (!rating) return <span className="text-xs text-text-muted italic">Not rated</span>
  const cfg = RISK_CONFIG[rating] || RISK_CONFIG.MEDIUM
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border uppercase', cfg.bg, cfg.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)}/>
      {rating}
    </span>
  )
}

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Rich PDF Generator ────────────────────────────────────────────────────────
// Matches enterprise GRC tool report structure:
// 1. Cover / Executive Summary
// 2. Section-by-section breakdown with verdict counts
// 3. Open findings / remediation tracker
// 4. Sign-off trail

async function generatePDF(assessment) {
  // Fetch full data
  let fullData = null
  try { fullData = await fetchFullAssessment(assessment.assessmentId) } catch(e) {}

  const sections  = fullData?.sections || []
  const findings  = fullData?.reviewFindings || assessment.reviewFindings || ''
  const risk      = assessment.riskRating || 'Not rated'
  const riskColor = risk === 'LOW' ? '#166534' : risk === 'MEDIUM' ? '#92400e' : risk === 'HIGH' ? '#9a3412' : '#991b1b'
  const riskBg    = risk === 'LOW' ? '#dcfce7' : risk === 'MEDIUM' ? '#fef3c7' : risk === 'HIGH' ? '#fed7aa' : '#fee2e2'
  const remed     = assessment.openRemediationCount ?? 0

  // Compute section stats
  const sectionRows = sections.map(sec => {
    const qs       = sec.questions || []
    const answered = qs.filter(q => q.currentResponse).length
    const pass     = qs.filter(q => q.currentResponse?.reviewerStatus === 'PASS').length
    const partial  = qs.filter(q => q.currentResponse?.reviewerStatus === 'PARTIAL').length
    const fail     = qs.filter(q => q.currentResponse?.reviewerStatus === 'FAIL').length
    const pending  = qs.length - pass - partial - fail
    return { name: sec.sectionName, total: qs.length, answered, pass, partial, fail, pending }
  })

  const totalQs   = sectionRows.reduce((s, r) => s + r.total, 0)
  const totalPass = sectionRows.reduce((s, r) => s + r.pass, 0)
  const totalFail = sectionRows.reduce((s, r) => s + r.fail, 0)
  const totalPart = sectionRows.reduce((s, r) => s + r.partial, 0)

  const sectionTableRows = sectionRows.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${r.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center">${r.total}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#166534;font-weight:600">${r.pass}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#92400e;font-weight:600">${r.partial}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#991b1b;font-weight:600">${r.fail}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#6b7280">${r.pending > 0 ? r.pending + ' pending' : '—'}</td>
    </tr>`).join('')

  // Build remediation items from sections (questions with FAIL verdict)
  const failedItems = sections.flatMap(sec =>
    (sec.questions || [])
      .filter(q => q.currentResponse?.reviewerStatus === 'FAIL' || q.currentResponse?.reviewerStatus === 'PARTIAL')
      .map(q => ({ section: sec.sectionName, question: q.questionText, verdict: q.currentResponse?.reviewerStatus }))
  ).slice(0, 20) // cap at 20

  const remediationRows = failedItems.length > 0
    ? failedItems.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px">${item.section}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px">${item.question.substring(0, 100)}${item.question.length > 100 ? '…' : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center">
          <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;
            background:${item.verdict === 'FAIL' ? '#fee2e2' : '#fef3c7'};
            color:${item.verdict === 'FAIL' ? '#991b1b' : '#92400e'}">${item.verdict}</span>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af;font-style:italic">No failed or partial evaluations</td></tr>'

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Vendor Assessment Report — ${assessment.vendorName}</title>
  <meta charset="UTF-8"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;font-size:13px;line-height:1.5}
    .page{padding:40px;max-width:900px;margin:0 auto}
    .cover{background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);color:white;padding:48px 40px;border-radius:0 0 16px 16px;margin:-40px -40px 36px -40px}
    .cover-logo{font-size:14px;font-weight:800;letter-spacing:2px;opacity:0.8;text-transform:uppercase}
    .cover-sub{font-size:11px;opacity:0.6;margin-top:2px;letter-spacing:1px;text-transform:uppercase}
    .cover-title{font-size:32px;font-weight:800;margin-top:24px;line-height:1.2}
    .cover-meta{font-size:12px;opacity:0.7;margin-top:8px}
    .cover-date{font-size:11px;opacity:0.5;margin-top:4px}
    .section{margin-top:32px;page-break-inside:avoid}
    .section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6366f1;border-bottom:2px solid #6366f1;padding-bottom:6px;margin-bottom:16px}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
    .metric{border:1px solid #e5e7eb;border-radius:10px;padding:16px;background:#f9fafb;text-align:center}
    .metric-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:6px}
    .metric-value{font-size:24px;font-weight:800;color:#1a1a2e}
    .risk-badge{display:inline-block;padding:6px 18px;border-radius:8px;font-weight:900;font-size:16px;letter-spacing:1px;background:${riskBg};color:${riskColor};text-transform:uppercase}
    .findings-box{background:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid #6366f1;border-radius:8px;padding:18px;font-size:13px;line-height:1.8;color:#374151;white-space:pre-wrap;min-height:60px}
    .findings-empty{color:#9ca3af;font-style:italic}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
    th{background:#f3f4f6;text-align:left;padding:10px 12px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:2px solid #e5e7eb}
    .footer{margin-top:48px;border-top:2px solid #e5e7eb;padding-top:16px;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between;align-items:center}
    .footer-logo{font-weight:800;color:#6366f1;font-size:12px}
    .eval-bar{display:flex;gap:8px;align-items:center;font-size:12px;margin-top:8px}
    .eval-pill{padding:3px 10px;border-radius:20px;font-weight:700;font-size:11px}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .page{padding:24px}
      .section{page-break-inside:avoid}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Cover -->
  <div class="cover">
    <div class="cover-logo">KashiGRC</div>
    <div class="cover-sub">Third-Party Risk Management</div>
    <div class="cover-title">${assessment.vendorName || 'Vendor'}</div>
    <div class="cover-meta">${assessment.templateName || 'Vendor Assessment'}</div>
    <div class="cover-date">
      Assessment #${assessment.assessmentId} &nbsp;·&nbsp;
      Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="section">
    <div class="section-label">Executive Summary</div>
    <div class="metrics">
      <div class="metric">
        <div class="metric-label">Risk Rating</div>
        <div style="margin-top:4px"><span class="risk-badge">${risk}</span></div>
      </div>
      <div class="metric">
        <div class="metric-label">Questions</div>
        <div class="metric-value">${totalQs}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px">${sectionRows.reduce((s,r)=>s+r.answered,0)} answered</div>
      </div>
      <div class="metric">
        <div class="metric-label">Evaluations</div>
        <div class="metric-value" style="font-size:16px;margin-top:4px">
          <span style="color:#166534">${totalPass}✓</span>&nbsp;
          <span style="color:#92400e">${totalPart}~</span>&nbsp;
          <span style="color:#991b1b">${totalFail}✗</span>
        </div>
        <div style="font-size:10px;color:#9ca3af;margin-top:2px">Pass · Partial · Fail</div>
      </div>
      <div class="metric">
        <div class="metric-label">Open Remediations</div>
        <div class="metric-value" style="color:${remed > 0 ? '#b45309' : '#166534'}">${remed}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px">${remed > 0 ? 'Require follow-up' : 'All clear'}</div>
      </div>
    </div>
  </div>

  <!-- Consolidated Findings -->
  <div class="section">
    <div class="section-label">Consolidated Findings</div>
    <div class="findings-box">
      ${findings
        ? findings.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        : '<span class="findings-empty">No consolidated findings were documented by the reviewer.</span>'}
    </div>
  </div>

  <!-- Section Breakdown -->
  ${sectionRows.length > 0 ? `
  <div class="section">
    <div class="section-label">Section-by-Section Evaluation</div>
    <table>
      <thead>
        <tr>
          <th>Section</th>
          <th style="text-align:center">Questions</th>
          <th style="text-align:center">Pass</th>
          <th style="text-align:center">Partial</th>
          <th style="text-align:center">Fail</th>
          <th style="text-align:center">Status</th>
        </tr>
      </thead>
      <tbody>${sectionTableRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Evaluation Findings -->
  <div class="section">
    <div class="section-label">Failed & Partial Evaluations</div>
    <table>
      <thead>
        <tr>
          <th style="width:25%">Section</th>
          <th>Question</th>
          <th style="width:12%;text-align:center">Verdict</th>
        </tr>
      </thead>
      <tbody>${remediationRows}</tbody>
    </table>
  </div>

  <!-- Assessment Details -->
  <div class="section">
    <div class="section-label">Assessment Details</div>
    <table>
      <thead><tr><th>Field</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280">Vendor</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${assessment.vendorName || '—'}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280">Assessment Template</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${assessment.templateName || '—'}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280">Risk Rating</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6"><span class="risk-badge" style="font-size:12px;padding:3px 10px">${risk}</span></td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280">Open Remediations</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${remed}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280">Status</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${assessment.status || '—'}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280">Assessment ID</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">#${assessment.assessmentId}</td></tr>
        <tr><td style="padding:8px 12px;color:#6b7280">Report Generated</td><td style="padding:8px 12px;font-weight:500">${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div>
      <div class="footer-logo">KashiGRC</div>
      <div style="margin-top:2px">Third-Party Risk Management Platform</div>
    </div>
    <div style="text-align:right">
      <div>Confidential — Internal Use Only</div>
      <div style="margin-top:2px">Generated ${new Date().toLocaleString('en-GB')}</div>
    </div>
  </div>

</div>
</body>
</html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 600)
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(assessments) {
  const rows = [
    ['Assessment ID','Vendor','Template','Status','Risk Rating','Open Remediations'],
    ...assessments.map(a => [
      a.assessmentId, a.vendorName||'', a.templateName||'',
      a.status||'', a.riskRating||'Not rated', a.openRemediationCount??0,
    ])
  ]
  const csv  = rows.map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv],{type:'text/csv'})
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href=url; a.download=`kashi-grc-reports-${new Date().toISOString().split('T')[0]}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── Summary Stats ─────────────────────────────────────────────────────────────

function SummaryStats({ assessments }) {
  const byRating = ['CRITICAL','HIGH','MEDIUM','LOW'].reduce((acc,r)=>{
    acc[r]=assessments.filter(a=>a.riskRating===r).length; return acc},{}
  )
  const openRem = assessments.reduce((s,a)=>s+(a.openRemediationCount??0),0)
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {[
        {label:'Total assessments', value:assessments.length,  icon:FileText,      color:'text-brand-400'},
        {label:'Critical risk',     value:byRating.CRITICAL,    icon:AlertTriangle, color:'text-red-400'},
        {label:'High risk',         value:byRating.HIGH,        icon:AlertTriangle, color:'text-orange-400'},
        {label:'Low / Medium',      value:(byRating.LOW+byRating.MEDIUM), icon:CheckCircle2, color:'text-green-400'},
        {label:'Open remediations', value:openRem,              icon:Clock,         color:'text-amber-400'},
      ].map(s=>(
        <div key={s.label} className="bg-surface border border-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <s.icon size={13} className={s.color}/>
            <span className="text-[10px] text-text-muted uppercase tracking-wide">{s.label}</span>
          </div>
          <p className={cn('text-2xl font-bold',s.color)}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Assessment Report Card ────────────────────────────────────────────────────

function AssessmentReportCard({ assessment }) {
  const navigate  = useNavigate()
  const [loading, setLoading] = useState(false)
  const remed = assessment.openRemediationCount ?? 0

  const handlePDF = async () => {
    setLoading(true)
    try { await generatePDF(assessment) }
    finally { setLoading(false) }
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden hover:border-brand-500/30 transition-colors">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-text-primary truncate">
              {assessment.vendorName || `Vendor #${assessment.vendorId}`}
            </p>
            <span className="text-[10px] text-text-muted font-mono shrink-0">#{assessment.assessmentId}</span>
          </div>
          <p className="text-xs text-text-muted">{assessment.templateName}</p>
        </div>
        <RiskBadge rating={assessment.riskRating}/>
      </div>

      <div className="px-5 pb-3 flex items-center gap-4 text-[11px]">
        <span className={cn('flex items-center gap-1', remed>0?'text-amber-400':'text-green-400')}>
          {remed>0?<AlertTriangle size={11}/>:<CheckCircle2 size={11}/>}
          {remed>0?`${remed} open remediation${remed!==1?'s':''}`:'No open remediations'}
        </span>
        <span className="text-text-muted flex items-center gap-1">
          <Shield size={11}/>{assessment.status}
        </span>
      </div>

      <div className="px-5 py-3 border-t border-border flex items-center gap-2">
        <button
          onClick={() => navigate(`/assessments/${assessment.assessmentId}/review?readonly=1`)}
          className="flex items-center gap-1.5 text-[11px] text-brand-400 hover:text-brand-300 font-medium transition-colors">
          <ExternalLink size={11}/> View assessment
        </button>
        <div className="flex-1"/>
        <button
          onClick={handlePDF}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary border border-border hover:border-brand-500/30 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50">
          <Download size={11}/> {loading ? 'Loading…' : 'PDF report'}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { data: assessments=[], isLoading, refetch } = useAllAssessments()
  const [search,     setSearch]     = useState('')
  const [riskFilter, setRiskFilter] = useState('ALL')

  const filtered = assessments.filter(a => {
    const matchSearch = !search ||
      (a.vendorName||'').toLowerCase().includes(search.toLowerCase()) ||
      (a.templateName||'').toLowerCase().includes(search.toLowerCase())
    const matchRisk = riskFilter==='ALL' || a.riskRating===riskFilter ||
      (riskFilter==='UNRATED' && !a.riskRating)
    return matchSearch && matchRisk
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Assessment Reports</h1>
          <p className="text-sm text-text-muted mt-0.5">Completed vendor risk assessments with risk ratings and findings</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>exportCSV(filtered)}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary border border-border hover:border-brand-500/30 px-3 py-2 rounded-lg transition-colors">
            <Download size={14}/> Export CSV
          </button>
          <button onClick={()=>refetch()}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary border border-border px-3 py-2 rounded-lg transition-colors">
            <RefreshCw size={14}/>
          </button>
        </div>
      </div>

      {assessments.length>0 && <SummaryStats assessments={assessments}/>}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search vendor or template…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"/>
        </div>
        <div className="flex items-center gap-1">
          {['ALL','CRITICAL','HIGH','MEDIUM','LOW','UNRATED'].map(r=>(
            <button key={r} onClick={()=>setRiskFilter(r)}
              className={cn('text-[11px] px-2.5 py-1.5 rounded border transition-colors font-medium',
                riskFilter===r
                  ?'bg-brand-500/10 border-brand-500/30 text-brand-400'
                  :'border-border text-text-muted hover:border-brand-500/20')}>
              {r==='ALL'?'All':r==='UNRATED'?'Unrated':r.charAt(0)+r.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {isLoading?(
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i=><div key={i} className="h-44 bg-surface border border-border rounded-xl animate-pulse"/>)}
        </div>
      ):filtered.length===0?(
        <div className="text-center py-16 text-text-muted">
          <BarChart3 size={36} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm font-medium">
            {assessments.length===0?'No completed assessments yet':'No results match your filters'}
          </p>
          <p className="text-xs mt-1 opacity-70">
            {assessments.length===0
              ?'Reports appear here once vendor assessments complete the full workflow.'
              :'Try adjusting the search or risk filter.'}
          </p>
        </div>
      ):(
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(a=><AssessmentReportCard key={a.assessmentId} assessment={a}/>)}
        </div>
      )}
    </div>
  )
}