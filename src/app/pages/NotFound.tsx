import { useLocation } from 'react-router-dom';
import { ButtonLink, PageHeader, useDocumentTitle } from '../ui';

export function NotFound() {
  useDocumentTitle('Page not found');
  const { pathname } = useLocation();
  return (
    <div>
      <PageHeader title="Page not found">
        There is no page at <code className="break-all">{pathname}</code>.
      </PageHeader>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to="/" variant="primary">Go home</ButtonLink>
        <ButtonLink to="/examples">Open an example trace</ButtonLink>
        <ButtonLink to="/docs">Read the docs</ButtonLink>
      </div>
    </div>
  );
}
