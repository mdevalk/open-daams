import { HdeuImportForm } from '@/components/HdeuImportForm';

export default function ImportPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">HD@EU incoming applications</h1>
        <p className="text-sm text-gray-500 mt-1">
          Register cross-border data access applications and data requests received via the
          HealthData@EU National Contact Point (NCP). Each imported application is automatically
          placed in <strong>Submitted</strong> state and the statutory decision clock starts
          from the transmission timestamp.
        </p>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">About cross-border applications</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>Applications are submitted by a researcher via a sending Member State HDAB</li>
          <li>The sending HDAB transmits the application to HDAB-NL via the HealthData@EU NCP</li>
          <li>HDAB-NL assesses the application against Dutch legal and technical requirements</li>
          <li>The outcome (permit / refusal) is communicated back through the NCP</li>
        </ul>
      </div>

      <HdeuImportForm />
    </div>
  );
}
