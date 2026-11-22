// The REST fallback for `gh pr view` / `gh pr checks`, which use GraphQL and fail where only the REST API is open (pure: REST JSON in,
// the gh pr view shape out, so collect has one code path after reading).
const GHOST = { login: 'ghost' };
const author = u => (u?.login ? { login: u.login } : GHOST);
const list = v => (Array.isArray(v) ? v : []);

/** rest: { pr, commits, comments, reviewComments, reviews } from the REST API -> the `gh pr view --json` fields collect reads. */
export function prFromRest(rest) {
  const { pr } = rest;
  return {
    number: pr.number, title: pr.title, url: pr.html_url, mergedAt: pr.merged_at ?? null, headRefName: pr.head?.ref, baseRefName: pr.base?.ref,
    commits: list(rest.commits).map(c => ({ oid: c.sha, committedDate: c.commit?.committer?.date, messageHeadline: String(c.commit?.message ?? '').split('\n')[0] })),
    comments: [
      ...list(rest.comments).map(c => ({ author: author(c.user), body: c.body, createdAt: c.created_at })),
      ...list(rest.reviewComments).map(c => ({ author: author(c.user), body: c.body, createdAt: c.created_at, path: c.path, line: c.line })),
    ],
    reviews: list(rest.reviews).map(r => ({ author: author(r.user), body: r.body, state: r.state, submittedAt: r.submitted_at })),
  };
}

/** REST check runs -> one line per check: name, conclusion (or status while running), url. */
export const checksFromRest = json => list(json?.check_runs).map(c => `${c.name}\t${c.conclusion ?? c.status}\t${c.html_url}\n`).join('');
