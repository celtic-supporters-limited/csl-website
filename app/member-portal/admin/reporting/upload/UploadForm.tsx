"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function UploadForm() {
  const [file, setFile]         = useState<File | null>(null);
  const [asOfDate, setAsOfDate] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<{ active_combined: number; legacy_count: number; rows_parsed: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !asOfDate) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("csv", file);
      form.append("as_of_date", asOfDate);

      const res = await fetch("/api/admin/upload-wp-snapshot", {
        method: "POST",
        body: form,
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        return;
      }

      setResult(json);
      // Refresh the dashboard data after a short pause
      setTimeout(() => router.push("/member-portal/admin/reporting"), 2000);
    } catch {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* File picker */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          WordPress members export CSV
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Export from WordPress Admin &rsaquo; Paid Memberships Pro &rsaquo; Members. Use the same format as the migration seed export.
        </p>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-csl-mid transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {file ? (
            <div>
              <p className="text-sm font-semibold text-csl-dark">{file.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500">Click to select CSV file</p>
              <p className="text-xs text-gray-400 mt-0.5">pms-export-members-*.csv</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {/* As-of date */}
      <div>
        <label htmlFor="as_of_date" className="block text-sm font-semibold text-gray-700 mb-1.5">
          Export date (date the CSV was generated)
        </label>
        <p className="text-xs text-gray-500 mb-2">
          This date is shown on the dashboard so directors know how current the WordPress data is.
        </p>
        <input
          id="as_of_date"
          type="date"
          required
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-csl-dark w-48"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          <p className="font-semibold">Snapshot saved.</p>
          <p className="mt-0.5">
            {result.rows_parsed} rows parsed &mdash; {result.legacy_count} legacy-only members &mdash;{" "}
            {result.active_combined} combined active. Redirecting to dashboard...
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!file || !asOfDate || loading}
        className="bg-csl-dark text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-csl-mid transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Processing..." : "Upload and save snapshot"}
      </button>
    </form>
  );
}
