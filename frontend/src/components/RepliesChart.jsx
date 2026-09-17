import { useLayoutEffect, useRef, useState } from "react";

// Categorical slot 1 (blue), validated against light and dark surfaces
const SERIES_COLOR = { light: "#2a78d6", dark: "#3987e5" };
const PLOT_HEIGHT = 180;
const AXIS_BAND = 28;
const Y_AXIS_WIDTH = 36;
const TOP_PAD = 20;
const MAX_BAR_WIDTH = 24;
const TOOLBAR_HEIGHT = 32; // the "Show table" row above the plot
const TOOLTIP_HEIGHT = 48;

const niceMax = (value) => {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  // Whole-number steps only: replies are counts
  const step = [0.5, 1, 2, 5, 10].find((m) => m * magnitude * 4 >= value) * magnitude;
  return step * 4;
};

const formatDay = (date, options) =>
  new Date(`${date}T12:00:00`).toLocaleDateString([], options);

// Column path with a 4px rounded top and a square baseline
const barPath = (x, y, width, height) => {
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
};

const RepliesChart = ({ data }) => {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(600);
  const [isDark, setIsDark] = useState(false);
  const [active, setActive] = useState(null);
  const [showTable, setShowTable] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // DaisyUI themes declare color-scheme, so the chart follows whichever theme is active
    setIsDark(getComputedStyle(el).colorScheme === "dark");
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxValue = Math.max(...data.map((d) => d.replies), 0);
  const yMax = niceMax(maxValue);
  const ticks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];
  const plotWidth = Math.max(width - Y_AXIS_WIDTH, 100);
  const band = plotWidth / data.length;
  const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, band * 0.6));
  const scaleY = (v) => TOP_PAD + PLOT_HEIGHT - (v / yMax) * PLOT_HEIGHT;
  const labelEvery = Math.ceil(data.length / 6);
  const peakIndex = maxValue > 0 ? data.findIndex((d) => d.replies === maxValue) : -1;
  const color = SERIES_COLOR[isDark ? "dark" : "light"];

  return (
    <figure ref={containerRef} className="relative">
      <div className="flex items-center justify-end h-8">
        <button className="btn btn-ghost btn-xs" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto max-h-72">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Agent replies</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{formatDay(d.date, { weekday: "short", month: "short", day: "numeric" })}</td>
                  <td className="text-right tabular-nums">{d.replies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          width={width}
          height={TOP_PAD + PLOT_HEIGHT + AXIS_BAND}
          role="img"
          aria-label={`Agent replies per day, peak ${maxValue}`}
          className="block text-base-content"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={Y_AXIS_WIDTH}
                x2={width}
                y1={scaleY(tick)}
                y2={scaleY(tick)}
                stroke="currentColor"
                strokeOpacity={tick === 0 ? 0.25 : 0.1}
                strokeWidth={1}
              />
              <text
                x={Y_AXIS_WIDTH - 8}
                y={scaleY(tick)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="currentColor"
                fillOpacity={0.6}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const x = Y_AXIS_WIDTH + i * band + (band - barWidth) / 2;
            const y = scaleY(d.replies);
            const height = TOP_PAD + PLOT_HEIGHT - y;
            return (
              <g key={d.date}>
                {height > 0 && (
                  <path d={barPath(x, y, barWidth, height)} fill={color} fillOpacity={active === i ? 0.75 : 1} />
                )}
                {i === peakIndex && (
                  <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.8}>
                    {d.replies}
                  </text>
                )}
                {(i % labelEvery === 0 || i === data.length - 1) && (
                  // Edge labels anchor inward so they're never clipped by the SVG bounds
                  <text
                    x={i === 0 ? Y_AXIS_WIDTH : i === data.length - 1 ? width : Y_AXIS_WIDTH + i * band + band / 2}
                    y={TOP_PAD + PLOT_HEIGHT + 18}
                    textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                    fontSize={11}
                    fill="currentColor"
                    fillOpacity={0.6}
                  >
                    {formatDay(d.date, { month: "short", day: "numeric" })}
                  </text>
                )}
                {/* The whole column band is the hover/focus target, not just the painted bar */}
                <rect
                  x={Y_AXIS_WIDTH + i * band}
                  y={TOP_PAD}
                  width={band}
                  height={PLOT_HEIGHT}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${formatDay(d.date, { month: "short", day: "numeric" })}: ${d.replies} replies`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
      )}

      {!showTable && active !== null && (
        <div
          className="absolute pointer-events-none bg-base-100 border border-base-300 shadow-lg rounded-lg px-3 py-2 text-xs"
          style={{
            left: Math.min(Math.max(Y_AXIS_WIDTH + active * band + band / 2 - 60, 0), width - 120),
            top: Math.max(TOOLBAR_HEIGHT + scaleY(data[active].replies) - TOOLTIP_HEIGHT - 8, 0),
          }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: color }} />
            <span className="font-semibold text-sm">{data[active].replies}</span>
          </div>
          <div className="text-base-content/60">
            {formatDay(data[active].date, { weekday: "short", month: "short", day: "numeric" })}
          </div>
        </div>
      )}
    </figure>
  );
};

export default RepliesChart;
