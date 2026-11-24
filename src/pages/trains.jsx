import "./Staff.css"

import {
  Fragment,
  useEffect,
  useMemo,
  useState
} from "react"

import {
  ref,
  get
} from "firebase/database"

import {
  Link,
  useSearchParams
} from "react-router-dom"

import {
  auth,
  database
} from "../firebase/config"

import {
  useDataset
} from "../context/DatasetContext"

import Icon from "../components/shell/Icon.jsx"
import PageHead from "../components/shell/PageHead.jsx"


function getDirectionLabel(
  direction
) {

  if (
    direction === "Kudari"
  ) {

    return "下り"

  }


  if (
    direction === "Nobori"
  ) {

    return "上り"

  }


  return "—"

}


function getFirstStation(
  train
) {

  if (
    !Array.isArray(
      train?.stations
    )
  ) {

    return null

  }


  return (
    train.stations[0] ||
    null
  )

}


function getLastStation(
  train
) {

  if (
    !Array.isArray(
      train?.stations
    )
  ) {

    return null

  }


  return (
    train.stations[
      train.stations.length - 1
    ] ||
    null
  )

}


function getTimeValue(
  station
) {

  if (!station) {
    return ""
  }


  return (
    station.departure ||
    station.dep ||
    station.arrival ||
    station.arr ||
    station.single ||
    ""
  )

}


function formatTime(
  value
) {

  if (!value) {
    return "—"
  }


  const text =
    String(value).trim()


  if (!text) {
    return "—"
  }


  if (
    text.length <= 4
  ) {

    const hour =
      text.slice(
        0,
        -2
      ) || "0"

    const minute =
      text.slice(-2)


    return `${hour}:${minute}`

  }


  const hour =
    text.slice(
      0,
      -4
    ) || "0"


  const minute =
    text.slice(
      -4,
      -2
    )


  return `${hour}:${minute}`

}


function getStartTime(
  train
) {

  return formatTime(
    getTimeValue(
      getFirstStation(
        train
      )
    )
  )

}


function getEndTime(
  train
) {

  return formatTime(
    getTimeValue(
      getLastStation(
        train
      )
    )
  )

}


function getOrigin(
  train
) {

  return (
    train.origin ||
    getFirstStation(
      train
    )?.name ||
    "—"
  )

}


function getDestination(
  train
) {

  return (
    train.destination ||
    train.finalDest ||
    getLastStation(
      train
    )?.name ||
    "—"
  )

}


