import { useEffect, useState } from 'react';
import { limitMessage } from '../limitMessage';
import { api, waitJob, cleanUserStatus } from '../api';
import { composeNotesKey, composeOutcome } from '../composeReport';
import { go } from '../router';
import { AlertCircleIcon, Badge, Button, CheckIcon, Notice, SparklesIcon } from '../ui';

/* ==================== Making Screen ==================== */
export const STAGE_SENTENCES: Record<number, string[]> = {
  1: [
    'Reading your brief and key message points…',
    'Choosing type, colour and contrast…',
    'Setting up the frame size and layout…',
    'Setting the visual mood and brand feel…',
  ],
  2: [
    'Structuring the story and scene order…',
    'Timing the entrance of each element…',
    'Setting scene lengths for the best pacing…',
    'Drafting on-screen copy and headlines…',
  ],
  3: [
    'Animating type and scene reveals…',
    'Adding camera moves and depth…',
    'Positioning badges, highlights and layouts…',
    'Balancing depth and motion…',
  ],
  4: [
    'Fine-tuning timing and transition cuts…',
    'Syncing audio accents with the picture…',
    'Checking contrast and readability…',
    'Finishing the motion for preview…',
  ],
};

export const CREATIVE_TIPS = [
  '✨ Smooth motion tuned for viewer engagement',
  '🎨 Colour harmony follows your chosen brand palette',
  '📐 Camera moves and transitions follow natural eye movement',
  '🎵 Audio and sound effects sync with visual reveals',
];

export const Bulleted = ({ items }: { items: string[] }) => (
  <>
    {items.map((message, index) => (
      <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span aria-hidden>•</span>
        <span>{message}</span>
      </div>
    ))}
  </>
);

/** Repairs alone do not stop the flow: the editor shows them once as a dismissible banner. */
export function stashComposeNotes(id: string, notes: string[]) {
  try { sessionStorage.setItem(composeNotesKey(id), JSON.stringify(notes)); } catch {}
}

