import {
  SiAndroid,
  SiAngular,
  SiAstro,
  SiCelery,
  SiCloudflareworkers,
  SiDart,
  SiDjango,
  SiDotnet,
  SiElectron,
  SiElixir,
  SiExpress,
  SiFastapi,
  SiFastify,
  SiFlask,
  SiFlutter,
  SiGatsby,
  SiGo,
  SiIonic,
  SiJavascript,
  SiKotlin,
  SiLaravel,
  SiNestjs,
  SiNextdotjs,
  SiNodedotjs,
  SiNuxt,
  SiOpenjdk,
  SiPerl,
  SiPhp,
  SiPython,
  SiReact,
  SiRemix,
  SiRubyonrails,
  SiRuby,
  SiRust,
  SiSpringboot,
  SiSvelte,
  SiSwift,
  SiSymfony,
  SiTypescript,
  SiUnity,
  SiUnrealengine,
  SiVuedotjs,
} from "@icons-pack/react-simple-icons";
import { Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlatformMeta {
  Icon: React.ComponentType<{ className?: string; color?: string; size?: number }>;
  color: string;
  label: string;
}

const PLATFORMS: Record<string, PlatformMeta> = {
  // ── JavaScript ─────────────────────────────────────
  javascript: { Icon: SiJavascript, color: "#F7DF1E", label: "JavaScript" },
  "javascript-react": { Icon: SiReact, color: "#61DAFB", label: "React" },
  "javascript-vue": { Icon: SiVuedotjs, color: "#41B883", label: "Vue" },
  "javascript-angular": { Icon: SiAngular, color: "#DD0031", label: "Angular" },
  "javascript-svelte": { Icon: SiSvelte, color: "#FF3E00", label: "Svelte" },
  "javascript-nextjs": { Icon: SiNextdotjs, color: "#FFFFFF", label: "Next.js" },
  "javascript-nuxt": { Icon: SiNuxt, color: "#00DC82", label: "Nuxt" },
  "javascript-remix": { Icon: SiRemix, color: "#FFFFFF", label: "Remix" },
  "javascript-astro": { Icon: SiAstro, color: "#FF5D01", label: "Astro" },
  "javascript-gatsby": { Icon: SiGatsby, color: "#663399", label: "Gatsby" },
  "javascript-electron": { Icon: SiElectron, color: "#47848F", label: "Electron" },
  typescript: { Icon: SiTypescript, color: "#3178C6", label: "TypeScript" },

  // ── Node.js ────────────────────────────────────────
  node: { Icon: SiNodedotjs, color: "#5FA04E", label: "Node.js" },
  "node-express": { Icon: SiExpress, color: "#FFFFFF", label: "Express" },
  "node-nestjs": { Icon: SiNestjs, color: "#E0234E", label: "NestJS" },
  "node-fastify": { Icon: SiFastify, color: "#FFFFFF", label: "Fastify" },
  "node-cloudflare-workers": { Icon: SiCloudflareworkers, color: "#F38020", label: "Cloudflare Workers" },

  // ── Python ─────────────────────────────────────────
  python: { Icon: SiPython, color: "#3776AB", label: "Python" },
  "python-django": { Icon: SiDjango, color: "#092E20", label: "Django" },
  "python-flask": { Icon: SiFlask, color: "#FFFFFF", label: "Flask" },
  "python-fastapi": { Icon: SiFastapi, color: "#009688", label: "FastAPI" },
  "python-celery": { Icon: SiCelery, color: "#A9CC54", label: "Celery" },

  // ── Ruby ───────────────────────────────────────────
  ruby: { Icon: SiRuby, color: "#CC342D", label: "Ruby" },
  "ruby-rails": { Icon: SiRubyonrails, color: "#D30001", label: "Ruby on Rails" },
  "ruby-sinatra": { Icon: SiRuby, color: "#CC342D", label: "Sinatra" },

  // ── PHP ────────────────────────────────────────────
  php: { Icon: SiPhp, color: "#777BB4", label: "PHP" },
  "php-laravel": { Icon: SiLaravel, color: "#FF2D20", label: "Laravel" },
  "php-symfony": { Icon: SiSymfony, color: "#FFFFFF", label: "Symfony" },

  // ── Go ─────────────────────────────────────────────
  go: { Icon: SiGo, color: "#00ADD8", label: "Go" },

  // ── JVM ────────────────────────────────────────────
  java: { Icon: SiOpenjdk, color: "#ED8B00", label: "Java" },
  "java-spring-boot": { Icon: SiSpringboot, color: "#6DB33F", label: "Spring Boot" },
  kotlin: { Icon: SiKotlin, color: "#7F52FF", label: "Kotlin" },

  // ── .NET ───────────────────────────────────────────
  csharp: { Icon: SiDotnet, color: "#512BD4", label: "C# / .NET" },
  dotnet: { Icon: SiDotnet, color: "#512BD4", label: ".NET" },
  "dotnet-aspnetcore": { Icon: SiDotnet, color: "#512BD4", label: "ASP.NET Core" },
  "dotnet-maui": { Icon: SiDotnet, color: "#512BD4", label: ".NET MAUI" },
  "dotnet-xamarin": { Icon: SiDotnet, color: "#512BD4", label: "Xamarin" },

  // ── Mobile / Native ────────────────────────────────
  swift: { Icon: SiSwift, color: "#F05138", label: "Swift" },
  "apple-ios": { Icon: SiSwift, color: "#F05138", label: "iOS" },
  "apple-macos": { Icon: SiSwift, color: "#F05138", label: "macOS" },
  objc: { Icon: SiSwift, color: "#F05138", label: "Objective-C" },
  cocoa: { Icon: SiSwift, color: "#F05138", label: "Cocoa" },
  android: { Icon: SiAndroid, color: "#34A853", label: "Android" },
  "react-native": { Icon: SiReact, color: "#61DAFB", label: "React Native" },
  flutter: { Icon: SiFlutter, color: "#02569B", label: "Flutter" },
  dart: { Icon: SiDart, color: "#0175C2", label: "Dart" },
  ionic: { Icon: SiIonic, color: "#3880FF", label: "Ionic" },
  unity: { Icon: SiUnity, color: "#FFFFFF", label: "Unity" },
  unreal: { Icon: SiUnrealengine, color: "#FFFFFF", label: "Unreal Engine" },

  // ── Other ──────────────────────────────────────────
  rust: { Icon: SiRust, color: "#CE412B", label: "Rust" },
  elixir: { Icon: SiElixir, color: "#A86EDF", label: "Elixir" },
  perl: { Icon: SiPerl, color: "#39457E", label: "Perl" },
};

function lookup(platform: string | null | undefined): PlatformMeta | null {
  if (!platform) return null;
  if (PLATFORMS[platform]) return PLATFORMS[platform];
  // Fall back to the base language (e.g. python-pyramid → python)
  const base = platform.split("-")[0];
  return PLATFORMS[base] ?? null;
}

export function PlatformIcon({
  platform,
  size = 14,
  className,
}: {
  platform: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const meta = lookup(platform);
  if (!meta) {
    return <Code2 className={cn("text-muted-foreground", className)} style={{ width: size, height: size }} />;
  }
  const { Icon, color } = meta;
  return <Icon size={size} color={color} className={className} />;
}

export function PlatformBadge({
  platform,
  showName = true,
  className,
}: {
  platform: string | null | undefined;
  showName?: boolean;
  className?: string;
}) {
  const meta = lookup(platform);
  const label = meta?.label ?? platform ?? "unknown";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-1.5 py-0.5",
        className,
      )}
    >
      <PlatformIcon platform={platform} size={12} />
      {showName && <span className="text-[11px] text-foreground/80">{label}</span>}
    </span>
  );
}