function getOperationLabel(
  train
) {

  if (!train) {
    return "運用未設定"
  }


  const directValues = [

    train.unyo,

    train.operation,

    train.operationNo,

    train.operationNumber,

    train.unyoNo

  ]


  for (
    const value of directValues
  ) {

    if (
      value === undefined ||
      value === null
    ) {

      continue

    }


    const text =
      String(value).trim()


    if (
      text &&
      text !== "null" &&
      text !== "undefined"
    ) {

      return text

    }

  }


  /*
   * operationLines
   */

  if (
    Array.isArray(
      train.operationLines
    )
  ) {

    for (
      const line of train.operationLines
    ) {

      if (!line) {
        continue
      }


      const lineValues = [

        line.unyo,

        line.operation,

        line.operationNo,

        line.operationNumber,

        line.value

      ]


      for (
        const value of lineValues
      ) {

        if (
          value === undefined ||
          value === null
        ) {

          continue

        }


        const text =
          String(value).trim()


        if (!text) {
          continue
        }


        /*
         * valueがそのまま運用番号の場合
         */

        if (
          !text.includes("/") &&
          !text.includes("$")
        ) {

          return text

        }


        /*
         * $/101
         * $/A01
         * など
         */

        const match =
          text.match(
            /\$\/([^,\s]+)/
          )


        if (
          match &&
          match[1]
        ) {

          const operationName =
            match[1].trim()


          if (
            operationName
          ) {

            return operationName

          }

        }


        /*
         * notes側にも運用番号が
         * 入っている場合
         */

        if (
          Array.isArray(
            line.notes
          )
        ) {

          for (
            const note of line.notes
          ) {

            if (!note) {
              continue
            }

            const noteValues = [

              note.unyo,

              note.operation,

              note.operationNo,

              note.operationNumber

            ]


            for (
              const noteValue
              of noteValues
            ) {

              if (
                noteValue === undefined ||
                noteValue === null
              ) {

                continue

              }


              const noteText =
                String(
                  noteValue
                ).trim()


              if (
                noteText
              ) {

                return noteText

              }

            }

          }

        }

      }

    }

  }


  /*
   * operationsオブジェクト
   */

  if (
    train.operations &&
    typeof train.operations ===
      "object"
  ) {

    const operationValues =
      Object.values(
        train.operations
      )


    for (
      const value of operationValues
    ) {

      if (
        value === undefined ||
        value === null
      ) {

        continue

      }


      const text =
        String(value).trim()


      if (!text) {
        continue
      }


      const match =
        text.match(
          /\$\/([^,\s]+)/
        )


      if (
        match &&
        match[1]
      ) {

        const operationName =
          match[1].trim()


        if (
          operationName
        ) {

          return operationName

        }

      }

    }

  }


  /*
   * operationRemarksに運用番号が
   * 保存されている場合
   */

  if (
    Array.isArray(
      train.operationRemarks
    )
  ) {

    for (
      const remark of train.operationRemarks
    ) {

      if (!remark) {
        continue
      }


      if (
        typeof remark === "string"
      ) {

        const match =
          remark.match(
            /\$\/([^,\s]+)/
          )


        if (
          match &&
          match[1]
        ) {

          return match[1].trim()

        }


        continue

      }


      const values = [

        remark.unyo,

        remark.operation,

        remark.operationNo,

        remark.operationNumber

      ]


      for (
        const value of values
      ) {

        if (
          value === undefined ||
          value === null
        ) {

          continue

        }


        const text =
          String(value).trim()


        if (
          text
        ) {

          return text

        }

      }

    }

  }


  return "運用未設定"

}

function sortOperationTrains(
  a,
  b
) {

  const sequenceA =
    Number(
      a.operationSequence
    )


  const sequenceB =
    Number(
      b.operationSequence
    )


  const validA =
    Number.isFinite(
      sequenceA
    )


  const validB =
    Number.isFinite(
      sequenceB
    )


  if (
    validA &&
    validB
  ) {

    return (
      sequenceA -
      sequenceB
    )

  }


  if (validA) {
    return -1
  }


  if (validB) {
    return 1
  }


  return String(
    a.trainNo || ""
  ).localeCompare(
    String(
      b.trainNo || ""
    ),
    undefined,
    {
      numeric: true
    }
  )

}


const DAY_START = 4 * 60
const DAY_END = 26 * 60

function timeToMinutes(value) {
  const text = String(value ?? "").trim()
  if (!text) {
    return null
  }
  if (text.includes(":")) {
    const [h, m] = text.split(":").map(Number)
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
  }
  if (!/^\d{3,6}$/.test(text)) {
    return null
  }
  const hm = text.length <= 4 ? text : text.slice(0, -2)
  const hour = Number(hm.slice(0, -2) || 0)
  const minute = Number(hm.slice(-2))
  return hour * 60 + minute
}

function timedStations(train) {
  return (Array.isArray(train?.stations) ? train.stations : []).filter(station => getTimeValue(station))
}

function getTrainSpan(train) {
  const stations = timedStations(train)
  let start = timeToMinutes(getTimeValue(stations[0]))
  let end = timeToMinutes(getTimeValue(stations[stations.length - 1]))
  if (start === null) {
    return null
  }
  if (start < 3 * 60) {
    start += 24 * 60
  }
  if (end === null) {
    end = start
  }
  while (end < start) {
    end += 24 * 60
  }
  return { start, end }
}

function validColor(value) {
  const text = String(value || "").trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : ""
}

function TypeBadge({ train }) {
  const color = validColor(train.trainTypeColor)
  return (
    <span className="ax-type" style={color ? { background: color } : undefined}>
      {train.typeShort || train.type || "—"}
    </span>
  )
}

