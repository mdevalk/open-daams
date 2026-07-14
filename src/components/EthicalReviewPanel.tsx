"use client";

import { useState } from "react";
import { Application } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatDate, readErrorMessage } from "@/lib/utils";

type Props = {
  application: Pick<
    Application,
    | "id"
    | "ethicalReviewRequired"
    | "ethicalReviewStatus"
    | "ethicalReviewBody"
    | "ethicalReviewReference"
    | "ethicalReviewDate"
  >;
  canManage: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  NOT_REQUIRED: "bg-gray-100 text-gray-600",
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

export function EthicalReviewPanel({ application, canManage }: Props) {
  const router = useRouter();
  const t = useTranslations("ethicalReview");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [required, setRequired] = useState(application.ethicalReviewRequired);
  const [status, setStatus] = useState(application.ethicalReviewStatus ?? "PENDING");
  const [body, setBody] = useState(application.ethicalReviewBody ?? "");
  const [reference, setReference] = useState(application.ethicalReviewReference ?? "");
  const [date, setDate] = useState(
    application.ethicalReviewDate ? new Date(application.ethicalReviewDate).toISOString().slice(0, 10) : ""
  );

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ethicalReviewRequired: required,
          ethicalReviewStatus: required ? status : "NOT_REQUIRED",
          ethicalReviewBody: body || null,
          ethicalReviewReference: reference || null,
          ethicalReviewDate: date || null,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, t("saveError")));
      setEditing(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  }

  const currentStatus = application.ethicalReviewRequired
    ? application.ethicalReviewStatus ?? "PENDING"
    : "NOT_REQUIRED";

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">{t("title")}</h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_STYLES[currentStatus]}`}>
          {t(`status${currentStatus}`)}
        </span>
      </div>

      {!editing && (
        <div className="text-sm space-y-1">
          {application.ethicalReviewRequired && (
            <>
              <div className="flex justify-between"><span className="text-gray-500">{t("committee")}</span><span>{application.ethicalReviewBody || "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t("reference")}</span><span>{application.ethicalReviewReference || "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t("date")}</span><span>{formatDate(application.ethicalReviewDate)}</span></div>
            </>
          )}
          {!application.ethicalReviewRequired && (
            <p className="text-xs text-gray-500">{t("notRequiredNote")}</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canManage && editing && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
            {t("requiredCheckbox")}
          </label>
          {required && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t("statusLabel")}</label>
                <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]">
                  <option value="PENDING">{t("statusPENDING")}</option>
                  <option value="APPROVED">{t("statusAPPROVED")}</option>
                  <option value="REJECTED">{t("statusREJECTED")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t("committee")}</label>
                <input type="text" value={body} onChange={e => setBody(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t("referenceNumber")}</label>
                <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t("date")}</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button disabled={loading} onClick={save}
              className="flex-1 rounded px-3 py-2 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors">
              {loading ? t("saving") : t("save")}
            </button>
            <button disabled={loading} onClick={() => setEditing(false)} className="rounded px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {canManage && !editing && (
        <button onClick={() => setEditing(true)} className="text-xs text-[#01689b] hover:underline">
          {t("edit")}
        </button>
      )}
    </div>
  );
}
