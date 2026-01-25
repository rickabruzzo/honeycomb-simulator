import React from "react";
import Link from "next/link";
import { TopNav } from "../../components/TopNav";
import { getAdminInvites, AdminInviteRow } from "../../lib/adminInvites";
import { ExternalLink } from "lucide-react";

function StatusBadge({ status }: { status: AdminInviteRow["status"] }) {
  const styles = {
    NOT_STARTED:
      "bg-white/10 text-white/70 border border-white/10 px-2 py-1 rounded text-xs font-medium",
    IN_PROGRESS:
      "bg-sky-500/15 text-sky-200 border border-sky-400/20 px-2 py-1 rounded text-xs font-medium",
    COMPLETED:
      "bg-emerald-500/15 text-emerald-200 border border-emerald-400/20 px-2 py-1 rounded text-xs font-medium",
  };

  const labels = {
    NOT_STARTED: "Not Started",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
  };

  return <span className={styles[status]}>{labels[status]}</span>;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TokenDisplay({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false);
  const short = `${token.slice(0, 8)}…`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: just show the copied state
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="text-xs text-gray-400 font-mono">{short}</code>
      <button
        onClick={handleCopy}
        className={`text-xs px-1.5 py-0.5 rounded transition ${
          copied
            ? "bg-emerald-500/20 text-emerald-200"
            : "bg-white/5 hover:bg-white/10 text-gray-400"
        }`}
      >
        {copied ? "✓" : "Copy"}
      </button>
    </div>
  );
}

export default async function AdminPage() {
  const invites = await getAdminInvites(50);

  return (
    <div className="min-h-screen text-gray-100">
      <TopNav />
      <div className="max-w-7xl mx-auto p-6 space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-white/70 text-sm">
            Internal training links and session status
          </p>
        </div>

        {/* Invites Table */}
        {invites.length === 0 ? (
          <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
            <p className="text-gray-400">
              No invites yet. Create one from the trainer dashboard.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-white/15 bg-white/7 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Token
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Persona
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Difficulty
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {invites.map((invite) => (
                    <tr
                      key={invite.token}
                      className="hover:bg-white/5 transition"
                    >
                      <td className="px-4 py-3">
                        <TokenDisplay token={invite.token} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {invite.personaName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 capitalize">
                        {invite.difficulty || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {formatDate(invite.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={invite.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/s/${invite.token}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#51368D] hover:bg-[#431E80] text-white transition"
                          >
                            <ExternalLink size={12} /> Trainee
                          </Link>
                          <Link
                            href={`/share/${invite.token}`}
                            target="_blank"
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition ${
                              invite.status === "COMPLETED"
                                ? "bg-[#64BA00] hover:bg-[#4CA600] text-gray-950"
                                : "bg-white/5 text-gray-500 cursor-not-allowed pointer-events-none"
                            }`}
                          >
                            <ExternalLink size={12} /> Score
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
