import {
  findTraineeByEmail,
  findTraineeByName,
  generateTraineeId,
  getTrainee,
  normalizeEmail,
  upsertTrainee,
  type Trainee,
} from "../traineeStore";

/**
 * The trainee record for a signed-in Google user. Email is the identity: it finds their record,
 * or one is created from their Google name. A same-name record with no email (added by an admin
 * or a CSV before sign-in existed) gets the email attached rather than duplicated.
 */
export interface GoogleUser {
  email: string;
  name?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}

export function nameParts(user: GoogleUser): { firstName: string; lastName: string } {
  const given = user.givenName?.trim();
  const family = user.familyName?.trim();
  if (given) return { firstName: given, lastName: family ?? "" };
  const display = user.name?.trim();
  if (display) {
    const at = display.lastIndexOf(" ");
    return at > 0
      ? { firstName: display.slice(0, at).trim(), lastName: display.slice(at + 1).trim() }
      : { firstName: display, lastName: "" };
  }
  return { firstName: user.email.split("@")[0], lastName: "" };
}

export async function traineeForUser(user: GoogleUser): Promise<Trainee> {
  const email = normalizeEmail(user.email);
  if (!email) throw new Error("Signed-in user has no usable email");

  const byEmail = await findTraineeByEmail(email);
  if (byEmail) return byEmail;

  const { firstName, lastName } = nameParts(user);
  const sameName = lastName ? await findTraineeByName(firstName, lastName) : null;
  if (sameName && !sameName.email) {
    return upsertTrainee({ ...sameName, email });
  }
  // A same-name record that belongs to someone else (it has a different email) stays theirs: pass
  // an explicit, unused id so upsertTrainee's dedupe-by-name cannot hand their record to this user.
  let id = generateTraineeId(firstName, lastName);
  for (let attempt = 0; attempt < 5 && (await getTrainee(id)); attempt++) {
    id = generateTraineeId(firstName, lastName);
  }
  return upsertTrainee({ id, firstName, lastName, email });
}
