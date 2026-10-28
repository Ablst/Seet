import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format } from "../format.mjs";
import { chartAvailability } from "../analysis.mjs";
export default function ChartView({ data, metric, type }) {
  const colors = [
    "var(--accent)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];
  const available = chartAvailability(data, metric.key, type);
  const rows = data.rows
    .slice(0, 200)
    .map((r, i) => ({ ...r, id: i, value: r[metric.key] }));
  const common = {
    data: rows,
    margin: { top: 15, right: 16, bottom: 8, left: 0 },
  };
  const axis = (
    <>
      <CartesianGrid
        vertical={false}
        stroke="var(--line)"
        strokeDasharray="3 5"
      />
      <XAxis
        dataKey="name"
        axisLine={false}
        tickLine={false}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        minTickGap={24}
        tickMargin={12}
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        width={48}
        tickFormatter={format}
      />
      <Tooltip
        cursor={{ fill: "var(--raised)" }}
        contentStyle={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          color: "var(--ink)",
        }}
        formatter={(v) => [`${format(v)} ${metric.unit}`, metric.key]}
      />
    </>
  );
  if (!available.ok)
    return (
      <p className="chart-note" role="status">
        {available.reason}
      </p>
    );
  const chartType = type;
  return (
    <>
      <div
        className="chart-box"
        role="img"
        aria-label={`${metric.key}${chartType === "line" ? "折线图" : chartType === "pie" ? "占比图" : "柱状图"}，完整数值见下方数据表`}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {chartType === "line" ? (
            <LineChart {...common}>
              {axis}
              <Line
                type="linear"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2.5}
                dot={
                  rows.length < 50
                    ? { r: 4, fill: "var(--surface)", strokeWidth: 2 }
                    : false
                }
                activeDot={{ r: 6 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          ) : chartType === "pie" ? (
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="57%"
                outerRadius="82%"
                paddingAngle={rows.length < 30 ? 2 : 0}
                isAnimationActive={false}
              >
                {rows.map((r, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [`${format(v)} ${metric.unit}`, metric.key]}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              />
            </PieChart>
          ) : (
            <BarChart {...common}>
              {axis}
              <Bar
                dataKey="value"
                fill="var(--accent)"
                maxBarSize={38}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {data.rows.length > 200 && (
        <p className="chart-note">
          图中仅展示前 200 类；统计使用全部数据。可让 AI 分组汇总以查看整体。
        </p>
      )}
      {chartType === "pie" && (
        <div className="pie-legend">
          {rows.map((r, i) => (
            <span key={i}>
              <i style={{ background: colors[i % colors.length] }} />
              {r.name} {format(r[metric.key])}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
