import { Link, NavLink } from "react-router-dom"
import Icon from "./shell/Icon.jsx"
import { visibleNavGroups } from "./shell/navConfig.js"
import { useAuthUser } from "./shell/useAuthUser.js"

function Sidebar({ onNavigate }) {
  const { isAdmin } = useAuthUser()
  const groups = visibleNavGroups(isAdmin)

  return (
    <nav className="ax-nav" aria-label="メインナビゲーション">
      {groups.map(group => (
        <div className="ax-nav-group" key={group.label}>
          <div className="ax-nav-label">{group.label}</div>

          {group.items.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) => (isActive ? "active" : "")}
              title={item.key ? `${item.label}（G → ${item.key.toUpperCase()}）` : item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.tag && (
                <em className={`ax-nav-tag ${item.admin && group.admin ? "adm" : ""}`}>
                  {item.tag}
                </em>
              )}
            </NavLink>
          ))}
        </div>
      ))}

      <div className="ax-nav-foot">
        <a href="https://discord.gg/vda3nRvfQd" target="_blank" rel="noopener noreferrer">
          公式Discord
        </a>
        <Link to="/privacy" onClick={onNavigate}>プライバシーポリシー</Link>
        <Link to="/terms" onClick={onNavigate}>利用規約</Link>
        <span>© 2026 ACTIS / goshi4058</span>
      </div>
    </nav>
  )
}

export default Sidebar
