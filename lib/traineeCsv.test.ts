import { describe, expect, it } from "vitest";
import { parseTraineeCsv, planTraineeImport } from "./traineeCsv";

describe("parseTraineeCsv", () => {
  it("reads first, last, email columns and skips a header row", () => {
    const rows = parseTraineeCsv("First,Last,Email\nRick,Abruzzo,rick@example.com\nMaggie,Ennis,\n");
    expect(rows).toEqual([
      { line: 2, firstName: "Rick", lastName: "Abruzzo", email: "rick@example.com", raw: "Rick,Abruzzo,rick@example.com" },
      { line: 3, firstName: "Maggie", lastName: "Ennis", email: null, raw: "Maggie,Ennis," },
    ]);
  });

  it("handles a BOM, CRLF line endings and quoted fields with commas", () => {
    const rows = parseTraineeCsv('﻿"first name","last name","e-mail"\r\n"Rick","Abruzzo, Jr.","rick@example.com"\r\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].lastName).toBe("Abruzzo, Jr.");
    expect(rows[0].email).toBe("rick@example.com");
  });

  it("splits a single 'First Last' cell on the last space", () => {
    const rows = parseTraineeCsv("Mary Ann Smith\nRick Abruzzo,rick@example.com\n");
    expect(rows[0]).toMatchObject({ firstName: "Mary Ann", lastName: "Smith", email: null });
    expect(rows[1]).toMatchObject({ firstName: "Rick", lastName: "Abruzzo", email: "rick@example.com" });
  });

  it("treats a second cell with an @ as the email even when the name is one word", () => {
    // A "Name,Email" sheet: the email must never end up as somebody's last name.
    const rows = parseTraineeCsv("Rick,rick@example.com\n");
    expect(rows[0]).toMatchObject({ firstName: "Rick", lastName: "", email: "rick@example.com" });
  });

  it("keeps a row with no last name so the plan can report it", () => {
    const rows = parseTraineeCsv("Cher\n");
    expect(rows[0]).toMatchObject({ firstName: "Cher", lastName: "", email: null });
  });

  it("ignores blank lines", () => {
    expect(parseTraineeCsv("\n\nRick,Abruzzo\n\n")).toHaveLength(1);
  });
});

describe("planTraineeImport", () => {
  const existing = [
    { id: "rick-abruzzo-5zzj", firstName: "Rick", lastName: "Abruzzo", email: undefined },
    { id: "maggie-ennis-1abc", firstName: "Maggie", lastName: "Ennis", email: "maggie@example.com" },
  ];

  it("creates new names, fills in emails for matching names, and skips unchanged ones", () => {
    const plan = planTraineeImport(
      parseTraineeCsv("New,Person,new@example.com\nrick,ABRUZZO,rick@example.com\nMaggie,Ennis,maggie@example.com\n"),
      existing
    );
    expect(plan.create).toEqual([{ firstName: "New", lastName: "Person", email: "new@example.com" }]);
    expect(plan.update).toEqual([{ id: "rick-abruzzo-5zzj", firstName: "Rick", lastName: "Abruzzo", email: "rick@example.com" }]);
    expect(plan.skip).toEqual([{ line: 3, raw: "Maggie,Ennis,maggie@example.com", reason: "already in the system, no changes" }]);
  });

  it("skips rows with no last name or a bad email, and duplicate rows", () => {
    const plan = planTraineeImport(
      parseTraineeCsv("Cher\nNew,Person,not-an-email\nNew,Person,new@example.com\nnew,person,new@example.com\nOther,Name,new@example.com\n"),
      []
    );
    expect(plan.create).toEqual([{ firstName: "New", lastName: "Person", email: "new@example.com" }]);
    expect(plan.skip.map((s) => [s.line, s.reason])).toEqual([
      [1, "missing last name"],
      [2, "invalid email"],
      [4, "duplicate row"],
      [5, "duplicate row"],
    ]);
  });

  it("skips a row whose email already belongs to a different trainee", () => {
    const plan = planTraineeImport(parseTraineeCsv("Someone,Else,maggie@example.com\n"), existing);
    expect(plan.create).toEqual([]);
    expect(plan.skip).toEqual([{ line: 1, raw: "Someone,Else,maggie@example.com", reason: "email already belongs to Maggie Ennis" }]);
  });

  it("skips rows whose name cells look like an email", () => {
    const plan = planTraineeImport(parseTraineeCsv("rick@example.com,Abruzzo,rick@example.com\nRick,rick@example.com\n"), []);
    expect(plan.create).toEqual([]);
    expect(plan.skip.map((s) => s.reason)).toEqual(["name looks like an email", "missing last name"]);
  });

  it("creates a trainee without an email when the column is empty", () => {
    const plan = planTraineeImport(parseTraineeCsv("New,Person\n"), []);
    expect(plan.create).toEqual([{ firstName: "New", lastName: "Person", email: null }]);
  });
});
