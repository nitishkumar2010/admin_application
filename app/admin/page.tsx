"use client";

import { useEffect, useState } from "react";
import { Stethoscope, FileText, CheckCircle, XCircle } from "lucide-react";
import prisma from "@/lib/prisma";

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

function formatDate(dateString: string) {
  if (!dateString) return "—";

  const date = new Date(dateString);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC", // ✅ CRITICAL FIX
  });
}


export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedAction, setSelectedAction] = useState<ReportStatus | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  // Fetch reports from API
  const fetchReports = async () => {
    try {
      const res = await fetch("/api/reports");
      const data = await res.json();
      setReports(data);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

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
    if (selectedId === null || selectedAction === null) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${selectedId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: selectedAction }),
      });

      if (!res.ok) throw new Error("Failed to update report status");

      // Update local state
      setReports((prev) =>
        prev.map((r) =>
          r.id === selectedId ? { ...r, status: selectedAction } : r
        )
      );
      setModalOpen(false);
      setSelectedId(null);
      setSelectedAction(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update report status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-8 flex justify-center">
      <div className="w-full max-w-6xl bg-white p-8 rounded-3xl shadow-xl border border-blue-100">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <Stethoscope className="w-10 h-10 text-blue-600" />
            <h1 className="text-3xl font-bold text-blue-700">
              Healthcare Report Review Portal
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700 shadow-md"
          >
            Logout
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
          <table className="w-full table-auto">
            <thead>
              <tr className="bg-blue-600 text-white text-left">
                <th className="p-4 font-medium">Report Name</th>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">PDF</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">
                    No reports available.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr
                    key={report.id}
                    className="border-b hover:bg-blue-50 transition-all"
                  >
                    <td className="p-4 font-medium text-gray-700 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-500" />{" "}
                      {report.patient_name} - {report.report_type}
                    </td>
                    <td className="p-4 text-gray-600">{formatDate(report.report_date)}</td>
                    <td
                      className={`p-4 font-semibold capitalize ${
                        report.status === "pending"
                          ? "text-yellow-600"
                          : report.status === "approved"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {report.status}
                    </td>
                    <td className="p-4">
                      {report.pdf_url ? (
                        <a
                          href={report.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline hover:text-blue-800"
                        >
                          View PDF
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-4 flex gap-3">
                      <button
                        onClick={() => openModal(report.id, "approved")}
                        disabled={report.status !== "pending"}
                        className={`px-4 py-2 rounded-xl flex items-center gap-2 shadow ${
                          report.status !== "pending"
                            ? "opacity-40 cursor-not-allowed bg-green-200"
                            : "bg-green-500 hover:bg-green-600 text-white"
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                      <button
                        onClick={() => openModal(report.id, "rejected")}
                        disabled={report.status !== "pending"}
                        className={`px-4 py-2 rounded-xl flex items-center gap-2 shadow ${
                          report.status !== "pending"
                            ? "opacity-40 cursor-not-allowed bg-red-200"
                            : "bg-red-500 hover:bg-red-600 text-white"
                        }`}
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-96 border border-blue-100">
            <h2 className="text-xl font-bold text-blue-700 mb-4">Confirm Action</h2>
            <p className="text-gray-700 mb-6">
              Are you sure you want to mark this report as{" "}
              <span className="font-semibold text-blue-700">{selectedAction}</span>?
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={cancelAction}
                className="px-5 py-2 rounded-xl bg-gray-200 hover:bg-gray-300"
              >
                No
              </button>
              <button
                onClick={confirmAction}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                disabled={loading}
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
