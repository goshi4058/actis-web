import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import Header from "../Header.jsx"
import Sidebar from "../Sidebar.jsx"
import CommandPalette from "./CommandPalette.jsx"
import { NAV_GROUPS } from "./navConfig.js"
import { useAuthUser } from "./useAuthUser.js"

const STORAGE_NAV = "actis.navCollapsed"

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 保存できない環境では無視
  }
}

function isTyping(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"))
}

const SHORTCUTS = Object.fromEntries(
  NAV_GROUPS.flatMap(group => group.items)
    .filter(item => item.key)
    .map(item => [item.key, item.path])
)

// ヘッダー・サイドバー・検索パレットをまとめたアプリ全体の枠
function AppLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin } = useAuthUser()

  const [collapsed, setCollapsed] = useState(() => readStorage(STORAGE_NAV, "0") === "1")
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const gPressedAt = useRef(0)

  useEffect(() => {
    writeStorage(STORAGE_NAV, collapsed ? "1" : "0")
  }, [collapsed])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const toggleNav = useCallback(() => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setMobileOpen(value => !value)
    } else {
      setCollapsed(value => !value)
    }
  }, [])

  const paletteActions = useMemo(() => [
    { icon: "panel", label: "サイドバーを折りたたむ／広げる", hint: "[", run: toggleNav },
  ], [toggleNav])

  useEffect(() => {
    const onKeyDown = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen(value => !value)
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) {
        return
      }
      if (event.key === "/") {
        const pageSearch = document.querySelector("[data-page-search]")
        event.preventDefault()
        if (pageSearch) {
          pageSearch.focus()
        } else {
          setPaletteOpen(true)
        }
        return
      }
      if (event.key === "[") {
        toggleNav()
        return
      }
      const key = event.key.toLowerCase()
      if (key === "g") {
        gPressedAt.current = Date.now()
        return
      }
      if (gPressedAt.current && Date.now() - gPressedAt.current < 1000 && SHORTCUTS[key]) {
        gPressedAt.current = 0
        navigate(SHORTCUTS[key])
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [navigate, toggleNav])

  return (
    <div className={`ax-shell ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      <Header
        onToggleNav={toggleNav}
        onOpenSearch={() => setPaletteOpen(true)}
      />

      <Sidebar onNavigate={() => setMobileOpen(false)} />
      {mobileOpen && <div className="ax-scrim" onClick={() => setMobileOpen(false)} />}

      <main className="ax-main">{children}</main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        isAdmin={isAdmin}
        actions={paletteActions}
      />
    </div>
  )
}

export default AppLayout
