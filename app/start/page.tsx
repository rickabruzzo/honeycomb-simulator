import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { StartButton } from "@/components/StartButton";
import { nameParts } from "@/lib/auth/traineeForUser";
import { findTraineeByEmail } from "@/lib/traineeStore";

/**
 * The generic booth-training link. The signed-in Google account says who this is: their email
 * finds their trainee record (or one is created from their Google name), then everyone follows
 * the same order: the study-guide quiz first, and after a C or better, a practice session
 * against a random attendee. The server (/api/start) decides where they go.
 */
export default async function StartPage() {
  const session = await auth();
  const user = session?.user;
  if (!user?.email) redirect("/signin?callbackUrl=%2Fstart");

  const known = await findTraineeByEmail(user.email);
  const { firstName, lastName } = known ?? nameParts({ email: user.email, name: user.name, givenName: user.givenName, familyName: user.familyName });
  const fullName = `${firstName} ${lastName}`.trim();

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-white/7 p-6 sm:p-7 shadow-sm flex flex-col gap-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">Booth training</span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold text-white">
            {known ? `Welcome back, ${firstName}` : `Hi, ${firstName}`}
          </h1>
          <p className="text-sm leading-relaxed text-white/65">
            You&apos;re <strong className="text-white">{fullName}</strong>{" "}
            <span className="text-white/45">({user.email})</span>.{" "}
            {known
              ? "Pick up where you left off: the quiz if you haven't passed yet, otherwise your practice session."
              : "You'll take the booth quiz first (a C or better unlocks the simulator), then practice a conversation with a simulated attendee."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button type="submit" className="text-sm text-white/60 underline underline-offset-4 hover:text-white">
              Not you? Sign out
            </button>
          </form>
          <StartButton label={known ? "Continue →" : "Start →"} />
        </div>
      </div>
    </div>
  );
}
