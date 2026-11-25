import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import UserMenu from "./usermenu.jsx"
import Icon from "./shell/Icon.jsx"
import DatasetSwitch from "./shell/DatasetSwitch.jsx"

const APP_VERSION = "0.2.2"

function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span className="ax-clock">
      {now.toLocaleTimeString("ja-JP", { hour12: false })}
    </span>
  )
}

function Header({ onToggleNav, onOpenSearch }) {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <header className="ax-topbar">
      <Link to="/" className="ax-brand" title="ダッシュボードへ">
        <span className="ax-brand-mark">AC</span>
        <span className="ax-brand-text">
          <b>ACTIS</b>
          <small>v{APP_VERSION}</small>
        </span>
      </Link>

      <button
        type="button"
        className="ax-icon-btn"
        onClick={onToggleNav}
        title="サイドバーを切り替え（[）"
        aria-label="サイドバーを切り替え"
      >
        <Icon name="panel" />
      </button>

      <DatasetSwitch />

      <button type="button" className="ax-search-btn" onClick={onOpenSearch}>
        <Icon name="search" size={16} />
        <span>列車番号・運用・ページを検索</span>
        <kbd>{isMac ? "⌘ K" : "Ctrl K"}</kbd>
      </button>

      <div className="ax-top-right">
        <Clock />
        <UserMenu />
      </div>
    </header>
  )
}

export default Header
