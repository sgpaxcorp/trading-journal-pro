"use client";

import { useState, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Period = "daily" | "weekly" | "monthly";

export default function GrowthAccountSimulator() {
  const [startingBalance, setStartingBalance] = useState(1000);
  const [percent, setPercent] = useState(1);
  const [period, setPeriod] = useState<Period>("daily");
  const [days, setDays] = useState(20);

  // Build simulation rows
  const simulation = useMemo(() => {
    const rows: { day: number; balance: number }[] = [];
    let balance = startingBalance;

    const stepInterval =
      period === "daily" ? 1 : period === "weekly" ? 5 : 20; // monthly ≈ 20 trading days

    for (let day = 1; day <= days; day++) {
      if (day % stepInterval === 0) {
        balance = balance * (1 + (percent || 0) / 100);
      }
      rows.push({ day, balance });
    }

    return rows;
  }, [startingBalance, percent, period, days]);

  const endingBalance =
    simulation.length > 0
      ? simulation[simulation.length - 1].balance
      : startingBalance;

  const handleDownloadPdf = () => {
    const doc = new jsPDF();

    // Logo TJ
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(14, 12, 10, 10, 2, 2, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text("TJ", 19, 19, { align: "center" });

    // Marca
    doc.setTextColor(34, 197, 94);
    doc.setFontSize(16);
    doc.text("Trading Journal Pro", 30, 20);

    // Subtítulo
    doc.setTextColor(148, 163, 253);
    doc.setFontSize(11);
    doc.text("Growth Account Simulation Report", 14, 32);

    // Resumen
    doc.setFontSize(9);
    doc.text(
      `Starting balance: $${startingBalance.toFixed(
        2
      )} | Growth: ${percent || 0}% / ${period} | Trading days: ${days}`,
      14,
      40
    );
    doc.text(
      `Estimated ending balance: $${endingBalance.toFixed(2)}`,
      14,
      46
    );

    // Datos tabla
    const tableBody = simulation.map((row) => [
      row.day,
      `$${row.balance.toFixed(2)}`,
    ]);

    // Tabla con autoTable
    autoTable(doc, {
      head: [["Trading day", "Balance"]],
      body: tableBody,
      startY: 52,
      styles: {
        fontSize: 8,
      },
      headStyles: {
        fillColor: [22, 163, 74],
        textColor: [10, 10, 10],
      },
    });

    doc.save("tjp-growth-plan-report.pdf");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center px-6 py-10">
      <div className="max-w-2xl w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-semibold text-center mb-4 text-emerald-400">
          Growth Plan Simulator
        </h1>
        <p className="text-slate-400 text-center mb-8 text-sm">
          Estimate how your trading account can grow based on your balance, %
          return, trading frequency and number of trading days.
        </p>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          {/* Starting Balance */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Starting Balance
            </label>
            <input
              type="number"
              min={0}
              value={startingBalance}
              onChange={(e) =>
                setStartingBalance(
                  isNaN(parseFloat(e.target.value))
                    ? 0
                    : parseFloat(e.target.value)
                )
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-emerald-400 text-sm"
              placeholder="e.g. 1,000"
            />
          </div>

          {/* Percentage */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Growth % per selected period
            </label>
            <input
              type="number"
              step="0.1"
              value={percent}
              onChange={(e) =>
                setPercent(
                  isNaN(parseFloat(e.target.value))
                    ? 0
                    : parseFloat(e.target.value)
                )
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-emerald-400 text-sm"
              placeholder="e.g. 1.5"
            />
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Frequency
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-emerald-400 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">
                Weekly (applies every 5 trading days)
              </option>
              <option value="monthly">
                Monthly (applies every 20 trading days)
              </option>
            </select>
          </div>

          {/* Trading Days */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Trading Days
            </label>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) =>
                setDays(
                  isNaN(parseInt(e.target.value))
                    ? 0
                    : parseInt(e.target.value, 10)
                )
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-emerald-400 text-sm"
              placeholder="e.g. 20"
            />
          </div>
        </div>

        {/* Result */}
        <div className="text-center mt-4">
          <h2 className="text-lg font-semibold text-slate-200 mb-2">
            Estimated Ending Balance:
          </h2>
          <p className="text-3xl font-bold text-emerald-400">
            ${endingBalance.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Based on {percent || 0}% {period} growth for {days} trading days.
          </p>
        </div>

        {/* Table preview */}
        <div className="mt-6">
          <p className="text-[11px] font-semibold text-slate-200 mb-2">
            Projection preview
          </p>
          <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-lg text-[10px]">
            <table className="w-full border-collapse">
              <thead className="bg-slate-900/90 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-1.5 text-left text-slate-300">
                    Trading day
                  </th>
                  <th className="px-3 py-1.5 text-left text-slate-300">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {simulation.map((row) => (
                  <tr
                    key={row.day}
                    className="odd:bg-slate-950/80 even:bg-slate-900/80"
                  >
                    <td className="px-3 py-1.5 text-slate-400">
                      {row.day}
                    </td>
                    <td className="px-3 py-1.5 text-emerald-300">
                      ${row.balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {simulation.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-3 py-3 text-center text-slate-500"
                    >
                      Adjust inputs to see the projection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="text-center mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleDownloadPdf}
            className="inline-block px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition shadow-lg shadow-emerald-500/25"
          >
            Download PDF report
          </button>
          <a
            href="/"
            className="inline-block px-6 py-2.5 rounded-xl border border-slate-700 text-[10px] text-slate-300 hover:border-emerald-400 hover:text-emerald-300 transition"
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </main>
  );
}