function OperationChain({ trains }) {
  return (
    <div className="ax-chain">
      <div className="ax-chain-track">
        {trains.map((train, index) => {
          const previous = trains[index - 1]
          const prevSpan = previous ? getTrainSpan(previous) : null
          const span = getTrainSpan(train)
          const gap = prevSpan && span ? span.start - prevSpan.end : null

          return (
            <Fragment key={train.id}>
              {index > 0 && (
                <div className="ax-link">
                  {gap !== null && gap >= 0 ? `${gap}分` : "—"}
                  <span>{previous && getDestination(previous) === getOrigin(train) ? "折返" : "接続"}</span>
                </div>
              )}
              <Link className="ax-leg" to={`/staff/${train.id}`}>
                <div className="ax-leg-1">
                  <b>{train.trainNo || "—"}</b>
                  <TypeBadge train={train} />
                  <span className="ax-pill" style={{ height: 18, fontSize: 10.5 }}>
                    {getDirectionLabel(train.direction)}
                  </span>
                </div>
                <div className="ax-leg-2">{getOrigin(train)} → {getDestination(train)}</div>
                <div className="ax-leg-3">{getStartTime(train)} – {getEndTime(train)}</div>
                <div className="ax-leg-4">スタフを開く →</div>
              </Link>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function OperationRow({ operation, trains, open, onToggle }) {
  const sortedTrains = useMemo(() => [...trains].sort(sortOperationTrains), [trains])
  const firstTrain = sortedTrains[0]
  const lastTrain = sortedTrains[sortedTrains.length - 1]
  const range = DAY_END - DAY_START

  return (
    <>
      <tr className={`row ${open ? "open" : ""}`} onClick={onToggle}>
        <td><Icon name="chevRight" size={16} className="ax-chev" /></td>
        <td><b className="ax-num">{operation}</b></td>
        <td className="ax-num">{sortedTrains.length}本</td>
        <td>
          <span className="ax-num">{firstTrain ? getStartTime(firstTrain) : "—"}</span>{" "}
          <span className="sub">{firstTrain ? getOrigin(firstTrain) : ""}</span>
        </td>
        <td className="hide-sm">
          <span className="ax-num">{lastTrain ? getEndTime(lastTrain) : "—"}</span>{" "}
          <span className="sub">{lastTrain ? getDestination(lastTrain) : ""}</span>
        </td>
        <td className="hide-sm">
          <div className="ax-bar">
            {sortedTrains.map(train => {
              const span = getTrainSpan(train)
              if (!span) {
                return null
              }
              const left = Math.max(0, (span.start - DAY_START) / range * 100)
              const width = Math.max(0.6, (span.end - span.start) / range * 100)
              return (
                <span
                  key={train.id}
                  title={`${train.trainNo || ""} ${getStartTime(train)}–${getEndTime(train)}`}
                  style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, background: validColor(train.trainTypeColor) || "#4b5563" }}
                />
              )
            })}
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ padding: 0, whiteSpace: "normal" }}>
            <OperationChain trains={sortedTrains} />
          </td>
        </tr>
      )}
    </>
  )
}

