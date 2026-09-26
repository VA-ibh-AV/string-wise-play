import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import HubPage from './hub/HubPage';
import { liveProjects } from './projects/registry';

const routes = liveProjects.map(p => ({ path: p.route, Component: lazy(p.load!) }));

function Loading() {
  return <div className="loading">Loading…</div>;
}

function NotFound() {
  return (
    <div className="loading">
      <p>Nothing orbits here.</p>
      <Link to="/">Back to play</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<HubPage />} />
          {routes.map(({ path, Component }) => (
            <Route key={path} path={path} element={<Component />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
