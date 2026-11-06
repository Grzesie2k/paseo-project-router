import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { routeForCwd } from "../server/routing.js";
import { settingsSchema } from "../shared/settings.js";

let home: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd,
    stdio: "ignore",
  });

const settings = () =>
  settingsSchema.parse({
    routes: [
      { name: "acme", paths: ["~/work/acme"], profileId: "acme-profile" },
      { name: "acme-labs", paths: ["~/work/acme/labs"], profileId: "labs-profile" },
      { name: "oss", paths: ["~/oss"], profileId: "oss-profile" },
    ],
  });

const nameOf = async (cwd: string, s = settings()) => {
  const selected = await routeForCwd(cwd, s, home);
  return selected ? (selected.kind === "route" ? selected.target.name : "fallback") : null;
};

beforeAll(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "router-home-")));
  for (const dir of ["work/acme", "work/acme/labs/tool", "work/acme-other", "oss/lib", "scratch"]) {
    mkdirSync(join(home, dir), { recursive: true });
  }
  git(join(home, "work/acme"), "init", "-q");
  git(join(home, "work/acme"), "commit", "-q", "--allow-empty", "-m", "init");
  git(join(home, "oss/lib"), "init", "-q");
});

afterAll(() => rmSync(home, { recursive: true, force: true }));

describe("routing", () => {
  it("routes a main repo by its path", async () => {
    expect(await nameOf(join(home, "work/acme"))).toBe("acme");
  });

  it("routes a worktree to the route of its main repo", async () => {
    const wt = join(home, "scratch/feature-wt");
    git(join(home, "work/acme"), "worktree", "add", "-q", "-b", "feature", wt);
    expect(await nameOf(wt)).toBe("acme");
  });

  it("returns null for a path outside every route without fallback", async () => {
    expect(await nameOf(join(home, "scratch"))).toBeNull();
  });

  it("uses the fallback for a path outside every route", async () => {
    const s = settingsSchema.parse({
      ...settings(),
      fallback: { profileId: "default-profile" },
    });
    expect(await nameOf(join(home, "scratch"), s)).toBe("fallback");
  });

  it("uses cwd when the directory is not in git", async () => {
    expect(await nameOf(join(home, "oss"))).toBe("oss");
    expect(await nameOf(join(home, "work/acme/labs/tool"))).toBe("acme");
  });

  it("picks the longest matching prefix", async () => {
    const tool = join(home, "work/acme/labs/tool");
    git(tool, "init", "-q");
    expect(await nameOf(tool)).toBe("acme-labs");
  });

  it("does not match a sibling that only shares a name prefix", async () => {
    expect(await nameOf(join(home, "work/acme-other"))).toBeNull();
  });

  it("is a no-op without routes and fallback", async () => {
    expect(await nameOf(join(home, "work/acme"), settingsSchema.parse({}))).toBeNull();
  });
});
