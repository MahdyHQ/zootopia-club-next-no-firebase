export function ProtectedWorkspaceBackground() {
  return (
    <div aria-hidden="true" className="protected-workspace-background">
      {/* Keep the protected-shell artwork isolated here so public auth pages keep full ownership of their own image treatments. */}
      <div className="protected-workspace-background__base" />

      {/* The source image stays gently filtered and slightly dimmed so it reads as a premium workspace backdrop instead of a harsh hero banner. */}
      <div className="protected-workspace-background__image" />

      {/* These restrained overlays add readability and scientific ambience without introducing noisy motion into the working surface. */}
      <div className="protected-workspace-background__overlay" />
      <div className="protected-workspace-background__grid" />
      <div className="protected-workspace-background__noise" />
      {/* This timed bubble layer is the only periodic motion accent in the protected workspace.
          Future agents should keep it lightweight, non-interactive, and mostly absent so it reads as ambience rather than UI noise. */}
      <div className="protected-workspace-background__bubble-layer">
        <span className="protected-workspace-background__bubble protected-workspace-background__bubble--alpha" />
        <span className="protected-workspace-background__bubble protected-workspace-background__bubble--beta" />
        <span className="protected-workspace-background__bubble protected-workspace-background__bubble--gamma" />
        <span className="protected-workspace-background__bubble protected-workspace-background__bubble--delta" />
      </div>

      <span className="protected-workspace-background__orb protected-workspace-background__orb--north" />
      <span className="protected-workspace-background__orb protected-workspace-background__orb--west" />
      <span className="protected-workspace-background__orb protected-workspace-background__orb--east" />
      <span className="protected-workspace-background__beam protected-workspace-background__beam--upper" />
      <span className="protected-workspace-background__beam protected-workspace-background__beam--lower" />
    </div>
  );
}
