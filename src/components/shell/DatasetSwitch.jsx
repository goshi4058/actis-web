import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useDataset } from "../../context/DatasetContext"
import Icon from "./Icon.jsx"
import { datasetLabel } from "./navConfig.js"

function formatDate(value) {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ヘッダー常駐のダイヤ切替（全ページ共通の選択中データセット）
function DatasetSwitch() {
  const navigate = useNavigate()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const { datasets, selectedDataset, selectedDatasetId, setSelectedDatasetId, loading } = useDataset()

  useEffect(() => {
    if (!open) {
      return undefined
    }
    const close = event => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false)
      }
    }
    const esc = event => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  const go = path => {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="ax-ds" ref={ref}>
      <button
        type="button"
        className="ax-ds-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        title="表示するダイヤを切り替え"
      >
        <span className={`ax-ds-dot ${selectedDataset ? "" : "off"}`} />
        <span className="ax-ds-label">ダイヤ</span>
        <span className="ax-ds-name">
          {loading ? "読み込み中…" : datasets.length === 0 ? "ダイヤなし" : datasetLabel(selectedDataset)}
        </span>
        <Icon name="chevDown" size={14} className="ax-muted" />
      </button>

      {open && (
        <div className="ax-ds-menu" role="listbox">
          {datasets.length === 0 && (
            <div className="ax-ds-empty">まだダイヤがありません</div>
          )}

          {datasets.map(dataset => (
            <button
              type="button"
              key={dataset.id}
              role="option"
              aria-selected={dataset.id === selectedDatasetId}
              className="ax-ds-item"
              onClick={() => {
                setSelectedDatasetId(dataset.id)
                setOpen(false)
              }}
            >
              <Icon name="db" className="ax-muted" />
              <span className="ax-ds-item-text">
                <b>{datasetLabel(dataset)}</b>
                <small>
                  {[dataset.fileName, formatDate(dataset.updatedAt || dataset.uploadedAt || dataset.createdAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
              {dataset.id === selectedDatasetId && <Icon name="check" className="ax-ds-check" />}
            </button>
          ))}

          <hr />
          <button type="button" className="ax-ds-item" onClick={() => go("/upload")}>
            <Icon name="plus" className="ax-accent" />
            <span className="ax-ds-item-text"><b>OUD2を追加</b><small>新しいダイヤを読み込む</small></span>
          </button>
          <button type="button" className="ax-ds-item" onClick={() => go("/datasets")}>
            <Icon name="db" className="ax-muted" />
            <span className="ax-ds-item-text"><b>ダイヤ管理を開く</b></span>
          </button>
        </div>
      )}
    </div>
  )
}

export default DatasetSwitch
