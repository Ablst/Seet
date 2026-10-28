import { useEffect, useState } from "react";
import { format } from "../format.mjs";
export default function DataTable({
  dataset,
  onChange,
  editing = false,
  limit,
}) {
  const [page, setPage] = useState(0),
    size = 50,
    pages = Math.max(1, Math.ceil(dataset.rows.length / size));
  useEffect(() => setPage(0), [dataset.title, dataset.rows.length]);
  const current = Math.min(page, pages - 1),
    start = limit ? 0 : current * size,
    rows = dataset.rows.slice(start, limit || start + size),
    dims = dataset.dimensions || [];
  function update(index, key, value) {
    const next = { ...dataset, rows: [...dataset.rows] };
    next.rows[index] = {
      ...next.rows[index],
      [key]:
        key === "name" || dims.some((d) => d.key === key)
          ? value
          : value.trim() === ""
            ? null
            : Number(value),
    };
    if (
      key !== "name" &&
      !dims.some((d) => d.key === key) &&
      next.rows[index][key] !== null &&
      (!Number.isFinite(next.rows[index][key]) ||
        Math.abs(next.rows[index][key]) > 1e15)
    )
      return;
    onChange(next);
  }
  const fields = dims.length ? dims : [{ key: "name", label: "分类" }];
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {fields.map((d) => (
                <th key={d.key}>{d.label || d.key}</th>
              ))}
              {dataset.metrics.map((m) => (
                <th className="num" key={m.key}>
                  {m.key}
                  {m.unit && <span className="table-unit"> / {m.unit}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={start + i}>
                {fields.map((d) => (
                  <td key={d.key}>
                    {editing ? (
                      <input
                        aria-label={`第${start + i + 1}行${d.label || d.key}`}
                        value={r[d.key] ?? ""}
                        maxLength={200}
                        onChange={(e) =>
                          update(start + i, d.key, e.target.value)
                        }
                      />
                    ) : (
                      (r[d.key] ?? "—")
                    )}
                  </td>
                ))}
                {dataset.metrics.map((m) => (
                  <td className="num" key={m.key}>
                    {editing ? (
                      <input
                        type="number"
                        step="any"
                        aria-label={`第${start + i + 1}行${m.key}`}
                        value={r[m.key] ?? ""}
                        onChange={(e) =>
                          update(start + i, m.key, e.target.value)
                        }
                      />
                    ) : (
                      format(r[m.key])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!limit && pages > 1 && (
        <nav className="table-pagination" aria-label="数据表分页">
          <span>
            共 {dataset.rows.length} 行，当前 {start + 1}–
            {Math.min(start + size, dataset.rows.length)} 行
          </span>
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            上一页
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button
            disabled={current + 1 === pages}
            onClick={() => setPage(current + 1)}
          >
            下一页
          </button>
        </nav>
      )}
    </>
  );
}
