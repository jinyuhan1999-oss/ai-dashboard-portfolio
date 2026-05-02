import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DollarSign, Percent, Sparkles, Target, TrendingDown, TrendingUp, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function apiUrl(path: string): string {
  return `https://ai-backend-api-srft.onrender.com${path}`;
}

type Overview = {
  risk_users_today: number;
  trend: string;
  threatened_gmv: number;
  accuracy_rate: number;
  retention_rate: number;
  retention_holdout_uplift_pp?: number;
};

type QueueUser = {
  user_id: string;
  nickname: string;
  avatar_url: string;
  churn_probability: number;
  ltv_tier: "high" | "low";
  potential_loss: number;
  processed: boolean;
  main_category: string;
  lifecycle_status: string;
  open_ticket: boolean;
  risk_level: string;
};

type Diagnosis = {
  user_id: string;
  churn_probability: number;
  main_category: string;
  lifecycle_status: string;
  open_ticket: boolean;
  risk_level: string;
  profile: { label: string; value: string }[];
  shap_data: { feature: string; value: number }[];
  ai_suggestion: string;
  actions: { id: string; label: string; variant: "primary" | "outline" }[];
  economics: {
    intervention_cost: number;
    expected_recover_gmv: number;
    roi_multiple: number;
  };
};

function trendPositive(trend: string): boolean {
  const t = trend.trim();
  return t.startsWith("+") || (!t.startsWith("-") && !t.includes("-"));
}

/** 流失概率（0–1）：≥75% 红色，50%–75% 橙色，其余偏低危为中性色 */
function churnProbabilityTextClass(probability: number): string {
  if (probability >= 0.75) return "text-red-600";
  if (probability >= 0.5) return "text-orange-600";
  return "text-slate-600";
}

const PROFILE_GRID_ORDER = ["注册时长", "累计消费", "退货次数", "最近活跃"] as const;

function orderedProfileForGrid(profile: { label: string; value: string }[]) {
  const map = Object.fromEntries(profile.map((p) => [p.label, p.value]));
  return PROFILE_GRID_ORDER.map((label) => ({ label, value: map[label] ?? "—" }));
}

const SHAP_POSITIVE = "#e11d48";
const SHAP_NEGATIVE = "#10b981";

const SENIOR_CS_ACTION_ID = "senior_cs_call";

const GLASS_PANEL =
  "backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.05)]";

const PRIMARY_GLOW_CTA =
  "border-0 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 text-white font-bold tracking-wide shadow-[0_0_20px_rgba(99,102,241,0.5)] hover:scale-105 hover:shadow-[0_0_30px_rgba(99,102,241,0.8)] hover:!bg-gradient-to-r hover:!from-blue-600 hover:!via-indigo-500 hover:!to-purple-600 transition-all duration-300";

