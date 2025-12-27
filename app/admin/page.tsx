"use client";

import { useEffect, useState } from "react";
import { Stethoscope, FileText, CheckCircle, XCircle } from "lucide-react";

type ReportStatus = "pending" | "approved" | "rejected";

type Report = {
  id: number;
  patient_name: string;
  report_type: string;
  report_date: string;
  status: ReportStatus;
  pdf_url: string | null;
  created_at: string;
};

function formatDate(dateString?: string) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedAction, setSelectedAction] =
    useState<ReportStatus | null>(null);
  const [updating, setUpdating] = useState(false);

  /* ---------------- FETCH REPORTS ---------------- */

  const fetchReports = async () => {
    setLoadingReports(true);
    setError(null);

    try {
      const res = await fetch("/api/reports", { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();

      // 🔒 HARD GUARD
      if (!Array.isArray(data)) {
        throw new Error("Invalid response format");
      }

      setReports(data);
    } catch (err) {
      console.error(err);
      setReports([]); // prevent map crash
      setError("Unable to load reports. Please try again later.");
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  /* ---------------- ACTION HANDLERS ---------------- */

  const openModal = (id: number, action: ReportStatus) => {
    setSelectedId(id);
    setSelectedAction(action);
    setModalOpen(true);
  };

  const cancelAction = () => {
    setModalOpen(false);
    setSelectedId(null);
    setSelectedAction(null);
  };

  const confirmAction = async () => {
    if (!selectedId || !selectedAction) return;

    setUpdating(true);

    try {
      const res = await fetch(`/api/reports/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedAction }),
      });

      if (!res.ok) throw new Error("Update failed");

      // update local state
      setReports((prev) =>
        prev.map((r) =>
          r.id === selectedId ? { ...r, status: selectedAction } : r
        )
      );

      cancelAction();
    } catch (err) {
      console.error(err);
      alert("Failed to update report. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    window.location.href = "/login";
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-8 flex justify-center">
      <div className="w-full max-w-6xl bg-white p-8 rounded-3xl shadow-xl border">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <Stethoscope className="w-9 h-9 text-blue-600" />
            <h1 className="text-3xl font-bold text-blue-700">
              Healthcare Report Review Portal
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700"
          >
            Logout
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full">
            <thead className="bg-blue-600 text-white">
              <tr>
                <th className="p-4 text-left">Report</th>
                <th className="p-4">Date</th>
                <th className="p-4">Status</th>
                <th className="p-4">PDF</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loadingReports ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">
                    Loading reports...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">
                    No reports available.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr
                    key={report.id}
                    className="border-b hover:bg-blue-50"
                  >
                    <td className="p-4 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      {report.patient_name} – {report.report_type}
                    </td>

                    <td className="p-4 text-center">
                      {formatDate(report.report_date)}
                    </td>

                    <td
                      className={`p-4 text-center font-semibold capitalize ${
                        report.status === "pending"
                          ? "text-yellow-600"
                          : report.status === "approved"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {report.status}
                    </td>

                    <td className="p-4 text-center">
                      {report.pdf_url ? (
                        <a
                          href={report.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline"
                        >
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="p-4 flex gap-3 justify-center">
                      <button
                        disabled={report.status !== "pending"}
                        onClick={() => openModal(report.id, "approved")}
                        className={`px-3 py-2 rounded-xl flex gap-2 items-center ${
                          report.status !== "pending"
                            ? "opacity-40 cursor-not-allowed bg-green-200"
                            : "bg-green-500 hover:bg-green-600 text-white"
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </button>

                      <button
                        disabled={report.status !== "pending"}
                        onClick={() => openModal(report.id, "rejected")}
                        className={`px-3 py-2 rounded-xl flex gap-2 items-center ${
                          report.status !== "pending"
                            ? "opacity-40 cursor-not-allowed bg-red-200"
                            : "bg-red-500 hover:bg-red-600 text-white"
                        }`}
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-96">
            <h2 className="text-xl font-bold mb-4 text-blue-700">
              Confirm Action
            </h2>
            <p className="mb-6 text-gray-700">
              Are you sure you want to mark this report as{" "}
              <span className="font-semibold">{selectedAction}</span>?
            </p>

            <div className="flex justify-end gap-4">
              <button
                onClick={cancelAction}
                className="px-4 py-2 bg-gray-200 rounded-xl"
              >
                No
              </button>
              <button
                onClick={confirmAction}
                disabled={updating}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
