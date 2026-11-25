import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { get, push, ref, remove, set, update } from "firebase/database"
import { onAuthStateChanged } from "firebase/auth"
import { auth, database } from "../firebase/config"
import { useDataset } from "../context/DatasetContext"
import Icon from "../components/shell/Icon.jsx"
import PageHead from "../components/shell/PageHead.jsx"
import { datasetLabel } from "../components/shell/navConfig.js"
import BoxDiagram from "../components/roster/BoxDiagram.jsx"
import {
  DEFAULT_ROSTER_SETTINGS,
  EVENT_HAS_END,
  EVENT_LABELS,
  analyzeCoverage,
  analyzeRoster,
  connectionCandidates,
  formatDuration,
  formatTime,
  parseTime,
  rosterItems,
  sortRosterItems,
  stopStations,
  toTimeInput,
  trainDestination,
  trainOrigin,
  trainTypeColor,
} from "../utils/rosterCalc.js"
import "./Roster.css"

const CREW_TYPES = ["乗務員", "運転士", "車掌"]

function waitForUser() {
  return new Promise(resolve => {
    if (auth.currentUser) {
      resolve(auth.currentUser)
      return
    }
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe()
      resolve(user)
    })
  })
}

function sortRosters(list) {
  return [...list].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja", { numeric: true }))
}

// ---------------------------------------------------------
// 小さな部品
// ---------------------------------------------------------

function TypeBadge({ train }) {
  const color = trainTypeColor(train)
  return (
    <span className="ax-type" style={color ? { background: color } : undefined}>
      {train?.typeShort || train?.type || "—"}
    </span>
  )
}

function IssueList({ issues }) {
  if (!issues?.length) {
    return null
  }
  return (
    <ul className="rs-issues">
      {issues.map((issue, index) => (
        <li key={index} className={`rs-issue ${issue.level}`}>
          <span className="rs-issue-dot" />
          {issue.text}
        </li>
      ))}
    </ul>
  )
}

function IssueBadge({ counts }) {
  if (counts.error > 0) {
    return <span className="rs-badge error">要修正 {counts.error}</span>
  }
  if (counts.warn > 0) {
    return <span className="rs-badge warn">注意 {counts.warn}</span>
  }
  return <span className="rs-badge ok">OK</span>
}

function StatsBar({ stats }) {
  const est = stats.dutyEstimated ? <small title="出勤・退勤が入っていないため列車の時刻から計算">推定</small> : null
  return (
    <div className="rs-stats">
      <div><span>出勤</span><b className="ax-num">{formatTime(stats.dutyStart)}</b><em>{stats.startStation}</em></div>
      <div><span>退勤</span><b className="ax-num">{formatTime(stats.dutyEnd)}</b><em>{stats.endStation}</em></div>
      <div><span>拘束時間 {est}</span><b>{formatDuration(stats.duty)}</b></div>
      <div><span>乗務時間</span><b>{formatDuration(stats.driving)}</b></div>
      <div><span>休憩時間</span><b>{formatDuration(stats.breakMinutes)}</b></div>
      <div><span>列車</span><b className="ax-num">{stats.trainCount}本</b></div>
    </div>
  )
}

// ---------------------------------------------------------
// 印刷用の行路表
// ---------------------------------------------------------

