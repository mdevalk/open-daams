'use client';

import { useState } from 'react';
import { Note, User } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type NoteWithAuthor = Note & { author: Pick<User, 'id' | 'name' | 'role'> };

export function NotesList({
  applicationId,
  notes,
  currentUser,
}: {
  applicationId: string;
  notes: NoteWithAuthor[];
  currentUser: User;
}) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [saving, setSaving] = useState(false);

  async function addNote() {
    if (!content.trim()) return;
    setSaving(true);
    await fetch(`/api/applications/${applicationId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorId: currentUser.id, content, isInternal }),
    });
    setContent('');
    setSaving(false);
    router.refresh();
  }

  const staffRoles = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN', 'DATA_HOLDER'];
  const isStaff = staffRoles.includes(currentUser.role);

  return (
    <div className="space-y-4">
      {/* Add note */}
      <div className="space-y-2">
        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center justify-between">
          {isStaff && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded"
              />
              Internal (not visible to applicant)
            </label>
          )}
          <button
            disabled={saving || !content.trim()}
            onClick={addNote}
            className="ml-auto rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Add note'}
          </button>
        </div>
      </div>

      {/* Existing notes */}
      {notes.length === 0 ? (
        <p className="text-sm text-gray-400">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`rounded-lg border p-3 text-sm ${
                note.isInternal
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
              <p className="text-xs text-gray-400 mt-1.5">
                {note.author.name}
                {note.isInternal && <span className="ml-1 text-amber-600 font-medium">[internal]</span>}
                {' '}&middot; {formatDateTime(note.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
