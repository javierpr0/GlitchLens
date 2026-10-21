"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle className="text-sm font-medium">Events over time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] w-full animate-pulse rounded-md bg-muted/30" />
      </CardContent>
    </Card>
  );
}

// Recharts (+ d3) is heavy; defer it so it doesn't block the rest of the dashboard.
export const EventsChart = dynamic(
  () => import("./events-chart").then((m) => m.EventsChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
