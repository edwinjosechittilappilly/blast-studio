export const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'bstudio' };
export const campaignPath = (slug, action) => `/api/projects/${encodeURIComponent(slug)}/${action}`;
export async function api(path, options) {
  const response = await fetch(path, options);
  if (response.status === 401) { window.dispatchEvent(new Event('session-expired')); throw new Error('Session expired'); }
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Request failed'); error.status = response.status; throw error; }
  return data;
}
export async function startFeedbackJob(campaign) {
  return api('/api/jobs', { method: 'POST', headers, body: JSON.stringify({ op: 'revise', campaign, args: { feedbackOnly: true } }) });
}
export async function feedbackJobStatus(campaign) {
  const jobs = await api(`/api/jobs?campaign=${encodeURIComponent(campaign)}`);
  const job = jobs.filter(item => item.operation === 'revise').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!job) return { running: false, staleLock: false, exitCode: null, lines: [] };
  const { log } = await api(`/api/jobs/${encodeURIComponent(job.id)}/log?tail=100`);
  return { running: job.state === 'running' || job.state === 'queued', staleLock: false, exitCode: job.state === 'succeeded' ? 0 : job.state === 'failed' || job.state === 'cancelled' ? job.exitCode ?? 1 : null, lines: log ? log.split('\n') : [] };
}
