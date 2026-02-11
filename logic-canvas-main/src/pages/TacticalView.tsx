import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, ArrowDownRight, ArrowUpRight, Pause, Play, RefreshCw, Shield, Target, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";
import { useTacticalSync, type MTPlatform } from "@/hooks/useTacticalSync";
import type { SyncLogicState, SyncState } from "@/types/tactical-sync";

interface TacticalEvent {
  id: string;
  kind: "change" | "command" | "info" | "error";
  title: string;
  detail?: string;
  timestamp: Date;
  color?: "green" | "red" | "blue" | "yellow" | "gray";
}

type RiskLevel = "low" | "medium" | "high" | "critical";

function getRiskLevel(drawdownPercent: number): RiskLevel {
  if (drawdownPercent >= 10) return "critical";
  if (drawdownPercent >= 5) return "high";
  if (drawdownPercent >= 2) return "medium";
  return "low";
}

function getRiskColor(level: RiskLevel) {
  switch (level) {
    case "low":
      return "text-green-500";
    case "medium":
      return "text-yellow-500";
    case "high":
      return "text-orange-500";
    case "critical":
      return "text-red-500";
  }
}

function getEventIcon(kind: TacticalEvent["kind"]) {
  switch (kind) {
    case "command":
      return <Target className="w-4 h-4" />;
    case "change":
      return <Activity className="w-4 h-4" />;
    case "error":
      return <ArrowDownRight className="w-4 h-4" />;
    default:
      return <ArrowUpRight className="w-4 h-4" />;
  }
}

function getEventColor(color: TacticalEvent["color"]) {
  switch (color) {
    case "green":
      return "text-green-500";
    case "red":
      return "text-red-500";
    case "blue":
      return "text-blue-500";
    case "yellow":
      return "text-yellow-500";
    default:
      return "text-gray-400";
  }
}

function diffEvents(prev: SyncState, next: SyncState): TacticalEvent[] {
  const result: TacticalEvent[] = [];

  if (
    prev.global_buy_sell.allow_buy !== next.global_buy_sell.allow_buy ||
    prev.global_buy_sell.allow_sell !== next.global_buy_sell.allow_sell
  ) {
    result.push({
      id: uuidv4(),
      kind: "change",
      title: "Global buy/sell updated",
      detail: `BUY=${next.global_buy_sell.allow_buy ? "ON" : "OFF"} · SELL=${
        next.global_buy_sell.allow_sell ? "ON" : "OFF"
      }`,
      timestamp: new Date(),
      color: next.global_buy_sell.allow_buy || next.global_buy_sell.allow_sell ? "green" : "yellow",
    });
  }

  const prevMap = new Map<string, SyncLogicState>();
  for (const ls of prev.logic_states) prevMap.set(`${ls.group}:${ls.logic}`, ls);

  for (const ls of next.logic_states) {
    const before = prevMap.get(`${ls.group}:${ls.logic}`);
    if (!before) continue;
    if (before.allow_buy !== ls.allow_buy || before.allow_sell !== ls.allow_sell) {
      result.push({
        id: uuidv4(),
        kind: "change",
        title: `G${ls.group} ${ls.logic} buy/sell updated`,
        detail: `BUY=${ls.allow_buy ? "ON" : "OFF"} · SELL=${ls.allow_sell ? "ON" : "OFF"}`,
        timestamp: new Date(),
        color: ls.allow_buy || ls.allow_sell ? "blue" : "gray",
      });
    }
  }

  return result;
}

