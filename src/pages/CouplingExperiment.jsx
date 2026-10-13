import { useMemo, useState } from "react"
import AdminGuard from "../components/AdminGuard"

const SAMPLE = `.\nRessya.\nHoukou=Nobori\nSyubetsu=0\nRessyabangou=8\nEkiJikoku=1;630$0,1;63230$1,1;63510$1,1;63740$1,1;63940$1,1;641/64130$2,1;64320$1,1;64540$1,1;64810/653$2,1;65530$1,1;65710$1,1;65850$1,1;65950$1,1;70140$1,1;70320/70350$2,1;70610$1,1;70810$1,1;70930/70950$1,1;71140$1,1;71330$1,1;71510$1,1;71650/71720$3,1;71950$1,1;72130$1,1;723$1,1;72430/$0\nOperation8A=1/0$651\nOperation8A.0B=3/64930$/30\nOperation25A=5/$0`

function formatOudTime(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "")
  if (!digits) return ""
  let hour
  let minute
  let second = 0

  if (digits.length >= 5) {
    hour = Number(digits.slice(0, -4))
    minute = Number(digits.slice(-4, -2))
    second = Number(digits.slice(-2))
  } else {
    hour = Number(digits.slice(0, -2))
    minute = Number(digits.slice(-2))
  }

  if (!Number.isFinite(hour) || minute > 59 || second > 59) return String(value)
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}${second ? `:${String(second).padStart(2, "0")}` : ""}`
}

function parseOperationLine(line) {
  const match = line.trim().match(/^Operation(\d+[AB])(?:\.(\d+[AB]))?=(.*)$/)
  if (!match) return null

  const [, parentKey, childKey = "", raw] = match
  const type = raw.match(/^(\d+)\//)?.[1]
  if (!type) return null

  const body = raw.slice(raw.indexOf("/") + 1)
  const [beforeDollar, afterDollar = ""] = body.split("$")
  const suffix = afterDollar.split("/")
  const event = {
    key: match[0].slice(0, match[0].indexOf("=")),
    parentKey,
    childKey,
    type: Number(type),
    time: "",
    operationNumber: "",
    position: "",
    remark: "",
    raw: line.trim()
  }

  if (event.type === 1) {
    const time = afterDollar.split("/")[0]
    event.time = formatOudTime(time)
    event.position = beforeDollar === "0" ? "後方" : "前方"
    event.remark = `${event.position}増結`
  } else if (event.type === 2) {
    event.time = formatOudTime(afterDollar.split("/")[0])
    event.remark = "解結"
  } else if (event.type === 3) {
    event.time = formatOudTime(beforeDollar)
    event.operationNumber = suffix[suffix.length - 1] || ""
    event.remark = event.operationNumber
      ? `${event.operationNumber}番運用 出区`
      : "出区"
  } else if (event.type === 4) {
    event.time = formatOudTime(beforeDollar)
    event.operationNumber = suffix[suffix.length - 1] || ""
    event.remark = event.operationNumber
      ? `${event.operationNumber}番運用 入区`
      : "入区"
  } else {
    return null
  }

  return event
}

function parseExperiment(text) {
  const lines = String(text || "").split(/\r?\n/)
  const trainNo = lines.find(line => /^Ressyabangou=/.test(line))?.split("=")[1]?.trim() || ""
  const operations = lines.map(parseOperationLine).filter(Boolean)
  const notes = operations
    .filter(item => item.time && item.remark)
    .map(item => ({
      ...item,
      displayText: `${item.time} ${item.remark}`
    }))
    .sort((a, b) => a.time.localeCompare(b.time))

  return { trainNo, operations, notes }
}

function CouplingExperimentPage() {
  const [source, setSource] = useState(SAMPLE)
  const result = useMemo(() => parseExperiment(source), [source])

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 20, color: "var(--text-primary, #17202a)" }}>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#16735d" }}>DEVELOPER EXPERIMENT</p>
          <h1 style={{ margin: 0 }}>OUD2 増解結解析</h1>
          <p style={{ margin: "8px 0 0", color: "var(--text-secondary, #65737d)" }}>OUD2のOperation記述を読み取り、スタフ備考用の作業メモを試験生成します。既存のスタフ表示・データは変更しません。</p>
        </div>
        <span style={{ border: "1px solid #b7d9ce", borderRadius: 999, padding: "6px 10px", color: "#176d59", fontWeight: 700, fontSize: 12 }}>開発者専用</span>
      </header>

      <section style={{ border: "1px solid #d5dde2", borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>OUD2データ</h2>
          <button type="button" onClick={() => setSource(SAMPLE)} style={{ padding: "7px 10px", cursor: "pointer" }}>サンプルに戻す</button>
        </div>
        <textarea aria-label="OUD2データ" value={source} onChange={event => setSource(event.target.value)} spellCheck={false} style={{ boxSizing: "border-box", width: "100%", minHeight: 260, resize: "vertical", fontFamily: "Consolas, monospace", fontSize: 13, lineHeight: 1.5, padding: 12, border: "1px solid #cbd5dc", borderRadius: 7 }} />
        <p style={{ fontSize: 12, color: "var(--text-secondary, #65737d)", marginBottom: 0 }}>現在の実験版はOperationの出区・入区・増結・解結記述を対象とします。運用データ全体との自動照合は次段階です。</p>
      </section>

      <section style={{ border: "1px solid #d5dde2", borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>解析結果</h2>
        <p style={{ marginTop: 0 }}>列車番号：<strong>{result.trainNo || "未検出"}</strong></p>
        {result.operations.length === 0 ? <p>対応するOperation記述が見つかりません。</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["キー", "作業時刻", "作業", "元データ"].map(label => <th key={label} style={{ textAlign: "left", padding: 9, borderBottom: "2px solid #cbd5dc", background: "#f3f6f7" }}>{label}</th>)}</tr></thead>
              <tbody>{result.operations.map((item, index) => <tr key={item.key + index}>
                <td style={{ padding: 9, borderBottom: "1px solid #e1e7eb", fontFamily: "Consolas, monospace", whiteSpace: "nowrap" }}>{item.key}</td>
                <td style={{ padding: 9, borderBottom: "1px solid #e1e7eb", whiteSpace: "nowrap" }}>{item.time || "—"}</td>
                <td style={{ padding: 9, borderBottom: "1px solid #e1e7eb", fontWeight: 700 }}>{item.remark || "未対応の作業種別"}</td>
                <td style={{ padding: 9, borderBottom: "1px solid #e1e7eb", fontFamily: "Consolas, monospace", overflowWrap: "anywhere" }}>{item.raw}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #d5dde2", borderRadius: 10, padding: 16 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>スタフ備考の生成プレビュー</h2>
        <p style={{ marginTop: 0, color: "var(--text-secondary, #65737d)", fontSize: 13 }}>作業時刻順に並べています。現段階では解析確認用で、実際のスタフには書き込みません。</p>
        {result.notes.length ? <ul style={{ marginBottom: 0, paddingLeft: 22 }}>{result.notes.map((item, index) => <li key={item.key + index} style={{ margin: "7px 0" }}>{item.displayText}</li>)}</ul> : <p>備考にできる作業はありません。</p>}
      </section>
    </main>
  )
}

export default function CouplingExperiment() {
  return <AdminGuard><CouplingExperimentPage /></AdminGuard>
}
