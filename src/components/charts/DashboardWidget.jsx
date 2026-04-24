import { useQuery } from '@tanstack/react-query'
import api from '../../config/axios.config'
import { Card, CardHeader } from '../ui/Card'
import { Skeleton } from '../ui/EmptyState'
import { cn } from '../../lib/cn'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

const CHART_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1']

function useWidgetData(widget) {
  return useQuery({
    queryKey: ['widget-data', widget.widgetKey],
    queryFn: async () => {
      if (!widget.dataEndpoint) return null
      // initialData guard — React Query requires non-undefined
      const data = await api.get(widget.dataEndpoint)
      if (!widget.dataPath) return data ?? null
      // Traverse dataPath like 'pagination.totalItems'
      // Return null (not undefined) — React Query forbids undefined from queryFn
      const result = widget.dataPath.split('.').reduce((obj, key) => obj?.[key], data)
      return result ?? null
    },
    refetchInterval: (widget.refreshIntervalSeconds || 300) * 1000,
    enabled: !!widget.dataEndpoint,
  })
}

export function DashboardWidgetCard({ widget }) {
  const { data, isLoading } = useWidgetData(widget)
  const navigate = useNavigate()
  let config = {}
  try { config = widget.configJson ? JSON.parse(widget.configJson) : {} } catch {}

  const handleClick = () => { if (widget.clickThroughRoute) navigate(widget.clickThroughRoute) }

  return (
    <Card
      className={cn('flex flex-col overflow-hidden', widget.clickThroughRoute && 'cursor-pointer hover:border-brand-500/30')}
      onClick={widget.clickThroughRoute ? handleClick : undefined}
    >
      <CardHeader title={widget.title} subtitle={widget.subtitle} />
      <div className="flex-1 p-4 min-h-0">
        {isLoading
          ? <Skeleton className="h-full w-full min-h-[80px]" />
          : <WidgetContent widget={widget} data={data} config={config} />
        }
      </div>
    </Card>
  )
}

function WidgetContent({ widget, data, config }) {
  switch (widget.widgetType) {
    case 'KPI_CARD':
      return (
        <div className="flex flex-col justify-center h-full">
          <p className="font-mono text-3xl font-bold text-text-primary tabular-nums">
            {config.prefix}{data ?? '—'}{config.suffix}
          </p>
          {config.description && <p className="text-xs text-text-muted mt-1">{config.description}</p>}
        </div>
      )

    case 'BAR_CHART':
      return (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85 / 0.5)" />
            <XAxis dataKey={config.xAxis || 'name'} tick={{ fontSize: 10, fill: 'rgb(100 116 139)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'rgb(100 116 139)' }} />
            <Tooltip contentStyle={{ background: 'rgb(22 33 56)', border: '1px solid rgb(51 65 85)', borderRadius: '6px', fontSize: 12 }} />
            <Bar dataKey={config.yAxis || 'value'} fill="rgb(14 165 233)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )

    case 'LINE_CHART': case 'AREA_CHART':
      return (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(14 165 233)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="rgb(14 165 233)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85 / 0.5)" />
            <XAxis dataKey={config.xAxis || 'name'} tick={{ fontSize: 10, fill: 'rgb(100 116 139)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'rgb(100 116 139)' }} />
            <Tooltip contentStyle={{ background: 'rgb(22 33 56)', border: '1px solid rgb(51 65 85)', borderRadius: '6px', fontSize: 12 }} />
            <Area type="monotone" dataKey={config.yAxis || 'value'} stroke="rgb(14 165 233)" fill="url(#colorGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )

    case 'PIE_CHART': case 'DONUT_CHART':
      return (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data || []} dataKey={config.yAxis || 'value'} nameKey={config.xAxis || 'name'}
              cx="50%" cy="50%" innerRadius={widget.widgetType === 'DONUT_CHART' ? 45 : 0} outerRadius={70} paddingAngle={2}>
              {(data || []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: 'rgb(22 33 56)', border: '1px solid rgb(51 65 85)', borderRadius: '6px', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )

    case 'PROGRESS_BAR': {
      const pct = typeof data === 'number' ? data : 0
      return (
        <div className="flex flex-col justify-center gap-2 h-full">
          <div className="flex justify-between text-xs text-text-secondary">
            <span>{config.label || 'Progress'}</span>
            <span className="font-mono text-text-primary">{pct}%</span>
          </div>
          <div className="h-2 bg-surface-overlay rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    }

    default:
      return <p className="text-xs text-text-muted">{widget.widgetType}</p>
  }
}

export function DashboardGrid({ widgets = [] }) {
  return (
    <div className="grid grid-cols-12 gap-4">
      {widgets.map(widget => (
        <div key={widget.widgetKey} className={`col-span-${widget.gridCols || 6}`}>
          <DashboardWidgetCard widget={widget} />
        </div>
      ))}
    </div>
  )
}