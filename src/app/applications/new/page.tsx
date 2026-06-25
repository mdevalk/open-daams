import { prisma } from '@/lib/db';
import { NewApplicationForm } from '@/components/NewApplicationForm';

export default async function NewApplicationPage() {
  const users = await prisma.user.findMany({
    where: { role: 'APPLICANT' },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="text-sm text-gray-500 mb-2">
          <a href="/applications" className="hover:text-gray-900">Applications</a>
          <span className="mx-2">/</span>
          <span className="text-gray-900">New application</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">New data access application</h1>
        <p className="text-sm text-gray-500 mt-1">
          Implements the EHDS common data access application form (TEHDAS2 D6.2)
        </p>
      </div>
      <NewApplicationForm applicants={users} />
    </div>
  );
}
