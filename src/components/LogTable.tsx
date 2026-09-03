import type { ReactNode } from 'react';

type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
};

// Shared table shell for AuditLogTable/SecurityLogTable/IntegrationLogTable —
// each keeps its own translations, column set, and per-cell rendering; only
// the wrapper markup and empty state are common.
export function LogTable<T extends { id: string }>({
  rows,
  columns,
  emptyMessage,
}: {
  rows: T[];
  columns: Column<T>[];
  emptyMessage: ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-2 font-medium">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 last:border-0">
              {columns.map((col) => (
                <td key={col.key} className={col.className ?? 'px-4 py-2 text-gray-700'}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
