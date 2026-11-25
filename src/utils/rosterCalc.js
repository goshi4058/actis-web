// =========================================================
// 乗務行路の計算（時刻・自動チェック・時間の集計・列車の割当状況）
//
// 行路データ（users/{uid}/datasets/{id}/crewRosters/{rosterId}）の形はこれまでどおり:
//   { name, crewType, items: [...], createdAt, updatedAt }
//   列車:   { type: "train", trainId, trainNo, startDutyStation, endDutyStation }
//   その他: { type: "report" | "finish" | "break" | "wait" | "change", station, time, endTime?, note? }
// endTime / note は v0.3.0 で追加した任意項目。
// =========================================================

// ダイヤの日付の切り替え（0:00〜3:59 は前日のダイヤとして 24:00〜27:59 扱い）
export const DAY_START_MINUTES = 4 * 60

export const DEFAULT_ROSTER_SETTINGS = {
  minConnection: 5, // 乗継ぎ・折返しに必要な最低時間（分）
  maxDutyHours: 0, // 拘束時間の上限（時間）。0 はチェックしない
}

export const EVENT_LABELS = {
  report: "出勤",
  finish: "退勤",
  break: "休憩",
  wait: "待機",
  change: "乗務員交代",
}

// 休憩・待機は終了時刻を持てる
export const EVENT_HAS_END = new Set(["break", "wait"])

// ---------------------------------------------------------
// 時刻
// ---------------------------------------------------------

