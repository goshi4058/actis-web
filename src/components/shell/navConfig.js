// サイドバーとコマンドパレットで共有するナビゲーション定義
// key: 「G → key」で移動するショートカット
// admin: 管理者のみ表示
export const NAV_GROUPS = [
  {
    label: "概要",
    items: [
      { path: "/", label: "ダッシュボード", icon: "home", key: "h", end: true },
    ],
  },
  {
    label: "閲覧",
    items: [
      { path: "/timetable", label: "駅時刻表", icon: "clock", key: "t" },
      { path: "/board", label: "駅発車標", icon: "board", key: "b" },
      { path: "/trains", label: "運用一覧", icon: "train", key: "o" },
      { path: "/lines", label: "路線一覧", icon: "route", key: "l" },
      { path: "/diagram", label: "ダイヤグラム", icon: "chart", tag: "開発中", admin: true },
    ],
  },
  {
    label: "乗務",
    items: [
      { path: "/staff", label: "スタフ", icon: "staff", tag: "β", admin: true, end: true },
      { path: "/roster", label: "行路組み立て", icon: "users", tag: "β", admin: true },
    ],
  },
  {
    label: "データ",
    items: [
      { path: "/datasets", label: "ダイヤ管理", icon: "db", key: "d" },
      { path: "/upload", label: "OUD2アップロード", icon: "upload", key: "u" },
    ],
  },
  {
    label: "管理",
    admin: true,
    items: [
      { path: "/admin", label: "管理センター", icon: "shield", tag: "管理", admin: true },
      { path: "/dev/crew-route", label: "行路自動生成", icon: "flask", tag: "実験", admin: true },
      { path: "/dev/coupling-experiment", label: "増解結解析", icon: "flask", tag: "実験", admin: true },
    ],
  },
]

export function visibleNavGroups(isAdmin) {
  return NAV_GROUPS
    .filter(group => isAdmin || !group.admin)
    .map(group => ({
      ...group,
      items: group.items.filter(item => isAdmin || !item.admin),
    }))
    .filter(group => group.items.length > 0)
}

export function datasetLabel(dataset) {
  if (!dataset) {
    return "データセット未選択"
  }
  return dataset.name || dataset.fileName || dataset.railwayName || dataset.id
}
