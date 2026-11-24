import { Fragment } from "react"
import { Link } from "react-router-dom"
import Icon from "./Icon.jsx"

// ページ上部の見出し（パンくず・タイトル・説明・操作ボタン）
function PageHead({ crumbs = [], title, description, actions }) {
  return (
    <div className="ax-page-head">
      <div>
        <div className="ax-crumbs">
          <Link to="/">ACTIS</Link>
          {crumbs.map(crumb => (
            <Fragment key={crumb}>
              <Icon name="chevRight" size={12} />
              <span>{crumb}</span>
            </Fragment>
          ))}
        </div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ax-actions">{actions}</div>}
    </div>
  )
}

export default PageHead
