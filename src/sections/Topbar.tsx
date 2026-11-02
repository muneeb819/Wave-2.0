import {
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  Layers3,
  Menu,
} from "lucide-react";
import { DEFAULT_CLOUD_AGENT_URL } from "../types";

export function Topbar({
  title,
  standaloneUrl,
  activeAgentId,
  botUrl,
  onOpenMobileNav,
  onOpenConnect,
}: {
  title: string;
  standaloneUrl: string;
  activeAgentId: string;
  botUrl: string;
  onOpenMobileNav: () => void;
  onOpenConnect: () => void;
}) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <button
          className="icon-button mobile-menu"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
        >
          <Menu />
        </button>
        <span className="breadcrumb-icon">
          <Layers3 />
        </span>
        <span>Workspace</span>
        <ChevronRight />
        <span className="breadcrumb-current">{title}</span>
      </div>
      <div className="topbar-actions">
        <a
          className="open-chrome-tab-top"
          href={standaloneUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open Wave 2.0 in a full Chrome tab so Chrome can access your microphone"
        >
          <ExternalLink />
          <span>Open in Chrome Tab</span>
        </a>
        <button
          className="environment-tag bot-pill-button"
          onClick={onOpenConnect}
          title={`Configure LiveKit Cloud bot ${activeAgentId}`}
        >
          <span />
          Bot · {activeAgentId}
        </button>
        <span className="topbar-divider" />
        <a
          className="docs-top-link"
          href={botUrl || DEFAULT_CLOUD_AGENT_URL}
          target="_blank"
          rel="noreferrer"
        >
          Cloud Agent
          <ArrowUpRight />
        </a>
      </div>
    </header>
  );
}
