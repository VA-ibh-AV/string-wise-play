import type { ComponentType } from 'react';

export interface ProjectManifest {
  id: string;
  title: string;
  tagline: string;
  route: `/${string}`;
  status: 'live' | 'beta' | 'soon';
  topics: string[];
  /** Typical session length, shown on the card. */
  minutes: number;
  /** Card art (SVG). The 1200×630 og:image lives at /og/<id>.png. */
  thumbnail: string;
  accent: string;
  /** One-line teaser for "soon" cards. */
  teaser?: string;
  /** Number of missions, for the progress count on the hub card. */
  missions?: number;
  relatedPosts: { title: string; url: string }[];
  load?: () => Promise<{ default: ComponentType }>;
}
