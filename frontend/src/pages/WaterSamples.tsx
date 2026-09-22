import { FormEvent, useEffect, useState } from 'react'
import { api, getUser } from '../api/client'
import type { Pond, SampleStatus, WaterSample } from '../types'

function nowLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

type FormState = {
  pondId: number
  sampledAt: string
  tempC: number
  salinityPpt: number
  doMgL: number
  ph: number
  notes: string
}

const emptyForm: FormState = {
  pondId: 0,
  sampledAt: nowLocal(),
  tempC: 26,
  salinityPpt: 28,
  doMgL: 6.5,
  ph: 8.0,
  notes: '',
}

const STATUS_LABEL: Record<SampleStatus, string> = {
  draft: '草稿',
  pending: '待审',
  published: '已发布',
}

const FILTERS: { key: string; label: string; param: string }[] = [
  { key: 'published', label: '已发布', param: '' },
  { key: 'draft', label: '草稿', param: 'draft' },
  { key: 'pending', label: '待审', param: 'pending' },
  { key: 'all', label: '全部', param: 'all' },
]

export default function WaterSamples() {
  const [ponds, setPonds] = useState<Pond[]>([])
  const [rows, setRows] = useState<WaterSample[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [filter, setFilter] = useState('published')
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<FormState | null>(null)
  const [error, setError] = useState('')
  const role = getUser()?.role

  async function load(activeKey = filter) {
    const active = FILTERS.find((f) => f.key === activeKey) ?? FILTERS[0]
    const qs = active.param ? `?status=${active.param}` : ''
    const [ps, ws] = await Promise.all([
      api<Pond[]>('/api/ponds'),
      api<WaterSample[]>(`/api/water-samples${qs}`),
    ])
    setPonds(ps)
    setRows(ws)
    if (!form.pondId && ps[0]) {
      setForm((f) => ({ ...f, pondId: ps[0].id }))
    }
  }

  useEffect(() => {
    load(filter).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api('/api/water-samples', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          sampledAt: new Date(form.sampledAt).toISOString(),
        }),
      })
      setForm((f) => ({ ...emptyForm, pondId: f.pondId, sampledAt: nowLocal() }))
      setFilter('draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function saveEdit() {
    if (!editForm || editId === null) return
    setError('')
    try {
      await api(`/api/water-samples/${editId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...editForm,
          sampledAt: new Date(editForm.sampledAt).toISOString(),
        }),
      })
      setEditId(null)
      setEditForm(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function changeStatus(id: number, status: SampleStatus) {
    setError('')
    try {
      await api(`/api/water-samples/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '状态变更失败')
    }
  }

  async function remove(id: number) {
    if (!confirm('确认删除该水质样？')) return
    try {
      await api(`/api/water-samples/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  function startEdit(r: WaterSample) {
    const d = new Date(r.sampledAt)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    setEditId(r.id)
    setEditForm({
      pondId: r.pondId,
      sampledAt: d.toISOString().slice(0, 16),
      tempC: r.tempC,
      salinityPpt: r.salinityPpt,
      doMgL: r.doMgL,
      ph: r.ph,
      notes: r.notes ?? '',
    })
    setError('')
  }

  const pondLabel = (id: number) => {
    const p = ponds.find((x) => x.id === id)
    return p ? `${p.pondCode} (${p.species})` : `#${id}`
  }

  const renderFields = (
    state: FormState,
    setState: (s: FormState) => void,
    disabledPond = false,
  ) => (
    <>
      <label>
        塘口
        <select
          value={state.pondId}
          disabled={disabledPond}
          onChange={(e) => setState({ ...state, pondId: Number(e.target.value) })}
          required
        >
          {ponds.map((p) => (
            <option key={p.id} value={p.id}>
              {p.pondCode} · {p.species}
            </option>
          ))}
        </select>
      </label>
      <label>
        采样时间
        <input
          type="datetime-local"
          value={state.sampledAt}
          onChange={(e) => setState({ ...state, sampledAt: e.target.value })}
          required
        />
      </label>
      <label>
        水温 °C
        <input
          type="number"
          step="0.1"
          value={state.tempC}
          onChange={(e) => setState({ ...state, tempC: Number(e.target.value) })}
          required
        />
      </label>
      <label>
        盐度 ppt
        <input
          type="number"
          step="0.1"
          value={state.salinityPpt}
          onChange={(e) => setState({ ...state, salinityPpt: Number(e.target.value) })}
          required
        />
      </label>
      <label>
        溶解氧 mg/L
        <input
          type="number"
          step="0.1"
          value={state.doMgL}
          onChange={(e) => setState({ ...state, doMgL: Number(e.target.value) })}
          required
        />
      </label>
      <label>
        pH
        <input
          type="number"
          step="0.1"
          value={state.ph}
          onChange={(e) => setState({ ...state, ph: Number(e.target.value) })}
          required
        />
      </label>
      <label className="span-2">
        备注
        <input value={state.notes} onChange={(e) => setState({ ...state, notes: e.target.value })} />
      </label>
    </>
  )

  return (
    <div>
      <header className="page-header">
        <h1>水质采样</h1>
        <p className="muted">
          新建默认为草稿；技术员提交待审，场长发布或退回。校验：溶解氧 doMgL &gt; 0，pH ∈ [6, 9]
        </p>
      </header>
      {error && <div className="error">{error}</div>}

      <form className="panel form-grid" onSubmit={onSubmit}>
        {renderFields(form, setForm)}
        <button type="submit" className="btn primary">
          登记为草稿
        </button>
      </form>

      {editId !== null && editForm && (
        <form
          className="panel form-grid edit-panel"
          onSubmit={(e) => {
            e.preventDefault()
            saveEdit()
          }}
        >
          <h3 className="span-2">编辑水质样 #{editId}（{STATUS_LABEL[rows.find((r) => r.id === editId)?.status ?? 'draft']}）</h3>
          {renderFields(editForm, setEditForm, true)}
          <div className="span-2 btn-row">
            <button type="submit" className="btn primary">
              保存修改
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setEditId(null)
                setEditForm(null)
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}

      <div className="filter-tabs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-tab ${filter === f.key ? 'active' : ''}`}
            onClick={() => {
              setFilter(f.key)
              setError('')
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>状态</th>
              <th>塘口</th>
              <th>采样时间</th>
              <th>水温</th>
              <th>盐度</th>
              <th>DO</th>
              <th>pH</th>
              <th>备注</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>
                  <span className={`badge sample-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td>{pondLabel(r.pondId)}</td>
                <td>{new Date(r.sampledAt).toLocaleString()}</td>
                <td>{r.tempC}</td>
                <td>{r.salinityPpt}</td>
                <td>{r.doMgL}</td>
                <td>{r.ph}</td>
                <td>{r.notes || '—'}</td>
                <td className="action-cell">
                  {r.status === 'draft' && (
                    <button
                      className="btn ghost"
                      title="技术员提交待审"
                      onClick={() => changeStatus(r.id, 'pending')}
                    >
                      提交待审
                    </button>
                  )}
                  {r.status === 'pending' && role === 'admin' && (
                    <>
                      <button
                        className="btn primary small"
                        onClick={() => changeStatus(r.id, 'published')}
                      >
                        发布
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => changeStatus(r.id, 'draft')}
                      >
                        退回
                      </button>
                    </>
                  )}
                  {r.status !== 'published' && (
                    <button className="btn ghost" onClick={() => startEdit(r)}>
                      编辑
                    </button>
                  )}
                  <button className="btn ghost danger" onClick={() => remove(r.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="muted empty-row">
                  当前筛选下暂无水质样
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
