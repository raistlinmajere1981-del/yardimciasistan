import { runCommand } from "./runners/exec.mjs";

/**
 * Günlük Git işlemleri. Kullanıcı Git'i yeni öğreniyor; her işlemin
 * gerçek karşılığı UI'da gösterilir (GIT_OPS[].git).
 * İlk sürümde YOK: force push, reset --hard, history rewrite,
 * interactive rebase, reflog, otomatik conflict çözme.
 */

const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;

function git(args, mode = "capture") {
  return runCommand({ command: "git", args, cwd: "repo", mode });
}

export const GIT_OPS = [
  { id: "status", title: "Durum (status)", git: "git status --short --branch" },
  { id: "diff", title: "Farkları göster (diff)", git: "git diff" },
  { id: "diff-staged", title: "Stagelenmiş fark (diff --cached)", git: "git diff --cached" },
  { id: "log", title: "Son commitler (log -15)", git: "git log --oneline -15" },
  { id: "branches", title: "Branch listesi", git: "git branch -vv" },
  { id: "fetch", title: "Fetch (uzak değişiklikleri al)", git: "git fetch --prune" },
  { id: "pull", title: "Pull (fetch + merge)", git: "git pull --ff-only" },
  { id: "push", title: "Push", git: "git push" },
  { id: "commit", title: "Commit oluştur", git: "git add -A / git commit -m <mesaj>" },
  { id: "commit-push", title: "Commit + Push", git: "git commit + git push" },
  { id: "switch", title: "Branch değiştir", git: "git switch <branch>" },
  { id: "create", title: "Yeni branch oluştur", git: "git switch -c <branch>" },
  { id: "merge", title: "Merge (kaynak → hedef)", git: "git switch <hedef> + git merge <kaynak>" },
  { id: "delete", title: "Branch sil (güvenli -d)", git: "git branch -d <branch>" },
];

function validBranch(name) {
  return BRANCH_RE.test(name) && !name.startsWith("-") && !name.includes("..");
}

export async function gitStatus() { return git(["status", "--short", "--branch"]); }
export async function gitDiff(staged = false) { return staged ? git(["diff", "--cached"]) : git(["diff"]); }
export async function gitLog(n = 15) { return git(["log", `--max-count=${n}`, "--oneline", "--decorate"]); }
export async function gitBranches() { return git(["branch", "-vv"]); }
export async function gitBranchNames() { return git(["branch", "--format=%(refname:short)"]); }
export async function gitFetch() { return git(["fetch", "--prune"]); }
export async function gitPull() { return git(["pull", "--ff-only"]); }
export async function gitPush() { return git(["push"]); }

export async function gitChangedFiles() {
  const [unstaged, staged] = await Promise.all([
    git(["diff", "--name-status"]),
    git(["diff", "--cached", "--name-status"]),
  ]);
  return { unstaged, staged };
}

export async function gitCommit(message, stageAll) {
  if (!message.trim()) return { exitCode: 2, stdout: "", stderr: "Commit mesajı boş olamaz.", durationMs: 0, timedOut: false };
  if (stageAll) {
    const add = await git(["add", "-A"]);
    if (add.exitCode !== 0) return add;
  }
  return git(["commit", "-m", message]);
}

export async function gitSwitch(branch) {
  if (!validBranch(branch)) return { exitCode: 2, stdout: "", stderr: `Geçersiz branch adı: ${branch}`, durationMs: 0, timedOut: false };
  return git(["switch", branch]);
}

export async function gitCreate(branch) {
  if (!validBranch(branch)) return { exitCode: 2, stdout: "", stderr: `Geçersiz branch adı: ${branch}`, durationMs: 0, timedOut: false };
  return git(["switch", "-c", branch]);
}

export async function gitMergePlan(source, target) {
  return `Kaynak branch: ${source}\nHedef: ${target}\n\nYapılacak işlem:\n\ngit switch ${target}\ngit merge ${source}\n`;
}

export async function gitMerge(source, target) {
  if (!validBranch(source) || !validBranch(target)) {
    return { exitCode: 2, stdout: "", stderr: "Geçersiz branch adı.", durationMs: 0, timedOut: false };
  }
  const sw = await git(["switch", target]);
  if (sw.exitCode !== 0) return sw;
  const mg = await git(["merge", "--no-edit", source]);
  return { ...mg, stdout: `${await gitMergePlan(source, target)}\n${mg.stdout}` };
}

export async function gitDelete(branch) {
  if (!validBranch(branch)) return { exitCode: 2, stdout: "", stderr: `Geçersiz branch adı: ${branch}`, durationMs: 0, timedOut: false };
  return git(["branch", "-d", branch]);
}
