import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { get, ref } from "firebase/database"
import { auth, database } from "../../firebase/config"
import { useDataset } from "../../context/DatasetContext"
import Icon from "./Icon.jsx"
import { datasetLabel, visibleNavGroups } from "./navConfig.js"

function firstTime(train) {
  const stations = Array.isArray(train?.stations) ? train.stations : []
  const st = stations.find(s => s && (s.departure || s.dep || s.arrival || s.arr || s.single))
  const raw = String(st ? st.departure || st.dep || st.arrival || st.arr || st.single : "").trim()
  if (!raw) {
    return ""
  }
  if (raw.includes(":")) {
    return raw.split(":").slice(0, 2).map(v => v.padStart(2, "0")).join(":")
  }
  if (/^\d{3,6}$/.test(raw)) {
    const hm = raw.length > 4 ? raw.slice(0, -2) : raw
    return `${hm.slice(0, -2).padStart(2, "0")}:${hm.slice(-2)}`
  }
  return raw
}

function operationOf(train) {
  for (const value of [train?.unyo, train?.operation, train?.operationNo, train?.operationNumber, train?.unyoNo]) {
    const text = value === undefined || value === null ? "" : String(value).trim()
    if (text) {
      return text
    }
  }
  return ""
}

// Ctrl/⌘+K で開く横断検索
function CommandPalette({ open, onClose, isAdmin, actions }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const [trains, setTrains] = useState(null)
  const { datasets, selectedDatasetId, setSelectedDatasetId } = useDataset()

  useEffect(() => {
    if (!open) {
      return
    }
    setQuery("")
    setSelected(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  // 列車データは初回に開いたときだけ読み込む
  useEffect(() => {
    if (!open || trains !== null) {
      return
    }
    const user = auth.currentUser
    if (!user) {
      setTrains([])
      return
    }
    let cancelled = false
    get(ref(database, `users/${user.uid}/trains`))
      .then(snapshot => {
        if (cancelled) {
          return
        }
        const data = snapshot.exists() ? snapshot.val() : {}
        setTrains(Object.entries(data).map(([id, train]) => ({ id, ...train })))
      })
      .catch(error => {
        console.error("ACTIS palette trains load error:", error)
        if (!cancelled) {
          setTrains([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, trains])

  // ダイヤを追加・切替したら再読み込み
  useEffect(() => {
    setTrains(null)
  }, [datasets.length])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result = []

    if (q) {
      const scoped = (trains || []).filter(t => !selectedDatasetId || t.datasetId === selectedDatasetId)

      scoped
        .filter(t => String(t.trainNo || "").toLowerCase().includes(q))
        .sort((a, b) => String(a.trainNo).localeCompare(String(b.trainNo), undefined, { numeric: true }))
        .slice(0, 6)
        .forEach(t => result.push({
          group: "列車",
          icon: "train",
          label: `${t.trainNo}  ${t.typeShort || t.type || ""} ${t.destination || t.finalDest || ""}${t.destination || t.finalDest ? "行" : ""}`,
          hint: [firstTime(t), operationOf(t)].filter(Boolean).join(" · "),
          run: () => navigate(`/staff/${t.id}`),
        }))

      const ops = [...new Set(scoped.map(operationOf).filter(Boolean))]
        .filter(op => op.toLowerCase().includes(q))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .slice(0, 5)
      ops.forEach(op => result.push({
        group: "運用",
        icon: "route",
        label: `運用 ${op}`,
        hint: `${scoped.filter(t => operationOf(t) === op).length}本`,
        run: () => navigate(`/trains?op=${encodeURIComponent(op)}`),
      }))
    }

    visibleNavGroups(isAdmin)
      .flatMap(group => group.items)
      .filter(item => !q || item.label.toLowerCase().includes(q) || item.path.includes(q))
      .forEach(item => result.push({
        group: "ページ",
        icon: item.icon,
        label: item.label,
        hint: item.key ? `G → ${item.key.toUpperCase()}` : "",
        run: () => navigate(item.path),
      }))

    datasets
      .filter(d => !q || datasetLabel(d).toLowerCase().includes(q))
      .slice(0, 6)
      .forEach(d => result.push({
        group: "ダイヤを切り替え",
        icon: "db",
        label: datasetLabel(d),
        hint: d.id === selectedDatasetId ? "選択中" : "",
        run: () => setSelectedDatasetId(d.id),
      }))

    actions
      .filter(a => !q || a.label.includes(q))
      .forEach(a => result.push({ group: "操作", ...a }))

    if (!q || "アカウント設定".includes(q)) {
      result.push({ group: "操作", icon: "user", label: "アカウント設定", hint: "", run: () => navigate("/account") })
    }

    return result
  }, [query, trains, datasets, selectedDatasetId, setSelectedDatasetId, isAdmin, actions, navigate])

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector(".sel")?.scrollIntoView({ block: "nearest" })
  }, [selected])

  if (!open) {
    return null
  }

  const runItem = item => {
    onClose()
    item.run()
  }

  const onKeyDown = event => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setSelected(value => Math.min(value + 1, items.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setSelected(value => Math.max(value - 1, 0))
    } else if (event.key === "Enter" && items[selected]) {
      event.preventDefault()
      runItem(items[selected])
    } else if (event.key === "Escape") {
      onClose()
    }
  }

  let lastGroup = ""

  return (
    <div className="ax-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="ax-palette" role="dialog" aria-label="検索">
        <div className="ax-palette-input">
          <Icon name="search" className="ax-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="ページ名・列車番号・運用・ダイヤ名で検索"
            autoComplete="off"
          />
          {query && trains === null && <span className="ax-muted ax-small">列車を読み込み中…</span>}
        </div>

        <ul ref={listRef}>
          {items.length === 0 && <li className="ax-palette-empty">見つかりませんでした</li>}
          {items.map((item, index) => {
            const header = item.group !== lastGroup
            lastGroup = item.group
            return [
              header && <li key={`g-${item.group}`} className="ax-palette-group">{item.group}</li>,
              <li
                key={`${item.group}-${item.label}-${index}`}
                className={`ax-palette-item ${index === selected ? "sel" : ""}`}
                onMouseEnter={() => setSelected(index)}
                onClick={() => runItem(item)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.hint && <small>{item.hint}</small>}
              </li>,
            ]
          })}
        </ul>

        <div className="ax-palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 移動</span>
          <span><kbd>Enter</kbd> 開く</span>
          <span><kbd>Esc</kbd> 閉じる</span>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette
