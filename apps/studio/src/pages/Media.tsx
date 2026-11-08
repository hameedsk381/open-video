import { useRef, useState } from 'react';
import { api, upload, type Asset, type Detail } from '../api';
import { Button, ImagesIcon, MusicIcon, Notice, Spinner, TrashIcon, useUi } from '../ui';

type Use = 'background' | 'picture' | 'logo' | 'sound';

const sizeOf = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac,audio/flac,.mkv,.m4a';

const choices: Record<string, { use: Use; label: string; hint: string; done: string }[]> = {
  image: [
    { use: 'background', label: 'Background', hint: 'Fill the whole scene, behind everything', done: 'Added as the background of' },
    { use: 'picture', label: 'Picture', hint: 'Place it in the middle of the scene', done: 'Added a picture to' },
    { use: 'logo', label: 'Logo', hint: 'A small copy in the top corner', done: 'Added as a logo to' },
  ],
  video: [
    { use: 'background', label: 'Background', hint: 'Fill the whole scene, behind everything', done: 'Added as the background of' },
    { use: 'picture', label: 'Clip', hint: 'Place it in the middle of the scene', done: 'Added a clip to' },
  ],
  audio: [{ use: 'sound', label: 'Add sound', hint: 'Play it during the scene', done: 'Added sound to' }],
};

/** The project's own media: pictures, video and sound. Upload here, then put a file into the scene being edited. */
export function MediaPanel({ detail, reload, setNote, sceneIndex }: {
  detail: Detail;
  reload: (keepFrame: boolean) => Promise<void>;
  setNote: (note: string) => void;
  sceneIndex: number;
}) {
  const { toast } = useUi();
  const [progress, setProgress] = useState('');
  const [over, setOver] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const scene = detail.scenes[sceneIndex];

  const addFiles = async (files: File[]) => {
    if (!files.length || progress) return;
    let added = 0;
    for (const [i, file] of files.entries()) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try { await upload(detail.id, file); added++; } catch (e) { toast(`${file.name}: ${(e as Error).message}`, 'error'); }
    }
    setProgress('');
    if (added) { setNote(`${added} file${added === 1 ? '' : 's'} added`); await reload(true); }
  };

  const place = async (asset: Asset, choice: { use: Use; done: string }) => {
    setWorking(asset.name);
    try {
      await api('/api/asset/use', { id: detail.id, name: asset.name, as: choice.use, scene: sceneIndex });
      toast(`${choice.done} ${scene?.name ?? 'the scene'}`, 'success');
      await reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setWorking(null);
    }
  };

  const remove = async (asset: Asset) => {
    setWorking(asset.name);
    try {
      await api('/api/asset/delete', { id: detail.id, name: asset.name, force: (asset.uses ?? 0) > 0 });
      setAsking(null);
      setNote(`Deleted ${asset.name}`);
      await reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <h2>Media</h2>
      <p className="sub">Pictures, video and sound for this video. Add a file here, then put it into a scene.</p>

      <div
        className={`media-drop${over ? ' over' : ''}`}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]); }}
      >
        <ImagesIcon size={22} />
        <b>{progress || 'Drop files here'}</b>
        <small>PNG, JPG, WebP, GIF, MP4, MOV, WebM, MP3, WAV, M4A</small>
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={e => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <Button size="sm" variant="primary" loading={!!progress} onClick={() => input.current?.click()}>
          Choose files
        </Button>
      </div>

      {detail.assets.length ? (
        <>
          <p className="media-target">
            Adds go to <b>{scene ? `Scene ${sceneIndex + 1} · ${scene.name}` : 'the video'}</b>
            <span> — pick another scene on the timeline to change it.</span>
          </p>
          <div className="media-grid">
            {detail.assets.map(asset => {
              const url = `${detail.source.base}${asset.path}`;
              const busy = working === asset.name;
              return (
                <div className="media-card" key={asset.name}>
                  <div className="media-thumb">
                    {asset.kind === 'image' ? (
                      <img src={url} alt="" loading="lazy" />
                    ) : asset.kind === 'video' ? (
                      <video src={`${url}#t=0.1`} preload="metadata" muted playsInline>
                        <track kind="captions" />
                      </video>
                    ) : (
                      <span className="media-icon"><MusicIcon size={28} /></span>
                    )}
                    {busy ? <span className="media-busy"><Spinner size={18} /></span> : null}
                  </div>
                  <div className="media-info">
                    <b title={asset.name}>{asset.name}</b>
                    <small>{asset.kind} · {sizeOf(asset.bytes)}{asset.uses ? ` · used ${asset.uses}×` : ''}</small>
                  </div>
                  {asking === asset.name ? (
                    <div className="media-confirm">
                      <span>{asset.uses ? `Used ${asset.uses}× in the video. Delete anyway?` : 'Delete this file?'}</span>
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove(asset)}>Delete</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAsking(null)}>Keep</Button>
                    </div>
                  ) : (
                    <div className="media-actions">
                      {(choices[asset.kind] ?? []).map(choice => (
                        <Button key={choice.use} size="sm" variant="secondary" disabled={busy} title={choice.hint} onClick={() => void place(asset, choice)}>
                          {choice.label}
                        </Button>
                      ))}
                      <Button size="sm" variant="ghost" icon={<TrashIcon size={13} />} disabled={busy} title="Delete this file" aria-label={`Delete ${asset.name}`} onClick={() => setAsking(asset.name)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Notice tone="neutral" title="No media yet">
          <p style={{ margin: '4px 0 0' }}>Your logo, product photos, a background clip or a voice track all work. Drop them above, or choose files.</p>
        </Notice>
      )}
    </>
  );
}
