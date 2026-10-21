"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type StatsGroup = {
  by?: Record<string, string | number>;
  totals?: Record<string, number>;
  series: Record<string, Array<number | null>>;
};

export function EventsChart({
  intervals,
  groups,
}: {
  intervals: string[];
  groups: StatsGroup[];
}) {
  const summed = intervals.map((_, i) =>
    groups.reduce((acc, g) => {
      const series = g?.series ?? {};
      const seriesKey = Object.keys(series)[0];
      const arr = (seriesKey ? series[seriesKey] : []) ?? [];
      return acc + (Number(arr[i]) || 0);
    }, 0),
  );

  const data = intervals.map((iso, i) => ({
    t: iso,
    value: summed[i] ?? 0,
  }));

  const total = summed.reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle className="text-sm font-medium">Events over time</CardTitle>
        <div className="text-xs text-muted-foreground">
          {total.toLocaleString()} events · last 14 days
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] w-full">
          {total === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              No events in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eventsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.18 305)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.7 0.18 305)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="t"
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => safeFormat(v, "MMM d")}
                  minTickGap={40}
                />
                <YAxis
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  cursor={{ stroke: "currentColor", strokeOpacity: 0.15 }}
                  contentStyle={{
                    background: "oklch(0.205 0 0)",
                    border: "1px solid oklch(1 0 0 / 0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => safeFormat(String(v), "PPp")}
                  formatter={(v) => [`${Number(v).toLocaleString()} events`, ""]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="oklch(0.7 0.18 305)"
                  strokeWidth={2}
                  fill="url(#eventsGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function safeFormat(iso: string, fmt: string): string {
  try {
    return format(new Date(iso), fmt);
  } catch {
    return iso;
  }
}