// "5:20" "05:20:30" "520" "0520" "52030" などを分（小数可）に変換する
export function parseTime(value) {
  const text = String(value ?? "").trim()
  if (!text) {
    return null
  }

  let hour
  let minute
  let second = 0

  const colon = text.match(/^(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?$/)
  if (colon) {
    hour = Number(colon[1])
    minute = Number(colon[2])
    second = Number(colon[3] || 0)
  } else {
    const digits = text.replace(/[^0-9]/g, "")
    if (digits.length < 3 || digits.length > 6) {
      return null
    }
    const hm = digits.length <= 4 ? digits : digits.slice(0, -2)
    second = digits.length <= 4 ? 0 : Number(digits.slice(-2))
    hour = Number(hm.slice(0, -2) || 0)
    minute = Number(hm.slice(-2))
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59 || second > 59) {
    return null
  }

  let total = hour * 60 + minute + second / 60
  if (total < DAY_START_MINUTES) {
    total += 24 * 60
  }
  return total
}

// 分 → "H:MM"（24時以降もそのまま 25:10 のように表示）
export function formatTime(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return "—"
  }
  const whole = Math.floor(minutes + 1e-6)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

// 分 → "<input type=time>" 用の "HH:MM"（24時以降は 0時台に戻す）
export function toTimeInput(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return ""
  }
  const whole = Math.floor(minutes + 1e-6) % (24 * 60)
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`
}

// 分 → "8時間05分"
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return "—"
  }
  const whole = Math.max(0, Math.round(minutes))
  const h = Math.floor(whole / 60)
  const m = whole % 60
  return h > 0 ? `${h}時間${String(m).padStart(2, "0")}分` : `${m}分`
}

// ---------------------------------------------------------
// 列車
// ---------------------------------------------------------

function stationName(station) {
  return String(station?.name || station?.Ekimei || "").trim()
}

function isPassStation(station) {
  return station?.isPass === true || Number(station?.stopType) === 2
}

function arrivalOf(station) {
  return parseTime(station?.arrival) ?? parseTime(station?.single) ?? parseTime(station?.departure)
}

function departureOf(station) {
  return parseTime(station?.departure) ?? parseTime(station?.single) ?? parseTime(station?.arrival)
}

// 停車して時刻がある駅（乗務員交代に使える駅）
export function stopStations(train) {
  const list = Array.isArray(train?.stations) ? train.stations : []
  const result = []
  const seen = new Set()
  list.forEach((station, index) => {
    const name = stationName(station)
    if (!name || seen.has(name) || isPassStation(station)) {
      return
    }
    if (departureOf(station) === null) {
      return
    }
    seen.add(name)
    result.push({ name, index, arrival: arrivalOf(station), departure: departureOf(station) })
  })
  return result
}

export function trainOrigin(train) {
  return train?.origin || stopStations(train)[0]?.name || "—"
}

export function trainDestination(train) {
  const stops = stopStations(train)
  return train?.destination || train?.finalDest || stops[stops.length - 1]?.name || "—"
}

export function trainTypeColor(train) {
  const text = String(train?.trainTypeColor || "").trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : ""
}

// 行路に入れた列車のうち、実際に乗務する区間
export function trainSegment(train, item = {}) {
  const stops = stopStations(train)
  if (stops.length === 0) {
    return null
  }

  const startName = String(item?.startDutyStation || "").trim()
  const endName = String(item?.endDutyStation || "").trim()

  const fromStop = (startName && stops.find(stop => stop.name === startName)) || stops[0]
  const toStop = (endName && stops.find(stop => stop.name === endName)) || stops[stops.length - 1]

  let start = fromStop.departure
  let end = fromStop === toStop ? fromStop.departure : toStop.arrival ?? toStop.departure
  if (start !== null && end !== null && end < start) {
    end += 24 * 60
  }

  return {
    from: fromStop.name,
    to: toStop.name,
    fromIndex: fromStop.index,
    toIndex: toStop.index,
    start,
    end,
    // 区間の指定が逆向き・同じ駅などで乗務区間にならない
    invalid: toStop.index <= fromStop.index,
  }
}

// ---------------------------------------------------------
// 行路
// ---------------------------------------------------------

export function rosterItems(roster) {
  return Array.isArray(roster?.items) ? roster.items.filter(Boolean) : []
}

// 項目の開始時刻（並べ替えの基準）
function itemStart(item, trainsById) {
  if (item?.type === "train") {
    return trainSegment(trainsById.get(String(item.trainId)), item)?.start ?? null
  }
  return parseTime(item?.time)
}

// 時刻順に並べ替える。時刻がない項目は直前の項目の後ろに付いたまま動く。
// 同じ時刻のときは 出勤 → 列車・待機・休憩 → 退勤 の順。
function sortedEntries(items, trainsById) {
  const order = { report: 0, finish: 2 }
  let carry = -Infinity
  return items
    .map((item, index) => {
      const start = itemStart(item, trainsById)
      if (start !== null) {
        carry = start
      }
      return { item, index, key: start ?? carry, rank: order[item?.type] ?? 1, timed: start !== null }
    })
    .sort((a, b) => a.key - b.key || (a.timed && b.timed ? a.rank - b.rank : 0) || a.index - b.index)
}

export function sortRosterItems(items, trainsById) {
  return sortedEntries(items, trainsById).map(entry => entry.item)
}

// 行路1本の計算結果
//   rows:   画面・印刷用に並べた項目（区間・時刻・警告つき）
//   stats:  出勤・退勤・拘束・乗務・休憩・本数
//   issues: 行路全体の警告
export function analyzeRoster(roster, trainsById, settings = DEFAULT_ROSTER_SETTINGS) {
  const minConnection = Number(settings?.minConnection ?? DEFAULT_ROSTER_SETTINGS.minConnection) || 0
  const maxDutyHours = Number(settings?.maxDutyHours ?? 0) || 0

  // 保存されている順番に関係なく、いつも時刻順で並べる（index は保存データ上の位置）
  const rows = sortedEntries(rosterItems(roster), trainsById).map(({ item, index }) => {
    if (item.type === "train") {
      const train = trainsById.get(String(item.trainId)) || null
      const segment = train ? trainSegment(train, item) : null
      return {
        kind: "train",
        index,
        item,
        train,
        segment,
        start: segment?.start ?? null,
        end: segment?.end ?? null,
        from: segment?.from || "",
        to: segment?.to || "",
        issues: [],
      }
    }
    const start = parseTime(item.time)
    let end = EVENT_HAS_END.has(item.type) ? parseTime(item.endTime) : null
    if (start !== null && end !== null && end < start) {
      end += 24 * 60
    }
    return {
      kind: "event",
      index,
      item,
      start,
      end: end ?? start,
      from: String(item.station || ""),
      to: String(item.station || ""),
      issues: [],
    }
  })

  const issues = []
  const trainRows = rows.filter(row => row.kind === "train")
  const reports = rows.filter(row => row.item.type === "report")
  const finishes = rows.filter(row => row.item.type === "finish")

  // --- 列車ごとのチェック ---
  trainRows.forEach(row => {
    if (!row.train) {
      row.issues.push({ level: "error", text: `列車 ${row.item.trainNo || ""} がこのダイヤに見つかりません` })
    } else if (!row.segment || row.start === null) {
      row.issues.push({ level: "error", text: "この列車には時刻のある停車駅がありません" })
    } else if (row.segment.invalid) {
      row.issues.push({ level: "error", text: "乗務開始駅が乗務終了駅より後ろ（または同じ駅）になっています" })
    }
  })

  // --- 前後のつながり ---
  const timed = rows.filter(row => row.start !== null)
  for (let i = 1; i < timed.length; i += 1) {
    const prev = timed[i - 1]
    const curr = timed[i]
    const prevEnd = prev.end ?? prev.start

    if (prevEnd !== null && curr.start < prevEnd - 1e-6) {
      curr.issues.push({ level: "error", text: `前の項目（〜${formatTime(prevEnd)}）と時間が重なっています` })
    }
  }

  // 列車どうしの駅と乗継ぎ時間（間の休憩・待機などは場所だけ見る）
  for (let i = 1; i < trainRows.length; i += 1) {
    const prev = trainRows[i - 1]
    const curr = trainRows[i]
    if (!prev.segment || !curr.segment || prev.end === null || curr.start === null) {
      continue
    }
    if (prev.to && curr.from && prev.to !== curr.from) {
      curr.issues.push({ level: "warn", text: `前の列車は ${prev.to} 着、この列車は ${curr.from} 発で駅がつながっていません` })
      continue
    }
    const gap = curr.start - prev.end
    if (gap >= 0 && gap < minConnection - 1e-6) {
      curr.issues.push({ level: "warn", text: `${curr.from}での乗継ぎが${Math.round(gap)}分しかありません（目安 ${minConnection}分）` })
    }
  }

  // 休憩・待機の場所が前の列車の着駅と違う
  rows.forEach((row, i) => {
    if (row.kind !== "event" || !["break", "wait"].includes(row.item.type)) {
      return
    }
    const prevTrain = [...rows.slice(0, i)].reverse().find(r => r.kind === "train" && r.segment)
    if (prevTrain && row.from && prevTrain.to && prevTrain.to !== row.from) {
      row.issues.push({ level: "warn", text: `直前の列車は ${prevTrain.to} 着です` })
    }
    if (EVENT_HAS_END.has(row.item.type) && row.start !== null && !String(row.item.endTime || "").trim()) {
      row.issues.push({ level: "info", text: "終了時刻を入れると休憩時間に集計されます" })
    }
  })

  // --- 出勤・退勤 ---
  const firstTrainStart = trainRows.find(row => row.start !== null)?.start ?? null
  const lastTrainEnd = [...trainRows].reverse().find(row => row.end !== null)?.end ?? null

  if (trainRows.length > 0 && reports.length === 0) {
    issues.push({ level: "info", text: "出勤が入っていません（拘束時間は最初の列車から計算しています）" })
  }
  if (trainRows.length > 0 && finishes.length === 0) {
    issues.push({ level: "info", text: "退勤が入っていません（拘束時間は最後の列車まで計算しています）" })
  }
  if (reports.length > 1) {
    issues.push({ level: "warn", text: "出勤が2つ以上あります" })
  }
  if (finishes.length > 1) {
    issues.push({ level: "warn", text: "退勤が2つ以上あります" })
  }
  reports.forEach(row => {
    if (row.start !== null && firstTrainStart !== null && row.start > firstTrainStart) {
      row.issues.push({ level: "error", text: "最初の列車より後に出勤しています" })
    }
  })
  finishes.forEach(row => {
    if (row.start !== null && lastTrainEnd !== null && row.start < lastTrainEnd) {
      row.issues.push({ level: "error", text: "最後の列車より前に退勤しています" })
    }
  })

  // --- 集計 ---
  const reportTime = reports.find(row => row.start !== null)?.start ?? null
  const finishTime = finishes.find(row => row.start !== null)?.start ?? null
  const dutyStart = reportTime ?? firstTrainStart
  const dutyEnd = finishTime ?? lastTrainEnd

  const driving = trainRows.reduce((sum, row) => (
    row.start !== null && row.end !== null && !row.segment?.invalid ? sum + Math.max(0, row.end - row.start) : sum
  ), 0)

  const breakMinutes = rows.reduce((sum, row) => (
    row.item.type === "break" && row.start !== null && row.end !== null ? sum + Math.max(0, row.end - row.start) : sum
  ), 0)

  const duty = dutyStart !== null && dutyEnd !== null ? Math.max(0, dutyEnd - dutyStart) : null

  if (maxDutyHours > 0 && duty !== null && duty > maxDutyHours * 60) {
    issues.push({ level: "warn", text: `拘束時間が上限（${maxDutyHours}時間）を超えています` })
  }

  const stats = {
    report: reportTime,
    finish: finishTime,
    dutyStart,
    dutyEnd,
    dutyEstimated: reportTime === null || finishTime === null,
    duty,
    driving,
    breakMinutes,
    trainCount: trainRows.length,
    startStation: (reports[0]?.from) || trainRows[0]?.from || "",
    endStation: (finishes[0]?.from) || trainRows[trainRows.length - 1]?.to || "",
  }

  const allIssues = [...issues, ...rows.flatMap(row => row.issues)]
  const counts = {
    error: allIssues.filter(issue => issue.level === "error").length,
    warn: allIssues.filter(issue => issue.level === "warn").length,
    info: allIssues.filter(issue => issue.level === "info").length,
  }

  return { rows, stats, issues, counts }
}

// ---------------------------------------------------------
// 全行路での列車の割当状況
// ---------------------------------------------------------

// 列車ごとに、どの区間がどの行路に入っているか。
//   uncovered: どの行路にも入っていない区間 [{from, to}]
//   overlaps:  2つ以上の行路に入っている区間 [{from, to, rosters: [name]}]
export function analyzeCoverage(rosters, trains) {
  const byTrain = new Map()

  rosters.forEach(roster => {
    rosterItems(roster).forEach(item => {
      if (item.type !== "train") {
        return
      }
      const key = String(item.trainId)
      if (!byTrain.has(key)) {
        byTrain.set(key, [])
      }
      byTrain.get(key).push({ roster, item })
    })
  })

  return trains.map(train => {
    const stops = stopStations(train)
    const assignments = (byTrain.get(String(train.id)) || [])
      .map(({ roster, item }) => ({ roster, segment: trainSegment(train, item) }))
      .filter(entry => entry.segment && !entry.segment.invalid)

    // 停車駅の区間（i → i+1）ごとに担当行路を数える
    const legs = []
    for (let i = 0; i < stops.length - 1; i += 1) {
      const a = stops[i]
      const b = stops[i + 1]
      const owners = assignments.filter(entry => entry.segment.fromIndex <= a.index && entry.segment.toIndex >= b.index)
      legs.push({ from: a.name, to: b.name, owners })
    }

    const merge = predicate => {
      const result = []
      legs.forEach(leg => {
        if (!predicate(leg)) {
          return
        }
        const last = result[result.length - 1]
        const names = leg.owners.map(entry => entry.roster.name || "名称未設定")
        if (last && last.to === leg.from && last.key === names.join("/")) {
          last.to = leg.to
        } else {
          result.push({ from: leg.from, to: leg.to, rosters: names, key: names.join("/") })
        }
      })
      return result.map(({ key: _key, ...rest }) => rest)
    }

    const uncovered = merge(leg => leg.owners.length === 0)
    const overlaps = merge(leg => leg.owners.length > 1)
    const status = legs.length === 0
      ? "none"
      : uncovered.length === 0
        ? "full"
        : uncovered.length === 1 && uncovered[0].from === legs[0].from && uncovered[0].to === legs[legs.length - 1].to
          ? "none"
          : "partial"

    return {
      train,
      start: stops[0]?.departure ?? null,
      status,
      uncovered,
      overlaps,
      rosterNames: [...new Set(assignments.map(entry => entry.roster.name || "名称未設定"))],
    }
  })
}

// 最後の列車の着駅から乗り継げる列車の候補（手で組むときのおすすめ）
export function connectionCandidates(roster, trains, trainsById, settings = DEFAULT_ROSTER_SETTINGS, limit = 8) {
  const analysis = analyzeRoster(roster, trainsById, settings)
  const lastTrain = [...analysis.rows].reverse().find(row => row.kind === "train" && row.segment && row.end !== null)
  if (!lastTrain) {
    return []
  }
  const minConnection = Number(settings?.minConnection ?? DEFAULT_ROSTER_SETTINGS.minConnection) || 0
  const used = new Set(rosterItems(roster).filter(item => item.type === "train").map(item => String(item.trainId)))

  return trains
    .filter(train => !used.has(String(train.id)))
    .map(train => {
      const stops = stopStations(train)
      const stop = stops.find(s => s.name === lastTrain.to)
      if (!stop || stop === stops[stops.length - 1] || stop.departure === null) {
        return null
      }
      const gap = stop.departure - lastTrain.end
      if (gap < minConnection - 1e-6) {
        return null
      }
      return { train, station: stop.name, departure: stop.departure, gap, fromOrigin: stop === stops[0] }
    })
    .filter(Boolean)
    .sort((a, b) => a.departure - b.departure)
    .slice(0, limit)
}
