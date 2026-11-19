import { Link } from 'react-router-dom';
import { TOOL } from '../../core';
import { SITE } from '../config';
import { Card, PageHeader, useDocumentTitle } from '../ui';

export function About() {
  useDocumentTitle('About');
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={`About ${SITE.name}`}>{SITE.tagline}</PageHeader>
      <Card>
        <h2 className="text-lg font-semibold">Mission</h2>
        <p className="mt-2 text-sm">
          Make it quick to understand where an API request spends its time and what to investigate next, without needing to be an observability
          expert. {SITE.name} explains its reasoning, shows its evidence and says plainly what a trace cannot tell you.
        </p>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Project</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">Created and maintained by</dt>
          <dd>{SITE.creator}</dd>
          <dt className="text-muted">License</dt>
          <dd>{SITE.license}</dd>
          <dt className="text-muted">Version</dt>
          <dd>{TOOL.version}</dd>
          <dt className="text-muted">Source code</dt>
          <dd>{SITE.repoUrl ? <a href={SITE.repoUrl}>{SITE.repoUrl.replace(/^https?:\/\//, '')}</a> : 'Repository link will be published at launch.'}</dd>
        </dl>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">What it is, and is not</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>It is an investigation aid for single traces you already have.</li>
          <li>It is not a production monitoring system and does not collect live telemetry.</li>
          <li>Its insights are rule-based hypotheses, not proven root causes. <Link to="/docs#limitations">Limitations</Link></li>
        </ul>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Feedback</h2>
        <p className="mt-2 text-sm">
          {SITE.repoUrl ? (
            <>Questions, bug reports and ideas are welcome as <a href={`${SITE.repoUrl.replace(/\/$/, '')}/issues`}>GitHub issues</a>.</>
          ) : (
            'Feedback will be handled through GitHub issues once the repository is public.'
          )}
        </p>
      </Card>
    </div>
  );
}
