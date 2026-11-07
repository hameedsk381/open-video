import { useMemo, useState } from 'react';
import { ago, cleanUserStatus, useJobs, type Job } from '../api';
import { editorPath, go } from '../router';
import {
  AlertCircleIcon,
  Badge,
  Button,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  FilmIcon,
  Page,
  PlusIcon,
  Spinner,
} from '../ui';

const labels: Record<string, string> = {
  compose: 'Compose',
  refine: 'Refine',
  render: 'Render',
  review: 'Review',
  narrate: 'Narration',
  transcribe: 'Captions',
  image: 'Imagery',
  thumbnail: 'Thumbnail',
  batch: 'Batch',
  import: 'Import',
};

type JobResult = { id?: string; url?: string; file?: string; seconds?: number; scenes?: number };

const tone = (job: Job) => (job.status === 'error' ? 'red' : job.status === 'done' ? 'green' : job.status === 'running' ? 'blue' : 'neutral') as const;

const elapsed = (job: Job) => {
  if (!job.startedAt) return '';
  const end = job.endedAt ?? Date.now();
  const seconds = Math.max(0, Math.round((end - job.startedAt) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};

function detail(job: Job) {
  if (job.status === 'error') return job.error || 'The job failed.';
  if (job.status === 'running' || job.status === 'queued') return cleanUserStatus(job.messages.at(-1));
  const result = job.result as JobResult | undefined;
  if (result?.seconds) return `Finished — ${Math.round(result.seconds)}s${result.scenes ? `, ${result.scenes} scenes` : ''}`;
  return 'Finished';
}

function JobRow({ job }: { job: Job }) {
  const result = job.result as JobResult | undefined;
  const open = () => {
    if (result?.id) go(editorPath(result.id));
  };

  return (
    <div className="gen-row">
      <span className={`gen-icon ${job.status}`}>
        {job.status === 'running' || job.status === 'queued' ? <Spinner size={14} /> : job.status === 'error' ? <AlertCircleIcon size={15} /> : <CheckIcon size={15} />}
      </span>
      <div className="gen-main">
        <div className="gen-title">
          <b>{labels[job.kind] ?? job.kind}</b>
          <Badge tone={tone(job)} dot={job.status === 'running'}>
            {job.status === 'running' ? 'working' : job.status}
          </Badge>
          <span className="gen-time">
            {job.startedAt ? ago(job.startedAt) : ''}{job.startedAt ? ` · ${elapsed(job)}` : ''}
          </span>
        </div>
        <small>{detail(job)}</small>
        {job.status === 'running' && job.messages.length ? (
          <div className="gen-log">{job.messages.slice(-2).map((message, index) => <span key={index}>{cleanUserStatus(message)}</span>)}</div>
        ) : null}
      </div>
      <div className="gen-actions">
        {result?.url ? (
          <a className="btn ghost sm" href={result.url} target="_blank" rel="noreferrer">
            <DownloadIcon size={13} />
            <span>File</span>
          </a>
        ) : null}
        {result?.id ? (
          <Button size="sm" variant="secondary" onClick={open}>Open</Button>
        ) : null}
      </div>
    </div>
  );
}

export function Generation() {
  const jobs = useJobs();
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'error'>('all');

  const ordered = useMemo(() => Object.values(jobs).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)), [jobs]);
  const counts = {
    active: ordered.filter(job => job.status === 'running' || job.status === 'queued').length,
    done: ordered.filter(job => job.status === 'done').length,
    error: ordered.filter(job => job.status === 'error').length,
  };
  const shown = ordered.filter(job => filter === 'all'
    || (filter === 'active' ? job.status === 'running' || job.status === 'queued' : job.status === filter));

  return (
    <Page
      title="Generation"
      subtitle="Every compose, refine, render and voice job in this workspace, newest first."
      actions={<Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => go('#/new')}>New video</Button>}
    >
      <div className="gen-stats">
        <div><b>{counts.active}</b><small>Running now</small></div>
        <div><b>{counts.done}</b><small>Completed</small></div>
        <div><b>{counts.error}</b><small>Failed</small></div>
      </div>

      <div className="segmented">
        {([['all', 'All'], ['active', 'Active'], ['done', 'Completed'], ['error', 'Failed']] as const).map(([id, label]) => (
          <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="gen-empty">
          <ClockIcon size={26} />
          <b>{ordered.length ? 'Nothing in this view' : 'No jobs yet'}</b>
          <small>{ordered.length ? 'Try another filter to see earlier work.' : 'Start a video and its progress will be listed here, with the files it produced.'}</small>
          {ordered.length ? null : <Button size="sm" variant="secondary" icon={<FilmIcon size={12} />} onClick={() => go('#/new')}>Create a video</Button>}
        </div>
      ) : (
        <div className="gen-list">{shown.map(job => <JobRow key={job.id} job={job} />)}</div>
      )}
    </Page>
  );
}
