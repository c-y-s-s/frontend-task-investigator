"use client";

import Link from "next/link";

type ModuleKey = "task" | "api" | "bug" | "review";
type Locale = "zh-TW" | "en";

type WorkspaceHeaderProps = {
  active: ModuleKey;
  locale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
};

const modules: { key: ModuleKey; href: string; label: string }[] = [
  { key: "task", href: "/", label: "Task" },
  { key: "api", href: "/api-analyzer", label: "API" },
  { key: "bug", href: "/bug-investigator", label: "Bug" },
  { key: "review", href: "/code-review", label: "Code Review" },
];

export function WorkspaceHeader({ active, locale, onLocaleChange }: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <Link className="workspace-header-brand" href="/">
        <span>✦</span>
        <div>
          <strong>Frontend Agent</strong>
          <small>Developer Workspace</small>
        </div>
      </Link>

      <nav className="workspace-header-nav" aria-label="Workspace tools">
        {modules.map((module) => (
          <Link
            key={module.key}
            href={module.href}
            className={active === module.key ? "active" : undefined}
            aria-current={active === module.key ? "page" : undefined}
          >
            {module.label}
          </Link>
        ))}
      </nav>

      <div className="workspace-header-meta">
        <span className="workspace-header-status"><i /> Local</span>
        {locale && onLocaleChange ? (
          <div className="locale-switcher" role="group" aria-label="Language">
            <button className={locale === "zh-TW" ? "active" : ""} onClick={() => onLocaleChange("zh-TW")} aria-pressed={locale === "zh-TW"}>中文</button>
            <button className={locale === "en" ? "active" : ""} onClick={() => onLocaleChange("en")} aria-pressed={locale === "en"}>EN</button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
