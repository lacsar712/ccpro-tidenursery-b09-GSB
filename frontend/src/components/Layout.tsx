import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearToken, clearUser, getUser } from '../api/client'

const links = [
  { to: '/', label: '看板', end: true },
  { to: '/hatcheries', label: '育苗场' },
  { to: '/ponds', label: '育苗塘' },
  { to: '/water-samples', label: '水质样' },
  { to: '/feed-events', label: '投喂事件' },
]

const roleLabel: Record<string, string> = {
  admin: '场长',
  technician: '水质技术员',
}

export default function Layout() {
  const navigate = useNavigate()
  const user = getUser()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div className="brand-title">TideNursery</div>
            <div className="brand-sub">潮汐育苗台账</div>
          </div>
        </div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-name">{user.display_name}</div>
            <div className="sidebar-user-role">{roleLabel[user.role] ?? user.role}</div>
          </div>
        )}
        <button
          className="logout-btn"
          onClick={() => {
            clearToken()
            clearUser()
            navigate('/login')
          }}
        >
          退出登录
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
