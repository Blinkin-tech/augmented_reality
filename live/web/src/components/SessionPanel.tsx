import { QRCodeSVG } from "qrcode.react";

export interface SessionPanelProps {
  session?: { code: string; customerUrl: string };
  onNew(): void;
}

export function SessionPanel({ session, onNew }: SessionPanelProps) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(session!.customerUrl); } catch { /* clipboard unavailable */ }
  };
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", padding: 12 }}>
      <button data-testid="new-session" onClick={onNew}>New session</button>
      {session && (
        <>
          <strong>{session.code}</strong>
          <a data-testid="customer-link" href={session.customerUrl} target="_blank" rel="noreferrer">{session.customerUrl}</a>
          <button onClick={copy}>Copy</button>
          <QRCodeSVG value={session.customerUrl} size={160} />
        </>
      )}
    </div>
  );
}