export default function TacticalView({ mtPlatform }: { mtPlatform: MTPlatform }) {
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<number | "all">("all");
  const [events, setEvents] = useState<TacticalEvent[]>([]);
  const prevSyncRef = useRef<SyncState | null>(null);

  const [sync, actions] = useTacticalSync(mtPlatform);

  const balance = sync.syncState?.account.balance ?? null;
  const equity = sync.syncState?.account.equity ?? null;
  const floatingPnl = balance != null && equity != null ? equity - balance : null;
  const drawdownPercent =
    balance != null && equity != null && balance > 0 ? Math.max(0, ((balance - equity) / balance) * 100) : null;
  const riskLevel = drawdownPercent == null ? null : getRiskLevel(drawdownPercent);

  const syncFresh = useMemo(() => {
    const m = sync.paths?.state_last_modified_ms;
    if (!m) return false;
    return Date.now() - m < 12_000;
  }, [sync.paths?.state_last_modified_ms]);

  useEffect(() => {
    if (!sync.error) return;
    setEvents((prev) => [
      { id: uuidv4(), kind: "error", title: "Sync error", detail: sync.error, timestamp: new Date(), color: "red" },
      ...prev,
    ].slice(0, 60));
  }, [sync.error]);

  useEffect(() => {
    const next = sync.syncState;
    if (!next) return;
    const prev = prevSyncRef.current;
    prevSyncRef.current = next;
    if (!prev) return;
    const newEvents = diffEvents(prev, next);
    if (newEvents.length === 0) return;
    setEvents((prevEvents) => [...newEvents, ...prevEvents].slice(0, 60));
  }, [sync.syncState]);

  const groups = useMemo(() => {
    const set = new Set<number>();
    for (const ls of sync.syncState?.logic_states ?? []) set.add(ls.group);
    return Array.from(set).sort((a, b) => a - b);
  }, [sync.syncState?.logic_states]);

  const filteredLogics = useMemo(() => {
    const list = sync.syncState?.logic_states ?? [];
    const q = search.trim().toLowerCase();
    return list
      .filter((ls) => (selectedGroup === "all" ? true : ls.group === selectedGroup))
      .filter((ls) => (q.length === 0 ? true : ls.logic.toLowerCase().includes(q)))
      .slice(0, 40);
  }, [search, selectedGroup, sync.syncState?.logic_states]);

  return (
    <div className="h-full bg-background p-4 flex flex-col gap-4 min-h-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
            <Target className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Tactical Center</h2>
            <p className="text-sm text-muted-foreground">Live EA sync & tactical overrides</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {mtPlatform}
          </Badge>
          <Badge
            className={cn(
              "text-xs",
              syncFresh
                ? "bg-green-500/15 text-green-400 border-green-500/30"
                : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
            )}
          >
            {syncFresh ? "SYNC LIVE" : "SYNC STALE"}
          </Badge>

          <Button
            variant={sync.isMonitoring ? "default" : "outline"}
            size="sm"
            className={
              sync.isMonitoring
                ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-700"
                : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
            }
            onClick={() => actions.setMonitoring(!sync.isMonitoring)}
          >
            {sync.isMonitoring ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
            {sync.isMonitoring ? "Monitoring" : "Paused"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
            onClick={() => actions.refresh()}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12 flex-1 min-h-0">
        <div className="lg:col-span-4 space-y-4 min-h-0">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Sync State</span>
                <Badge variant="outline" className="text-xs">
                  {sync.paths?.state_exists ? "FOUND" : "MISSING"}
                </Badge>
              </div>

              {!sync.paths?.state_exists && sync.paths?.state_path && (
                <div className="text-xs text-muted-foreground break-all">Waiting for {sync.paths.state_path}</div>
              )}

              {sync.syncState && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Symbol</span>
                    <span>{sync.syncState.symbol}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Magic</span>
                    <span>{sync.syncState.magic_number}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Balance</span>
                    <span>
                      {balance?.toFixed(2)} {sync.syncState.account.currency}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Equity</span>
                    <span>
                      {equity?.toFixed(2)} {sync.syncState.account.currency}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Floating P/L</span>
                    <span className={cn(floatingPnl != null && floatingPnl >= 0 ? "text-green-500" : "text-red-500")}>
                      {floatingPnl != null ? floatingPnl.toFixed(2) : "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm">Risk Level</span>
                    <Badge className={cn("text-xs", riskLevel ? getRiskColor(riskLevel) : "text-gray-500")}>
                      {(riskLevel ?? "unknown").toUpperCase()}
                    </Badge>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Drawdown</span>
                      <span>{drawdownPercent != null ? `${drawdownPercent.toFixed(2)}%` : "—"}</span>
                    </div>
                    <Progress value={drawdownPercent ?? 0} className="h-2" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                  onClick={async () => {
                    setEvents((prev) => [
                      {
                        id: uuidv4(),
                        kind: "command",
                        title: "Pause trading",
                        detail: "Set global BUY/SELL to OFF",
                        timestamp: new Date(),
                        color: "yellow",
                      },
                      ...prev,
                    ].slice(0, 60));
                    await actions.setGlobalBuySell(false, false);
                  }}
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                  onClick={async () => {
                    setEvents((prev) => [
                      {
                        id: uuidv4(),
                        kind: "command",
                        title: "Resume trading",
                        detail: "Set global BUY/SELL to ON",
                        timestamp: new Date(),
                        color: "green",
                      },
                      ...prev,
                    ].slice(0, 60));
                    await actions.setGlobalBuySell(true, true);
                  }}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Resume
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                  onClick={async () => {
                    setEvents((prev) => [
                      { id: uuidv4(), kind: "command", title: "Reload config", timestamp: new Date(), color: "blue" },
                      ...prev,
                    ].slice(0, 60));
                    await actions.reloadConfig();
                  }}
                >
                  Reload
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                  onClick={async () => {
                    setEvents((prev) => [
                      { id: uuidv4(), kind: "command", title: "Reset overrides", timestamp: new Date(), color: "yellow" },
                      ...prev,
                    ].slice(0, 60));
                    await actions.resetOverrides();
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                Live Events
                <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                  {events.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 min-h-0">
              <ScrollArea className="h-[320px] sm:h-[360px]">
                <div className="p-3 space-y-2">
                  {events.length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      No events yet. Start Monitoring and ensure the EA writes {sync.paths?.state_path ?? "DAAVFX_SyncState.json"}.
                    </div>
                  )}
                  {events.map((ev) => (
                    <div key={ev.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className={cn("mt-0.5", getEventColor(ev.color))}>{getEventIcon(ev.kind)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium">{ev.title}</div>
                          <div className="text-xs text-muted-foreground">{ev.timestamp.toLocaleTimeString()}</div>
                        </div>
                        {ev.detail && <div className="text-xs text-muted-foreground">{ev.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5 min-h-0">
          <Card className="h-full flex flex-col min-h-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-500" />
                Logic Overrides
                <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                  {sync.syncState?.logic_states.length ?? 0}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 flex flex-col gap-3 min-h-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search logic..."
                  className="w-full sm:flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md"
                />
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="px-3 py-2 text-sm bg-background border border-border rounded-md"
                >
                  <option value="all">All groups</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      G{g}
                    </option>
                  ))}
                </select>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-3 pr-2">
                  {filteredLogics.length === 0 && <div className="text-xs text-muted-foreground">No logic entries available.</div>}
                  {filteredLogics.map((ls) => (
                    <Card key={`${ls.group}:${ls.logic}`} className="border-l-4 border-l-gray-600">
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-medium">{ls.logic}</span>
                              <Badge variant="outline" className="text-xs">
                                G{ls.group}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn("text-xs", ls.allow_buy ? "border-green-500 text-green-500" : "border-gray-600 text-gray-400")}
                              >
                                BUY
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn("text-xs", ls.allow_sell ? "border-red-500 text-red-500" : "border-gray-600 text-gray-400")}
                              >
                                SELL
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Reverse {ls.reverse_enabled ? "ON" : "OFF"} · Hedge {ls.hedge_enabled ? "ON" : "OFF"} · Scale rev {ls.scale_reverse.toFixed(2)} · hedge {ls.scale_hedge.toFixed(2)}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn("border-gray-600 hover:border-gray-500", ls.allow_buy ? "text-green-400" : "text-gray-400")}
                              onClick={async () => {
                                setEvents((prev) => [
                                  {
                                    id: uuidv4(),
                                    kind: "command",
                                    title: `Toggle BUY (${ls.logic})`,
                                    detail: `G${ls.group} BUY ${ls.allow_buy ? "OFF" : "ON"}`,
                                    timestamp: new Date(),
                                    color: "blue",
                                  },
                                  ...prev,
                                ].slice(0, 60));
                                await actions.setLogicBuySell(ls.group, ls.logic, !ls.allow_buy, ls.allow_sell);
                              }}
                            >
                              BUY
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn("border-gray-600 hover:border-gray-500", ls.allow_sell ? "text-red-400" : "text-gray-400")}
                              onClick={async () => {
                                setEvents((prev) => [
                                  {
                                    id: uuidv4(),
                                    kind: "command",
                                    title: `Toggle SELL (${ls.logic})`,
                                    detail: `G${ls.group} SELL ${ls.allow_sell ? "OFF" : "ON"}`,
                                    timestamp: new Date(),
                                    color: "blue",
                                  },
                                  ...prev,
                                ].slice(0, 60));
                                await actions.setLogicBuySell(ls.group, ls.logic, ls.allow_buy, !ls.allow_sell);
                              }}
                            >
                              SELL
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4 min-h-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-500" />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">State file</span>
                <span className="text-xs">{sync.paths?.state_exists ? "OK" : "—"}</span>
              </div>
              {sync.paths?.state_path && <div className="text-xs text-muted-foreground break-all">{sync.paths.state_path}</div>}

              <div className="pt-2 border-t space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Global BUY</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      sync.syncState?.global_buy_sell.allow_buy ? "border-green-500 text-green-500" : "border-gray-600 text-gray-400",
                    )}
                  >
                    {sync.syncState?.global_buy_sell.allow_buy ? "ON" : "OFF"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Global SELL</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      sync.syncState?.global_buy_sell.allow_sell ? "border-red-500 text-red-500" : "border-gray-600 text-gray-400",
                    )}
                  >
                    {sync.syncState?.global_buy_sell.allow_sell ? "ON" : "OFF"}
                  </Badge>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                onClick={async () => {
                  setEvents((prev) => [
                    { id: uuidv4(), kind: "command", title: "Export state", timestamp: new Date(), color: "blue" },
                    ...prev,
                  ].slice(0, 60));
                  await actions.exportState();
                }}
              >
                Export State
              </Button>
            </CardContent>
          </Card>

          <Card className="min-h-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-blue-500">Commands File</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sync.paths?.commands_path && <div className="text-xs text-muted-foreground break-all">{sync.paths.commands_path}</div>}
              <div className="text-xs text-muted-foreground">Commands are written and then consumed (deleted) by the EA.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