export default function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<QueueUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [acting, setActing] = useState(false);
  const [autopilotOn, setAutopilotOn] = useState(true);

  const loadOverview = useCallback(async () => {
    const res = await fetch(apiUrl("/api/overview"));
    if (!res.ok) throw new Error("overview failed");
    setOverview(await res.json());
  }, []);

  const loadUsers = useCallback(async (): Promise<QueueUser[]> => {
    const res = await fetch(apiUrl("/api/users"));
    if (!res.ok) throw new Error("users failed");
    const data: QueueUser[] = await res.json();
    setUsers(data);
    return data;
  }, []);

  useEffect(() => {
    void loadOverview().catch(console.error);
    void loadUsers()
      .then((list) => {
        const firstOpen = list.find((u) => !u.processed);
        setSelectedId(firstOpen?.user_id ?? list[0]?.user_id ?? null);
      })
      .catch(console.error);
  }, [loadOverview, loadUsers]);

  useEffect(() => {
    if (!selectedId) {
      setDiagnosis(null);
      return;
    }
    let cancelled = false;
    setLoadingDiag(true);
    void fetch(apiUrl(`/api/users/${selectedId}/diagnosis`))
      .then(async (res) => {
        if (!res.ok) throw new Error("diagnosis failed");
        return res.json() as Promise<Diagnosis>;
      })
      .then((d) => {
        if (!cancelled) setDiagnosis(d);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoadingDiag(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedUser = useMemo(() => users.find((u) => u.user_id === selectedId), [users, selectedId]);

  const chartData = diagnosis?.shap_data ?? [];
  const maxAbs = Math.max(0.01, ...chartData.map((d) => Math.abs(d.value)));

  const openTicketFrozen = diagnosis?.open_ticket === true || selectedUser?.open_ticket === true;

  const handleAction = async (actionId: string) => {
    if (!selectedId || acting) return;
    setActing(true);
    try {
      const res = await fetch(apiUrl(`/api/users/${selectedId}/action`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_id: actionId }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; detail?: string };
      if (!res.ok) {
        throw new Error(typeof body.detail === "string" ? body.detail : "action failed");
      }
      toast({
        title: body.message ?? "干预策略已成功下发",
      });
      await loadOverview().catch(console.error);
      const nextUsers = await loadUsers();
      const next = nextUsers.find((u) => !u.processed);
      setSelectedId(next?.user_id ?? null);
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "下发失败",
        description: e instanceof Error ? e.message : "请确认后端已启动并重试。",
      });
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden text-slate-900">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -left-[20%] -top-[25%] h-[55vmin] w-[55vmin] rounded-full bg-blue-200/50 blur-[120px]" />
        <div className="absolute -right-[15%] -top-[20%] h-[50vmin] w-[50vmin] rounded-full bg-purple-200/50 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] h-[48vmin] w-[48vmin] rounded-full bg-pink-200/40 blur-[120px]" />
        <div className="absolute -bottom-[15%] right-[5%] h-[42vmin] w-[42vmin] rounded-full bg-cyan-200/35 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="relative shrink-0 px-6 pb-2 pt-6">
          <div
            className={cn(
              "flex min-h-[132px] w-full flex-col overflow-hidden rounded-2xl bg-white/35 lg:flex-row lg:items-stretch",
              GLASS_PANEL,
              "divide-y divide-white/40 lg:divide-x lg:divide-y-0",
            )}
          >
          <div className="flex min-w-0 flex-[1.15] flex-col justify-center gap-2 px-6 py-6 lg:px-10 lg:py-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <DollarSign className="h-4 w-4 text-indigo-500" aria-hidden />
              受威胁潜在 GMV
            </div>
            <p className="text-xs leading-relaxed text-slate-500">待处理高风险用户的潜在损失合计（演示口径）</p>
            <p className="bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-4xl font-black tabular-nums tracking-tight text-transparent sm:text-5xl lg:text-6xl">
              {overview ? `¥${overview.threatened_gmv.toLocaleString("zh-CN")}` : "—"}
            </p>
          </div>

          <div className="flex min-w-0 flex-1 flex-col divide-white/40 sm:flex-row sm:divide-x">
            <div className="flex flex-1 flex-col justify-center gap-3 border-b border-white/40 px-5 py-5 sm:border-b-0 sm:py-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">今日高风险</p>
                  <p className="mt-1 text-[11px] text-slate-400">流失概率 &gt; 60% 且待处理</p>
                </div>
                <span className="rounded-full bg-white/50 p-2 text-slate-600 shadow-sm backdrop-blur-sm [&_svg]:size-[18px]">
                  <Users className="h-[18px] w-[18px]" aria-hidden />
                </span>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                  {overview ? overview.risk_users_today.toLocaleString("zh-CN") : "—"}
                </span>
                {overview ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur-sm",
                      trendPositive(overview.trend)
                        ? "border-emerald-200/60 bg-emerald-100/40 text-emerald-800"
                        : "border-rose-200/60 bg-rose-100/40 text-rose-800",
                    )}
                  >
                    {trendPositive(overview.trend) ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {overview.trend}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-center gap-3 border-b border-white/40 px-5 py-5 sm:border-b-0 sm:py-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">模型准确率</p>
                  <p className="mt-1 text-[11px] text-slate-400">离线评估 · 演示</p>
                </div>
                <span className="rounded-full bg-white/50 p-2 text-slate-600 shadow-sm backdrop-blur-sm [&_svg]:size-[18px]">
                  <Target className="h-[18px] w-[18px]" aria-hidden />
                </span>
              </div>
              <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                {overview ? `${(overview.accuracy_rate * 100).toFixed(1)}%` : "—"}
              </span>
            </div>

            <div className="flex flex-1 flex-col justify-center gap-2 px-5 py-5 sm:py-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">策略挽留 · 拦截率</p>
                  <p className="mt-1 text-[11px] text-slate-400">昨日策略维度（演示）</p>
                </div>
                <span className="rounded-full bg-white/50 p-2 text-slate-600 shadow-sm backdrop-blur-sm [&_svg]:size-[18px]">
                  <Percent className="h-[18px] w-[18px]" aria-hidden />
                </span>
              </div>
              <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                {overview ? `${(overview.retention_rate * 100).toFixed(1)}%` : "—"}
              </span>
              {overview ? (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Holdout 增量 +{(overview.retention_holdout_uplift_pp ?? 5.2).toFixed(1)}%
                </p>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              "flex shrink-0 flex-col justify-center gap-2 border-t border-white/40 px-5 py-4 lg:border-l lg:border-t-0 lg:px-6",
              "bg-white/25 backdrop-blur-md",
            )}
          >
            <Switch id="autopilot" checked={autopilotOn} onCheckedChange={setAutopilotOn} />
            <label htmlFor="autopilot" className="max-w-[140px] cursor-pointer select-none text-xs font-semibold leading-snug text-slate-600">
              自动化拦截
              <span className="mt-0.5 block font-normal text-slate-400">Auto-pilot</span>
            </label>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden px-6 pb-6 pt-6">
        <div className="flex min-h-0 flex-1 flex-row gap-4 overflow-hidden">
        <aside
          className={cn(
            "flex min-h-0 w-[25%] min-w-[260px] shrink-0 flex-col self-stretch overflow-hidden rounded-2xl bg-blue-50/40",
            GLASS_PANEL,
          )}
        >
          <div className="shrink-0 border-b border-white/40 bg-white/20 px-6 py-5 backdrop-blur-md">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">流失预测控制台</p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-slate-900">智能工单队列</p>
            <p className="mt-1 text-sm tracking-wide text-slate-500">按潜在损失排序 · 已处理沉底</p>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/50 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
              <div className="scrollbar-glass min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-2">
                <div className="flex flex-col gap-4 pb-1 md:gap-5">
              {users.map((u) => {
                const active = u.user_id === selectedId;
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => setSelectedId(u.user_id)}
                    className={cn(
                      "flex w-full shrink-0 cursor-pointer rounded-2xl border border-white/70 bg-white/80 p-0 text-left shadow-sm transition-all duration-200 hover:bg-white hover:shadow-md",
                      active
                        ? "border-blue-400/50 bg-white ring-2 ring-blue-400/30 shadow-[0_8px_30px_-12px_rgba(59,130,246,0.45)]"
                        : "",
                      u.processed && "opacity-70",
                    )}
                  >
                    {active ? (
                      <div className="flex shrink-0 flex-col justify-center py-5 pl-4 pr-1" aria-hidden>
                        <span className="h-12 w-1 shrink-0 rounded-full bg-blue-500 shadow-sm shadow-blue-500/25" />
                      </div>
                    ) : null}
                    <div className={cn("flex min-w-0 flex-1 gap-4 p-5", active ? "pl-2" : "pl-5")}>
                      <img
                        src={u.avatar_url}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-2xl border border-white/80 bg-white/60 object-cover shadow-md"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-base font-semibold tracking-tight text-slate-900">{u.nickname}</p>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                            <Badge variant={u.ltv_tier === "high" ? "amber" : "muted"}>
                              {u.ltv_tier === "high" ? "高净值" : "低净值"}
                            </Badge>
                            {u.processed ? (
                              <Badge variant="success" className="font-medium">
                                已处理
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <p className="text-sm tracking-wide text-slate-500">
                          流失概率{" "}
                          <span
                            className={cn(
                              "font-extrabold tabular-nums tracking-tight",
                              churnProbabilityTextClass(u.churn_probability),
                            )}
                          >
                            {(u.churn_probability * 100).toFixed(0)}%
                          </span>
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto md:gap-6">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8">
              <Card
                className={cn(
                  "w-full max-w-lg border-white/60 bg-white/45 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.06)]",
                )}
              >
                <CardHeader>
                  <CardTitle className="text-lg font-semibold tracking-tight text-slate-900">暂无待处理用户</CardTitle>
                  <CardDescription className="text-slate-600">队列中所有高风险用户均已处理完毕。</CardDescription>
                </CardHeader>
              </Card>
            </div>
          ) : (
            <div className="flex min-h-0 w-full flex-1 flex-col gap-6">
              <section
                className={cn(
                  "flex min-h-[300px] w-full flex-col gap-5 rounded-2xl bg-white/50 p-4 md:gap-6 md:p-6 xl:flex-row xl:items-stretch",
                  GLASS_PANEL,
                  "xl:min-h-[360px]",
                )}
              >
                <Card className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/50 bg-white/25 shadow-none backdrop-blur-md xl:min-h-[360px]">
                  <CardHeader className="shrink-0 space-y-3 pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg font-semibold tracking-tight text-slate-900">用户画像</CardTitle>
                        <CardDescription>核心指标与行为摘要（演示数据）</CardDescription>
                      </div>
                      {diagnosis?.lifecycle_status ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 border font-medium",
                            diagnosis.lifecycle_status === "流失高危期"
                              ? "border-red-200/80 bg-red-50 text-red-700"
                              : "border-emerald-200/70 bg-emerald-50/70 text-emerald-800",
                          )}
                        >
                          复购周期 · {diagnosis.lifecycle_status}
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-6 pt-0">
                    {diagnosis?.risk_level === "疑似羊毛党" ? (
                      <div className="rounded-lg border border-neutral-900 bg-neutral-950 px-4 py-3 text-center text-sm font-semibold tracking-tight text-white shadow-sm">
                        ⚠️ 触发风控：高频退货/疑似羊毛党
                      </div>
                    ) : null}
                    <div className="flex flex-col items-stretch gap-8 lg:flex-row lg:items-center lg:gap-10">
                      <div className="flex shrink-0 flex-col items-center gap-4 lg:items-start">
                        <ChurnRiskRing
                          loading={loadingDiag || !diagnosis}
                          percent={
                            diagnosis ? Math.round(diagnosis.churn_probability * 100) : 0
                          }
                          probability={diagnosis?.churn_probability ?? 0}
                        />
                        {selectedUser ? (
                          <Badge variant={selectedUser.ltv_tier === "high" ? "amber" : "muted"}>
                            LTV · {selectedUser.ltv_tier === "high" ? "高净值" : "低净值"}
                          </Badge>
                        ) : null}
                      </div>
                      <dl className="grid min-h-0 min-w-0 flex-1 grid-cols-2 gap-4">
                        <div className="col-span-2 rounded-xl border border-white/60 bg-white/40 px-4 py-3 backdrop-blur-sm">
                          <dt className="text-xs font-medium text-slate-500">主购类目</dt>
                          <dd className="mt-1 text-sm font-semibold tracking-tight text-slate-900">
                            {loadingDiag || !diagnosis ? "—" : diagnosis.main_category || "—"}
                          </dd>
                        </div>
                        {orderedProfileForGrid(diagnosis?.profile ?? []).map((row) => (
                          <div
                            key={row.label}
                            className="rounded-xl border border-white/70 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm"
                          >
                            <dt className="text-xs font-medium text-slate-500">{row.label}</dt>
                            <dd className="mt-1 truncate text-sm font-semibold tabular-nums tracking-tight text-slate-900">
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </CardContent>
                </Card>

                <Card className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/50 bg-white/25 shadow-none backdrop-blur-md xl:min-h-[360px]">
                  <CardHeader className="shrink-0 pb-4">
                    <CardTitle className="text-lg font-semibold tracking-tight text-slate-900">流失归因（SHAP）</CardTitle>
                    <CardDescription>正值加剧风险（红），负值减缓风险（绿）</CardDescription>
                  </CardHeader>
                  <CardContent className="flex min-h-[300px] flex-1 flex-col xl:min-h-0">
                    <div className="flex min-h-[300px] w-full flex-1 flex-col xl:min-h-0">
                      {chartData.length === 0 ? (
                        <div className="flex h-full min-h-[300px] w-full items-center justify-center rounded-xl border border-dashed border-white/50 bg-white/20 text-sm tracking-wide text-slate-500 backdrop-blur-sm">
                          {loadingDiag ? "加载中…" : "暂无归因数据"}
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart layout="vertical" data={chartData} margin={{ top: 10, right: 18, left: 4, bottom: 10 }}>
                            <CartesianGrid
                              strokeDasharray="4 6"
                              stroke="rgba(148,163,184,0.25)"
                              strokeOpacity={0.95}
                              vertical
                              horizontal
                            />
                            <XAxis
                              type="number"
                              domain={[-maxAbs * 1.15, maxAbs * 1.15]}
                              tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 500 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="feature"
                              width={128}
                              tick={{ fontSize: 11, fill: "#64748b", fontWeight: 500 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              formatter={(v: number) => [v.toFixed(3), "SHAP"]}
                              contentStyle={{
                                borderRadius: 12,
                                border: "1px solid rgb(241 245 249)",
                                boxShadow: "0 4px 20px -4px rgba(0,0,0,0.08)",
                                fontSize: 13,
                                color: "#334155",
                              }}
                            />
                            <Bar dataKey="value" barSize={10} radius={[0, 4, 4, 0]}>
                              {chartData.map((entry, index) => (
                                <Cell
                                  key={`${entry.feature}-${index}`}
                                  fill={entry.value >= 0 ? SHAP_POSITIVE : SHAP_NEGATIVE}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </section>

              <section
                className={cn(
                  "shrink-0 overflow-hidden rounded-2xl bg-fuchsia-50/30 p-6 md:p-8",
                  GLASS_PANEL,
                )}
                aria-label="智能行动建议"
              >
                <div className="border-b border-white/40 pb-4">
                  <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-slate-900">
                    <Sparkles
                      className="h-5 w-5 shrink-0 text-indigo-500 motion-safe:animate-pulse"
                      aria-hidden
                    />
                    AI 智能行动建议（NBA）
                  </h3>
                  <p className="mt-1.5 text-sm tracking-wide text-slate-500">
                    基于 LTV 与归因的差异化策略（演示）
                  </p>
                </div>
                <div className="mt-5 rounded-xl border border-white/60 bg-white/35 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl">
                  {openTicketFrozen ? (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-snug text-red-800">
                      🚨 拦截：该用户存在未结案售后工单，已冻结自动化营销策略。
                    </div>
                  ) : null}
                  <p className="text-sm font-medium leading-relaxed tracking-wide text-slate-700">
                    {loadingDiag || !diagnosis ? "加载建议中…" : diagnosis.ai_suggestion}
                  </p>
                  {diagnosis?.economics ? (
                    <p className="mt-3 font-mono text-xs text-slate-400">
                      系统预估：干预成本 ¥{diagnosis.economics.intervention_cost.toFixed(2)}，挽回预期 GMV ¥
                      {diagnosis.economics.expected_recover_gmv.toFixed(2)}，ROI测算 ={" "}
                      {diagnosis.economics.roi_multiple.toFixed(1)}
                    </p>
                  ) : null}
                  <div className="mt-6 flex flex-col gap-4">
                    {openTicketFrozen ? (
                      <>
                        <p className="text-xs font-medium text-slate-500">以下营销动作已冻结（需先结案工单）</p>
                        <div className="flex flex-wrap gap-2">
                          {(diagnosis?.actions ?? []).map((a) => (
                            <Button
                              key={a.id}
                              type="button"
                              variant="outline"
                              disabled
                              className="cursor-not-allowed rounded-xl border-dashed border-white/50 bg-white/30 font-medium text-slate-400 opacity-60 backdrop-blur-sm"
                            >
                              {a.label}
                            </Button>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="default"
                          disabled={acting || !!selectedUser?.processed || loadingDiag || !diagnosis}
                          className={cn(
                            "w-full max-w-md rounded-xl px-6 disabled:hover:scale-100 sm:w-auto",
                            PRIMARY_GLOW_CTA,
                          )}
                          onClick={() => void handleAction(SENIOR_CS_ACTION_ID)}
                        >
                          转交高级客服电话安抚
                        </Button>
                      </>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {(diagnosis?.actions ?? []).map((a) => (
                          <Button
                            key={a.id}
                            variant={a.variant === "primary" ? "default" : "outline"}
                            disabled={acting || !!selectedUser?.processed || loadingDiag || !diagnosis}
                            className={cn(
                              "rounded-xl font-semibold transition-all duration-200 disabled:hover:scale-100",
                              a.variant === "primary" && PRIMARY_GLOW_CTA,
                              a.variant === "outline" &&
                                "border-white/60 bg-white/50 text-slate-800 shadow-sm backdrop-blur-md hover:bg-white/75 hover:text-slate-900 hover:shadow-md",
                            )}
                            onClick={() => void handleAction(a.id)}
                          >
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
        </div>
      </div>
      </div>
    </div>
  );
}

function ChurnRiskRing(props: {
  loading: boolean;
  percent: number;
  probability: number;
}) {
  const r = 54;
  const stroke = 9;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, props.percent));
  const dashOffset = c - (pct / 100) * c;

  const strokeClass = props.loading
    ? "stroke-slate-200"
    : props.probability >= 0.75
      ? "stroke-red-500"
      : props.probability > 0.6
        ? "stroke-orange-500"
        : "stroke-slate-400";

  const textClass = props.loading
    ? "text-slate-300"
    : churnProbabilityTextClass(props.probability);

  return (
    <div className="grid h-[188px] w-[188px] shrink-0 place-items-center">
      <svg className="col-start-1 row-start-1 h-full w-full -rotate-90" viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={stroke} />
        {!props.loading && (
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            className={strokeClass}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.45s ease" }}
          />
        )}
      </svg>
      <div className="col-start-1 row-start-1 flex flex-col items-center justify-center px-2 text-center">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">流失概率</span>
        <span className={cn("mt-0.5 text-3xl font-bold tabular-nums tracking-tight", textClass)}>
          {props.loading ? "—" : `${pct}%`}
        </span>
      </div>
    </div>
  );
}
