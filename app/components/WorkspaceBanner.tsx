type WorkspaceBannerProps = {
  eyebrow: string;
  title: string;
  description: string;
  tags: string[];
  steps: string[];
  activeStep?: number;
};

export function WorkspaceBanner({
  eyebrow,
  title,
  description,
  tags,
  steps,
  activeStep = 2,
}: WorkspaceBannerProps) {
  return (
    <div className="workspace-banner">
      <div className="workspace-banner-copy">
        <div className="workspace-banner-kicker">
          <i aria-hidden="true">✦</i>
          <span>{eyebrow}</span>
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="workspace-banner-tags">
          {tags.map((tag) => <b key={tag}>{tag}</b>)}
        </div>
      </div>
      <div className="workspace-banner-flow" aria-label="Agent workflow">
        <div className="workspace-banner-flow-title">
          <span>AGENT WORKFLOW</span>
          <b>READ ONLY</b>
        </div>
        {steps.map((step, index) => (
          <div className={`workspace-banner-flow-item ${index === activeStep ? "active" : ""}`} key={step}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step}</strong>
            {index === activeStep ? <i aria-hidden="true">●</i> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
