import { FormEvent, useEffect, useState } from 'react'
import { api, getStoredUser } from '../api/client'
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

const makeEmpty = (pondId = 0): FormState => ({
  pondId,
  sampledAt: nowLocal(),
  tempC: 26,
  salinityPpt: 28,
  doMgL: 6.5,
  ph: 8.0,
  notes: '',
})

const STATUS_TABS: { key: SampleStatus; label: string }[] = [
  { key: 'published', label: '已发布' },
  { key: 'draft', label: '草稿' },
  { key: 'pending', label: '待审' },
]

const STATUS_TEXT: Record<SampleStatus, string> = {
  draft: '草稿',
  pending: '待审',
  published: '已发布',
}

export default function WaterSamples() {
  const [ponds, setPonds] = useState<Pond[]>([])
  const [rows, setRows] = useState<WaterSample[]>([])
  const [tab, setTab] = useState<SampleStatus>('published')
  const [form, setForm] = useState<FormState>(makeEmpty())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const role = getStoredUser()?.role ?? ''
  const isAdmin = role === 'admin'

  async function load(nextTab: SampleStatus = tab) {
    const [ps, ws] = await Promise.all([
      api<Pond[]>('/api/ponds'),
      api<WaterSample[]>(`/api/water-samples?status=${nextTab}`),
    ])
    setPonds(ps)
    setRows(ws)
    setForm((f) => (f.pondId ? f : makeEmpty(ps[0]?.id ?? 0)))
  }

  useEffect(() => {
    load(tab).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const body = {
      ...form,
      sampledAt: new Date(form.sampledAt).toISOString(),
      notes: form.notes || null,
    }
    try {
      const wasEditing = editingId !== null
      if (wasEditing) {
        await api(`/api/water-samples/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
      } else {
        await api('/api/water-samples', { method: 'POST', body: JSON.stringify(body) })
        // 新记录是草稿，切到草稿页以便看到
        setTab('draft')
      }
      cancelEdit()
      await load(wasEditing ? tab : 'draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  function startEdit(r: WaterSample) {
    setEditingId(r.id)
    const d = new Date(r.sampledAt)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    setForm({
      pondId: r.pondId,
      sampledAt: d.toISOString().slice(0, 16),
      tempC: r.tempC,
      salinityPpt: r.salinityPpt,
      doMgL: r.doMgL,
      ph: r.ph,
      notes: r.notes ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm((f) => makeEmpty(f.pondId))
  }

  async function changeStatus(r: WaterSample, action: 'submit' | 'publish' | 'reject') {
    setError('')
    try {
      await api(`/api/water-samples/${r.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '状态更新失败')
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

  const pondLabel = (id: number) => {
    const p = ponds.find((x) => x.id === id)
    return p ? `${p.pondCode} (${p.species})` : `#${id}`
  }

  return (
    <div>
      <header className="page-header">
        <h1>水质采样</h1>
        <p className="muted">
          新建默认为草稿；技术员提交待审，场长发布或退回。已发布进入默认列表与看板，且禁止修改测值。
        </p>
      </header>
      {error && <div className="error">{error}</div>}

      <div className="tabs">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form className="panel form-grid" onSubmit={onSubmit}>
        <label>
          塘口
          <select
            value={form.pondId}
            onChange={(e) => setForm({ ...form, pondId: Number(e.target.value) })}
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
            value={form.sampledAt}
            onChange={(e) => setForm({ ...form, sampledAt: e.target.value })}
            required
          />
        </label>
        <label>
          水温 °C
          <input
            type="number"
            step="0.1"
            value={form.tempC}
            onChange={(e) => setForm({ ...form, tempC: Number(e.target.value) })}
            required
          />
        </label>
        <label>
          盐度 ppt
          <input
            type="number"
            step="0.1"
            value={form.salinityPpt}
            onChange={(e) => setForm({ ...form, salinityPpt: Number(e.target.value) })}
            required
          />
        </label>
        <label>
          溶解氧 mg/L
          <input
            type="number"
            step="0.1"
            value={form.doMgL}
            onChange={(e) => setForm({ ...form, doMgL: Number(e.target.value) })}
            required
          />
        </label>
        <label>
          pH
          <input
            type="number"
            step="0.1"
            value={form.ph}
            onChange={(e) => setForm({ ...form, ph: Number(e.target.value) })}
            required
          />
        </label>
        <label className="span-2">
          备注
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <div className="form-actions span-2">
          <button type="submit" className="btn primary">
            {editingId !== null ? '保存修改（不改变状态）' : '登记水质样（草稿）'}
          </button>
          {editingId !== null && (
            <button type="button" className="btn ghost" onClick={cancelEdit}>
              取消编辑
            </button>
          )}
        </div>
      </form>

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
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={editingId === r.id ? 'row-editing' : undefined}
              >
                <td>{r.id}</td>
                <td>
                  <span className={`badge sample-${r.status}`}>{STATUS_TEXT[r.status]}</span>
                </td>
                <td>{pondLabel(r.pondId)}</td>
                <td>{new Date(r.sampledAt).toLocaleString()}</td>
                <td>{r.tempC}</td>
                <td>{r.salinityPpt}</td>
                <td>{r.doMgL}</td>
                <td>{r.ph}</td>
                <td>{r.notes || '—'}</td>
                <td className="actions">
                  {r.status === 'draft' && (
                    <>
                      <button
                        className="btn ghost"
                        onClick={() => startEdit(r)}
                        disabled={editingId === r.id}
                      >
                        编辑
                      </button>
                      <button className="btn ghost" onClick={() => changeStatus(r, 'submit')}>
                        提交待审
                      </button>
                    </>
                  )}
                  {r.status === 'pending' && (
                    <>
                      <button
                        className="btn ghost"
                        onClick={() => startEdit(r)}
                        disabled={editingId === r.id}
                      >
                        编辑
                      </button>
                      {isAdmin ? (
                        <>
                          <button
                            className="btn primary small"
                            onClick={() => changeStatus(r, 'publish')}
                          >
                            发布
                          </button>
                          <button
                            className="btn ghost"
                            onClick={() => changeStatus(r, 'reject')}
                          >
                            退回
                          </button>
                        </>
                      ) : (
                        <span className="muted tiny">待场长审核</span>
                      )}
                    </>
                  )}
                  {r.status === 'published' && (
                    <span className="muted tiny">已锁定</span>
                  )}
                  <button className="btn ghost danger-text" onClick={() => remove(r.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="muted empty-row">
                  当前状态下暂无水质样
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
