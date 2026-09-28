"use client";

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { money } from '@/lib/helpers';
import { PIE_COLORS } from '@/lib/constants';

// Thin wrappers around Chart.js for the Overview dashboard's bar and
// doughnut charts. Chart.js manages its own canvas; we just create/
// destroy an instance per mount, matching the original CDN usage.

export function BarPanel({ data, dark }) {
  const ref = useRef(null); const chartRef = useRef(null);
  const gridColor = dark ? '#2E3654' : '#F0ECE0';
  const tickColor = dark ? '#A8AEC4' : '#6B6555';
  const salesColor = dark ? '#7C93D6' : '#1C2541';
  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, {
      type: 'bar',
      data: { labels: data.map(d => d.month), datasets: [
        { label: 'Sales', data: data.map(d => d.sales), backgroundColor: salesColor, borderRadius: 2, barPercentage: 0.5, categoryPercentage: 0.7 },
        { label: 'Commission', data: data.map(d => d.commission), backgroundColor: '#B8863C', borderRadius: 2, barPercentage: 0.5, categoryPercentage: 0.7 }
      ] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { font: { size: 11, family: 'Inter' }, color: tickColor } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ₹${money(c.raw)}` } } },
        scales: { x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Inter' }, color: tickColor } }, y: { ticks: { font: { size: 11, family: 'Inter' }, color: tickColor }, grid: { color: gridColor } } } }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, dark]);
  return <canvas ref={ref} height="200"></canvas>;
}
export function PiePanel({ data, dark }) {
  const ref = useRef(null); const chartRef = useRef(null);
  const tickColor = dark ? '#A8AEC4' : '#6B6555';
  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, {
      type: 'doughnut',
      data: { labels: data.map(d => d.name), datasets: [{ data: data.map(d => d.value), backgroundColor: PIE_COLORS }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11, family: 'Inter' }, color: tickColor } }, tooltip: { callbacks: { label: (c) => `${c.label}: ₹${money(c.raw)}` } } } }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, dark]);
  if (data.length === 0) return <p style={{ fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '50px' }}>No payments logged yet</p>;
  return <canvas ref={ref} height="200"></canvas>;
}
