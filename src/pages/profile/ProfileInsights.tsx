import { useEffect, useState } from "react";
import { api } from "../../services/api";

export default function ProfileInsights({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.insights()
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err?.message || "Could not load your food insights."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const topCuisines = Array.isArray(data?.topCuisines) ? data.topCuisines : [];
  const activityCounts = data?.activityCounts && typeof data.activityCounts === "object" ? data.activityCounts : {};
  const recentActivity = Object.entries(activityCounts).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 5);

  return (
    <section className="profile-insights-page">
      <div className="profile-subpage-header">
        <button type="button" className="profile-back" onClick={onBack} aria-label="Back"><span aria-hidden="true">‹</span></button>
        <div><span className="eyebrow">YOUR KIKU PATTERNS</span><h2>Food insights</h2><p>See patterns from the activity Kiku has observed in your account.</p></div>
      </div>

      {loading ? <div className="profile-card"><p className="profile-insights-muted">Loading your insights…</p></div> : null}
      {error ? <div className="profile-card profile-insights-error"><strong>Insights unavailable</strong><p>{error}</p></div> : null}

      {!loading && !error ? (
        <div className="profile-insights-grid">
          <article className="profile-card profile-insights-card">
            <div className="profile-card-heading"><div><strong>Top cuisines</strong><span>Most common cuisine signals in your activity</span></div></div>
            {topCuisines.length ? (
              <div className="profile-insights-list">
                {topCuisines.map((item) => <div key={item.name} className="profile-insights-row"><span>{item.name}</span><strong>{item.count}</strong></div>)}
              </div>
            ) : <p className="profile-insights-muted">Not enough activity yet.</p>}
          </article>

          <article className="profile-card profile-insights-card">
            <div className="profile-card-heading"><div><strong>Common budget</strong><span>Most frequent price range from observed activity</span></div></div>
            {data?.commonBudget ? (
              <div className="profile-insights-budget">₹{data.commonBudget.min}–₹{data.commonBudget.max}</div>
            ) : <p className="profile-insights-muted">No price pattern yet.</p>}
          </article>

          <article className="profile-card profile-insights-card profile-insights-wide">
            <div className="profile-card-heading"><div><strong>Recent activity patterns</strong><span>Signals that can help Kiku personalize recommendations</span></div></div>
            {recentActivity.length ? (
              <div className="profile-insights-list">
                {recentActivity.map(([name, count]) => <div key={name} className="profile-insights-row"><span>{String(name).replace(/_/g, " ")}</span><strong>{String(count)}</strong></div>)}
              </div>
            ) : <p className="profile-insights-muted">Not enough activity yet.</p>}
          </article>
        </div>
      ) : null}
    </section>
  );
}
