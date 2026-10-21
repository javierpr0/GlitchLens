import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SNIPPETS: Record<string, (dsn: string) => string> = {
  javascript: (dsn) => `import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "${dsn}",
  tracesSampleRate: 0.1,
});`,
  node: (dsn) => `import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "${dsn}",
  tracesSampleRate: 0.1,
});`,
  python: (dsn) => `import sentry_sdk

sentry_sdk.init(
    dsn="${dsn}",
    traces_sample_rate=0.1,
)`,
  php: (dsn) => `\\Sentry\\init([
    'dsn' => '${dsn}',
    'traces_sample_rate' => 0.1,
]);`,
  ruby: (dsn) => `Sentry.init do |config|
  config.dsn = '${dsn}'
  config.traces_sample_rate = 0.1
end`,
  go: (dsn) => `import "github.com/getsentry/sentry-go"

sentry.Init(sentry.ClientOptions{
    Dsn: "${dsn}",
    TracesSampleRate: 0.1,
})`,
};

export function SetupSnippet({
  platform,
  dsn,
}: {
  platform: string | null;
  dsn: string;
}) {
  const snippetFn = SNIPPETS[platform ?? ""] ?? SNIPPETS["javascript"];
  if (!snippetFn || !dsn) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Setup snippet ({platform ?? "javascript"})</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-lg border border-border bg-background/40 p-4 font-mono text-[12px] text-foreground/90">
          {snippetFn(dsn)}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Use the official Sentry SDK — GlitchTip is wire-compatible.
        </p>
      </CardContent>
    </Card>
  );
}
