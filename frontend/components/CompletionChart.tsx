// File: components/CompletionChart.tsx
// Purpose: Chart.js bar chart showing evaluator completion percentages.
//          Theme-aware — listens for data-theme changes and updates colors.

'use client';

import { useMemo, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { EvaluatorStats } from '@/lib/api';
import { getTheme } from '@/lib/theme';

// Register Chart.js modules
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface CompletionChartProps {
  stats: EvaluatorStats[];
}

function getChartColors(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    return {
      barBg: 'rgba(232, 168, 50, 0.7)',
      barBorder: '#E8A832',
      gridColor: 'rgba(245, 240, 225, 0.06)',
      textColor: '#A89F92',
      labelColor: '#F0EDE6',
    };
  }
  return {
    barBg: 'rgba(201, 125, 10, 0.6)',
    barBorder: '#C97D0A',
    gridColor: 'rgba(30, 25, 15, 0.07)',
    textColor: '#5C5648',
    labelColor: '#1A1713',
  };
}

export default function CompletionChart({ stats }: CompletionChartProps) {
  const chartRef = useRef<ChartJS<'bar'>>(null);

  // Watch for theme changes via MutationObserver
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const chart = chartRef.current;
      if (!chart) return;

      const colors = getChartColors(getTheme());
      const dataset = chart.data.datasets[0];
      if (dataset) {
        dataset.backgroundColor = colors.barBg;
        dataset.borderColor = colors.barBorder;
      }
      if (chart.options.scales?.x) {
        const xScale = chart.options.scales.x;
        if (xScale.ticks) xScale.ticks.color = colors.textColor;
        if (xScale.grid) xScale.grid.color = colors.gridColor;
      }
      if (chart.options.scales?.y) {
        const yScale = chart.options.scales.y;
        if (yScale.ticks) yScale.ticks.color = colors.textColor;
        if (yScale.grid) yScale.grid.color = colors.gridColor;
      }
      chart.update('none');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  const colors = useMemo(() => getChartColors(getTheme()), []);

  const data = useMemo(
    () => ({
      labels: stats.map((s) => s.name),
      datasets: [
        {
          label: 'Completion %',
          data: stats.map((s) => s.completionPct),
          backgroundColor: colors.barBg,
          borderColor: colors.barBorder,
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.6,
        },
      ],
    }),
    [stats, colors]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFont: { family: "'DM Sans', system-ui, sans-serif", size: 13 },
          bodyFont: { family: "'DM Sans', system-ui, sans-serif", size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: { parsed: { y: number | null } }) => `${ctx.parsed.y ?? 0}% complete`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: colors.textColor,
            font: { family: "'DM Sans', system-ui, sans-serif", size: 11 },
          },
          grid: { color: colors.gridColor },
          border: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: colors.textColor,
            font: { family: "'DM Sans', system-ui, sans-serif", size: 11 },
            callback: (value: string | number) => `${value}%`,
          },
          grid: { color: colors.gridColor },
          border: { display: false },
        },
      },
      animation: {
        duration: 600,
        easing: 'easeOutQuart' as const,
      },
    }),
    [colors]
  );

  return (
    <div className="chart-container chart-container--bar" role="img" aria-label={`Bar chart showing completion percentages for ${stats.length} evaluators`}>
      <Bar ref={chartRef} data={data} options={options} />
    </div>
  );
}