export function getPlatformLabel(platform: string | null | undefined): string {
  return lookup(platform)?.label ?? platform ?? "Unknown";
}

export const PLATFORM_GROUPS: Array<{ label: string; items: Array<{ value: string; label: string }> }> = [
  {
    label: "JavaScript",
    items: [
      { value: "javascript", label: "Browser" },
      { value: "javascript-react", label: "React" },
      { value: "javascript-vue", label: "Vue" },
      { value: "javascript-angular", label: "Angular" },
      { value: "javascript-svelte", label: "Svelte" },
      { value: "javascript-nextjs", label: "Next.js" },
      { value: "javascript-nuxt", label: "Nuxt" },
      { value: "javascript-remix", label: "Remix" },
      { value: "javascript-astro", label: "Astro" },
      { value: "javascript-gatsby", label: "Gatsby" },
      { value: "javascript-electron", label: "Electron" },
    ],
  },
  {
    label: "Node.js",
    items: [
      { value: "node", label: "Node.js" },
      { value: "node-express", label: "Express" },
      { value: "node-nestjs", label: "NestJS" },
      { value: "node-fastify", label: "Fastify" },
      { value: "node-cloudflare-workers", label: "Cloudflare Workers" },
    ],
  },
  {
    label: "Python",
    items: [
      { value: "python", label: "Python" },
      { value: "python-django", label: "Django" },
      { value: "python-flask", label: "Flask" },
      { value: "python-fastapi", label: "FastAPI" },
      { value: "python-celery", label: "Celery" },
    ],
  },
  {
    label: "Ruby",
    items: [
      { value: "ruby", label: "Ruby" },
      { value: "ruby-rails", label: "Ruby on Rails" },
      { value: "ruby-sinatra", label: "Sinatra" },
    ],
  },
  {
    label: "PHP",
    items: [
      { value: "php", label: "PHP" },
      { value: "php-laravel", label: "Laravel" },
      { value: "php-symfony", label: "Symfony" },
    ],
  },
  {
    label: "Go",
    items: [{ value: "go", label: "Go" }],
  },
  {
    label: "JVM",
    items: [
      { value: "java", label: "Java" },
      { value: "java-spring-boot", label: "Spring Boot" },
      { value: "kotlin", label: "Kotlin" },
    ],
  },
  {
    label: ".NET",
    items: [
      { value: "csharp", label: "C# / .NET" },
      { value: "dotnet-aspnetcore", label: "ASP.NET Core" },
      { value: "dotnet-maui", label: ".NET MAUI" },
      { value: "dotnet-xamarin", label: "Xamarin" },
    ],
  },
  {
    label: "Mobile / Native",
    items: [
      { value: "apple-ios", label: "iOS (Swift)" },
      { value: "android", label: "Android" },
      { value: "react-native", label: "React Native" },
      { value: "flutter", label: "Flutter" },
      { value: "dart", label: "Dart" },
      { value: "ionic", label: "Ionic" },
      { value: "unity", label: "Unity" },
      { value: "unreal", label: "Unreal Engine" },
    ],
  },
  {
    label: "Other",
    items: [
      { value: "rust", label: "Rust" },
      { value: "elixir", label: "Elixir" },
      { value: "perl", label: "Perl" },
    ],
  },
];