export function Making({ id, job }: { id: string; job: string }) {
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [report, setReport] = useState<{ notes: string[]; errors: string[] } | undefined>();
  const [sentenceIndex, setSentenceIndex] = useState(0);

  useEffect(() => {
    // The page stays mounted when the route moves to another job, so what the last one reported must not describe this one.
    setMessages([]); setError(''); setReport(undefined);
    let live = true;
    waitJob(job, j => {
      if (live) setMessages(j.messages);
    }).then(
      j => {
        if (!live) return;
        // Unresolved review faults stop here and say what is wrong. Repairs alone open the editor, where the
        // notes arrive as a dismissible banner instead of an extra click.
        const outcome = composeOutcome(j.result);
        if (outcome.stop) { setReport(outcome.report); return; }
        // Always written, even when empty: a project that reuses a deleted one's id must not inherit its notes.
        stashComposeNotes(id, outcome.notes);
        go(`#/p/${encodeURIComponent(id)}`);
      },
      e => {
        if (live) {
          const msg = (e as Error).message || '';
          setError(limitMessage(msg) ?? 'Video creation was interrupted. Please review your brief and try again.');
        }
      }
    );
    return () => { live = false; };
  }, [id, job]);

  // Rotate informative status sentences every 2.8s
  useEffect(() => {
    const timer = setInterval(() => {
      setSentenceIndex(prev => prev + 1);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  // Determine stage based on messages count & content
  const stage = messages.some(m => /retim|review|audio|render|finish/i.test(m))
    ? 4
    : messages.some(m => /compose|layer|scene|kinetic/i.test(m))
      ? 3
      : messages.some(m => /plan|beat|story|narrat/i.test(m))
        ? 2
        : 1;

  const currentStatusText = messages.length
    ? cleanUserStatus(messages[messages.length - 1]!)
    : (STAGE_SENTENCES[stage] || STAGE_SENTENCES[1])[sentenceIndex % (STAGE_SENTENCES[stage] || STAGE_SENTENCES[1]).length];

  const currentTip = CREATIVE_TIPS[sentenceIndex % CREATIVE_TIPS.length];

  return (
    <div className="center" style={{ maxWidth: 540, margin: '40px auto', padding: '0 20px' }}>
      {report ? (
        <>
          <div style={{ margin: '0 auto 20px', width: 56, height: 56, borderRadius: '50%', background: `color-mix(in srgb, var(--${report.errors.length ? 'red' : 'amber'}) 15%, transparent)`, color: `var(--${report.errors.length ? 'red' : 'amber'})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {report.errors.length ? <AlertCircleIcon size={28} /> : <SparklesIcon size={28} />}
          </div>
          <h2>{report.errors.length ? 'Made, but the review still faults it' : 'Made, with notes'}</h2>
          {report.errors.length ? <Notice tone="error" title="Unresolved review faults"><Bulleted items={report.errors} /></Notice> : null}
          {report.notes.length ? <Notice tone={report.errors.length ? 'neutral' : 'warn'} title="What the studio adjusted"><Bulleted items={report.notes} /></Notice> : null}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
            <Button variant="primary" onClick={() => go(`#/p/${encodeURIComponent(id)}`)}>Open the video</Button>
            <Button onClick={() => go('#/projects')}>Back to Projects</Button>
          </div>
        </>
      ) : error ? (
        <>
          <div style={{ margin: '0 auto 20px', width: 56, height: 56, borderRadius: '50%', background: 'color-mix(in srgb, var(--red) 15%, transparent)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircleIcon size={28} />
          </div>
          <h2>Creation Paused</h2>
          <Notice tone="error" title="Notice">{error}</Notice>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
            <Button variant="primary" onClick={() => {
              let saved = '';
              try { saved = sessionStorage.getItem(`ove-brief-${id}`) ?? ''; } catch {}
              go(saved ? `#/new?prompt=${encodeURIComponent(saved)}` : '#/new');
            }}>Try again with the same brief</Button>
            <Button onClick={() => api('/api/project/delete', { id }).then(() => go('#/projects'))}>Back to Projects</Button>
          </div>
        </>
      ) : (
        <>
          {/* Animated Product Loader */}
          <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '3px solid color-mix(in srgb, var(--indigo) 20%, transparent)',
                borderTopColor: 'var(--indigo)',
                animation: 'spin 1.2s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite',
              }}
            />
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--brand-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 24px var(--brand-glow)',
                color: '#fff',
              }}
            >
              <SparklesIcon size={22} />
            </div>
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            Creating Your Video
          </h2>

          {/* Dynamic rotating status sentence */}
          <div
            key={currentStatusText}
            style={{
              minHeight: 28,
              fontSize: 14.5,
              fontWeight: 500,
              color: 'var(--text)',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'opacity 0.25s ease',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--indigo)', animation: 'pulse 1.5s infinite' }} />
            <span>{currentStatusText}</span>
          </div>

          {/* Visual Production Pipeline */}
          <div className="pipeline-card" style={{ textAlign: 'left', margin: '0 0 20px' }}>
            <div className="pipeline-header">
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>How your video is made</span>
              <Badge tone="blue" dot>Stage {stage} of 4</Badge>
            </div>

            <div className={`pipeline-step ${stage === 1 ? 'active' : stage > 1 ? 'done' : ''}`}>
              <div className="step-circle">{stage > 1 ? <CheckIcon size={14} /> : '1'}</div>
              <div className="step-content">
                <b>Concept & direction</b>
                <small>Reading the brief and choosing brand colours</small>
              </div>
            </div>

            <div className={`pipeline-step ${stage === 2 ? 'active' : stage > 2 ? 'done' : ''}`}>
              <div className="step-circle">{stage > 2 ? <CheckIcon size={14} /> : '2'}</div>
              <div className="step-content">
                <b>Storyboard & pacing</b>
                <small>Structuring visual hooks, key message points and a call to action</small>
              </div>
            </div>

            <div className={`pipeline-step ${stage === 3 ? 'active' : stage > 3 ? 'done' : ''}`}>
              <div className="step-circle">{stage > 3 ? <CheckIcon size={14} /> : '3'}</div>
              <div className="step-content">
                <b>Motion & layout</b>
                <small>Animating type, camera moves and transitions</small>
              </div>
            </div>

            <div className={`pipeline-step ${stage === 4 ? 'active' : ''}`}>
              <div className="step-circle">{stage === 4 ? <SparklesIcon size={12} /> : '4'}</div>
              <div className="step-content">
                <b>Review & polish</b>
                <small>Fine-tuning timing, audio sync and picture quality</small>
              </div>
            </div>
          </div>

          {/* Product feature insight footer */}
          <div
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              fontSize: 12.5,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>{currentTip}</span>
          </div>
        </>
      )}
    </div>
  );
}
