import { PROJECTS } from '../projects/registry';
import { usePageMeta } from '../usePageMeta';
import { ProjectCard } from './ProjectCard';
import { Starfield } from './Starfield';
import './hub.css';

export default function HubPage() {
  usePageMeta({
    title: 'play · string-wise',
    description: 'Calm, interactive playgrounds for learning how systems really work.',
  });
  return (
    <div className="hub">
      <header className="hub-head">
        <Starfield />
        <div className="hub-title">
          <h1>play</h1>
          <p>Calm playgrounds for systems internals.</p>
          <p className="sub">No score, no timer, no way to lose. Five minutes, and you come away knowing something real.</p>
        </div>
      </header>
      <main className="grid">
        {PROJECTS.map(p => (
          <ProjectCard key={p.id} p={p} />
        ))}
      </main>
      <footer className="hub-foot">
        <a href="https://string-wise.com">string-wise.com</a>
        <span>·</span>
        <span>built with curiosity by @goroutine_guy</span>
      </footer>
    </div>
  );
}
