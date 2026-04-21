import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  fe: number[];
  keyframes: number[];
}

export function FreeEnergyChart({ fe, keyframes }: Props) {
  const data = fe.map((v, i) => ({ t: i, fe: v }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="feGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--signal-fe))" stopOpacity={0.5} />
              <stop offset="100%" stopColor="hsl(var(--signal-fe))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            tickLine={false}
          />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
          {keyframes.map((kf) => (
            <ReferenceLine
              key={kf}
              x={kf}
              stroke="hsl(var(--signal-causal))"
              strokeDasharray="2 2"
              label={{ value: `kf ${kf}`, fill: "hsl(var(--signal-causal))", fontSize: 9, position: "top" }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="fe"
            stroke="hsl(var(--signal-fe))"
            strokeWidth={1.5}
            fill="url(#feGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}