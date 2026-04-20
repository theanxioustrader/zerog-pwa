import { api } from '../services/api';
import './ApprovalsScreen.css';

export interface PendingPermission {
  id: string; // unique per request
  permissionText: string;
  conversationId?: string;
  ts: number;
}

interface Props {
  permissions: PendingPermission[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onApproveAll: () => void;
  onDenyAll: () => void;
  onBack: () => void;
}

function relativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function ApprovalsScreen({ permissions, onApprove, onDeny, onApproveAll, onDenyAll, onBack }: Props) {
  return (
    <div className="approvals-screen">
      {/* Header */}
      <div className="approvals-header">
        <button className="approvals-back" onClick={onBack}>‹</button>
        <div className="approvals-title-wrap">
          <div className="approvals-eyebrow">PENDING</div>
          <div className="approvals-title">Approvals</div>
        </div>
        {permissions.length > 0 && (
          <div className="approvals-badge">{permissions.length}</div>
        )}
      </div>

      {/* Bulk actions */}
      {permissions.length > 1 && (
        <div className="approvals-bulk">
          <button className="approvals-bulk-deny" onClick={onDenyAll}>Deny All</button>
          <button className="approvals-bulk-allow" onClick={onApproveAll}>Approve All</button>
        </div>
      )}

      {/* List */}
      <div className="approvals-list">
        {permissions.length === 0 ? (
          <div className="approvals-empty">
            <div className="approvals-empty-icon">✅</div>
            <div className="approvals-empty-title">All clear</div>
            <div className="approvals-empty-sub">No pending approvals right now.</div>
          </div>
        ) : (
          permissions.map(p => (
            <div key={p.id} className="approvals-item">
              <div className="approvals-item-header">
                <span className="approvals-item-tag">🔐 Permission Request</span>
                <span className="approvals-item-ts">{relativeTime(p.ts)}</span>
              </div>
              {p.conversationId && (
                <div className="approvals-item-conv">
                  {p.conversationId === 'active' ? 'Active IDE Session' : `Conv: ${p.conversationId.slice(0, 8)}…`}
                </div>
              )}
              <div className="approvals-item-text">{p.permissionText || 'Antigravity is requesting approval to proceed.'}</div>
              <div className="approvals-item-btns">
                <button
                  className="approvals-deny-btn"
                  onClick={async () => {
                    await api.approvePermission('deny').catch(() => {});
                    onDeny(p.id);
                  }}
                >
                  Deny
                </button>
                <button
                  className="approvals-allow-btn"
                  onClick={async () => {
                    await api.approvePermission('allow').catch(() => {});
                    onApprove(p.id);
                  }}
                >
                  Allow
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
