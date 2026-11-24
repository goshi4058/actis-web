import { useMemo } from "react"
import { Link } from "react-router-dom"
import { useDataset } from "../context/DatasetContext"
import Icon from "../components/shell/Icon.jsx"
import PageHead from "../components/shell/PageHead.jsx"
import { datasetLabel } from "../components/shell/navConfig.js"

const quickLinks = [
  { path: "/timetable", icon: "clock", label: "駅時刻表", description: "駅ごとの発車時刻", key: "G T" },
  { path: "/board", icon: "board", label: "駅発車標", description: "LED／フルカラー表示", key: "G B" },
  { path: "/trains", icon: "train", label: "運用一覧", description: "運用と列車のつながり", key: "G O" },
  { path: "/lines", icon: "route", label: "路線一覧", description: "駅と路線の確認", key: "G L" },
]

function datasetTime(dataset) {
  return dataset?.updatedAt || dataset?.uploadedAt || dataset?.createdAt || null
}

function formatDateTime(value) {
  if (!value) {
    return "未記録"
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "未記録"
    : date.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function Kpi({ tone, icon, label, value, sub, loading }) {
  return (
    <div className={`ax-card ax-kpi tone-${tone}`}>
      <div className="ax-kpi-top">
        {label}
        <span className="ax-kpi-ico"><Icon name={icon} size={16} /></span>
      </div>
      <strong>{loading ? "…" : value}</strong>
      <div className="ax-kpi-sub">{sub}</div>
    </div>
  )
}

function Home() {
  const {
    datasets,
    selectedDataset,
    selectedDatasetId,
    setSelectedDatasetId,
    loading,
  } = useDataset()

  const stats = useMemo(() => {
    const files = Array.isArray(selectedDataset?.files) ? selectedDataset.files : []
    const firstFile = files[0] || {}
    return {
      files: selectedDataset ? files.length || 1 : 0,
      kudari: selectedDataset?.kudariCount ?? firstFile?.trains?.Kudari?.length ?? 0,
      nobori: selectedDataset?.noboriCount ?? firstFile?.trains?.Nobori?.length ?? 0,
      shared: datasets.filter(dataset => dataset.shareId).length,
    }
  }, [datasets, selectedDataset])

  const recentDatasets = useMemo(
    () => [...datasets]
      .sort((a, b) => new Date(datasetTime(b) || 0) - new Date(datasetTime(a) || 0))
      .slice(0, 6),
    [datasets]
  )

  return (
    <div className="home-page">
      <PageHead
        title="運行管理ダッシュボード"
        description="ヘッダーで選んだダイヤを基準に、全ページの表示が切り替わります。"
        actions={
          <>
            <Link className="ax-btn" to="/datasets"><Icon name="db" size={16} />ダイヤ管理</Link>
            <Link className="ax-btn primary" to="/upload"><Icon name="upload" size={16} />OUD2を追加</Link>
          </>
        }
      />

      <section className="ax-kpis" aria-label="データセット概要">
        <Kpi tone="green" icon="db" label="登録ダイヤ" value={datasets.length} sub={`共有中 ${stats.shared} 件`} loading={loading} />
        <Kpi tone="blue" icon="staff" label="選択中のファイル数" value={stats.files} sub={selectedDataset ? datasetLabel(selectedDataset) : "未選択"} loading={loading} />
        <Kpi tone="amber" icon="down" label="下り列車" value={stats.kudari} sub="選択中のダイヤ" loading={loading} />
        <Kpi tone="red" icon="up" label="上り列車" value={stats.nobori} sub="選択中のダイヤ" loading={loading} />
      </section>

      <section className="ax-two">
        <div className="ax-card">
          <div className="ax-card-head">
            <div>
              <h2>{datasetLabel(selectedDataset)}</h2>
              <span className="sub">選択中のダイヤ</span>
            </div>
            {selectedDataset && (
              selectedDataset.shareId
                ? <span className="ax-pill ok"><Icon name="share" size={12} />共有中</span>
                : <span className="ax-pill">非公開</span>
            )}
          </div>

          <div className="ax-card-body">
            {selectedDatasetId ? (
              <div className="ax-meta">
                <div><span>路線</span><b>{selectedDataset?.railwayName || "未設定"}</b></div>
                <div><span>ファイル</span><b>{selectedDataset?.fileName || "—"}</b></div>
                <div><span>最終更新</span><b className="ax-num">{formatDateTime(datasetTime(selectedDataset))}</b></div>
              </div>
            ) : (
              <p className="ax-muted" style={{ margin: 0 }}>
                まだ選択中のダイヤがありません。OUD2をアップロードするとACTIS全体で参照できます。
              </p>
            )}

            <div className="ax-quick">
              {quickLinks.map(link => (
                <Link className="ax-q" to={link.path} key={link.path}>
                  <span className="ax-qi"><Icon name={link.icon} /></span>
                  <span><b>{link.label}</b><small>{link.description}</small></span>
                  <kbd>{link.key}</kbd>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="ax-card">
          <div className="ax-card-head">
            <div>
              <h2>ダイヤ一覧</h2>
              <span className="sub">クリックで表示を切り替え</span>
            </div>
            <Link className="ax-btn ghost sm" to="/datasets">すべて表示 <Icon name="chevRight" size={14} /></Link>
          </div>

          {recentDatasets.length === 0 ? (
            <div className="ax-empty">
              {loading ? "読み込み中…" : "ダイヤがまだありません"}
            </div>
          ) : (
            <ul className="ax-list">
              {recentDatasets.map(dataset => (
                <li key={dataset.id}>
                  <Icon name="db" className={dataset.id === selectedDatasetId ? "ax-accent" : "ax-muted"} />
                  <button
                    type="button"
                    className="ax-btn ghost sm"
                    style={{ padding: 0, minWidth: 0, fontWeight: dataset.id === selectedDatasetId ? 700 : 500, color: "var(--ax-text)" }}
                    onClick={() => setSelectedDatasetId(dataset.id)}
                  >
                    {datasetLabel(dataset)}
                  </button>
                  <span className="muted ax-num">{formatDateTime(datasetTime(dataset))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <a
        className="ax-card ax-discord"
        href="https://discord.gg/vda3nRvfQd"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="ax-qi"><Icon name="discord" /></span>
        <span>
          <b>公式Discordサーバー</b>
          <small>ACTISに関するお問い合わせや情報交換はこちら</small>
        </span>
        <Icon name="chevRight" size={16} className="ax-muted" style={{ marginLeft: "auto" }} />
      </a>
    </div>
  )
}

export default Home