function PrintSheet({ roster, analysis, datasetName, stationOrder }) {
  const { rows, stats } = analysis
  return (
    <section className="rs-sheet">
      <header className="rs-sheet-head">
        <div>
          <small>{datasetName}</small>
          <h1>{roster.name || "名称未設定"}</h1>
        </div>
        <div className="rs-sheet-meta">
          <span>{roster.crewType || "乗務員"}</span>
          <span>出勤 {formatTime(stats.dutyStart)} {stats.startStation}</span>
          <span>退勤 {formatTime(stats.dutyEnd)} {stats.endStation}</span>
          <span>拘束 {formatDuration(stats.duty)}{stats.dutyEstimated ? "（推定）" : ""}</span>
          <span>乗務 {formatDuration(stats.driving)}</span>
          <span>休憩 {formatDuration(stats.breakMinutes)}</span>
        </div>
      </header>

      <div className="rs-sheet-body">
      <table className="rs-sheet-table">
        <thead>
          <tr>
            <th>発</th>
            <th>駅</th>
            <th>内容</th>
            <th>種別</th>
            <th>行先</th>
            <th>着</th>
            <th>着駅</th>
            <th>備考</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            if (row.kind === "train") {
              const notes = []
              if (row.item.startDutyStation) notes.push(`${row.from}から乗務`)
              if (row.item.endDutyStation) notes.push(`${row.to}で交代`)
              if (row.train?.unyo || row.train?.operation) notes.push(`運用 ${row.train.unyo || row.train.operation}`)
              return (
                <tr key={index}>
                  <td className="t">{formatTime(row.start)}</td>
                  <td>{row.from}</td>
                  <td className="no">{row.train?.trainNo || row.item.trainNo || "—"}</td>
                  <td>{row.train?.typeShort || row.train?.type || ""}</td>
                  <td>{row.train ? trainDestination(row.train) : ""}</td>
                  <td className="t">{formatTime(row.end)}</td>
                  <td>{row.to}</td>
                  <td>{notes.join("・")}</td>
                </tr>
              )
            }
            const hasEnd = EVENT_HAS_END.has(row.item.type) && row.item.endTime
            return (
              <tr key={index} className="ev">
                <td className="t">{formatTime(row.start)}</td>
                <td>{row.from}</td>
                <td colSpan={3}>{EVENT_LABELS[row.item.type] || "その他"}</td>
                <td className="t">{hasEnd ? formatTime(row.end) : ""}</td>
                <td />
                <td>{row.item.note || ""}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="rs-sheet-box">
        <BoxDiagram analysis={analysis} stationOrder={stationOrder} compact />
      </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------
// 全行路の時間軸
// ---------------------------------------------------------

function RosterTimeline({ entries, onSelect }) {
  const times = entries.flatMap(({ analysis }) =>
    analysis.rows.flatMap(row => [row.start, row.end]).concat([analysis.stats.dutyStart, analysis.stats.dutyEnd])
  ).filter(value => value !== null && Number.isFinite(value))

  const startHour = times.length ? Math.floor(Math.min(...times) / 60) : 4
  const endHour = times.length ? Math.ceil(Math.max(...times) / 60) : 26
  const from = startHour * 60
  const span = Math.max(60, endHour * 60 - from)
  const pos = minutes => `${((minutes - from) / span) * 100}%`
  const hours = []
  for (let h = startHour; h <= endHour; h += 1) {
    hours.push(h)
  }

  return (
    <div className="rs-gantt">
      <div className="rs-gantt-row rs-gantt-axis">
        <div className="rs-gantt-name" />
        <div className="rs-gantt-track">
          {hours.map(h => (
            <span key={h} style={{ left: pos(h * 60) }}>{h}</span>
          ))}
        </div>
      </div>

      {entries.map(({ roster, analysis }) => {
        const { stats } = analysis
        return (
          <button type="button" className="rs-gantt-row" key={roster.id} onClick={() => onSelect(roster.id)}>
            <div className="rs-gantt-name">
              <b>{roster.name || "名称未設定"}</b>
              <small className="ax-num">{formatTime(stats.dutyStart)}–{formatTime(stats.dutyEnd)}</small>
            </div>
            <div className="rs-gantt-track">
              {hours.map(h => <i key={h} className="rs-gantt-grid" style={{ left: pos(h * 60) }} />)}
              {stats.dutyStart !== null && stats.dutyEnd !== null && (
                <span className="rs-gantt-duty" style={{ left: pos(stats.dutyStart), width: `${((stats.dutyEnd - stats.dutyStart) / span) * 100}%` }} />
              )}
              {analysis.rows.map((row, index) => {
                if (row.start === null) {
                  return null
                }
                const end = row.end ?? row.start
                const width = `${Math.max(0.35, ((end - row.start) / span) * 100)}%`
                if (row.kind === "train") {
                  return (
                    <span
                      key={index}
                      className="rs-gantt-train"
                      title={`${row.train?.trainNo || ""} ${row.from}→${row.to} ${formatTime(row.start)}–${formatTime(row.end)}`}
                      style={{ left: pos(row.start), width, background: trainTypeColor(row.train) || "#4b5563" }}
                    >
                      {row.train?.trainNo}
                    </span>
                  )
                }
                if (row.item.type === "break" || row.item.type === "wait") {
                  return (
                    <span
                      key={index}
                      className={`rs-gantt-rest ${row.item.type}`}
                      title={`${EVENT_LABELS[row.item.type]} ${row.from} ${formatTime(row.start)}–${formatTime(row.end)}`}
                      style={{ left: pos(row.start), width }}
                    />
                  )
                }
                return null
              })}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------
// 本体
// ---------------------------------------------------------

function Roster() {
  const { selectedDatasetId, selectedDataset } = useDataset()
  const [rosters, setRosters] = useState([])
  const [trains, setTrains] = useState([])
  const [settings, setSettings] = useState(DEFAULT_ROSTER_SETTINGS)
  const [selectedRosterId, setSelectedRosterId] = useState("")
  const [view, setView] = useState("edit")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [showPicker, setShowPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState("")
  const [pickerUnassigned, setPickerUnassigned] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [printTarget, setPrintTarget] = useState(null)
  const [showAllCoverage, setShowAllCoverage] = useState(false)

  const rosterPath = useCallback(
    (uid, id = "") => `users/${uid}/datasets/${selectedDatasetId}/crewRosters${id ? `/${id}` : ""}`,
    [selectedDatasetId]
  )

  // ---------- 読み込み ----------
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const user = await waitForUser()
      if (cancelled) return
      if (!user) {
        setError("ACTISアカウントにログインしてください。")
        setLoading(false)
        return
      }
      if (!selectedDatasetId) {
        setRosters([])
        setTrains([])
        setSelectedRosterId("")
        setLoading(false)
        return
      }

      setLoading(true)
      setError("")
      try {
        const [rosterSnap, trainSnap, settingsSnap] = await Promise.all([
          get(ref(database, `users/${user.uid}/datasets/${selectedDatasetId}/crewRosters`)),
          get(ref(database, `users/${user.uid}/trains`)),
          get(ref(database, `users/${user.uid}/datasets/${selectedDatasetId}/rosterSettings`)),
        ])
        if (cancelled) return

        const rosterList = sortRosters(
          Object.entries(rosterSnap.exists() ? rosterSnap.val() : {}).map(([id, value]) => ({ id, ...(value || {}) }))
        )
        const trainList = Object.entries(trainSnap.exists() ? trainSnap.val() : {})
          .map(([id, value]) => ({ id, ...(value || {}) }))
          .filter(train => String(train.datasetId || "") === String(selectedDatasetId))

        setRosters(rosterList)
        setTrains(trainList)
        setSettings({ ...DEFAULT_ROSTER_SETTINGS, ...(settingsSnap.exists() ? settingsSnap.val() : {}) })
        setSelectedRosterId(current => (rosterList.some(r => r.id === current) ? current : rosterList[0]?.id || ""))
      } catch (err) {
        console.error("Roster load error:", err)
        if (!cancelled) setError(`行路データを取得できませんでした：${err.message}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [selectedDatasetId])

  // ---------- 計算 ----------
  const trainsById = useMemo(() => new Map(trains.map(train => [String(train.id), train])), [trains])

  const sortedTrains = useMemo(
    () => [...trains]
      .map(train => ({ train, start: stopStations(train)[0]?.departure ?? Infinity }))
      .sort((a, b) => a.start - b.start || String(a.train.trainNo).localeCompare(String(b.train.trainNo), undefined, { numeric: true }))
      .map(entry => entry.train),
    [trains]
  )

  // 箱ダイヤの縦軸に使う駅の並び（いちばん駅数の多い列車を基準に、ほかの列車の駅を足していく）
  const stationOrder = useMemo(() => {
    const lists = trains
      .map(train => (Array.isArray(train.stations) ? train.stations : [])
        .map(station => String(station?.name || station?.Ekimei || "").trim())
        .filter(Boolean))
      .sort((a, b) => b.length - a.length)
    const base = [...(lists[0] || [])]
    const firstTrain = trains.find(train => (train.stations || []).length === base.length)
    if (firstTrain?.direction === "Nobori") base.reverse()
    lists.slice(1).forEach(list => {
      list.forEach((name, i) => {
        if (base.includes(name)) return
        const prev = list.slice(0, i).reverse().find(n => base.includes(n))
        const at = prev ? base.indexOf(prev) + 1 : base.length
        base.splice(at, 0, name)
      })
    })
    return base
  }, [trains])

  const analyses = useMemo(
    () => rosters.map(roster => ({ roster, analysis: analyzeRoster(roster, trainsById, settings) })),
    [rosters, trainsById, settings]
  )

  const coverage = useMemo(() => analyzeCoverage(rosters, sortedTrains), [rosters, sortedTrains])
  const coverageById = useMemo(() => new Map(coverage.map(entry => [String(entry.train.id), entry])), [coverage])

  const selected = analyses.find(entry => entry.roster.id === selectedRosterId) || null
  const selectedRoster = selected?.roster || null

  const candidates = useMemo(
    () => (selectedRoster ? connectionCandidates(selectedRoster, sortedTrains, trainsById, settings, 6) : []),
    [selectedRoster, sortedTrains, trainsById, settings]
  )

  // ---------- 保存 ----------
  const writeRoster = async (rosterId, patch) => {
    const user = await waitForUser()
    if (!user) return
    setSaving(true)
    setRosters(current => current.map(r => (r.id === rosterId ? { ...r, ...patch } : r)))
    try {
      await update(ref(database, rosterPath(user.uid, rosterId)), { ...patch, updatedAt: Date.now() })
    } catch (err) {
      setError(`行路を保存できませんでした：${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const saveItems = items => {
    if (!selectedRoster) return
    return writeRoster(selectedRoster.id, { items: sortRosterItems(items, trainsById) })
  }

  const createRoster = async () => {
    const user = await waitForUser()
    if (!user || !selectedDatasetId) return
    const used = new Set(rosters.map(r => r.name))
    let n = rosters.length + 1
    while (used.has(`${n}行路`)) n += 1

    setSaving(true)
    try {
      const newRef = push(ref(database, rosterPath(user.uid)))
      const roster = { name: `${n}行路`, crewType: "乗務員", items: [], createdAt: Date.now(), updatedAt: Date.now() }
      await set(newRef, roster)
      setRosters(current => sortRosters([...current, { id: newRef.key, ...roster }]))
      setSelectedRosterId(newRef.key)
      setView("edit")
      setNameDraft(roster.name)
      setRenaming(true)
    } catch (err) {
      setError(`行路を作成できませんでした：${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const duplicateRoster = async () => {
    if (!selectedRoster) return
    const user = await waitForUser()
    if (!user) return
    const newRef = push(ref(database, rosterPath(user.uid)))
    const roster = {
      name: `${selectedRoster.name || "行路"}のコピー`,
      crewType: selectedRoster.crewType || "乗務員",
      items: rosterItems(selectedRoster),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await set(newRef, roster)
    setRosters(current => sortRosters([...current, { id: newRef.key, ...roster }]))
    setSelectedRosterId(newRef.key)
  }

  const commitRename = async () => {
    setRenaming(false)
    const name = nameDraft.trim()
    if (!selectedRoster || !name || name === selectedRoster.name) return
    await writeRoster(selectedRoster.id, { name })
    setRosters(current => sortRosters(current))
  }

  const deleteRoster = async () => {
    if (!selectedRoster) return
    if (!window.confirm(`「${selectedRoster.name}」を削除しますか？この操作は元に戻せません。`)) return
    const user = await waitForUser()
    if (!user) return
    await remove(ref(database, rosterPath(user.uid, selectedRoster.id)))
    const rest = rosters.filter(r => r.id !== selectedRoster.id)
    setRosters(rest)
    setSelectedRosterId(rest[0]?.id || "")
  }

  const saveSettings = async patch => {
    const next = { ...settings, ...patch }
    setSettings(next)
    const user = await waitForUser()
    if (!user || !selectedDatasetId) return
    await update(ref(database, `users/${user.uid}/datasets/${selectedDatasetId}/rosterSettings`), patch)
  }

  // ---------- 項目の操作 ----------
  const items = rosterItems(selectedRoster)

  const addTrain = async (train, startDutyStation = "") => {
    if (!selectedRoster) return
    await saveItems([
      ...items,
      { type: "train", trainId: train.id, trainNo: train.trainNo || "", startDutyStation, endDutyStation: "", addedAt: Date.now() },
    ])
  }

  const addEvent = async type => {
    if (!selectedRoster) return
    const { rows, stats } = selected.analysis
    const trainRows = rows.filter(row => row.kind === "train" && row.start !== null)
    const last = [...rows].reverse().find(row => row.end !== null)
    let station = ""
    let time = null
    let endTime = null

    if (type === "report") {
      station = trainRows[0]?.from || ""
      time = trainRows[0] ? trainRows[0].start - 20 : null
    } else if (type === "finish") {
      station = trainRows[trainRows.length - 1]?.to || ""
      time = stats.dutyEnd !== null ? (trainRows.length ? trainRows[trainRows.length - 1].end : stats.dutyEnd) + 15 : null
    } else {
      station = last?.to || ""
      time = last ? last.end : null
      endTime = time !== null && type === "break" ? time + 45 : null
    }

    await saveItems([
      ...items,
      {
        type,
        station,
        time: toTimeInput(time),
        ...(EVENT_HAS_END.has(type) ? { endTime: toTimeInput(endTime) } : {}),
        addedAt: Date.now(),
      },
    ])
  }

  const updateItem = async (index, patch) => {
    const next = [...items]
    next[index] = { ...next[index], ...patch }
    await saveItems(next)
  }

  const removeItem = async index => {
    await saveItems(items.filter((_, i) => i !== index))
  }

  // ---------- 印刷 ----------
  useEffect(() => {
    if (!printTarget) return undefined
    const done = () => setPrintTarget(null)
    window.addEventListener("afterprint", done)
    const timer = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("afterprint", done)
    }
  }, [printTarget])

  const printEntries = printTarget === "all"
    ? analyses
    : analyses.filter(entry => entry.roster.id === printTarget)

  // ---------- 列車の追加ダイアログ ----------
  const pickerList = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    const inRoster = new Set(items.filter(item => item.type === "train").map(item => String(item.trainId)))
    return sortedTrains.filter(train => {
      if (inRoster.has(String(train.id))) return false
      if (pickerUnassigned && coverageById.get(String(train.id))?.status === "full") return false
      if (!q) return true
      return [train.trainNo, train.type, train.typeShort, trainOrigin(train), trainDestination(train), train.unyo, train.operation]
        .some(value => String(value || "").toLowerCase().includes(q))
    })
  }, [pickerQuery, pickerUnassigned, sortedTrains, coverageById, items])

  // ---------- 表示 ----------
  const coverageSummary = {
    total: coverage.length,
    full: coverage.filter(c => c.status === "full").length,
    partial: coverage.filter(c => c.status === "partial").length,
    none: coverage.filter(c => c.status === "none").length,
    overlaps: coverage.filter(c => c.overlaps.length > 0).length,
  }

  const head = (
    <PageHead
      crumbs={["乗務"]}
      title="行路組み立て"
      description="乗務員の担当列車・休憩・出退勤を組み立てます。時刻順に自動で並び、つながりや時間を自動でチェックします。"
      actions={
        <>
          <button type="button" className="ax-btn" onClick={() => setPrintTarget("all")} disabled={rosters.length === 0}>
            <Icon name="staff" size={16} />全行路を印刷
          </button>
          <button type="button" className="ax-btn primary" onClick={createRoster} disabled={saving || !selectedDatasetId}>
            <Icon name="plus" size={16} />行路を作成
          </button>
        </>
      }
    />
  )

  if (!selectedDatasetId || loading) {
    return (
      <div className="rs-page">
        {head}
        <div className="ax-card ax-empty">{loading ? "読み込み中…" : "ヘッダーでダイヤを選択してください。"}</div>
      </div>
    )
  }

  return (
    <div className="rs-page">
      <div className="rs-screen">
        {head}

        {error && <div className="rs-error">{error}</div>}

        <div className="rs-tabs">
          <div className="ax-seg">
            <button type="button" className={view === "edit" ? "on" : ""} onClick={() => setView("edit")}>行路の編集</button>
            <button type="button" className={view === "overview" ? "on" : ""} onClick={() => setView("overview")}>
              全行路の一覧
              {coverageSummary.none + coverageSummary.partial > 0 && (
                <span className="rs-tab-count">未担当 {coverageSummary.none + coverageSummary.partial}</span>
              )}
            </button>
          </div>
          <div className="rs-settings">
            <label>
              乗継ぎの目安
              <input
                type="number"
                min="0"
                max="60"
                value={settings.minConnection}
                onChange={e => saveSettings({ minConnection: Math.max(0, Number(e.target.value) || 0) })}
              />
              分
            </label>
            <label>
              拘束の上限
              <input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={settings.maxDutyHours}
                onChange={e => saveSettings({ maxDutyHours: Math.max(0, Number(e.target.value) || 0) })}
              />
              時間
            </label>
            {saving && <span className="ax-muted ax-small">保存中…</span>}
          </div>
        </div>

        {view === "overview" ? (
          <>
            <section className="ax-card rs-section">
              <div className="ax-card-head">
                <div><h2>行路の一覧</h2><span className="sub">行をクリックで編集</span></div>
                <span className="ax-muted ax-small">{rosters.length} 行路</span>
              </div>
              {analyses.length === 0 ? (
                <div className="ax-empty">まだ行路がありません。</div>
              ) : (
                <>
                  <table className="ax-table rs-summary">
                    <thead>
                      <tr>
                        <th>行路</th>
                        <th>出勤</th>
                        <th>退勤</th>
                        <th>拘束</th>
                        <th>乗務</th>
                        <th className="hide-sm">休憩</th>
                        <th>列車</th>
                        <th>チェック</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyses.map(({ roster, analysis }) => (
                        <tr className="row" key={roster.id} onClick={() => { setSelectedRosterId(roster.id); setView("edit") }}>
                          <td><b>{roster.name || "名称未設定"}</b> <span className="sub">{roster.crewType}</span></td>
                          <td className="ax-num">{formatTime(analysis.stats.dutyStart)} <span className="sub">{analysis.stats.startStation}</span></td>
                          <td className="ax-num">{formatTime(analysis.stats.dutyEnd)} <span className="sub">{analysis.stats.endStation}</span></td>
                          <td>{formatDuration(analysis.stats.duty)}</td>
                          <td>{formatDuration(analysis.stats.driving)}</td>
                          <td className="hide-sm">{formatDuration(analysis.stats.breakMinutes)}</td>
                          <td className="ax-num">{analysis.stats.trainCount}本</td>
                          <td><IssueBadge counts={analysis.counts} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <RosterTimeline entries={analyses} onSelect={id => { setSelectedRosterId(id); setView("edit") }} />
                </>
              )}
            </section>

            <section className="ax-card rs-section">
              <div className="ax-card-head">
                <div>
                  <h2>列車の担当状況</h2>
                  <span className="sub">
                    全{coverageSummary.total}本中 担当済み {coverageSummary.full}本 · 一部だけ {coverageSummary.partial}本 · 未担当 {coverageSummary.none}本
                    {coverageSummary.overlaps > 0 && ` · 重複 ${coverageSummary.overlaps}本`}
                  </span>
                </div>
              </div>
              <div className="rs-cover-bar">
                <span className="full" style={{ flex: coverageSummary.full }} />
                <span className="partial" style={{ flex: coverageSummary.partial }} />
                <span className="none" style={{ flex: coverageSummary.none }} />
              </div>
              {coverage.filter(c => c.status !== "full" || c.overlaps.length).length === 0 ? (
                <div className="ax-empty">すべての列車がちょうど1つの行路に入っています。</div>
              ) : (
                <table className="ax-table">
                  <colgroup>
                    <col style={{ width: 70 }} />
                    <col style={{ width: 110 }} />
                    <col />
                    <col className="hide-sm" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>発時刻</th>
                      <th>列車</th>
                      <th>状況</th>
                      <th className="hide-sm">担当している行路</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.filter(c => c.status !== "full" || c.overlaps.length).slice(0, showAllCoverage ? undefined : 30).map(c => (
                      <tr key={c.train.id}>
                        <td className="ax-num">{formatTime(c.start)}</td>
                        <td><b className="ax-num">{c.train.trainNo}</b> <TypeBadge train={c.train} /></td>
                        <td style={{ whiteSpace: "normal" }}>
                          {c.status === "none" && <span className="rs-badge error">未担当</span>}
                          {c.status === "partial" && (
                            <span className="rs-badge warn">未担当区間 {c.uncovered.map(u => `${u.from}→${u.to}`).join("、")}</span>
                          )}
                          {c.overlaps.map((o, i) => (
                            <span key={i} className="rs-badge warn">重複 {o.from}→{o.to}（{o.rosters.join("・")}）</span>
                          ))}
                          <span className="sub"> {trainOrigin(c.train)} → {trainDestination(c.train)}</span>
                        </td>
                        <td className="hide-sm sub">{c.rosterNames.join("、") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {coverage.filter(c => c.status !== "full" || c.overlaps.length).length > 30 && (
                <div className="rs-more">
                  <button type="button" className="ax-btn ghost sm" onClick={() => setShowAllCoverage(value => !value)}>
                    {showAllCoverage
                      ? "最初の30本だけ表示"
                      : `残り ${coverage.filter(c => c.status !== "full" || c.overlaps.length).length - 30} 本も表示`}
                  </button>
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="rs-layout">
            <aside className="ax-card rs-list">
              <div className="ax-card-head"><h2>行路</h2><span className="ax-muted ax-small">{rosters.length}件</span></div>
              {analyses.length === 0 ? (
                <div className="ax-empty">まだ行路がありません。<br />右上の「行路を作成」から始めます。</div>
              ) : analyses.map(({ roster, analysis }) => (
                <button
                  type="button"
                  key={roster.id}
                  className={`rs-list-item ${roster.id === selectedRosterId ? "active" : ""}`}
                  onClick={() => { setSelectedRosterId(roster.id); setRenaming(false) }}
                >
                  <span className="rs-list-top">
                    <b>{roster.name || "名称未設定"}</b>
                    <IssueBadge counts={analysis.counts} />
                  </span>
                  <span className="rs-list-sub ax-num">
                    {formatTime(analysis.stats.dutyStart)}–{formatTime(analysis.stats.dutyEnd)} · {analysis.stats.trainCount}本 · 乗務 {formatDuration(analysis.stats.driving)}
                  </span>
                </button>
              ))}
            </aside>

            <main className="ax-card rs-editor">
              {!selected ? (
                <div className="ax-empty">左の一覧から行路を選ぶか、新しく作成してください。</div>
              ) : (
                <>
                  <div className="rs-editor-head">
                    <div className="rs-title">
                      {renaming ? (
                        <input
                          autoFocus
                          className="rs-name-input"
                          value={nameDraft}
                          onChange={e => setNameDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === "Enter") commitRename()
                            if (e.key === "Escape") setRenaming(false)
                          }}
                        />
                      ) : (
                        <h2 onDoubleClick={() => { setNameDraft(selectedRoster.name || ""); setRenaming(true) }}>
                          {selectedRoster.name || "名称未設定"}
                        </h2>
                      )}
                      <select
                        className="ax-select"
                        value={selectedRoster.crewType || "乗務員"}
                        onChange={e => writeRoster(selectedRoster.id, { crewType: e.target.value })}
                        aria-label="乗務の種類"
                      >
                        {CREW_TYPES.map(type => <option key={type}>{type}</option>)}
                      </select>
                    </div>
                    <div className="ax-actions">
                      <button type="button" className="ax-btn ghost sm" onClick={() => { setNameDraft(selectedRoster.name || ""); setRenaming(true) }}>名前を変更</button>
                      <button type="button" className="ax-btn ghost sm" onClick={duplicateRoster}>複製</button>
                      <button type="button" className="ax-btn sm" onClick={() => setPrintTarget(selectedRoster.id)}>
                        <Icon name="staff" size={14} />行路表を印刷
                      </button>
                      <button type="button" className="ax-btn ghost sm rs-danger" onClick={deleteRoster}>削除</button>
                    </div>
                  </div>

                  <StatsBar stats={selected.analysis.stats} />
                  <IssueList issues={selected.analysis.issues} />

                  <div className="rs-split">
                  <div className="rs-split-main">
                  <div className="rs-list-head">
                    <b>行路の内容</b>
                    <span className="ax-muted ax-small">時刻順に自動で並びます</span>
                  </div>

                  <div className="rs-timeline">
                    {selected.analysis.rows.length === 0 && (
                      <div className="ax-empty">下の「列車を追加」から担当する列車を入れてください。</div>
                    )}

                    {selected.analysis.rows.map((row, index) => {
                      const prev = selected.analysis.rows[index - 1]
                      const gap = prev && prev.end !== null && row.start !== null ? row.start - prev.end : null
                      const level = row.issues.some(i => i.level === "error") ? "error" : row.issues.some(i => i.level === "warn") ? "warn" : ""

                      return (
                        <Fragment key={`${row.item.type}-${row.item.trainId || ""}-${row.item.addedAt || index}`}>
                          {gap !== null && gap > 0 && (
                            <div className="rs-gap">
                              <span className="ax-num">{formatDuration(gap)}</span>
                              {prev.to && row.from && prev.to === row.from && <span>{row.from}</span>}
                            </div>
                          )}

                          {row.kind === "train" ? (
                            <div className={`rs-row train ${level}`}>
                              <div className="rs-time ax-num">
                                <b>{formatTime(row.start)}</b>
                                <span>{formatTime(row.end)}</span>
                              </div>
                              <div className="rs-marker" style={{ background: trainTypeColor(row.train) || undefined }} />
                              <div className="rs-body">
                                <div className="rs-row-title">
                                  <b className="ax-num">{row.train?.trainNo || row.item.trainNo || "—"}</b>
                                  <TypeBadge train={row.train} />
                                  <span className="rs-route">{row.from} → {row.to}</span>
                                  {row.train && (
                                    <span className="sub">
                                      （{trainOrigin(row.train)}→{trainDestination(row.train)}
                                      {row.train.unyo || row.train.operation ? ` · ${row.train.unyo || row.train.operation}` : ""}）
                                    </span>
                                  )}
                                </div>
                                {row.train && (
                                  <div className="rs-duty">
                                    <label>
                                      乗務開始
                                      <select
                                        className="ax-select"
                                        value={row.item.startDutyStation || ""}
                                        onChange={e => updateItem(row.index, { startDutyStation: e.target.value })}
                                      >
                                        <option value="">始発（{trainOrigin(row.train)}）から</option>
                                        {stopStations(row.train).slice(1, -1).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                      </select>
                                    </label>
                                    <label>
                                      乗務終了
                                      <select
                                        className="ax-select"
                                        value={row.item.endDutyStation || ""}
                                        onChange={e => updateItem(row.index, { endDutyStation: e.target.value })}
                                      >
                                        <option value="">終着（{trainDestination(row.train)}）まで</option>
                                        {stopStations(row.train).slice(1, -1).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                      </select>
                                    </label>
                                  </div>
                                )}
                                <IssueList issues={row.issues} />
                              </div>
                              <button type="button" className="rs-remove" title="この列車を外す" onClick={() => removeItem(row.index)}>×</button>
                            </div>
                          ) : (
                            <div className={`rs-row event ${row.item.type} ${level}`}>
                              <div className="rs-time ax-num">
                                <b>{formatTime(row.start)}</b>
                                {EVENT_HAS_END.has(row.item.type) && row.item.endTime && <span>{formatTime(row.end)}</span>}
                              </div>
                              <div className="rs-marker" />
                              <div className="rs-body">
                                <div className="rs-event-fields">
                                  <b className="rs-event-label">{EVENT_LABELS[row.item.type] || "その他"}</b>
                                  <input
                                    className="rs-input"
                                    defaultValue={row.item.station || ""}
                                    placeholder="駅・場所"
                                    list="rs-stations"
                                    onBlur={e => e.target.value !== (row.item.station || "") && updateItem(row.index, { station: e.target.value.trim() })}
                                  />
                                  <input
                                    className="rs-input time"
                                    type="time"
                                    value={toTimeInput(parseTime(row.item.time))}
                                    onChange={e => updateItem(row.index, { time: e.target.value })}
                                    aria-label="開始時刻"
                                  />
                                  {EVENT_HAS_END.has(row.item.type) && (
                                    <>
                                      <span className="ax-muted">〜</span>
                                      <input
                                        className="rs-input time"
                                        type="time"
                                        value={toTimeInput(parseTime(row.item.endTime))}
                                        onChange={e => updateItem(row.index, { endTime: e.target.value })}
                                        aria-label="終了時刻"
                                      />
                                    </>
                                  )}
                                  <input
                                    className="rs-input note"
                                    defaultValue={row.item.note || ""}
                                    placeholder="メモ（印刷に出ます）"
                                    onBlur={e => e.target.value !== (row.item.note || "") && updateItem(row.index, { note: e.target.value.trim() })}
                                  />
                                </div>
                                <IssueList issues={row.issues} />
                              </div>
                              <button type="button" className="rs-remove" title="削除" onClick={() => removeItem(row.index)}>×</button>
                            </div>
                          )}
                        </Fragment>
                      )
                    })}
                  </div>

                  <div className="rs-add">
                    <button type="button" className="ax-btn primary" onClick={() => { setPickerQuery(""); setShowPicker(true) }}>
                      <Icon name="plus" size={16} />列車を追加
                    </button>
                    {["report", "break", "wait", "finish"].map(type => (
                      <button type="button" key={type} className="ax-btn" onClick={() => addEvent(type)}>
                        ＋ {EVENT_LABELS[type]}
                      </button>
                    ))}
                  </div>

                  {candidates.length > 0 && (
                    <div className="rs-candidates">
                      <div className="rs-candidates-head">
                        次に乗り継げる列車
                        <span className="ax-muted ax-small">最後の列車の着駅から、乗継ぎの目安（{settings.minConnection}分）以上あとに出る列車</span>
                      </div>
                      <div className="rs-candidate-list">
                        {candidates.map(c => {
                          const cov = coverageById.get(String(c.train.id))
                          return (
                            <button
                              type="button"
                              key={c.train.id}
                              className="rs-candidate"
                              onClick={() => addTrain(c.train, c.fromOrigin ? "" : c.station)}
                              title={c.fromOrigin ? "" : `${c.station}から途中乗務`}
                            >
                              <span className="ax-num rs-cand-time">{formatTime(c.departure)}</span>
                              <b className="ax-num">{c.train.trainNo}</b>
                              <TypeBadge train={c.train} />
                              <span className="sub">{c.station}→{trainDestination(c.train)}</span>
                              <span className="sub ax-num">+{Math.round(c.gap)}分</span>
                              {cov && cov.status === "full" && <span className="rs-badge warn">担当済み</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  </div>

                  <aside className="rs-split-box">
                    <div className="rs-box-head">
                      <b>箱ダイヤ</b>
                      <span className="ax-muted ax-small">横が駅、上から下へ時間が進みます。横線が列車での移動、縦線が駅にいる時間です（縦の長さは時間に比例しません）。</span>
                    </div>
                    <BoxDiagram analysis={selected.analysis} stationOrder={stationOrder} />
                  </aside>
                  </div>
                </>
              )}
            </main>
          </div>
        )}

        <datalist id="rs-stations">
          {[...new Set(sortedTrains.flatMap(train => stopStations(train).map(s => s.name)))].map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      {showPicker && selectedRoster && (
        <div className="ax-overlay" onMouseDown={e => e.target === e.currentTarget && setShowPicker(false)}>
          <div className="ax-palette rs-picker" role="dialog" aria-label="列車を追加">
            <div className="ax-palette-input">
              <Icon name="search" className="ax-muted" />
              <input
                autoFocus
                value={pickerQuery}
                onChange={e => setPickerQuery(e.target.value)}
                onKeyDown={e => e.key === "Escape" && setShowPicker(false)}
                placeholder="列車番号・種別・駅名・運用で検索"
              />
              <label className="rs-picker-toggle">
                <input type="checkbox" checked={pickerUnassigned} onChange={e => setPickerUnassigned(e.target.checked)} />
                未担当のみ
              </label>
            </div>
            <ul>
              {pickerList.length === 0 && <li className="ax-palette-empty">該当する列車がありません</li>}
              {pickerList.slice(0, 150).map(train => {
                const cov = coverageById.get(String(train.id))
                return (
                  <li
                    key={train.id}
                    className="ax-palette-item rs-picker-item"
                    onClick={async () => { await addTrain(train); setShowPicker(false) }}
                  >
                    <span className="ax-num rs-cand-time">{formatTime(stopStations(train)[0]?.departure ?? null)}</span>
                    <b className="ax-num">{train.trainNo || "—"}</b>
                    <TypeBadge train={train} />
                    <span>{trainOrigin(train)} → {trainDestination(train)}</span>
                    <small>
                      {cov?.status === "partial" ? "一部担当" : cov?.status === "full" ? `担当: ${cov.rosterNames.join("・")}` : ""}
                    </small>
                  </li>
                )
              })}
            </ul>
            <div className="ax-palette-foot">
              <span>{selectedRoster.name} に追加します。時刻順に自動で並びます。</span>
              <span style={{ marginLeft: "auto" }}><kbd>Esc</kbd> 閉じる</span>
            </div>
          </div>
        </div>
      )}

      {printTarget && (
        <div className="rs-print">
          {printEntries.map(({ roster, analysis }) => (
            <PrintSheet key={roster.id} roster={roster} analysis={analysis} datasetName={datasetLabel(selectedDataset)} stationOrder={stationOrder} />
          ))}
        </div>
      )}
    </div>
  )
}

export default Roster
