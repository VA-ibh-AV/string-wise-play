import { Link } from 'react-router-dom';
import { useProgress } from '@play/progress';
import type { ProjectManifest } from '../projects/types';

export function ProjectCard({ p }: { p: ProjectManifest }) {
  const { done } = useProgress(p.id);
  const playable = !!p.load;
  const body = (
    <>
      <div className="thumb" style={{ backgroundImage: `url(${p.thumbnail})`, ['--accent' as string]: p.accent }} />
      <div className="card-body">
        <div className="card-top">
          <h2>{p.title}</h2>
          <span className={`status ${p.status}`}>{p.status}</span>
        </div>
        <p className="tagline">{p.tagline}</p>
        {!playable && p.teaser && <p className="teaser">{p.teaser}</p>}
        <ul className="chips">
          {p.topics.slice(0, 5).map(t => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="card-foot">
          <span>≈{p.minutes} min</span>
          {p.missions ? (
            <span className="progress">
              {done.size}/{p.missions} missions
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
  return playable ? (
    <Link to={p.route} className="card" style={{ ['--accent' as string]: p.accent }}>
      {body}
    </Link>
  ) : (
    <div className="card soon" aria-disabled="true">
      {body}
    </div>
  );
}