function Trains() {

  const {
    selectedDatasetId
  } = useDataset()

  const [trains, setTrains] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState("")


  useEffect(() => {

    let cancelled = false


    const loadTrains =
      async () => {

        try {

          setLoading(true)
          setError("")


          const user =
            auth.currentUser


          if (!user) {

            setError(
              "Discordでログインしてください。"
            )

            return

          }


          const snapshot =
            await get(

              ref(
                database,
                `users/${user.uid}/trains`
              )

            )


          if (
            cancelled
          ) {

            return

          }


          if (
            !snapshot.exists()
          ) {

            setTrains([])

            return

          }


          const data =
            snapshot.val()


          const list =
            Object.entries(
              data
            )
              .filter(
                ([, train]) =>
                  !selectedDatasetId ||
                  train?.datasetId === selectedDatasetId
              )
              .map(
              (
                [id, train]
              ) => ({

                id,

                ...train

              })
            )


          setTrains(
            list
          )

        }

        catch (err) {

          console.error(
            "Trains load error:",
            err
          )


          if (
            !cancelled
          ) {

            setError(
              "列車データを取得できませんでした。"
            )

          }

        }

        finally {

          if (
            !cancelled
          ) {

            setLoading(false)

          }

        }

      }


    loadTrains()


    return () => {

      cancelled = true

    }

  }, [selectedDatasetId])


  const operationGroups =
    useMemo(
      () => {

        const groups = {}


        for (
          const train
          of trains
        ) {

          const operation =
            getOperationLabel(
              train
            )


          if (
            !groups[
              operation
            ]
          ) {

            groups[
              operation
            ] = []

          }


          groups[
            operation
          ].push(
            train
          )

        }


        return groups

      },
      [trains]
    )


  const operationNames =
    useMemo(
      () => {

        return Object.keys(
          operationGroups
        ).sort(
          (
            a,
            b
          ) => {

            if (
              a ===
              "運用未設定"
            ) {

              return 1

            }


            if (
              b ===
              "運用未設定"
            ) {

              return -1

            }


            return a.localeCompare(
              b,
              undefined,
              {
                numeric: true
              }
            )

          }
        )

      },
      [operationGroups]
    )


  const configuredCount =
    useMemo(
      () =>
        operationNames.filter(
          operation =>
            operation !==
            "運用未設定"
        ).length,
      [operationNames]
    )


  const unconfiguredCount =
    operationGroups[
      "運用未設定"
    ]?.length || 0


  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get("q") ?? searchParams.get("op") ?? ""
  const [openOperation, setOpenOperation] = useState(() => searchParams.get("op") || null)

  const setQuery = value => {
    const next = new URLSearchParams(searchParams)
    next.delete("op")
    if (value) {
      next.set("q", value)
    } else {
      next.delete("q")
    }
    setSearchParams(next, { replace: true })
  }

  const filteredNames = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return operationNames
    }
    return operationNames.filter(operation =>
      operation.toLowerCase().includes(q) ||
      operationGroups[operation].some(train =>
        String(train.trainNo || "").toLowerCase().includes(q) ||
        String(getDestination(train)).toLowerCase().includes(q)
      )
    )
  }, [query, operationNames, operationGroups])

  const head = (
    <PageHead
      crumbs={["閲覧"]}
      title="運用一覧"
      description="運用ごとの列車のつながりを一覧します。行をクリックで展開、/ キーで検索。"
      actions={
        <button type="button" className="ax-btn" onClick={() => window.print()}>
          <Icon name="staff" size={16} />印刷
        </button>
      }
    />
  )

  if (loading || error) {
    return (
      <div className="trains-page">
        {head}
        <div className="ax-card ax-empty">{loading ? "読み込み中…" : error}</div>
      </div>
    )
  }

  return (
    <div className="trains-page">
      {head}

      <div className="ax-card" style={{ overflow: "hidden" }}>
        <div className="ax-toolbar">
          <label className="ax-field">
            <Icon name="search" size={15} />
            <input
              data-page-search
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="運用名・列車番号・行先で絞り込み"
            />
          </label>
          <span className="count ax-num">
            表示 {filteredNames.length} 件 · 運用 {configuredCount} · 列車 {trains.length}
            {unconfiguredCount > 0 && ` · 運用未設定 ${unconfiguredCount}`}
          </span>
        </div>

        {filteredNames.length === 0 ? (
          <div className="ax-empty">
            {operationNames.length === 0 ? "列車データがありません。OUD2をアップロードしてください。" : "該当する運用がありません"}
          </div>
        ) : (
          <table className="ax-table">
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col className="hide-sm" />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th>運用</th>
                <th>列車</th>
                <th>開始</th>
                <th className="hide-sm">終了</th>
                <th className="hide-sm">稼働（4:00 – 26:00）</th>
              </tr>
            </thead>
            <tbody>
              {filteredNames.map(operation => (
                <OperationRow
                  key={operation}
                  operation={operation}
                  trains={operationGroups[operation]}
                  open={openOperation === operation}
                  onToggle={() => setOpenOperation(value => (value === operation ? null : operation))}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Trains