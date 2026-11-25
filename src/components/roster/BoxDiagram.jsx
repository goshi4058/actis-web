import { formatDuration, formatTime, trainTypeColor } from "../../utils/rosterCalc.js"

// =========================================================
// 箱ダイヤ（乗務員1人分の動き）
//   横軸: 駅（路線の順）
//   縦軸: 手順（上から下へ進む。駅にいる時間は縦線、列車での移動は横線）
// 縦方向は正確な時間比例ではなく、読みやすさのため長さに上限・下限を付けている。
// 出勤・退勤は描かない（行路のリストと印刷の表に出る）。
// =========================================================

const COL_W = 112
const LEFT = 16
const HEAD_H = 34
const BOTTOM = 18
const PX_PER_MIN = 1.6
const MIN_STAY = 58
const MAX_STAY = 220

function stayHeight(minutes) {
  if (minutes === null || !Number.isFinite(minutes)) {
    return MIN_STAY
  }
  return Math.max(MIN_STAY, Math.min(MAX_STAY, minutes * PX_PER_MIN))
}

function buildLayout(rows, stationOrder) {
  const drawn = rows.filter(row =>
    row.item.type !== "report" &&
    row.item.type !== "finish" &&
    (row.kind !== "train" || (row.segment && row.start !== null && !row.segment.invalid))
  )

  const used = new Set()
  drawn.forEach(row => {
    if (row.from) used.add(row.from)
    if (row.to) used.add(row.to)
  })
  const order = stationOrder.filter(name => used.has(name))
  ;[...used].forEach(name => {
    if (!order.includes(name)) order.push(name)
  })
  const xOf = name => LEFT + Math.max(0, order.indexOf(name)) * COL_W + COL_W / 2

  const shapes = []
  let y = HEAD_H + 20
  let station = ""
  let time = null
  // 直前の列車が右から来たときは、時間の表示を左側に出す（列車番号の箱と重ならないように）
  let side = "right"

  const stay = (until, kind = "stay", label = "") => {
    if (!station) return
    const minutes = time !== null && until !== null ? until - time : null
    if (kind === "stay" && (minutes === null || minutes <= 0)) return
    const h = stayHeight(minutes)
    shapes.push({ type: "v", kind, x: xOf(station), y1: y, y2: y + h, minutes, label, side })
    y += h
    if (until !== null) time = until
  }

  const moveTo = name => {
    if (!name) return
    if (station && name !== station) {
      // 駅がつながっていない（自動チェックの警告と同じ場所）
      shapes.push({ type: "h", kind: "deadhead", y, x1: xOf(station), x2: xOf(name) })
      shapes.push({ type: "v", kind: "link", x: xOf(name), y1: y, y2: y + 24, minutes: null, label: "", side })
      y += 24
    }
    station = name
  }

  drawn.forEach(row => {
    const type = row.item.type

    if (row.kind === "train") {
      if (!station) {
        station = row.from
        time = row.start
      }
      moveTo(row.from)
      stay(row.start)
      shapes.push({
        type: "h",
        kind: "train",
        y,
        x1: xOf(row.from),
        x2: xOf(row.to),
        t1: row.start,
        t2: row.end,
        trainNo: row.train?.trainNo || row.item.trainNo || "",
        trainType: row.train?.typeShort || row.train?.type || "",
        color: trainTypeColor(row.train),
      })
      side = xOf(row.to) < xOf(row.from) ? "left" : "right"
      station = row.to
      time = row.end
      return
    }

    if (type === "break" || type === "wait") {
      if (!station) {
        station = row.from
        time = row.start
      }
      moveTo(row.from)
      stay(row.start)
      const end = row.end ?? row.start
      const label = type === "break" ? "休憩" : "待機"
      stay(row.start !== null && end > row.start ? end : null, type, label)
      return
    }

    // 乗務員交代などその他の項目は、その駅に移るだけ
    if (row.from) {
      moveTo(row.from)
      stay(row.start)
    }
  })

  const width = LEFT * 2 + Math.max(1, order.length) * COL_W
  const height = y + 46 + BOTTOM
  return { order, shapes, width, height, xOf }
}

