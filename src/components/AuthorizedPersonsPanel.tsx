import { AuthorizedPerson } from '@prisma/client';
import { getTranslations } from 'next-intl/server';

type Props = {
  persons: AuthorizedPerson[];
  locale: string;
};

// Read-only — authorized persons are only ever set at permit creation
// (the researcher, auto-derived, and the output controller, selected by
// HDAB) and re-selected at amendment approval (PermitChangeRequestPanel),
// never added/removed ad hoc on an existing version.
export async function AuthorizedPersonsPanel({ persons, locale }: Props) {
  const t = await getTranslations({ locale, namespace: 'authorizedPersons' });

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <h2 className="font-semibold text-gray-900 text-sm">{t('title')}</h2>

      {persons.length === 0 && (
        <p className="text-xs text-gray-500">{t('empty')}</p>
      )}

      <ul className="space-y-2">
        {persons.map((p) => (
          <li key={p.id} className="text-sm border border-gray-100 rounded p-2">
            <p className="font-medium">
              {p.name}
              {p.role && (
                <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  {t(p.role === 'RESEARCHER' ? 'roleResearcher' : 'roleOutputController')}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500">{p.affiliation}</p>
            {p.did && <p className="text-xs text-gray-400 font-mono">{t('did')}: {p.did}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
