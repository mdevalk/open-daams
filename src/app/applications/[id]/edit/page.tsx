import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) notFound();
  if (application.status !== 'DRAFT') {
    return (
      <div className="max-w-lg">
        <p className="text-sm text-red-600">
          This application can no longer be edited (status: {application.status}).
        </p>
        <Link href={`/applications/${id}`} className="text-sm text-blue-600 hover:underline mt-2 block">Back</Link>
      </div>
    );
  }

  // Full edit form would go here; for now redirect back with a message
  return (
    <div className="max-w-lg">
      <p className="text-gray-700 text-sm">
        Edit form for <strong>{application.referenceNumber}</strong> — extend <code>NewApplicationForm</code> with pre-populated values.
      </p>
      <Link href={`/applications/${id}`} className="text-sm text-blue-600 hover:underline mt-2 block">Back to application</Link>
    </div>
  );
}