function BoxDiagram({ analysis, stationOrder, compact = false }) {
  const hasTrain = analysis.rows.some(row => row.kind === "train" && row.segment && row.start !== null)

  if (!hasTrain) {
    return <div className="rs-box-empty">列車を入れると、ここに箱ダイヤが描かれます。</div>
  }

  const { order, shapes, width, height, xOf } = buildLayout(analysis.rows, stationOrder)

  return (
    <div className={`rs-box ${compact ? "compact" : ""}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={compact ? "100%" : width}
        height={compact ? undefined : height}
        role="img"
        aria-label="箱ダイヤ"
        preserveAspectRatio="xMidYMin meet"
      >
        {/* 駅の列 */}
        {order.map((name, i) => (
          <g key={name}>
            <rect x={LEFT + i * COL_W} y="0" width={COL_W} height={height} className={i % 2 ? "rs-box-band alt" : "rs-box-band"} />
            <line x1={xOf(name)} x2={xOf(name)} y1={HEAD_H} y2={height - BOTTOM} className="rs-box-guide" />
            <text x={xOf(name)} y={HEAD_H - 12} textAnchor="middle" className="rs-box-station">{name}</text>
          </g>
        ))}
        <line x1={LEFT} x2={width - LEFT} y1={HEAD_H} y2={HEAD_H} className="rs-box-axis" />

        {/* 駅にいる時間（縦線） */}
        {shapes.filter(s => s.type === "v").map((s, i) => (
          <g key={`v${i}`}>
            <line x1={s.x} x2={s.x} y1={s.y1} y2={s.y2} className={`rs-box-stay ${s.kind}`} />
            {s.kind !== "link" && (s.label || (s.minutes !== null && s.minutes > 0)) && (
              <text
                x={s.side === "left" ? s.x - 8 : s.x + 8}
                y={(s.y1 + s.y2) / 2 + 4}
                textAnchor={s.side === "left" ? "end" : "start"}
                className={`rs-box-dur ${s.kind}`}
              >
                {s.label ? `${s.label} ` : ""}{s.minutes !== null && s.minutes > 0 ? formatDuration(s.minutes) : ""}
              </text>
            )}
          </g>
        ))}

        {/* 列車での移動（横線） */}
        {shapes.filter(s => s.type === "h").map((s, i) => {
          if (s.kind !== "train") {
            return <line key={`h${i}`} x1={s.x1} x2={s.x2} y1={s.y} y2={s.y} className="rs-box-move deadhead" />
          }
          const right = s.x2 >= s.x1
          const mid = (s.x1 + s.x2) / 2
          const color = s.color || "#2b3640"
          return (
            <g key={`h${i}`}>
              <line x1={s.x1} x2={s.x2} y1={s.y} y2={s.y} className="rs-box-move train" style={{ stroke: color }} />
              <circle cx={s.x1} cy={s.y} r="3.2" className="rs-box-node" />
              <circle cx={s.x2} cy={s.y} r="3.2" className="rs-box-node" />
              {/* 発時刻は発駅側、着時刻は着駅側（どちらも線の上） */}
              <text x={s.x1 + (right ? 6 : -6)} y={s.y - 7} textAnchor={right ? "start" : "end"} className="rs-box-time">{formatTime(s.t1)}</text>
              <text x={s.x2 + (right ? -6 : 6)} y={s.y - 7} textAnchor={right ? "end" : "start"} className="rs-box-time">{formatTime(s.t2)}</text>
              {/* 列車番号（線の下） */}
              <g transform={`translate(${mid}, ${s.y + 7})`}>
                <rect x="-27" y="0" width="54" height="32" rx="5" className="rs-box-label-bg" style={{ stroke: color }} />
                <text y="14" textAnchor="middle" className="rs-box-no">{s.trainNo}</text>
                <text y="26" textAnchor="middle" className="rs-box-type" style={{ fill: color }}>{s.trainType}</text>
              </g>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default BoxDiagram
