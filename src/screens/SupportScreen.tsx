import { useState } from 'react';
import { api } from '../services/api';
import './SupportScreen.css';

interface Props {
  token: string;
  onBack: () => void;
}

const KNOWN_ISSUES = [
  {
    icon: '🔌',
    title: 'Bridge requires PC to be awake',
    body: 'ZeroG connects directly to your PC. If your computer sleeps or the bridge restarts, the app will show "Offline" until the bridge comes back up.',
  },
  {
    icon: '🔐',
    title: 'Permission requests require TestFlight build',
    body: 'Approval modals only appear on the native iOS build. The web PWA does not support real-time permission prompts.',
  },
  {
    icon: '📶',
    title: 'Messages may delay on weak Wi-Fi',
    body: 'The bridge polls the Antigravity IDE every 3 seconds. On slow networks, message delivery may take up to 6–9 seconds.',
  },
];

const FAQS = [
  {
    q: 'How do I reconnect after a disconnect?',
    a: 'Go to the Dashboard — if the agent shows Offline, your PC bridge needs to be restarted. On your PC, run: pm2 restart zerog-cdp-bridge',
  },
  {
    q: 'Can I use ZeroG on multiple devices?',
    a: 'Not simultaneously. The bridge uses a single-client policy — connecting a second device disconnects the first.',
  },
  {
    q: 'Where are my conversation histories stored?',
    a: 'Locally on your PC inside the Antigravity brain directory. Nothing is stored in the cloud.',
  },
];

export function SupportScreen({ token, onBack }: Props) {
  const [reportText, setReportText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleSendReport = async () => {
    if (!reportText.trim() || sending) return;
    setSending(true);
    try {
      // Send report as a message to the bridge with a [BUG REPORT] tag
      await api.sendMessage(token, `[BUG REPORT] ${reportText.trim()}`);
      setSent(true);
      setReportText('');
    } catch {
      alert('Could not send report. Make sure your agent is connected.');
    }
    setSending(false);
  };

  return (
    <div className="support-screen">
      {/* Header */}
      <div className="support-header">
        <button className="support-back" onClick={onBack}>‹</button>
        <div className="support-header-text">
          <div className="support-eyebrow">ZEROG REMOTE</div>
          <div className="support-title">Support</div>
        </div>
        <span className="support-header-icon">🛟</span>
      </div>

      <div className="support-scroll">

        {/* Report a Bug */}
        <div className="support-section-label">REPORT AN ISSUE</div>
        <div className="support-card">
          {sent ? (
            <div className="support-sent">
              <div className="support-sent-icon">✅</div>
              <div className="support-sent-title">Report sent!</div>
              <div className="support-sent-sub">Your agent received it — we'll look into it.</div>
              <button className="support-sent-reset" onClick={() => setSent(false)}>Send another</button>
            </div>
          ) : (
            <>
              <textarea
                className="support-textarea"
                placeholder="Describe what happened, what you expected, and what went wrong..."
                value={reportText}
                onChange={e => setReportText(e.target.value)}
                rows={4}
              />
              <button
                className={`support-send-btn ${(!reportText.trim() || sending) ? 'disabled' : ''}`}
                onClick={handleSendReport}
                disabled={!reportText.trim() || sending}
              >
                {sending ? 'Sending…' : 'Send Report →'}
              </button>
            </>
          )}
        </div>

        {/* Known Issues */}
        <div className="support-section-label">KNOWN LIMITATIONS</div>
        <div className="support-card support-issues">
          {KNOWN_ISSUES.map((issue, i) => (
            <div key={i} className={`support-issue ${i < KNOWN_ISSUES.length - 1 ? 'issue-border' : ''}`}>
              <div className="support-issue-icon">{issue.icon}</div>
              <div className="support-issue-body">
                <div className="support-issue-title">{issue.title}</div>
                <div className="support-issue-text">{issue.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="support-section-label">FAQ</div>
        <div className="support-card support-faq">
          {FAQS.map((faq, i) => (
            <div key={i} className={`support-faq-item ${i < FAQS.length - 1 ? 'faq-border' : ''}`}>
              <button
                className="support-faq-q"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span>{faq.q}</span>
                <span className={`support-faq-chevron ${openFaq === i ? 'open' : ''}`}>›</span>
              </button>
              {openFaq === i && (
                <div className="support-faq-a">{faq.a}</div>
              )}
            </div>
          ))}
        </div>

        {/* Version info */}
        <div className="support-version">
          ZeroG Remote · v1.0 · Built on Antigravity
        </div>

      </div>
    </div>
  );
}
