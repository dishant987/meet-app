// Run: npm test (plain Node, no browser needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changePasswordForm,
  chatMessageForm,
  check,
  displayNameForm,
  joinCodeForm,
  notesForm,
  resetForm,
  signInForm,
  signUpForm,
} from "./validation.ts";

test("sign up: one clear message per field, first problem wins", () => {
  assert.deepEqual(check(signUpForm, { name: "  ", email: "", password: "" }).errors, {
    name: "Enter your name",
    email: "Enter your email",
    password: "Enter a password",
  });
  assert.deepEqual(check(signUpForm, { name: "A", email: "nope", password: "short" }).errors, {
    email: "That doesn't look like an email address",
    password: "Use at least 8 characters",
  });
  assert.equal(check(signUpForm, { name: "A".repeat(51), email: "a@b.co", password: "12345678" }).errors?.name, "Keep your name under 50 characters");
});

test("clean data comes back trimmed, email lower-cased", () => {
  const r = check(signUpForm, { name: "  Asha ", email: "  Asha@Example.COM ", password: "password1" });
  assert.deepEqual(r.data, { name: "Asha", email: "asha@example.com", password: "password1" });
  assert.equal(check(signInForm, { email: "a@b.co", password: "" }).errors?.password, "Enter your password");
});

test("passwords must match", () => {
  assert.equal(check(resetForm, { password: "password1", confirm: "password2" }).errors?.confirm, "The two passwords don't match");
  assert.equal(check(resetForm, { password: "password1", confirm: "password1" }).errors, null);
  assert.equal(
    check(changePasswordForm(true), { currentPassword: "", newPassword: "password1", confirm: "password1" }).errors?.currentPassword,
    "Enter your current password",
  );
  assert.equal(check(changePasswordForm(false), { newPassword: "password1", confirm: "password1" }).errors, null); // Google account
});

test("join box accepts a code or a link and returns the code", () => {
  assert.equal(check(joinCodeForm, { code: " ABC-defg-hij " }).data?.code, "abc-defg-hij");
  assert.equal(check(joinCodeForm, { code: "https://meet-app-xi.vercel.app/m/abc-defg-hij" }).data?.code, "abc-defg-hij");
  assert.equal(check(joinCodeForm, { code: "hello" }).errors?.code, "Enter a code like abc-defg-hij or paste the meeting link");
  assert.equal(check(joinCodeForm, { code: "" }).errors?.code, "Enter a meeting code or link");
});

test("call name, chat and notes limits", () => {
  assert.equal(check(displayNameForm, { name: " " }).errors?.name, "Add your name so others know who joined");
  assert.equal(check(chatMessageForm, { message: "x".repeat(1001) }).errors?.message, "Messages can be up to 1000 characters");
  const notes = { title: "T", summary: "", keyPoints: [], decisions: [], openQuestions: [], actionItems: [] };
  assert.equal(check(notesForm, notes).errors, null);
  assert.equal(check(notesForm, { ...notes, keyPoints: Array(51).fill("a") }).errors?.keyPoints, "Key points: up to 50 lines");
  assert.equal(
    check(notesForm, { ...notes, actionItems: [{ task: "Do it", owner: "x".repeat(101), dueDate: null }] }).errors?.actionItems,
    "Owner names can be up to 100 characters",
  );
});
